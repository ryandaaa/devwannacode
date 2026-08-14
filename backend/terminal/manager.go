package terminal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type activeSession struct {
	info   *SessionInfo
	sess   *Session
	cancel context.CancelFunc
}

// Manager manages active terminal sessions.
type Manager struct {
	ctx      context.Context
	mu       sync.RWMutex
	sessions map[string]*activeSession
}

// NewManager creates a new Terminal Manager.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*activeSession),
	}
}

// SetContext sets the Wails context.
func (m *Manager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

// CreateSession creates and starts a new terminal session.
func (m *Manager) CreateSession(cwd string, shell string, cols int, rows int) (*SessionInfo, error) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	id := uuid.New().String()

	// Build command line with interactive flags per shell type
	var cmdLine string
	title := "Terminal"

	if runtime.GOOS == "windows" {
		switch shell {
		case "cmd", "cmd.exe":
			cmdLine = "cmd.exe /K"
			title = "cmd"
		case "bash", "git-bash", "bash.exe":
			cmdLine = "bash.exe"
			title = "bash"
		case "powershell", "powershell.exe":
			cmdLine = "powershell.exe -NoProfile -NoExit -NoLogo"
			title = "powershell"
		case "":
			cmdLine = "cmd.exe /K"
			title = "cmd"
		default:
			cmdLine = shell
			title = filepath.Base(shell)
		}

		if fields := strings.Fields(cmdLine); len(fields) > 0 {
			if fullPath, err := exec.LookPath(fields[0]); err == nil {
				fields[0] = fullPath
				cmdLine = strings.Join(fields, " ")
			}
		}
	} else {
		defaultShell := os.Getenv("SHELL")
		if defaultShell == "" {
			defaultShell = "bash"
		}

		targetShell := shell
		if targetShell == "" || targetShell == "cmd" || targetShell == "cmd.exe" {
			targetShell = defaultShell
		} else if targetShell == "powershell" || targetShell == "powershell.exe" {
			if _, err := exec.LookPath("powershell"); err != nil {
				if _, err2 := exec.LookPath("pwsh"); err2 == nil {
					targetShell = "pwsh"
				} else {
					targetShell = defaultShell
				}
			}
		}

		fields := strings.Fields(targetShell)
		if len(fields) > 0 {
			if fullPath, err := exec.LookPath(fields[0]); err == nil {
				fields[0] = fullPath
				cmdLine = strings.Join(fields, " ")
			} else {
				if defPath, err := exec.LookPath(defaultShell); err == nil {
					cmdLine = defPath
				} else {
					cmdLine = "/bin/sh"
				}
			}
		} else {
			cmdLine = defaultShell
		}
		title = filepath.Base(strings.Fields(cmdLine)[0])
	}

	// Working directory: use provided cwd or home dir
	workDir := cwd
	if workDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			workDir = home
		}
	}

	sess, err := newSession(cmdLine, workDir, cols, rows)
	if err != nil {
		return nil, fmt.Errorf("failed to start terminal: %w", err)
	}

	info := &SessionInfo{
		ID:       id,
		Title:    title,
		Cwd:      workDir,
		Shell:    cmdLine,
		Exited:   false,
		ExitCode: 0,
	}

	ctx, cancel := context.WithCancel(context.Background())

	as := &activeSession{
		info:   info,
		sess:   sess,
		cancel: cancel,
	}

	m.mu.Lock()
	m.sessions[id] = as
	m.mu.Unlock()

	// Stream PTY output → Wails events with 16ms batching (60 FPS alignment)
	var (
		bufMu      sync.Mutex
		pendingBuf []byte
		timer      *time.Timer
	)

	flushTerminal := func() {
		bufMu.Lock()
		if len(pendingBuf) == 0 {
			timer = nil
			bufMu.Unlock()
			return
		}
		dataStr := string(pendingBuf)
		pendingBuf = nil
		timer = nil
		bufMu.Unlock()

		if m.ctx != nil {
			wailsRuntime.EventsEmit(m.ctx, fmt.Sprintf("terminal:data:%s", id), dataStr)
		}
	}

	go readLoop(ctx, sess, func(data []byte) {
		bufMu.Lock()
		pendingBuf = append(pendingBuf, data...)
		if len(pendingBuf) >= 16384 {
			if timer != nil {
				timer.Stop()
				timer = nil
			}
			bufMu.Unlock()
			flushTerminal()
			return
		}
		if timer == nil {
			timer = time.AfterFunc(16*time.Millisecond, flushTerminal)
		}
		bufMu.Unlock()
	})

	// Wait for process exit
	go func() {
		exitCode, _ := sess.Wait()

		m.mu.Lock()
		if s, ok := m.sessions[id]; ok {
			s.info.Exited = true
			s.info.ExitCode = exitCode
		}
		m.mu.Unlock()

		// Unblock readLoop
		sess.cancelRead()
		cancel()

		if m.ctx != nil {
			wailsRuntime.EventsEmit(m.ctx, fmt.Sprintf("terminal:exit:%s", id), exitCode)
		}
	}()

	return info, nil
}

// WriteSession sends input to a terminal session.
func (m *Manager) WriteSession(id string, data string) error {
	// Temporarily ignore focus events which seem to crash the terminal
	if data == "\x1b[I" || data == "\x1b[O" {
		return nil
	}

	m.mu.RLock()
	as, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session not found")
	}
	_, err := as.sess.Write([]byte(data))
	return err
}

// ResizeSession resizes the pseudo console for a session.
func (m *Manager) ResizeSession(id string, cols int, rows int) error {
	m.mu.RLock()
	as, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session not found")
	}
	return as.sess.Resize(cols, rows)
}

// CloseSession terminates a terminal session.
func (m *Manager) CloseSession(id string) error {
	m.mu.Lock()
	as, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	delete(m.sessions, id)
	m.mu.Unlock()

	as.cancel()
	as.sess.cancelRead()
	return as.sess.Close()
}

// ListSessions returns all current sessions.
func (m *Manager) ListSessions() []*SessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*SessionInfo, 0, len(m.sessions))
	for _, s := range m.sessions {
		info := *s.info
		list = append(list, &info)
	}
	return list
}

// Shutdown terminates all sessions.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	sessions := make(map[string]*activeSession, len(m.sessions))
	for k, v := range m.sessions {
		sessions[k] = v
	}
	m.sessions = make(map[string]*activeSession)
	m.mu.Unlock()

	for _, as := range sessions {
		as.cancel()
		as.sess.cancelRead()
		as.sess.Close()
	}
}
