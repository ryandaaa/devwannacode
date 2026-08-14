package lsp

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow Wails frontend origin
	},
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

type Manager struct {
	server *http.Server
	port   int
	mu     sync.Mutex
	ctx    context.Context
}

func NewManager() *Manager {
	return &Manager{
		port: 9999, // Fixed port for now, can be dynamic later
	}
}

func (m *Manager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *Manager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server != nil {
		return nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/lsp", m.handleLSPConnection)

	m.server = &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", m.port),
		Handler: mux,
	}

	go func() {
		log.Printf("LSP WebSocket server started on ws://%s/lsp\n", m.server.Addr)
		if err := m.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("LSP server error: %v\n", err)
		}
	}()

	return nil
}

func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		err := m.server.Shutdown(ctx)
		m.server = nil
		return err
	}
	return nil
}

func (m *Manager) handleLSPConnection(w http.ResponseWriter, r *http.Request) {
	lang := r.URL.Query().Get("lang")
	if lang == "" {
		http.Error(w, "lang parameter is required", http.StatusBadRequest)
		return
	}

	cmdName, args, err := EnsureLSPInstalled(m.ctx, lang)
	if err != nil {
		log.Printf("LSP Install/Check failed for %s: %v", lang, err)
		http.Error(w, fmt.Sprintf("Failed to setup LSP for %s: %v", lang, err), http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.CommandContext(ctx, cmdName, args...)
	// typescript-language-server resolves TypeScript through Node's module
	// resolution. npm -g installs are not necessarily visible from the app's
	// working directory, so expose the global npm modules for JS/TS sessions.
	if lang == "javascript" || lang == "typescript" {
		if npmPath, err := exec.LookPath("npm"); err == nil {
			if output, err := exec.Command(npmPath, "root", "-g").Output(); err == nil {
				globalNodeModules := strings.TrimSpace(string(output))
				if globalNodeModules != "" {
					cmd.Env = append(os.Environ(), "NODE_PATH="+globalNodeModules)
				}
			}
		}
	}
	hideWindow(cmd)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("Failed to get stdin pipe: %v", err)
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Failed to get stdout pipe: %v", err)
		return
	}

	// We redirect stderr to normal log for debugging LSP issues
	cmd.Stderr = log.Writer()

	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start LSP process %s: %v", cmdName, err)
		return
	}

	log.Printf("LSP process %s started (lang: %s)\n", cmdName, lang)

	var wg sync.WaitGroup
	wg.Add(2)

	// Pump complete LSP frames from stdout to WebSocket. stdout.Read can split
	// a JSON-RPC message at any byte, so forwarding arbitrary chunks breaks the
	// Content-Length framing expected by the browser client.
	go func() {
		defer wg.Done()
		defer cancel() // if LSP dies, cancel ctx

		reader := bufio.NewReader(stdout)
		for {
			contentLength := -1
			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					if err != io.EOF {
						log.Printf("Stdout read error: %v", err)
					}
					return
				}
				line = strings.TrimSpace(line)
				if line == "" {
					break
				}
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 && strings.EqualFold(strings.TrimSpace(parts[0]), "Content-Length") {
					contentLength, err = strconv.Atoi(strings.TrimSpace(parts[1]))
					if err != nil || contentLength < 0 {
						log.Printf("Invalid LSP Content-Length: %q", line)
						return
					}
				}
			}

			if contentLength < 0 {
				log.Printf("LSP message missing Content-Length")
				return
			}
			payload := make([]byte, contentLength)
			if _, err := io.ReadFull(reader, payload); err != nil {
				log.Printf("Incomplete LSP payload: %v", err)
				return
			}

			frame := append([]byte(fmt.Sprintf("Content-Length: %d\r\n\r\n", contentLength)), payload...)
			if err := conn.WriteMessage(websocket.TextMessage, frame); err != nil {
				log.Printf("Failed to write to WS: %v", err)
				return
			}
		}
	}()

	// Pump WebSocket to stdin
	go func() {
		defer wg.Done()
		defer cancel() // if WS dies, cancel ctx
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					log.Printf("WS read error: %v", err)
				}
				return
			}
			if _, werr := stdin.Write(msg); werr != nil {
				log.Printf("Stdin write error: %v", werr)
				return
			}
		}
	}()

	wg.Wait()

	// Ensure process is dead
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	if err := cmd.Wait(); err != nil {
		log.Printf("LSP process exited with error (lang: %s): %v", lang, err)
	}
	log.Printf("LSP session ended (lang: %s)", lang)
}

// getLSPCommand has been replaced by EnsureLSPInstalled in installer.go
