package git

// FileChange represents a single changed file in Git.
type FileChange struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "M", "A", "D", "R", "?"
	Staged bool   `json:"staged"`
}

// Status represents repository status metadata.
type Status struct {
	IsRepo       bool         `json:"isRepo"`
	Branch       string       `json:"branch"`
	Ahead        int          `json:"ahead"`
	Behind       int          `json:"behind"`
	Files        []FileChange `json:"files"`
	AddedLines   int          `json:"addedLines"`
	DeletedLines int          `json:"deletedLines"`
	Summary      string       `json:"summary"` // e.g. "+12 -4"
}
