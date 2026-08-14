package filesystem

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Watcher monitors filesystem changes in a workspace.
type Watcher struct {
	ctx      context.Context
	fsWatch  *fsnotify.Watcher
	mu       sync.Mutex
	stopCh   chan struct{}
	rootPath string
	debTimer *time.Timer
	pending  map[string]string // path -> eventType
}

// NewWatcher creates a new Watcher instance.
func NewWatcher(ctx context.Context) *Watcher {
	return &Watcher{
		ctx:     ctx,
		pending: make(map[string]string),
	}
}

// Watch starts watching the given directory.
func (w *Watcher) Watch(rootPath string) error {
	w.mu.Lock()
	oldWatcher, oldStop := w.fsWatch, w.stopCh
	w.fsWatch = nil
	w.stopCh = nil
	w.mu.Unlock()

	// Stop the previous event loop before replacing shared watcher state.
	if oldStop != nil {
		close(oldStop)
	}
	if oldWatcher != nil {
		_ = oldWatcher.Close()
	}

	absRoot, err := filepath.Abs(rootPath)
	if err != nil {
		return err
	}
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	stopCh := make(chan struct{})

	// Add all subdirectories (except .git, node_modules, etc.)
	err = filepath.WalkDir(absRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			name := entry.Name()
			if name == ".git" || name == "node_modules" || name == "dist" || name == "build" || name == ".next" {
				return filepath.SkipDir
			}
			return fsWatcher.Add(path)
		}
		return nil
	})
	if err != nil {
		_ = fsWatcher.Close()
		return err
	}

	w.mu.Lock()
	w.rootPath = absRoot
	w.fsWatch = fsWatcher
	w.stopCh = stopCh
	w.mu.Unlock()

	go w.eventLoop(fsWatcher, stopCh)
	return nil
}

func (w *Watcher) eventLoop(fsWatcher *fsnotify.Watcher, stopCh <-chan struct{}) {
	for {
		select {
		case <-stopCh:
			return
		case err, ok := <-fsWatcher.Errors:
			if !ok {
				return
			}
			_ = err
		case event, ok := <-fsWatcher.Events:
			if !ok {
				return
			}

			// Ignore events on ignored paths
			nameLower := strings.ToLower(event.Name)
			if strings.Contains(nameLower, ".git") || strings.Contains(nameLower, "node_modules") ||
				strings.Contains(nameLower, "\\dist\\") || strings.Contains(nameLower, "/dist/") ||
				strings.Contains(nameLower, "\\build\\") || strings.Contains(nameLower, "/build/") ||
				strings.HasSuffix(nameLower, ".tmp") || strings.HasSuffix(nameLower, "~") {
				continue
			}

			eventType := "change"
			if event.Op&fsnotify.Create == fsnotify.Create {
				eventType = "create"
				// If a new directory is created, watch it
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					if !strings.Contains(event.Name, "node_modules") && !strings.Contains(event.Name, "vendor") && !strings.Contains(event.Name, ".git") {
						_ = fsWatcher.Add(event.Name)
					}
				}
			} else if event.Op&fsnotify.Remove == fsnotify.Remove {
				eventType = "remove"
			} else if event.Op&fsnotify.Rename == fsnotify.Rename {
				eventType = "rename"
			} else if event.Op&fsnotify.Write == fsnotify.Write {
				eventType = "write"
			}

			w.mu.Lock()
			w.pending[event.Name] = eventType
			if w.debTimer != nil {
				w.debTimer.Stop()
			}
			w.debTimer = time.AfterFunc(250*time.Millisecond, w.flushEvents)
			w.mu.Unlock()
		}
	}
}

func (w *Watcher) flushEvents() {
	w.mu.Lock()
	if len(w.pending) == 0 {
		w.mu.Unlock()
		return
	}

	var batch []FileChangeEvent
	for path, op := range w.pending {
		batch = append(batch, FileChangeEvent{
			Type: op,
			Path: path,
		})
	}
	w.pending = make(map[string]string)
	w.mu.Unlock()

	if w.ctx != nil {
		wailsRuntime.EventsEmit(w.ctx, "filesystem:change", batch)
	}
}

// Close stops the watcher.
func (w *Watcher) Close() {
	w.mu.Lock()
	fsWatcher, stopCh := w.fsWatch, w.stopCh
	w.fsWatch = nil
	w.stopCh = nil
	w.mu.Unlock()

	if stopCh != nil {
		close(stopCh)
	}
	if fsWatcher != nil {
		_ = fsWatcher.Close()
	}
}
