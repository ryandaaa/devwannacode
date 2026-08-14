package terminal

// SessionInfo represents metadata about an active or exited terminal session.
type SessionInfo struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Cwd      string `json:"cwd"`
	Shell    string `json:"shell"`
	Exited   bool   `json:"exited"`
	ExitCode int    `json:"exitCode"`
}

// TerminalSize represents dimensions of the terminal grid.
type TerminalSize struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}
