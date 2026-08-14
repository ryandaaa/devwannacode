package filesystem

import (
	"context"
	"encoding/base64"
	"fmt"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Service handles filesystem operations.
type Service struct {
	ctx           context.Context
	watcher       *Watcher
	mu            sync.RWMutex
	workspaceRoot string
}

func (s *Service) Close() {
	if s.watcher != nil {
		s.watcher.Close()
	}
}

func (s *Service) workspacePath(path string, allowRoot bool) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("path is required")
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	s.mu.RLock()
	root := s.workspaceRoot
	s.mu.RUnlock()
	if root == "" {
		return "", fmt.Errorf("no workspace is open")
	}
	canonicalRoot, err := resolveSymlinks(root)
	if err != nil {
		return "", err
	}
	canonicalPath, err := resolveSymlinks(absPath)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(canonicalRoot, canonicalPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || (!allowRoot && rel == ".") {
		return "", fmt.Errorf("path must stay within the open workspace")
	}
	return absPath, nil
}

// resolveSymlinks resolves the nearest existing parent so new files cannot be
// created through a symlink that points outside the workspace.
func resolveSymlinks(path string) (string, error) {
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return resolved, nil
	}
	if !os.IsNotExist(err) {
		return "", err
	}
	parent := filepath.Dir(path)
	if parent == path {
		return "", err
	}
	resolvedParent, err := resolveSymlinks(parent)
	if err != nil {
		return "", err
	}
	return filepath.Join(resolvedParent, filepath.Base(path)), nil
}

// NewService creates a new filesystem service.
func NewService() *Service {
	return &Service{}
}

// SetContext sets the Wails context.
func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
	s.watcher = NewWatcher(ctx)
}

// OpenFolderDialog opens a native Windows folder picker dialog.
func (s *Service) OpenFolderDialog() (string, error) {
	if s.ctx == nil {
		return "", fmt.Errorf("context not set")
	}
	dir, err := wailsRuntime.OpenDirectoryDialog(s.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Open Project Folder",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

func (s *Service) SaveFileDialog(defaultFilename string) (string, error) {
	if s.ctx == nil {
		return "", fmt.Errorf("context not set")
	}
	s.mu.RLock()
	root := s.workspaceRoot
	s.mu.RUnlock()
	return wailsRuntime.SaveFileDialog(s.ctx, wailsRuntime.SaveDialogOptions{
		Title:            "Save File As",
		DefaultDirectory: root,
		DefaultFilename:  filepath.Base(defaultFilename),
	})
}

// ReadDirectory scans a directory recursively up to maxDepth.
func (s *Service) ReadDirectory(dirPath string, maxDepth int) (*FileNode, error) {
	absPath, err := s.workspacePath(dirPath, true)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", absPath)
	}

	rootNode := &FileNode{
		Name:      info.Name(),
		Path:      absPath,
		RelPath:   "",
		IsDir:     true,
		Size:      info.Size(),
		ModTime:   info.ModTime().Format(time.RFC3339),
		Extension: "",
	}

	rootNode.Children = s.scanDir(absPath, absPath, 1, maxDepth)
	return rootNode, nil
}

// ReadDirectoryFlat returns direct children of a directory.
func (s *Service) ReadDirectoryFlat(dirPath string) ([]*FileNode, error) {
	absPath, err := s.workspacePath(dirPath, true)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}

	var nodes []*FileNode
	for _, entry := range entries {
		name := entry.Name()
		fullPath := filepath.Join(absPath, name)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		ext := ""
		if !entry.IsDir() {
			ext = strings.ToLower(filepath.Ext(name))
		}

		nodes = append(nodes, &FileNode{
			Name:      name,
			Path:      fullPath,
			RelPath:   name,
			IsDir:     entry.IsDir(),
			Size:      info.Size(),
			ModTime:   info.ModTime().Format(time.RFC3339),
			Extension: ext,
		})
	}

	// Sort directories first, then alphabetical
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
	})

	return nodes, nil
}

