package lsp

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// CheckLSPInstalled verifies if an LSP is installed without triggering download
func CheckLSPInstalled(lang string) bool {
	switch lang {
	case "go":
		_, err := exec.LookPath("gopls")
		return err == nil
	case "java":
		_, err := exec.LookPath("java")
		if err != nil {
			return false
		}
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return false
		}
		jdtlsDir := filepath.Join(homeDir, ".devwannacode", "lsp", "jdtls")
		jarPath := findEquinoxLauncher(filepath.Join(jdtlsDir, "plugins"))
		return jarPath != ""
	case "html", "css", "json":
		cmdName := "vscode-" + lang + "-language-server"
		_, err := exec.LookPath(cmdName)
		return err == nil
	case "typescript", "javascript":
		_, err := exec.LookPath("typescript-language-server")
		return err == nil
	case "python":
		_, err := exec.LookPath("pyright-langserver")
		return err == nil
	default:
		return false
	}
}

// EnsureLSPInstalled checks if the required language server is installed.
// If it's not installed, it attempts to automatically install it,
// emitting events to the frontend to show a loading state.
func EnsureLSPInstalled(ctx context.Context, lang string) (string, []string, error) {
	switch lang {
	case "go":
		return ensureGoLSP(ctx)
	case "java":
		return ensureJavaLSP(ctx)
	case "html", "css", "json":
		return ensureWebLSP(ctx, lang)
	case "typescript", "javascript":
		return ensureTsLSP(ctx)
	case "python":
		return "pyright-langserver", []string{"--stdio"}, nil
	default:
		return "", nil, fmt.Errorf("no LSP configured for %s", lang)
	}
}

func ensureWebLSP(ctx context.Context, lang string) (string, []string, error) {
	cmdName := "vscode-" + lang + "-language-server"
	path, err := exec.LookPath(cmdName)
	if err == nil {
		return path, []string{"--stdio"}, nil
	}

	log.Printf("%s not found, starting auto-install via npm...", cmdName)

	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, "lsp:install:start", map[string]string{
			"language": lang,
			"message":  fmt.Sprintf("Downloading Web Smart Helper (%s)...", cmdName),
		})
	}

	npmPath, err := exec.LookPath("npm")
	if err != nil {
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:error", map[string]string{
				"language": lang,
				"error":    "Node.js/npm is required to install web language servers",
			})
		}
		return "", nil, fmt.Errorf("npm not found: %v", err)
	}

	installCmd := exec.CommandContext(ctx, npmPath, "install", "-g", "vscode-langservers-extracted")
	hideWindow(installCmd)

	stderr, err := installCmd.StderrPipe()
	if err != nil {
		return "", nil, fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	if err := installCmd.Start(); err != nil {
		return "", nil, fmt.Errorf("failed to start web lsp install: %v", err)
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line != "" && ctx != nil {
				log.Printf("[web-lsp install] %s", line)
				wailsRuntime.EventsEmit(ctx, "lsp:install:progress", map[string]string{
					"language": lang,
					"message":  line,
				})
			}
		}
	}()

	if err := installCmd.Wait(); err != nil {
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:error", map[string]string{
				"language": lang,
				"error":    fmt.Sprintf("Failed to install web-lsp: %v", err),
			})
		}
		return "", nil, fmt.Errorf("failed to install web-lsp: %v", err)
	}

	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, "lsp:install:success", map[string]string{
			"language": lang,
		})
	}

	path, err = exec.LookPath(cmdName)
	if err != nil {
		// Fallback to name if not in path (npm global installs can sometimes delay path updates)
		return cmdName, []string{"--stdio"}, nil
	}

	return path, []string{"--stdio"}, nil
}

func ensureTsLSP(ctx context.Context) (string, []string, error) {
	path, err := exec.LookPath("typescript-language-server")

	findTSPath := func() string {
		for _, name := range []string{"tsserver.cmd", "tsserver"} {
			if tsPath, err := exec.LookPath(name); err == nil {
				return tsPath
			}
		}
		// npm global installs on Windows commonly expose typescript-language-server
		// but not tsserver as a PATH command. Resolve tsserver.js from npm's root.
		npmPath, err := exec.LookPath("npm")
		if err == nil {
			if output, err := exec.Command(npmPath, "root", "-g").Output(); err == nil {
				candidate := filepath.Join(strings.TrimSpace(string(output)), "typescript", "lib", "tsserver.js")
				if _, err := os.Stat(candidate); err == nil {
					return candidate
				}
			}
		}
		return ""
	}

	getArgs := func() []string {
		return []string{"--stdio"}
	}

	if err == nil && findTSPath() != "" {
		return path, getArgs(), nil
	}

	log.Println("typescript-language-server not found, starting auto-install via npm...")

	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, "lsp:install:start", map[string]string{
			"language": "typescript",
			"message":  "Downloading TS/JS Smart Helper (typescript-language-server)...",
		})
	}

	// Check if npm is installed
	npmPath, err := exec.LookPath("npm")
	if err != nil {
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:error", map[string]string{
				"language": "typescript",
				"error":    "Node.js/npm is required to install typescript-language-server",
			})
		}
		return "", nil, fmt.Errorf("npm not found: %v", err)
	}

	// typescript@7 no longer ships tsserver, which the current language server
	// requires. Keep this on the supported TypeScript 5 line.
	installCmd := exec.CommandContext(ctx, npmPath, "install", "-g", "typescript@5.9.3", "typescript-language-server")
	hideWindow(installCmd)

	stderr, err := installCmd.StderrPipe()
	if err != nil {
		return "", nil, fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	if err := installCmd.Start(); err != nil {
		return "", nil, fmt.Errorf("failed to start ts lsp install: %v", err)
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			log.Printf("[ts-lsp install] %s", line)
			if ctx != nil {
				wailsRuntime.EventsEmit(ctx, "lsp:install:progress", map[string]string{
					"language": "typescript",
					"message":  line,
				})
			}
		}
	}()

	if err := installCmd.Wait(); err != nil {
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:error", map[string]string{
				"language": "typescript",
				"error":    fmt.Sprintf("Failed to install ts-lsp: %v", err),
			})
		}
		return "", nil, fmt.Errorf("failed to install ts-lsp: %v", err)
	}

	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, "lsp:install:success", map[string]string{
			"language": "typescript",
		})
	}

	path, err = exec.LookPath("typescript-language-server")
	if err != nil || findTSPath() == "" {
		return "", nil, fmt.Errorf("TypeScript tsserver was not found after installation")
	}
	return path, getArgs(), nil
}

