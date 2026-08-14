package settings

// Settings stores user preferences.
type Settings struct {
	Theme        string `json:"theme"`        // "dark" | "light" | "nord"
	FontSize     int    `json:"fontSize"`     // default: 14
	WordWrap     string `json:"wordWrap"`     // "off" | "on"
	Minimap      bool   `json:"minimap"`      // default: false
	FormatOnSave bool   `json:"formatOnSave"` // default: false
	DefaultShell string `json:"defaultShell"` // "powershell" | "cmd" | "bash"
	EnableLSP    bool   `json:"enableLsp"`    // default: true
	AccentColor  string `json:"accentColor,omitempty"`
}

// RecentProject stores metadata for previously opened workspaces.
type RecentProject struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	LastOpened string `json:"lastOpened"`
}

// WorkspaceState stores layout and session state across runs.
type WorkspaceState struct {
	LastWorkspace   string   `json:"lastWorkspace"`
	OpenTabs        []string `json:"openTabs"`
	ActiveTab       string   `json:"activeTab"`
	IsSplit         bool     `json:"isSplit"`
	SplitTabPath    string   `json:"splitTabPath"`
	ExplorerWidth   int      `json:"explorerWidth"`
	TerminalWidth   int      `json:"terminalWidth"`
	ExplorerVisible bool     `json:"explorerVisible"`
	TerminalVisible bool     `json:"terminalVisible"`
	// Window geometry
	WindowWidth  int  `json:"windowWidth"`
	WindowHeight int  `json:"windowHeight"`
	WindowX      int  `json:"windowX"`
	WindowY      int  `json:"windowY"`
	IsMaximized  bool `json:"isMaximized"`
}