func (s *Service) scanDir(rootPath, currentPath string, depth, maxDepth int) []*FileNode {
	if maxDepth > 0 && depth > maxDepth {
		return nil
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		return nil
	}

	var nodes []*FileNode
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() && (name == ".git" || name == "node_modules" || name == "vendor" || name == "dist" || name == "build" || name == ".next" || name == ".venv" || name == "__pycache__" || name == ".idea") {
			continue
		}

		fullPath := filepath.Join(currentPath, name)
		relPath, _ := filepath.Rel(rootPath, fullPath)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		ext := ""
		if !entry.IsDir() {
			ext = strings.ToLower(filepath.Ext(name))
		}

		node := &FileNode{
			Name:      name,
			Path:      fullPath,
			RelPath:   relPath,
			IsDir:     entry.IsDir(),
			Size:      info.Size(),
			ModTime:   info.ModTime().Format(time.RFC3339),
			Extension: ext,
		}

		if entry.IsDir() && (maxDepth == 0 || depth < maxDepth) {
			node.Children = s.scanDir(rootPath, fullPath, depth+1, maxDepth)
		}

		nodes = append(nodes, node)
	}

	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
	})

	return nodes
}

// ReadFile reads the full UTF-8 text content of a file.
func (s *Service) ReadFile(filePath string) (string, error) {
	absPath, err := s.workspacePath(filePath, false)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("cannot read directory as file: %s", absPath)
	}

	if info.Size() > 10*1024*1024 {
		return "", fmt.Errorf("file exceeds 10MB limit: %s", absPath)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}

	return string(data), nil
}

// WriteFile writes content to a file atomically or directly.
func (s *Service) WriteFile(filePath string, content string) error {
	absPath, err := s.workspacePath(filePath, false)
	if err != nil {
		return err
	}

	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(absPath, []byte(content), 0644)
}

// CreateFile creates an empty file if it doesn't already exist.
func (s *Service) CreateFile(filePath string) error {
	absPath, err := s.workspacePath(filePath, false)
	if err != nil {
		return err
	}

	if _, err := os.Stat(absPath); err == nil {
		return fmt.Errorf("file already exists: %s", absPath)
	}

	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	file, err := os.Create(absPath)
	if err != nil {
		return err
	}
	return file.Close()
}

// CreateDirectory creates a new directory.
func (s *Service) CreateDirectory(dirPath string) error {
	absPath, err := s.workspacePath(dirPath, false)
	if err != nil {
		return err
	}
	return os.MkdirAll(absPath, 0755)
}

// Rename renames or moves a file or folder.
func (s *Service) Rename(oldPath, newPath string) error {
	oldAbs, err := s.workspacePath(oldPath, false)
	if err != nil {
		return err
	}
	newAbs, err := s.workspacePath(newPath, false)
	if err != nil {
		return err
	}
	return os.Rename(oldAbs, newAbs)
}

// Delete removes a file or directory recursively.
func (s *Service) Delete(targetPath string) error {
	absPath, err := s.workspacePath(targetPath, false)
	if err != nil {
		return err
	}
	return os.RemoveAll(absPath)
}

// CopyFiles copies files or directories to a target directory.
func (s *Service) CopyFiles(targetDir string, sourcePaths []string) error {
	absTarget, err := s.workspacePath(targetDir, true)
	if err != nil {
		return err
	}

	for _, src := range sourcePaths {
		absSrc, err := filepath.Abs(src)
		if err != nil {
			continue
		}
		dest := filepath.Join(absTarget, filepath.Base(absSrc))
		if info, statErr := os.Stat(absSrc); statErr == nil && info.IsDir() {
			rel, relErr := filepath.Rel(absSrc, dest)
			if relErr == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return fmt.Errorf("cannot copy a folder into itself")
			}
		}
		if err := copyAll(absSrc, dest); err != nil {
			return err
		}
	}
	return nil
}

func copyAll(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}

	if info.IsDir() {
		if err := os.MkdirAll(dst, info.Mode()); err != nil {
			return err
		}
		entries, err := os.ReadDir(src)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			srcPath := filepath.Join(src, entry.Name())
			dstPath := filepath.Join(dst, entry.Name())
			if err := copyAll(srcPath, dstPath); err != nil {
				return err
			}
		}
		return nil
	}

	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, info.Mode())
}

// RevealInOS opens the file or folder in the OS file explorer (Windows).
func (s *Service) RevealInOS(targetPath string) error {
	absPath, err := s.workspacePath(targetPath, true)
	if err != nil {
		return err
	}
	cmd := exec.Command("explorer", "/select,", absPath)
	hideWindow(cmd)
	return cmd.Run()
}

// WatchWorkspace starts watching the workspace directory for changes.
func (s *Service) WatchWorkspace(workspacePath string) error {
	if s.watcher == nil {
		return fmt.Errorf("watcher not initialized")
	}
	absPath, err := filepath.Abs(workspacePath)
	if err != nil {
		return err
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("workspace path is not a directory")
	}
	if err := s.watcher.Watch(absPath); err != nil {
		return err
	}
	s.mu.Lock()
	s.workspaceRoot = absPath
	s.mu.Unlock()
	return nil
}