func ensureGoLSP(ctx context.Context) (string, []string, error) {
	path, err := exec.LookPath("gopls")
	if err == nil {
		return path, []string{}, nil
	}

	log.Println("gopls not found, starting auto-install...")

	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, "lsp:install:start", map[string]string{
			"language": "go",
			"message":  "Downloading Go Smart Helper (gopls)...",
		})
	}

	installCmd := exec.CommandContext(ctx, "go", "install", "-v", "golang.org/x/tools/gopls@latest")
	hideWindow(installCmd)

	// go install -v writes package names to stderr as it compiles
	stderr, err := installCmd.StderrPipe()
	if err != nil {
		return "", nil, fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	if err := installCmd.Start(); err != nil {
		return "", nil, fmt.Errorf("failed to start gopls install: %v", err)
	}

	// Stream progress line by line ke frontend
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			log.Printf("[gopls install] %s", line)
			if ctx != nil {
				wailsRuntime.EventsEmit(ctx, "lsp:install:progress", map[string]string{
					"language": "go",
					"message":  line,
				})
			}
		}
	}()

	if err := installCmd.Wait(); err != nil {
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:error", map[string]string{
				"language": "go",
				"error":    fmt.Sprintf("Failed to install gopls: %v", err),
			})
		}
		return "", nil, fmt.Errorf("failed to install gopls: %v", err)
	}

	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, "lsp:install:success", map[string]string{
			"language": "go",
		})
	}

	path, err = exec.LookPath("gopls")
	if err != nil {
		return "gopls", []string{}, nil
	}

	return path, []string{}, nil
}

func ensureJavaLSP(ctx context.Context) (string, []string, error) {
	// Java LSP (JDTLS) requires Java to be installed on the system
	javaPath, err := exec.LookPath("java")
	if err != nil {
		return "", nil, fmt.Errorf("Java is not installed on this system, JDTLS requires it")
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", nil, err
	}

	jdtlsDir := filepath.Join(homeDir, ".devwannacode", "lsp", "jdtls")
	jarPath := ""

	// Check if already downloaded
	if _, err := os.Stat(jdtlsDir); !os.IsNotExist(err) {
		jarPath = findEquinoxLauncher(filepath.Join(jdtlsDir, "plugins"))
	}

	if jarPath == "" {
		// Need to download
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:start", map[string]string{
				"language": "java",
				"message":  "Downloading Java Smart Helper (JDTLS)...",
			})
		}

		err = downloadAndExtractJDTLS(ctx, jdtlsDir)
		if err != nil {
			if ctx != nil {
				wailsRuntime.EventsEmit(ctx, "lsp:install:error", map[string]string{
					"language": "java",
					"error":    fmt.Sprintf("Failed to download JDTLS: %v", err),
				})
			}
			return "", nil, err
		}

		jarPath = findEquinoxLauncher(filepath.Join(jdtlsDir, "plugins"))
		if jarPath == "" {
			return "", nil, fmt.Errorf("could not find equinox launcher in downloaded JDTLS")
		}

		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, "lsp:install:success", map[string]string{
				"language": "java",
			})
		}
	}

	// Prepare JDTLS arguments
	configDirName := "config_linux"
	if runtime.GOOS == "windows" {
		configDirName = "config_win"
	} else if runtime.GOOS == "darwin" {
		configDirName = "config_mac"
	}

	configDir := filepath.Join(jdtlsDir, configDirName)
	dataDir := filepath.Join(homeDir, ".devwannacode", "lsp", "java-workspace")

	args := []string{
		"-Declipse.application=org.eclipse.jdt.ls.core.id1",
		"-Dosgi.bundles.defaultStartLevel=4",
		"-Declipse.product=org.eclipse.jdt.ls.core.product",
		"-Dlog.level=ALL",
		"-Xmx1G",
		"-jar", jarPath,
		"-configuration", configDir,
		"-data", dataDir,
	}

	return javaPath, args, nil
}

func findEquinoxLauncher(pluginsDir string) string {
	files, err := os.ReadDir(pluginsDir)
	if err != nil {
		return ""
	}
	for _, f := range files {
		if strings.HasPrefix(f.Name(), "org.eclipse.equinox.launcher_") && strings.HasSuffix(f.Name(), ".jar") {
			return filepath.Join(pluginsDir, f.Name())
		}
	}
	return ""
}

func downloadAndExtractJDTLS(ctx context.Context, destDir string) error {
	url := "https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz"

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	err = os.MkdirAll(destDir, 0755)
	if err != nil {
		return err
	}

	// Extract tar.gz
	gzr, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		// Prevent path traversal
		target := filepath.Join(destDir, filepath.Clean(header.Name))
		if !strings.HasPrefix(target, destDir) {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			f.Close()
		}
	}

	return nil
}
