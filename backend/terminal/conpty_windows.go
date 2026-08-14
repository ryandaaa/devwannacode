//go:build windows

package terminal

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/UserExistsError/conpty"
)

// Session wraps a Windows ConPTY-based terminal session.
type Session struct {
	cpty   *conpty.ConPty
	mu     sync.Mutex
	closed bool
}

// newSession starts a new terminal session using ConPTY.
func newSession(command string, cwd string, cols, rows int) (*Session, error) {
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}

	// Create ConPTY session
	cpty, err := conpty.Start(command, conpty.ConPtyDimensions(cols, rows), conpty.ConPtyWorkDir(cwd))
	if err != nil {
		return nil, fmt.Errorf("conpty.Start: %w", err)
	}

	return &Session{
		cpty: cpty,
	}, nil
}

// Write sends input bytes to the PTY (keystrokes, paste, etc.).
func (s *Session) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.cpty == nil {
		return 0, fmt.Errorf("session closed")
	}
	return s.cpty.Write(p)
}

// Read reads output bytes from the PTY (terminal output).
func (s *Session) Read(p []byte) (int, error) {
	if s.cpty == nil {
		return 0, io.EOF
	}
	return s.cpty.Read(p)
}

// Resize resizes the PTY.
func (s *Session) Resize(cols, rows int) error {
	if s.cpty == nil {
		return nil
	}
	return s.cpty.Resize(cols, rows)
}

// Wait blocks until the process exits and returns the exit code.
func (s *Session) Wait() (int, error) {
	if s.cpty == nil {
		return 0, nil
	}
	exitCode, err := s.cpty.Wait(context.Background())
	return int(exitCode), err
}

// Close terminates the session and cleans up resources.
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true

	if s.cpty != nil {
		err := s.cpty.Close()
		s.cpty = nil
		return err
	}
	return nil
}

// cancelRead is intentionally a no-op here since closing the session unblocks Read automatically.
func (s *Session) cancelRead() {
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