// SearchFiles searches filenames across the workspace for Quick Open.
func (s *Service) SearchFiles(rootPath string, query string, maxResults int) ([]*FileNode, error) {
	absRoot, err := s.workspacePath(rootPath, true)
	if err != nil {
		return nil, err
	}

	if maxResults <= 0 {
		maxResults = 50
	}

	query = strings.ToLower(query)
	var results []*FileNode

	err = filepath.WalkDir(absRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		name := entry.Name()
		if entry.IsDir() {
			if name == ".git" || name == "node_modules" || name == "dist" || name == "build" || name == ".next" {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, _ := filepath.Rel(absRoot, path)
		lowerRel := strings.ToLower(relPath)
		lowerName := strings.ToLower(name)

		info, err := entry.Info()
		if err != nil {
			return nil
		}

		if query == "" || strings.Contains(lowerName, query) || strings.Contains(lowerRel, query) {
			results = append(results, &FileNode{
				Name:      name,
				Path:      path,
				RelPath:   relPath,
				IsDir:     false,
				Size:      info.Size(),
				ModTime:   info.ModTime().Format(time.RFC3339),
				Extension: strings.ToLower(filepath.Ext(name)),
			})

			if len(results) >= maxResults {
				return filepath.SkipAll
			}
		}

		return nil
	})

	return results, err
}

// SearchTextContent searches text across files in the workspace.
func (s *Service) SearchTextContent(rootPath string, query string, maxResults int) ([]*TextSearchResult, error) {
	absRoot, err := s.workspacePath(rootPath, true)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(query) == "" {
		return []*TextSearchResult{}, nil
	}

	if maxResults <= 0 {
		maxResults = 200
	}

	lowerQuery := strings.ToLower(query)
	var results []*TextSearchResult

	ignoredDirs := map[string]bool{
		".git":         true,
		"node_modules": true,
		"dist":         true,
		"build":        true,
		".next":        true,
		".gemini":      true,
		"vendor":       true,
		"out":          true,
	}

	ignoredExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true,
		".svg": true, ".webp": true, ".pdf": true, ".zip": true, ".tar": true,
		".gz": true, ".7z": true, ".exe": true, ".dll": true, ".so": true,
		".dylib": true, ".woff": true, ".woff2": true, ".ttf": true, ".eot": true,
		".mp3": true, ".mp4": true, ".wav": true, ".avi": true, ".mkv": true,
		".pyc": true, ".o": true, ".a": true, ".class": true, ".db": true,
		".sqlite": true, ".bin": true,
	}

	err = filepath.WalkDir(absRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		name := entry.Name()
		if entry.IsDir() {
			if ignoredDirs[name] {
				return filepath.SkipDir
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(name))
		if ignoredExts[ext] {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return nil
		}

		// Skip files larger than 2MB
		if info.Size() > 2*1024*1024 {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		// Quick check for binary file (contains null byte in first 512 bytes)
		checkLen := len(data)
		if checkLen > 512 {
			checkLen = 512
		}
		for i := 0; i < checkLen; i++ {
			if data[i] == 0 {
				return nil
			}
		}

		relPath, _ := filepath.Rel(absRoot, path)
		lines := strings.Split(string(data), "\n")

		for lineIdx, line := range lines {
			lowerLine := strings.ToLower(line)
			if strings.Contains(lowerLine, lowerQuery) {
				cleanLine := strings.TrimRight(line, "\r")
				results = append(results, &TextSearchResult{
					Path:        path,
					RelPath:     relPath,
					FileName:    name,
					LineNumber:  lineIdx + 1,
					LineContent: cleanLine,
				})

				if len(results) >= maxResults {
					return filepath.SkipAll
				}
			}
		}

		return nil
	})

	return results, err
}

// GetFileBase64 reads a binary file and returns a base64 Data URL string.
func (s *Service) GetFileBase64(filePath string) (string, error) {
	absPath, err := s.workspacePath(filePath, false)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if info.Size() > 10*1024*1024 {
		return "", fmt.Errorf("file exceeds 10MB preview limit: %s", absPath)
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}

	ext := strings.ToLower(filepath.Ext(absPath))
	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		switch ext {
		case ".png":
			mimeType = "image/png"
		case ".jpg", ".jpeg":
			mimeType = "image/jpeg"
		case ".gif":
			mimeType = "image/gif"
		case ".svg":
			mimeType = "image/svg+xml"
		case ".webp":
			mimeType = "image/webp"
		default:
			mimeType = "application/octet-stream"
		}
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded), nil
}
