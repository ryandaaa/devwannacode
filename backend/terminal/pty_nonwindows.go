//go:build !windows

package terminal

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	"golang.org/x/sys/unix"
)

// Session wraps a Unix PTY terminal session.
type Session struct {
	master *os.File
	cmd    *exec.Cmd
	mu     sync.Mutex
	closed bool
}

func openPty() (master *os.File, slave *os.File, err error) {
	p, err := os.OpenFile("/dev/ptmx", os.O_RDWR|unix.O_NOCTTY, 0)
	if err != nil {
		return nil, nil, err
	}
	if err := unix.IoctlSetPointerInt(int(p.Fd()), unix.TIOCSPTLCK, 0); err != nil {
		p.Close()
		return nil, nil, err
	}
	ptn, err := unix.IoctlGetInt(int(p.Fd()), unix.TIOCGPTN)
	if err != nil {
		p.Close()
		return nil, nil, err
	}
	ptsName := fmt.Sprintf("/dev/pts/%d", ptn)
	s, err := os.OpenFile(ptsName, os.O_RDWR|unix.O_NOCTTY, 0)
	if err != nil {
		p.Close()
		return nil, nil, err
	}
	return p, s, nil
}

// newSession starts a new terminal session using Unix PTY.
func newSession(command string, cwd string, cols, rows int) (*Session, error) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	master, slave, err := openPty()
	if err != nil {
		return nil, fmt.Errorf("openPty: %w", err)
	}

	// Set initial window size
	ws := &unix.Winsize{
		Row: uint16(rows),
		Col: uint16(cols),
	}
	_ = unix.IoctlSetWinsize(int(master.Fd()), unix.TIOCSWINSZ, ws)

	// Determine shell binary and arguments
	var cmd *exec.Cmd
	if command == "" {
		userShell := os.Getenv("SHELL")
		if userShell == "" {
			userShell = "bash"
		}
		cmd = exec.Command(userShell, "-l")
	} else {
		parts := strings.Fields(command)
		base := filepath.Base(parts[0])
		if len(parts) == 1 {
			if base == "bash" || base == "zsh" || base == "sh" || base == "fish" {
				cmd = exec.Command(parts[0], "-l")
			} else {
				cmd = exec.Command(parts[0])
			}
		} else {
			cmd = exec.Command(parts[0], parts[1:]...)
		}
	}

	if cwd != "" {
		cmd.Dir = cwd
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    0,
	}

	if err := cmd.Start(); err != nil {
		master.Close()
		slave.Close()
		return nil, fmt.Errorf("cmd.Start: %w", err)
	}

	// Slave file descriptor is no longer needed in parent process
	slave.Close()

	return &Session{
		master: master,
		cmd:    cmd,
	}, nil
}

// Write sends input bytes to the PTY.
func (s *Session) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.master == nil {
		return 0, fmt.Errorf("session closed")
	}
	return s.master.Write(p)
}

// Read reads output bytes from the PTY.
func (s *Session) Read(p []byte) (int, error) {
	s.mu.Lock()
	master := s.master
	closed := s.closed
	s.mu.Unlock()

	if closed || master == nil {
		return 0, io.EOF
	}
	return master.Read(p)
}

// Resize resizes the PTY.
func (s *Session) Resize(cols, rows int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.master == nil {
		return nil
	}
	ws := &unix.Winsize{
		Row: uint16(rows),
		Col: uint16(cols),
	}
	return unix.IoctlSetWinsize(int(s.master.Fd()), unix.TIOCSWINSZ, ws)
}

// Wait blocks until the process exits and returns the exit code.
func (s *Session) Wait() (int, error) {
	if s.cmd == nil || s.cmd.Process == nil {
		return 0, nil
	}
	err := s.cmd.Wait()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return exitErr.ExitCode(), nil
		}
		return -1, err
	}
	return 0, nil
}

// Close terminates the session and cleans up resources.
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true

	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}

	if s.master != nil {
		err := s.master.Close()
		s.master = nil
		return err
	}
	return nil
}

// cancelRead terminates the session to unblock pending Read.
func (s *Session) cancelRead() {
	s.Close()
}

// readLoop streams PTY output to the provided callback until ctx is done or EOF.
func readLoop(ctx context.Context, s *Session, onData func([]byte)) {
	buf := make([]byte, 4096)
	for {
		n, err := s.Read(buf)
		if n > 0 {
			onData(buf[:n])
		}
		if err != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		default:
		}
	}
}
