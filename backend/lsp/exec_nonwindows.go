//go:build !windows

package lsp

import (
	"os/exec"
)

func hideWindow(cmd *exec.Cmd) {
	// Not needed on non-Windows
}
