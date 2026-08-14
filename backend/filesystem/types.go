package filesystem

// FileNode represents a file or directory in the workspace tree.
type FileNode struct {
	Name      string      `json:"name"`
	Path      string      `json:"path"`
	RelPath   string      `json:"relPath"`
	IsDir     bool        `json:"isDir"`
	Size      int64       `json:"size"`
	ModTime   string      `json:"modTime"`
	Extension    string      `json:"extension"`
	MatchContext string      `json:"matchContext,omitempty"`
	Children     []*FileNode `json:"children,omitempty"`
}

// FileChangeEvent represents a change notification from the filesystem watcher.
type FileChangeEvent struct {
	Type string `json:"type"` // "create", "write", "remove", "rename"
	Path string `json:"path"`
}

// TextSearchResult represents a match found during global text search.
type TextSearchResult struct {
	Path        string `json:"path"`
	RelPath     string `json:"relPath"`
	FileName    string `json:"fileName"`
	LineNumber  int    `json:"lineNumber"`
	LineContent string `json:"lineContent"`
}

