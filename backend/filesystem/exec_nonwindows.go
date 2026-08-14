//go:build !windows

package filesystem

import (
	"os/exec"
)

func hideWindow(cmd *exec.Cmd) {
	// Not needed on non-Windows
}
