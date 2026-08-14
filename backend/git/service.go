package git

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Service provides lightweight, terminal-first Git status checks.
type Service struct {
	ctx context.Context
}

// NewService creates a new Git service.
func NewService() *Service {
	return &Service{}
}

// SetContext sets the Wails context.
func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

// GetStatus checks repository status for the given workspace path.
func (s *Service) GetStatus(workspacePath string) (*Status, error) {
	if workspacePath == "" {
		return &Status{IsRepo: false}, nil
	}

	absPath, err := filepath.Abs(workspacePath)
	if err != nil {
		return &Status{IsRepo: false}, nil
	}

	// Quick check: does .git exist in this directory or above?
	gitDir := filepath.Join(absPath, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		// Run git rev-parse to be sure if inside a submodule or subfolder
		cmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
		hideWindow(cmd)
		cmd.Dir = absPath
		if err := cmd.Run(); err != nil {
			return &Status{IsRepo: false}, nil
		}
	}

	status := &Status{
		IsRepo: true,
		Branch: "main",
	}

	// 1. Run git status --porcelain=v1 -b
	cmd := exec.Command("git", "status", "--porcelain=v1", "-b")
	hideWindow(cmd)
	cmd.Dir = absPath
	var outBuf bytes.Buffer
	cmd.Stdout = &outBuf
	if err := cmd.Run(); err != nil {
		// Git failed or not installed
		return status, nil
	}

	lines := strings.Split(outBuf.String(), "\n")
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "## ") {
			// Branch header
			branchPart := strings.TrimPrefix(line, "## ")
			s.parseBranchHeader(branchPart, status)
			continue
		}

		if len(line) >= 3 {
			x := line[0]
			y := line[1]
			path := strings.TrimSpace(line[3:])
			// Strip quotes if git escaped path
			if strings.HasPrefix(path, "\"") && strings.HasSuffix(path, "\"") {
				path = strings.Trim(path, "\"")
			}

			// Determine primary status code
			statusCode := "?"
			staged := false
			if x != ' ' && x != '?' {
				staged = true
				statusCode = string(x)
			} else if y != ' ' {
				statusCode = string(y)
			}

			status.Files = append(status.Files, FileChange{
				Path:   path,
				Status: statusCode,
				Staged: staged,
			})
		}
	}

	// 2. Run git diff --shortstat to calculate added/deleted line summaries
	diffCmd := exec.Command("git", "diff", "--shortstat")
	hideWindow(diffCmd)
	diffCmd.Dir = absPath
	var diffOut bytes.Buffer
	diffCmd.Stdout = &diffOut
	if err := diffCmd.Run(); err == nil {
		s.parseShortStat(diffOut.String(), status)
	}

	return status, nil
}

// GetFileAtHead returns the content of a file at the HEAD commit.
func (s *Service) GetFileAtHead(workspacePath string, filePath string) (string, error) {
	relPath, err := filepath.Rel(workspacePath, filePath)
	if err != nil {
		return "", err
	}

	// Important: Convert to forward slashes for Git even on Windows
	gitPath := "./" + filepath.ToSlash(relPath)

	cmd := exec.Command("git", "show", "HEAD:"+gitPath)
	hideWindow(cmd)
	cmd.Dir = workspacePath
	
	var outBuf bytes.Buffer
	cmd.Stdout = &outBuf
	
	// If git show fails (e.g., file is new and not in HEAD), we just return empty string
	if err := cmd.Run(); err != nil {
		return "", nil
	}

	return outBuf.String(), nil
}

func (s *Service) parseBranchHeader(header string, status *Status) {
	// Example: "main...origin/main [ahead 1, behind 2]"
	// Example: "Initial commit on main"
	// Example: "HEAD (no branch)"
	if strings.Contains(header, "...") {
		parts := strings.SplitN(header, "...", 2)
		status.Branch = parts[0]
		if len(parts) > 1 && strings.Contains(parts[1], "[") {
			bracket := parts[1][strings.Index(parts[1], "[")+1 : strings.Index(parts[1], "]")]
			for _, item := range strings.Split(bracket, ",") {
				item = strings.TrimSpace(item)
				if strings.HasPrefix(item, "ahead ") {
					status.Ahead, _ = strconv.Atoi(strings.TrimPrefix(item, "ahead "))
				} else if strings.HasPrefix(item, "behind ") {
					status.Behind, _ = strconv.Atoi(strings.TrimPrefix(item, "behind "))
				}
			}
		}
	} else if strings.HasPrefix(header, "No commits yet on ") {
		status.Branch = strings.TrimPrefix(header, "No commits yet on ")
	} else if strings.HasPrefix(header, "Initial commit on ") {
		status.Branch = strings.TrimPrefix(header, "Initial commit on ")
	} else {
		// Just branch name or other
		fields := strings.Fields(header)
		if len(fields) > 0 {
			status.Branch = fields[0]
		}
	}
}

func (s *Service) parseShortStat(stat string, status *Status) {
	// Example: " 3 files changed, 12 insertions(+), 4 deletions(-)"
	parts := strings.Split(stat, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "insertion") {
			fields := strings.Fields(part)
			if len(fields) > 0 {
				status.AddedLines, _ = strconv.Atoi(fields[0])
			}
		} else if strings.Contains(part, "deletion") {
			fields := strings.Fields(part)
			if len(fields) > 0 {
				status.DeletedLines, _ = strconv.Atoi(fields[0])
			}
		}
	}

	if status.AddedLines > 0 || status.DeletedLines > 0 {
		status.Summary = ""
		if status.AddedLines > 0 {
			status.Summary += "+" + strconv.Itoa(status.AddedLines)
		}
		if status.DeletedLines > 0 {
			if status.Summary != "" {
				status.Summary += " "
			}
			status.Summary += "-" + strconv.Itoa(status.DeletedLines)
		}
	}
}
