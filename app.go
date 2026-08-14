package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync/atomic"

	"devwannacode/backend/filesystem"
	"devwannacode/backend/git"
	"devwannacode/backend/lsp"
	"devwannacode/backend/settings"
	"devwannacode/backend/terminal"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx         context.Context
	filesystem  *filesystem.Service
	terminal    *terminal.Manager
	git         *git.Service
	settings    *settings.Service
	lsp         *lsp.Manager
	hasUnsaved  atomic.Bool
	startupPath string
}

// NewApp creates a new App application struct
func NewApp(startupPath string) *App {
	return &App{
		filesystem:  filesystem.NewService(),
		terminal:    terminal.NewManager(),
		git:         git.NewService(),
		settings:    settings.NewService(),
		lsp:         lsp.NewManager(),
		startupPath: startupPath,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.filesystem.SetContext(ctx)
	a.terminal.SetContext(ctx)
	a.git.SetContext(ctx)
	a.settings.SetContext(ctx)
	a.lsp.SetContext(ctx)

	// Restore previous window geometry
	if state, err := a.settings.GetWorkspaceState(); err == nil {
		if state.IsMaximized {
			wailsRuntime.WindowMaximise(ctx)
		} else if state.WindowWidth > 0 && state.WindowHeight > 0 {
			wailsRuntime.WindowSetSize(ctx, state.WindowWidth, state.WindowHeight)
			if state.WindowX != 0 || state.WindowY != 0 {
				wailsRuntime.WindowSetPosition(ctx, state.WindowX, state.WindowY)
			}
		}
	}

	// Start LSP WebSocket Server
	go a.lsp.Start()
}

// shutdown is called when the app terminates
func (a *App) shutdown(ctx context.Context) {
	a.filesystem.Close()
	a.terminal.Shutdown()
	a.lsp.Stop()
}

// GetStartupPath returns a folder or file path provided by the CLI.
// The frontend uses it before restoring the previous workspace.
func (a *App) GetStartupPath() (string, error) {
	if a.startupPath == "" {
		return "", nil
	}
	absPath, err := filepath.Abs(a.startupPath)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return "", fmt.Errorf("startup path is unavailable: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("startup path must be a directory")
	}
	return absPath, nil
}

// beforeClose is called when the application is about to close
func (a *App) beforeClose(ctx context.Context) bool {
	if a.hasUnsaved.Load() {
		res, err := wailsRuntime.MessageDialog(ctx, wailsRuntime.MessageDialogOptions{
			Type:          wailsRuntime.QuestionDialog,
			Title:         "Unsaved Changes",
			Message:       "You have unsaved files. Are you sure you want to quit without saving?",
			DefaultButton: "No",
			CancelButton:  "No",
		})
		if err == nil && res != "Yes" {
			return true // cancel closing
		}
	}

	if state, err := a.settings.GetWorkspaceState(); err == nil {
		isMaximized := wailsRuntime.WindowIsMaximised(ctx)
		w, h := wailsRuntime.WindowGetSize(ctx)
		x, y := wailsRuntime.WindowGetPosition(ctx)

		state.IsMaximized = isMaximized
		if !isMaximized {
			state.WindowWidth = w
			state.WindowHeight = h
			state.WindowX = x
			state.WindowY = y
		}
		a.settings.SaveWorkspaceState(state)
	}
	return false // Allow the window to close
}

// SetHasUnsavedChanges tells the backend if there are unsaved files
func (a *App) SetHasUnsavedChanges(unsaved bool) {
	a.hasUnsaved.Store(unsaved)
}

// --- Filesystem API ---

func (a *App) OpenFolderDialog() (string, error) {
	return a.filesystem.OpenFolderDialog()
}

func (a *App) SaveFileDialog(defaultFilename string) (string, error) {
	return a.filesystem.SaveFileDialog(defaultFilename)
}

func (a *App) ReadDirectory(dirPath string, maxDepth int) (*filesystem.FileNode, error) {
	return a.filesystem.ReadDirectory(dirPath, maxDepth)
}

func (a *App) ReadDirectoryFlat(dirPath string) ([]*filesystem.FileNode, error) {
	return a.filesystem.ReadDirectoryFlat(dirPath)
}

func (a *App) ReadFile(filePath string) (string, error) {
	return a.filesystem.ReadFile(filePath)
}

func (a *App) GetFileBase64(filePath string) (string, error) {
	return a.filesystem.GetFileBase64(filePath)
}

func (a *App) WriteFile(filePath string, content string) error {
	return a.filesystem.WriteFile(filePath, content)
}

func (a *App) CreateFile(filePath string) error {
	return a.filesystem.CreateFile(filePath)
}

func (a *App) CreateDirectory(dirPath string) error {
	return a.filesystem.CreateDirectory(dirPath)
}

func (a *App) Rename(oldPath string, newPath string) error {
	return a.filesystem.Rename(oldPath, newPath)
}

func (a *App) Delete(targetPath string) error {
	return a.filesystem.Delete(targetPath)
}

func (a *App) CopyFiles(targetDir string, sourcePaths []string) error {
	return a.filesystem.CopyFiles(targetDir, sourcePaths)
}

func (a *App) RevealInOS(targetPath string) error {
	return a.filesystem.RevealInOS(targetPath)
}

func (a *App) WatchWorkspace(workspacePath string) error {
	return a.filesystem.WatchWorkspace(workspacePath)
}

func (a *App) SearchFiles(rootPath string, query string, maxResults int) ([]*filesystem.FileNode, error) {
	return a.filesystem.SearchFiles(rootPath, query, maxResults)
}

func (a *App) SearchTextContent(rootPath string, query string, maxResults int) ([]*filesystem.TextSearchResult, error) {
	return a.filesystem.SearchTextContent(rootPath, query, maxResults)
}

// --- Terminal API ---

func (a *App) CreateTerminal(cwd string, shell string, cols int, rows int) (*terminal.SessionInfo, error) {
	return a.terminal.CreateSession(cwd, shell, cols, rows)
}

func (a *App) WriteTerminal(sessionID string, data string) error {
	return a.terminal.WriteSession(sessionID, data)
}

func (a *App) ResizeTerminal(sessionID string, cols int, rows int) error {
	return a.terminal.ResizeSession(sessionID, cols, rows)
}

func (a *App) CloseTerminal(sessionID string) error {
	return a.terminal.CloseSession(sessionID)
}

func (a *App) ListTerminals() []*terminal.SessionInfo {
	return a.terminal.ListSessions()
}

// --- Git API ---

func (a *App) GetGitStatus(workspacePath string) (*git.Status, error) {
	return a.git.GetStatus(workspacePath)
}

func (a *App) GetGitFileAtHead(workspacePath string, filePath string) (string, error) {
	return a.git.GetFileAtHead(workspacePath, filePath)
}

// --- Settings API ---

func (a *App) GetSettings() (*settings.Settings, error) {
	return a.settings.GetSettings()
}

func (a *App) SaveSettings(s *settings.Settings) error {
	return a.settings.SaveSettings(s)
}

func (a *App) GetRecentProjects() ([]settings.RecentProject, error) {
	return a.settings.GetRecentProjects()
}

func (a *App) AddRecentProject(path string) error {
	return a.settings.AddRecentProject(path)
}

func (a *App) RemoveRecentProject(path string) error {
	return a.settings.RemoveRecentProject(path)
}

func (a *App) GetWorkspaceState() (*settings.WorkspaceState, error) {
	return a.settings.GetWorkspaceState()
}

func (a *App) SaveWorkspaceState(state *settings.WorkspaceState) error {
	return a.settings.SaveWorkspaceState(state)
}

// --- LSP API ---

func (a *App) GetLSPStatus() map[string]bool {
	status := make(map[string]bool)
	languages := []string{"go", "java", "html", "css", "json", "typescript", "python"}
	for _, lang := range languages {
		status[lang] = lsp.CheckLSPInstalled(lang)
	}
	return status
}

func (a *App) InstallLSP(lang string) error {
	_, _, err := lsp.EnsureLSPInstalled(a.ctx, lang)
	return err
}
