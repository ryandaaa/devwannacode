package settings

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// Service manages local JSON configuration persistence.
type Service struct {
	ctx            context.Context
	mu             sync.Mutex
	dataDir        string
	settings       *Settings
	workspaceState *WorkspaceState
	initOnce       sync.Once
}

// NewService creates a new settings service.
func NewService() *Service {
	// Determine AppData directory
	baseDir, err := os.UserConfigDir()
	if err != nil {
		baseDir = "."
	}
	appDir := filepath.Join(baseDir, "DevWannaCode")

	return &Service{
		dataDir: appDir,
	}
}

// SetContext sets the Wails context.
func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func (s *Service) ensureDataDir() {
	s.initOnce.Do(func() {
		_ = os.MkdirAll(s.dataDir, 0755)
	})
}

func defaultShellForOS() string {
	if runtime.GOOS == "windows" {
		return "powershell"
	}
	userShell := os.Getenv("SHELL")
	if userShell != "" {
		return filepath.Base(userShell)
	}
	return "bash"
}

// GetSettings loads user preferences from settings.json.
func (s *Service) GetSettings() (*Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.settings != nil {
		return s.settings, nil
	}

	defaultSettings := &Settings{
		Theme:        "dark",
		FontSize:     14,
		WordWrap:     "off",
		Minimap:      false,
		FormatOnSave: true,
		DefaultShell: defaultShellForOS(),
		EnableLSP:    true,
	}

	filePath := filepath.Join(s.dataDir, "settings.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		s.settings = defaultSettings
		return defaultSettings, nil
	}

	var loaded Settings
	if err := json.Unmarshal(data, &loaded); err != nil {
		s.settings = defaultSettings
		return defaultSettings, nil
	}

	if loaded.Theme == "" {
		loaded.Theme = "dark"
	}
	if loaded.FontSize <= 0 {
		loaded.FontSize = 14
	}
	if loaded.DefaultShell == "" {
		loaded.DefaultShell = defaultShellForOS()
	} else if runtime.GOOS != "windows" && (loaded.DefaultShell == "powershell" || loaded.DefaultShell == "cmd") {
		if _, err := exec.LookPath(loaded.DefaultShell); err != nil {
			loaded.DefaultShell = defaultShellForOS()
		}
	}

	s.settings = &loaded
	return &loaded, nil
}

// SaveSettings writes user preferences to settings.json.
func (s *Service) SaveSettings(settings *Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.settings = settings
	s.ensureDataDir()

	filePath := filepath.Join(s.dataDir, "settings.json")
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}

// GetRecentProjects returns the list of recently opened workspaces.
func (s *Service) GetRecentProjects() ([]RecentProject, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	filePath := filepath.Join(s.dataDir, "recent.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return []RecentProject{}, nil
	}

	var recents []RecentProject
	if err := json.Unmarshal(data, &recents); err != nil {
		return []RecentProject{}, nil
	}

	return recents, nil
}

// AddRecentProject adds or updates a workspace in the recent list.
func (s *Service) AddRecentProject(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureDataDir()

	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	filePath := filepath.Join(s.dataDir, "recent.json")
	var recents []RecentProject
	if data, err := os.ReadFile(filePath); err == nil {
		_ = json.Unmarshal(data, &recents)
	}

	name := filepath.Base(absPath)
	newEntry := RecentProject{
		Path:       absPath,
		Name:       name,
		LastOpened: time.Now().Format(time.RFC3339),
	}

	var updated []RecentProject
	updated = append(updated, newEntry)

	for _, r := range recents {
		if r.Path != absPath {
			updated = append(updated, r)
		}
		if len(updated) >= 20 {
			break
		}
	}

	data, err := json.MarshalIndent(updated, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

// RemoveRecentProject removes a project from the recent list.
func (s *Service) RemoveRecentProject(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ensureDataDir()

	filePath := filepath.Join(s.dataDir, "recent.json")
	var recents []RecentProject
	if data, err := os.ReadFile(filePath); err == nil {
		_ = json.Unmarshal(data, &recents)
	}

	var updated []RecentProject
	for _, r := range recents {
		if r.Path != path {
			updated = append(updated, r)
		}
	}

	data, err := json.MarshalIndent(updated, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

// GetWorkspaceState loads layout and tab states from workspace.json.
func (s *Service) GetWorkspaceState() (*WorkspaceState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.workspaceState != nil {
		return s.workspaceState, nil
	}

	defaultState := &WorkspaceState{
		LastWorkspace:   "",
		OpenTabs:        []string{},
		ActiveTab:       "",
		IsSplit:         false,
		SplitTabPath:    "",
		ExplorerWidth:   240,
		TerminalWidth:   380,
		ExplorerVisible: true,
		TerminalVisible: true,
	}

	filePath := filepath.Join(s.dataDir, "workspace.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		s.workspaceState = defaultState
		return defaultState, nil
	}

	var state WorkspaceState
	if err := json.Unmarshal(data, &state); err != nil {
		s.workspaceState = defaultState
		return defaultState, nil
	}

	if state.ExplorerWidth <= 0 {
		state.ExplorerWidth = 240
	}
	if state.TerminalWidth <= 0 {
		state.TerminalWidth = 380
	}

	s.workspaceState = &state
	return s.workspaceState, nil
}

// SaveWorkspaceState saves layout and tab states to workspace.json.
func (s *Service) SaveWorkspaceState(state *WorkspaceState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.workspaceState = state
	s.ensureDataDir()

	filePath := filepath.Join(s.dataDir, "workspace.json")
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}
