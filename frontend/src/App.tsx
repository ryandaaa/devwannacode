import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { TopBar } from './components/TopBar/TopBar';
import { Explorer } from './components/Explorer/Explorer';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Dialog } from './components/Common/Dialog';
import { ProblemsPanel, ProblemMarker } from './components/Problems/ProblemsPanel';

// Lazy-loaded heavy components (Monaco ~5MB, xterm ~500KB, modals on-demand)
const Editor = React.lazy(() => import('./components/Editor/Editor').then(m => ({ default: m.Editor })));
const Terminal = React.lazy(() => import('./components/Terminal/Terminal').then(m => ({ default: m.Terminal })));
const CommandPalette = React.lazy(() => import('./components/CommandPalette/CommandPalette').then(m => ({ default: m.CommandPalette })));
const QuickOpen = React.lazy(() => import('./components/QuickOpen/QuickOpen').then(m => ({ default: m.QuickOpen })));
const SettingsModal = React.lazy(() => import('./components/Settings/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ShortcutsModal = React.lazy(() => import('./components/Shortcuts/ShortcutsModal').then(m => ({ default: m.ShortcutsModal })));
const GlobalSearch = React.lazy(() => import('./components/Search/GlobalSearch').then(m => ({ default: m.GlobalSearch })));


import {
  FileNode,
  EditorTab,
  TerminalTabItem,
  GitStatus,
  AppSettings,
  RecentProject,
  CommandItem,
} from './types';
import { getLanguageFromPath } from './utils/languages';

import * as AppService from '../wailsjs/go/main/App';
import * as runtime from '../wailsjs/runtime/runtime';
import './App.css';

export const App: React.FC = () => {
  // --- Initialization Gate ---
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // --- Workspace State ---
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');

  // --- Panels & Layout ---
  const [explorerWidth, setExplorerWidth] = useState<number>(240);
  const [terminalWidth, setTerminalWidth] = useState<number>(380);
  const [explorerVisible, setExplorerVisible] = useState<boolean>(true);
  const [terminalVisible, setTerminalVisible] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<'explorer' | 'search'>('explorer');

  // --- Split Editor State ---
  const [isSplit, setIsSplit] = useState<boolean>(false);
  const [splitTabPath, setSplitTabPath] = useState<string>('');



  // --- Editor State ---
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string>('');
  const [mruTabPaths, setMruTabPaths] = useState<string[]>([]);

  useEffect(() => {
    if (activeTabPath) {
      setMruTabPaths((prev) => [activeTabPath, ...prev.filter((p) => p !== activeTabPath)]);
    }
  }, [activeTabPath]);

  // --- Terminal State ---
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabItem[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('');

  // --- Git State ---
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  // --- LSP & Diagnostic Errors State ---
  const [lspLoadingMessage, setLspLoadingMessage] = useState<string>('');
  const [problems, setProblems] = useState<ProblemMarker[]>([]);
  const [bottomPanelTab, setBottomPanelTab] = useState<'terminal' | 'problems'>('terminal');
  const [targetLocation, setTargetLocation] = useState<{ path: string; line: number; col: number; timestamp: number } | null>(null);

  // --- Settings & Persistence ---
  const [appSettings, setAppSettings] = useState<AppSettings>({
    theme: (localStorage.getItem('devwannacode-theme') as any) || 'dark',
    fontSize: 14,
    wordWrap: 'off',
    minimap: true,
    formatOnSave: true,
    defaultShell: 'powershell',
    enableLsp: true,
    accentColor: localStorage.getItem('devwannacode-accent') || '',
  });
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // --- Modals ---
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // --- Dialog Confirmation State ---
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    secondaryLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onSecondaryAction?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // --- Toast Notification State ---
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }>({
    visible: false,
    message: '',
  });

  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void, durationMs?: number) => {
    setToast({ visible: true, message, actionLabel, onAction });
    const duration = durationMs || (actionLabel ? 7000 : 1800);
    setTimeout(() => {
      setToast((prev) => {
        // Only hide if it's still the same message
        if (prev.message === message) {
          return { ...prev, visible: false };
        }
        return prev;
      });
    }, duration);
  }, []);

  // Global toast event listener
  useEffect(() => {
    const handleCustomToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; actionLabel?: string; onAction?: () => void; duration?: number }>;
      if (customEvent.detail?.message) {
        showToast(customEvent.detail.message, customEvent.detail.actionLabel, customEvent.detail.onAction, customEvent.detail.duration);
      }
    };
    window.addEventListener('devwannacode:toast', handleCustomToast);
    return () => window.removeEventListener('devwannacode:toast', handleCustomToast);
  }, [showToast]);

  // Resizing state
  const isDraggingExplorer = useRef(false);
  const isDraggingTerminal = useRef(false);

  // Preserve last known window geometry (managed by Go on shutdown)
  const windowGeometryRef = useRef({ windowWidth: 0, windowHeight: 0, windowX: 0, windowY: 0, isMaximized: false });

  // Prevent double terminal init in StrictMode
  const terminalInitRef = useRef(false);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appSettings.theme);
    localStorage.setItem('devwannacode-theme', appSettings.theme);
    
    if (appSettings.accentColor) {
      document.documentElement.style.setProperty('--accent', appSettings.accentColor);
      localStorage.setItem('devwannacode-accent', appSettings.accentColor);
    } else {
      document.documentElement.style.removeProperty('--accent');
      localStorage.removeItem('devwannacode-accent');
    }
  }, [appSettings.theme, appSettings.accentColor]);

  useEffect(() => {
    // Determine if any tab has unsaved changes
    const hasUnsaved = openTabs.some((tab) => tab.isDirty);
    AppService.SetHasUnsavedChanges(hasUnsaved).catch(console.error);
  }, [openTabs]);

  // Initial Load from Go backend
  useEffect(() => {
    const loadInitialState = async () => {
      let loadedShell = 'powershell';
      try {
        const loadedSettings = await AppService.GetSettings();
        if (loadedSettings) {
          if (loadedSettings.defaultShell) {
            loadedShell = loadedSettings.defaultShell;
          }
          setAppSettings({
            theme: loadedSettings.theme === 'light' ? 'light' : loadedSettings.theme === 'nord' ? 'nord' : 'dark',
            fontSize: loadedSettings.fontSize || 14,
            wordWrap: loadedSettings.wordWrap === 'on' ? 'on' : 'off',
            minimap: Boolean(loadedSettings.minimap),
            formatOnSave: loadedSettings.formatOnSave !== false,
            defaultShell: (loadedSettings.defaultShell as any) || 'powershell',
            enableLsp: loadedSettings.enableLsp !== false,
            accentColor: (loadedSettings as any).accentColor || '',
          });
        }

        const loadedRecents = await AppService.GetRecentProjects();
        if (loadedRecents) {
          setRecentProjects(loadedRecents as RecentProject[]);
        }

        const wsState = await AppService.GetWorkspaceState();
        if (wsState) {
          if (wsState.explorerWidth) setExplorerWidth(wsState.explorerWidth);
          if (wsState.terminalWidth) setTerminalWidth(wsState.terminalWidth);
          if (wsState.explorerVisible !== undefined) setExplorerVisible(wsState.explorerVisible);
          if (wsState.terminalVisible !== undefined) setTerminalVisible(wsState.terminalVisible);

          // Preserve geometry so we don't clobber it on next layout save
          windowGeometryRef.current = {
            windowWidth: wsState.windowWidth || 0,
            windowHeight: wsState.windowHeight || 0,
            windowX: wsState.windowX || 0,
            windowY: wsState.windowY || 0,
            isMaximized: wsState.isMaximized || false,
          };

          const startupPath = await AppService.GetStartupPath();
          if (startupPath) {
            await openWorkspace(startupPath, loadedShell);
          } else if (wsState.lastWorkspace) {
            await openWorkspace(wsState.lastWorkspace, loadedShell);
          }
        }

        // Preload critical lazy components before revealing the UI
        await Promise.all([
          import('./components/Editor/Editor'),
          import('./components/Terminal/Terminal')
        ]).catch(console.error);

      } catch (err) {
        console.error('Error loading initial state:', err);
      } finally {
        setIsInitializing(false);
        
        // Wait for React to commit to the DOM
        requestAnimationFrame(() => {
          // Tell Wails to show the window (it is currently hidden and colored via go config)
          runtime.WindowShow();
          
          // Start the CSS fade-in transition on the next frame
          requestAnimationFrame(() => {
            const rootEl = document.getElementById('root');
            if (rootEl) {
              rootEl.style.opacity = '1';
            }
          });
        });
      }
    };

    loadInitialState();
  }, []);

  // --- Drag and Drop from OS ---
  useEffect(() => {
    runtime.OnFileDrop(async (x: number, y: number, paths: string[]) => {
      showToast(`received ${paths?.length || 0} file(s)`);
      if (!workspaceRoot || !paths || paths.length === 0) return;
      
      try {
        await AppService.CopyFiles(workspaceRoot, paths);
        showToast(`copied ${paths.length} file(s) to workspace`);
      } catch (err: any) {
        console.error('Failed to copy dropped files:', err);
        setDialogState({
          isOpen: true,
          title: 'Error Copying Files',
          message: err.message || 'Unknown error occurred.',
          onConfirm: () => setDialogState(prev => ({ ...prev, isOpen: false })),
        });
      }
    }, false); // false means catch drops anywhere on the window, no specific drop target CSS needed

    return () => {
      runtime.OnFileDropOff();
    };
  }, [workspaceRoot, showToast]);

  // Prevent default browser drag and drop behavior
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = (e: DragEvent) => e.preventDefault();
    
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Save workspace state on changes
  useEffect(() => {
    if (workspaceRoot) {
      const saveState = async () => {
        try {
          if ((window as any).runtime) {
            const size = await (window as any).runtime.WindowGetSize();
            const pos = await (window as any).runtime.WindowGetPosition();
            const isMax = await (window as any).runtime.WindowIsMaximised();
            if (size && pos) {
              windowGeometryRef.current.isMaximized = isMax;
              if (!isMax) {
                windowGeometryRef.current.windowWidth = size.w || size[0];
                windowGeometryRef.current.windowHeight = size.h || size[1];
                windowGeometryRef.current.windowX = pos.x || pos[0];
                windowGeometryRef.current.windowY = pos.y || pos[1];
              }
            }
          }
        } catch (e) {
          // Ignore, fallback to existing ref
        }

        AppService.SaveWorkspaceState({
          lastWorkspace: workspaceRoot,
          openTabs: openTabs.map((t) => t.path),
          activeTab: activeTabPath,
          isSplit: Boolean(isSplit),
          splitTabPath: splitTabPath || '',
          explorerWidth,
          terminalWidth,
          explorerVisible,
          terminalVisible,
          ...windowGeometryRef.current,
        });
      };
      saveState();
    }
  }, [workspaceRoot, openTabs, activeTabPath, explorerWidth, terminalWidth, explorerVisible, terminalVisible, isSplit, splitTabPath, sidebarTab]);

  // Auto-close split editor if there aren't enough tabs open
  useEffect(() => {
    if (isSplit && openTabs.length < 2) {
      setIsSplit(false);
    }
  }, [isSplit, openTabs.length]);

  // Handle Soft Delete (Delete key)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger if user is typing
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || activeEl.isContentEditable || activeEl.classList.contains('inputarea')) {
          return;
        }
      }

      if (e.key === 'Delete' && selectedFilePath) {
        e.preventDefault();
        
        const originalPath = selectedFilePath;
        const trashPath = originalPath + '.trash_tmp';
        
        try {
          await AppService.Rename(originalPath, trashPath);
          showToast('file deleted', 'restore', async () => {
            try {
              await AppService.Rename(trashPath, originalPath);
            } catch (err) {
              console.error('Failed to restore:', err);
            }
          });
          
          // Permanently delete after 7.5s if not restored
          setTimeout(async () => {
             try {
               await AppService.Delete(trashPath);
             } catch (err) {
               // Ignore error, likely restored or already deleted
             }
          }, 7500);
        } catch (err: any) {
           console.error('Soft delete error:', err);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilePath, showToast]);

  // Open Workspace
  const openWorkspace = async (dirPath: string, shellOverride?: string) => {
    if (!dirPath) return;
    try {
      await AppService.WatchWorkspace(dirPath);
      await AppService.AddRecentProject(dirPath);

      // Refresh file tree
      const tree = await AppService.ReadDirectory(dirPath, 6);
      setFileTree(tree);

      // Refresh Git
      refreshGit(dirPath);

      // Reload recents
      const recents = await AppService.GetRecentProjects();
      setRecentProjects(recents || []);

      // Auto-create initial terminal session if none exists
      if (terminalTabs.length === 0 && !terminalInitRef.current) {
        terminalInitRef.current = true;
        createTerminalSession(dirPath, shellOverride);
      }

      // Restore session open tabs & split state if available
      const wsState = await AppService.GetWorkspaceState();
      if (wsState && wsState.openTabs && wsState.openTabs.length > 0) {
        const restoredTabs: EditorTab[] = [];
        for (const filePath of wsState.openTabs) {
          try {
            const content = await AppService.ReadFile(filePath);
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            restoredTabs.push({
              path: filePath,
              name: fileName,
              isDirty: false,
              content: content || '',
              originalContent: content || '',
              language: getLanguageFromPath(filePath),
              line: 1,
              col: 1,
            });
          } catch (err) {
            console.warn('Could not restore tab file:', filePath, err);
          }
        }
        if (restoredTabs.length > 0) {
          setOpenTabs(restoredTabs);
          if (wsState.activeTab && restoredTabs.some((t) => t.path === wsState.activeTab)) {
            setActiveTabPath(wsState.activeTab);
          } else {
            setActiveTabPath(restoredTabs[0].path);
          }
          if (wsState.isSplit) {
            setIsSplit(true);
            if (wsState.splitTabPath) {
              setSplitTabPath(wsState.splitTabPath);
            }
          }
        }
      }

      setWorkspaceRoot(dirPath);
    } catch (err) {
      console.error('Failed to open workspace:', err);
    }
  };

  const handleOpenFolderPicker = async () => {
    try {
      const selectedDir = await AppService.OpenFolderDialog();
      if (selectedDir) {
        openWorkspace(selectedDir);
      }
    } catch (err) {
      console.error('Folder picker error:', err);
    }
  };

  const refreshFileTree = useCallback(async () => {
    if (!workspaceRoot) return;
    try {
      const tree = await AppService.ReadDirectory(workspaceRoot, 6);
      setFileTree(tree);
      refreshGit(workspaceRoot);
    } catch (err) {
      console.error('Failed to refresh file tree:', err);
    }
  }, [workspaceRoot]);

  const refreshGit = async (dirPath: string) => {
    try {
      const status = await AppService.GetGitStatus(dirPath);
      setGitStatus(status);
    } catch (err) {
      console.error('Git status error:', err);
    }
  };

  // Watch for external filesystem changes from Go
  useEffect(() => {
    const handleFsChange = () => {
      refreshFileTree();
    };

    const handleLspStart = (data: any) => {
      setLspLoadingMessage(data?.message || 'Downloading Helper...');
    };

    const handleLspProgress = (data: any) => {
      // Show package name being compiled, trimmed for readability
      const pkg = data?.message || '';
      const short = pkg.includes('/') ? pkg.split('/').slice(-2).join('/') : pkg;
      setLspLoadingMessage(`Building: ${short}`);
    };

    const handleLspSuccess = (data: any) => {
      setLspLoadingMessage('Ready');
      setTimeout(() => setLspLoadingMessage(''), 3000); // clear after 3s
    };

    const handleLspError = (data: any) => {
      setLspLoadingMessage('Error Downloading LSP');
      showToast(data?.error || 'Failed to download Language Server');
      setTimeout(() => setLspLoadingMessage(''), 5000); // clear after 5s
    };

    const handleLspReady = (e: Event) => {
      const customEvent = e as CustomEvent<{ language: string }>;
      const lang = customEvent.detail?.language || '';
      showToast(`autocomplete ready (${lang.toLowerCase()})`);
    };

    const handleLspWSError = (e: Event) => {
      const customEvent = e as CustomEvent<{ error: string }>;
      const err = customEvent.detail?.error || 'lsp error';
      showToast(err.toLowerCase());
      setLspLoadingMessage('LSP Disconnected');
    };

    runtime.EventsOn('filesystem:change', handleFsChange);
    runtime.EventsOn('lsp:install:start', handleLspStart);
    runtime.EventsOn('lsp:install:progress', handleLspProgress);
    runtime.EventsOn('lsp:install:success', handleLspSuccess);
    runtime.EventsOn('lsp:install:error', handleLspError);
    window.addEventListener('devwannacode:lsp_ready', handleLspReady);
    window.addEventListener('devwannacode:lsp_error', handleLspWSError);
    
    return () => {
      runtime.EventsOff('filesystem:change');
      runtime.EventsOff('lsp:install:start');
      runtime.EventsOff('lsp:install:progress');
      runtime.EventsOff('lsp:install:success');
      runtime.EventsOff('lsp:install:error');
      window.removeEventListener('devwannacode:lsp_ready', handleLspReady);
      window.removeEventListener('devwannacode:lsp_error', handleLspWSError);
    };
  }, [workspaceRoot, showToast]);

  // --- Editor Operations ---
  const handleOpenFile = useCallback(async (node: FileNode) => {
    if (node.isDir) return;
    setSelectedFilePath(node.path);

    // Check if already open
    const existing = openTabs.find((t) => t.path === node.path);
    if (existing) {
      setActiveTabPath(node.path);
      return;
    }

    try {
      const content = await AppService.ReadFile(node.path);
      const newTab: EditorTab = {
        path: node.path,
        name: node.name,
        isDirty: false,
        content: content || '',
        originalContent: content || '',
        language: getLanguageFromPath(node.path),
        line: 1,
        col: 1,
      };

      setOpenTabs((prev) => {
        if (prev.find((t) => t.path === newTab.path)) return prev;
        return [...prev, newTab];
      });
      setActiveTabPath(node.path);
    } catch (err) {
      console.error('Failed to read file:', err);
    }
  }, [openTabs]);

  const handleOpenFileByPath = useCallback(async (filePath: string) => {
    if (!filePath) return;
    const normalizedPath = filePath.replace(/\\/g, '/');
    const name = normalizedPath.split('/').pop() || normalizedPath;

    setSelectedFilePath(normalizedPath);

    const existing = openTabs.find((t) => t.path === normalizedPath);
    if (existing) {
      setActiveTabPath(normalizedPath);
      return;
    }

    try {
      const content = await AppService.ReadFile(normalizedPath);
      const newTab: EditorTab = {
        path: normalizedPath,
        name: name,
        isDirty: false,
        content: content || '',
        originalContent: content || '',
        language: getLanguageFromPath(normalizedPath),
        line: 1,
        col: 1,
      };

      setOpenTabs((prev) => {
        if (prev.find((t) => t.path === newTab.path)) return prev;
        return [...prev, newTab];
      });
      setActiveTabPath(normalizedPath);
    } catch (err) {
      console.error('Failed to read file by path:', err);
    }
  }, [openTabs]);

  const handleOpenDiff = useCallback(async (node: FileNode) => {
    if (node.isDir) return;
    const diffPath = `diff://${node.path}`;
    setSelectedFilePath(node.path);

    // Check if diff tab is already open
    const existing = openTabs.find((t) => t.path === diffPath);
    if (existing) {
      setActiveTabPath(diffPath);
      return;
    }

    try {
      // Fetch both the current content on disk and the original content from HEAD
      const currentContent = await AppService.ReadFile(node.path);
      const headContent = await AppService.GetGitFileAtHead(workspaceRoot, node.path);

      const newTab: EditorTab = {
        path: diffPath,
        name: `git diff: ${node.name}`,
        isDirty: false,
        content: currentContent || '',
        originalContent: currentContent || '',
        headContent: headContent || '',
        language: getLanguageFromPath(node.path),
        line: 1,
        col: 1,
        isDiff: true,
      };

      setOpenTabs((prev) => {
        if (prev.find((t) => t.path === newTab.path)) return prev;
        return [...prev, newTab];
      });
      setActiveTabPath(diffPath);
    } catch (err) {
      console.error('Failed to open diff:', err);
      showToast('Failed to load git diff');
    }
  }, [openTabs, workspaceRoot]);

  const handleContentChange = (path: string, newContent: string) => {
    setOpenTabs((prev) =>
      prev.map((tab) => {
        if (tab.path === path) {
          const isDirty = newContent !== tab.originalContent;
          return { ...tab, content: newContent, isDirty };
        }
        return tab;
      })
    );
  };

  const handleSaveFile = async (path: string, directContent?: string): Promise<boolean> => {
    const tab = openTabs.find((t) => t.path === path);
    if (!tab) return false;

    const contentToSave = directContent !== undefined ? directContent : tab.content;
    let targetPath = path;

    try {
      if (path.startsWith('Untitled-')) {
        targetPath = await AppService.SaveFileDialog(tab.name);
        if (!targetPath) return false;
      }
      await AppService.WriteFile(targetPath, contentToSave);
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? { ...t, path: targetPath, name: targetPath.split(/[/\\]/).pop() || targetPath, isDirty: false, originalContent: contentToSave, content: contentToSave, hasConflict: false }
            : t
        )
      );
      if (targetPath !== path) setActiveTabPath(targetPath);
      if (workspaceRoot) refreshGit(workspaceRoot);
      showToast(`saved: ${(targetPath.split(/[/\\]/).pop() || targetPath).toLowerCase()}`);
      return true;
    } catch (err) {
      console.error('Failed to save file:', err);
      return false;
    }
  };

  const handleSaveAll = async () => {
    for (const tab of openTabs) {
      if (tab.isDirty) {
        await handleSaveFile(tab.path);
      }
    }
  };

  const handleCloseTab = useCallback((path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const tab = openTabs.find((t) => t.path === path);
    if (!tab) return;

    if (tab.isDirty) {
      setDialogState({
        isOpen: true,
        title: 'Unsaved Changes',
        message: `Do you want to save changes to "${tab.name}" before closing?`,
        confirmLabel: 'Save & Close',
        secondaryLabel: "Don't Save",
        isDestructive: false,
        onConfirm: async () => {
          if (await handleSaveFile(path)) closeTabDirect(path);
          setDialogState((prev) => ({ ...prev, isOpen: false }));
        },
        onSecondaryAction: () => {
          closeTabDirect(path);
          setDialogState((prev) => ({ ...prev, isOpen: false }));
        },
      });
      return;
    }

    closeTabDirect(path);
  }, [openTabs, handleSaveFile]);

  const closeTabDirect = (path: string) => {
    setOpenTabs((prev) => {
      const filtered = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) {
        const nextActive = filtered.length > 0 ? filtered[filtered.length - 1].path : '';
        setActiveTabPath(nextActive);
      }
      return filtered;
    });
  };

  // Conflict handling
  const handleReloadConflict = async (path: string) => {
    try {
      const diskContent = await AppService.ReadFile(path);
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? { ...t, content: diskContent, originalContent: diskContent, isDirty: false, hasConflict: false }
            : t
        )
      );
    } catch (err) {
      console.error('Failed to reload file from disk:', err);
    }
  };

  const handleKeepConflict = (path: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, hasConflict: false } : t))
    );
  };

  const handleNewTab = () => {
    let newId = 1;
    while (openTabs.some((t) => t.path === `Untitled-${newId}`)) {
      newId++;
    }
    const path = `Untitled-${newId}`;
    const newTab: EditorTab = {
      path,
      name: path,
      content: '',
      originalContent: '',
      isDirty: false, 
      language: 'plaintext',
      line: 1,
      col: 1,
    };
    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTabPath(path);
  };

  const switchTab = useCallback((direction: 'next' | 'prev') => {
    if (openTabs.length <= 1) return;
    const currIdx = openTabs.findIndex((t) => t.path === activeTabPath);
    const safeIdx = currIdx >= 0 ? currIdx : 0;
    const targetIdx = direction === 'next'
      ? (safeIdx + 1) % openTabs.length
      : (safeIdx - 1 + openTabs.length) % openTabs.length;

    const targetTab = openTabs[targetIdx];
    if (targetTab) {
      setActiveTabPath(targetTab.path);
      showToast(`switched to ${targetTab.name.toLowerCase()}`);
    }
  }, [openTabs, activeTabPath, showToast]);

  useEffect(() => {
    const handleSwitchTabEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ direction: 'next' | 'prev' }>;
      if (customEvent.detail?.direction) {
        switchTab(customEvent.detail.direction);
      }
    };
    window.addEventListener('devwannacode:switch_tab', handleSwitchTabEvent);
    return () => window.removeEventListener('devwannacode:switch_tab', handleSwitchTabEvent);
  }, [switchTab]);

  const handleReorderTabs = (fromIndex: number, toIndex: number) => {
    setOpenTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  // --- Terminal Operations ---
  const createTerminalSession = async (cwd?: string, shellOverride?: string) => {
    const targetCwd = cwd || workspaceRoot || '';
    const shellToUse = shellOverride || appSettings.defaultShell;
    try {
      const session = await AppService.CreateTerminal(
        targetCwd,
        shellToUse,
        80,
        24
      );

      const tabCount = terminalTabs.length + 1;
      const title = `${session.title} ${tabCount}`;

      const newTab: TerminalTabItem = {
        id: session.id,
        title,
        exited: false,
        exitCode: 0,
      };

      setTerminalTabs((prev) => [...prev, newTab]);
      setActiveTerminalId(session.id);
      setTerminalVisible(true);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  };

  const handleCloseTerminal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await AppService.CloseTerminal(id);
      setTerminalTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (activeTerminalId === id) {
          const nextActive = filtered.length > 0 ? filtered[filtered.length - 1].id : '';
          setActiveTerminalId(nextActive);
        }
        return filtered;
      });
    } catch (err) {
      console.error('Failed to close terminal:', err);
    }
  };

  const handleSessionExit = (id: string, exitCode: number) => {
    // DEBUG: always keep tab open so we can see what exit code is returned
    console.log(`[TERMINAL DEBUG] Session ${id} exited with code ${exitCode}`);
    setTerminalTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exited: true, exitCode } : t))
    );
  };

  const handleRenameTerminal = (id: string, newTitle: string) => {
    setTerminalTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle.trim() || t.title } : t))
    );
  };

  // --- Problem / Diagnostic Marker Click ---
  const handleSelectProblem = async (problem: ProblemMarker) => {
    if (!problem || !problem.resource) return;

    let targetPath = typeof problem.resource === 'string'
      ? problem.resource
      : problem.resource.fsPath || problem.resource.path || String(problem.resource);

    targetPath = targetPath.replace(/^file:\/\/\/?/i, '');
    if (/^\/[a-zA-Z]:/.test(targetPath)) {
      targetPath = targetPath.slice(1);
    }

    const normTarget = targetPath.replace(/\\/g, '/').toLowerCase();
    const matchedTab = openTabs.find(
      (t) => t.path.replace(/\\/g, '/').toLowerCase() === normTarget
    );

    if (!matchedTab) {
      try {
        const content = await AppService.ReadFile(targetPath);
        const fileName = targetPath.split(/[/\\]/).pop() || targetPath;
        const newTab: EditorTab = {
          path: targetPath,
          name: fileName,
          isDirty: false,
          content: content || '',
          originalContent: content || '',
          language: getLanguageFromPath(targetPath),
          line: problem.startLineNumber || 1,
          col: problem.startColumn || 1,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(targetPath);
      } catch (err) {
        console.error('Failed to open file for problem:', err);
      }
    } else {
      setActiveTabPath(matchedTab.path);
    }

    setTargetLocation({
      path: matchedTab ? matchedTab.path : targetPath,
      line: problem.startLineNumber || 1,
      col: problem.startColumn || 1,
      timestamp: Date.now(),
    });
  };


  // --- Global Text Search Click ---
  const handleSelectSearchResult = async (path: string, lineNumber: number) => {
    const normTarget = path.replace(/\\/g, '/').toLowerCase();
    const matchedTab = openTabs.find(
      (t) => t.path.replace(/\\/g, '/').toLowerCase() === normTarget
    );

    if (!matchedTab) {
      try {
        const content = await AppService.ReadFile(path);
        const fileName = path.split(/[/\\]/).pop() || path;
        const newTab: EditorTab = {
          path,
          name: fileName,
          isDirty: false,
          content: content || '',
          originalContent: content || '',
          language: getLanguageFromPath(path),
          line: lineNumber,
          col: 1,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(path);
      } catch (err) {
        console.error('Failed to open search result:', err);
      }
    } else {
      setActiveTabPath(matchedTab.path);
    }

    setTargetLocation({
      path: matchedTab ? matchedTab.path : path,
      line: lineNumber,
      col: 1,
      timestamp: Date.now(),
    });
  };

  // --- Delete File/Folder Confirmation ---
  const handleRequestDelete = useCallback((path: string, isDir: boolean) => {
    const itemName = path.split('\\').pop()?.split('/').pop() || path;
    setDialogState({
      isOpen: true,
      title: isDir ? 'Delete Folder?' : 'Delete File?',
      message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await AppService.Delete(path);
          // If deleted file was open, close tab
          closeTabDirect(path);
          refreshFileTree();
        } catch (err) {
          console.error('Failed to delete item:', err);
        }
        setDialogState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [refreshFileTree]);

  // --- Split Editor Controls ---
  const handleToggleSplit = useCallback(() => {
    setIsSplit((prev) => {
      const next = !prev;
      if (next && !splitTabPath && openTabs.length > 0) {
        const other = openTabs.find((t) => t.path !== activeTabPath) || openTabs[0];
        if (other) setSplitTabPath(other.path);
      }
      return next;
    });
  }, [splitTabPath, openTabs, activeTabPath]);

  const handleCloseSplit = useCallback(() => {
    setIsSplit(false);
  }, []);

  const handleToggleZenMode = useCallback(() => {
    const isEnteringZen = explorerVisible || terminalVisible;
    if (isEnteringZen) {
      setExplorerVisible(false);
      setTerminalVisible(false);
      showToast('zen mode: on');
    } else {
      setExplorerVisible(true);
      setTerminalVisible(true);
      showToast('zen mode: off');
    }
  }, [explorerVisible, terminalVisible, showToast]);

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P -> Quick Open
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsQuickOpenOpen(true);
        setIsCommandPaletteOpen(false);
        return;
      }

      // Ctrl+\ -> Toggle Split Editor
      if (e.ctrlKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        handleToggleSplit();
        return;
      }

      // Ctrl+O -> Open Folder
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFolderPicker();
        return;
      }

      // Ctrl+Shift+E -> File Explorer (Sidebar)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setSidebarTab('explorer');
        setExplorerVisible(true);
        return;
      }

      // Ctrl+Shift+F -> Global Text Search (Sidebar)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSidebarTab('search');
        setExplorerVisible(true);
        return;
      }



      // Ctrl+K -> Command Palette
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        setIsQuickOpenOpen(false);
        return;
      }

      // Ctrl+Shift+S -> Save All
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveAll();
        return;
      }

      // Ctrl+S -> Save Active Tab
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeTabPath) {
          handleSaveFile(activeTabPath);
        }
        return;
      }

      // Ctrl+Tab & Ctrl+Shift+Tab -> Quick Tab Switcher (Next / Prev)
      if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
        e.preventDefault();
        e.stopPropagation();
        switchTab(e.shiftKey ? 'prev' : 'next');
        return;
      }

      // Ctrl+G -> Go to Line
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        showToast('go to line');
        window.dispatchEvent(new CustomEvent('devwannacode:gotoline'));
        return;
      }

      // Alt+Z -> Toggle Word Wrap
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('devwannacode:toggle_wordwrap'));
        return;
      }

      // Ctrl+W -> Close Active Tab
      if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeTabPath) {
          const tabToClose = openTabs.find(t => t.path === activeTabPath);
          showToast(`closed ${tabToClose?.name.toLowerCase() || 'tab'}`);
          handleCloseTab(activeTabPath);
        }
        return;
      }

      // Ctrl+B -> Toggle Explorer
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setExplorerVisible((prev) => {
          showToast(prev ? 'sidebar hidden' : 'sidebar shown');
          return !prev;
        });
        return;
      }

      // Ctrl+` -> Toggle Terminal
      if (e.ctrlKey && !e.shiftKey && e.key === '`') {
        e.preventDefault();
        setTerminalVisible((prev) => {
          showToast(prev ? 'terminal hidden' : 'terminal shown');
          return !prev;
        });
        return;
      }

      // Ctrl+Shift+` -> New Terminal
      if (e.ctrlKey && e.shiftKey && e.key === '`') {
        e.preventDefault();
        showToast('new terminal session');
        createTerminalSession();
        return;
      }

      // Ctrl+, -> Settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        showToast('opened settings');
        setIsSettingsOpen(true);
        return;
      }

      // Ctrl+Shift+/ -> Shortcuts Cheat Sheet Modal
      if (e.ctrlKey && e.shiftKey && (e.key === '?' || e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        showToast('shortcuts');
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      // F11 -> Zen Mode
      if (e.key === 'F11') {
        e.preventDefault();
        handleToggleZenMode();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabPath, openTabs, workspaceRoot, appSettings, handleToggleZenMode]);

  // --- Resizing Mouse Handlers ---
  const handleExplorerMouseDown = () => {
    isDraggingExplorer.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('is-resizing');
  };

  const handleTerminalMouseDown = () => {
    isDraggingTerminal.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('is-resizing');
  };

  const resizeRequestRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (resizeRequestRef.current !== null) cancelAnimationFrame(resizeRequestRef.current);
    resizeRequestRef.current = requestAnimationFrame(() => {
      if (isDraggingExplorer.current) {
        const newWidth = Math.max(160, Math.min(500, e.clientX));
        setExplorerWidth(newWidth);
      } else if (isDraggingTerminal.current) {
        const newWidth = Math.max(240, Math.min(800, window.innerWidth - e.clientX));
        setTerminalWidth(newWidth);
      }
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDraggingExplorer.current || isDraggingTerminal.current) {
      isDraggingExplorer.current = false;
      isDraggingTerminal.current = false;
      document.body.style.cursor = 'default';
      document.body.classList.remove('is-resizing');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (resizeRequestRef.current !== null) cancelAnimationFrame(resizeRequestRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Command palette actions
  const commandList: CommandItem[] = useMemo(() => [
    {
      id: 'open-folder',
      label: 'open folder',
      shortcut: 'ctrl+o',
      category: 'workspace',
      action: handleOpenFolderPicker,
    },
    {
      id: 'quick-open',
      label: 'quick open (file search)',
      shortcut: 'ctrl+p',
      category: 'navigation',
      action: () => setIsQuickOpenOpen(true),
    },
    {
      id: 'goto-line',
      label: 'go to line / column...',
      shortcut: 'ctrl+g',
      category: 'editor',
      action: () => {
        window.dispatchEvent(new CustomEvent('devwannacode:gotoline'));
      },
    },
    {
      id: 'global-search',
      label: 'find in files (global text search)',
      shortcut: 'ctrl+shift+f',
      category: 'navigation',
      action: () => {
        setSidebarTab('search');
        setExplorerVisible(true);
      },
    },
    {
      id: 'split-editor-right',
      label: 'split editor right',
      shortcut: 'ctrl+\\',
      category: 'editor',
      action: handleToggleSplit,
    },
    {
      id: 'toggle-word-wrap',
      label: 'toggle word wrap',
      shortcut: 'alt+z',
      category: 'editor',
      action: () => {
        window.dispatchEvent(new CustomEvent('devwannacode:toggle_wordwrap'));
      },
    },
    {
      id: 'close-split-editor',
      label: 'close split editor',
      category: 'editor',
      action: handleCloseSplit,
    },
    {
      id: 'new-terminal',
      label: 'new terminal',
      shortcut: 'ctrl+shift+`',
      category: 'terminal',
      action: () => createTerminalSession(),
    },
    {
      id: 'save-file',
      label: 'save file',
      shortcut: 'ctrl+s',
      category: 'file',
      action: () => activeTabPath && handleSaveFile(activeTabPath),
    },
    {
      id: 'save-all',
      label: 'save all files',
      shortcut: 'ctrl+shift+s',
      category: 'file',
      action: handleSaveAll,
    },
    {
      id: 'close-tab',
      label: 'close active tab',
      shortcut: 'ctrl+w',
      category: 'editor',
      action: () => activeTabPath && handleCloseTab(activeTabPath),
    },
    {
      id: 'toggle-explorer',
      label: 'toggle file explorer',
      shortcut: 'ctrl+b',
      category: 'view',
      action: () => setExplorerVisible((p) => !p),
    },
    {
      id: 'toggle-terminal',
      label: 'toggle terminal surface',
      shortcut: 'ctrl+`',
      category: 'view',
      action: () => setTerminalVisible((p) => !p),
    },
    {
      id: 'toggle-theme',
      label: `switch theme (current: ${appSettings.theme})`,
      category: 'view',
      action: () => {
        const themes = ['dark', 'nord', 'light', 'warm', 'monochrome'];
        const nextTheme = themes[(themes.indexOf(appSettings.theme) + 1) % themes.length];
        const updated = { ...appSettings, theme: nextTheme as any };
        setAppSettings(updated);
        AppService.SaveSettings(updated);
      },
    },
    {
      id: 'settings',
      label: 'open settings',
      shortcut: 'ctrl+,',
      category: 'preferences',
      action: () => setIsSettingsOpen(true),
    },
    {
      id: 'shortcuts-cheatsheet',
      label: 'keyboard shortcuts cheat sheet',
      shortcut: 'ctrl+shift+/',
      category: 'help',
      action: () => setIsShortcutsOpen(true),
    },
    {
      id: 'zen-mode',
      label: 'toggle zen mode',
      shortcut: 'f11',
      category: 'view',
      action: handleToggleZenMode,
    },
  ], [activeTabPath, openTabs, appSettings, workspaceRoot, handleToggleZenMode]);

  // Derived state for active tab
  const activeTab = useMemo(
    () => openTabs.find((t) => t.path === activeTabPath) || null,
    [openTabs, activeTabPath]
  );

  // Map Git file statuses for easy lookup
  const gitStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (gitStatus?.files) {
      for (const f of gitStatus.files) {
        const norm = f.path.replace(/\\/g, '/');
        const normBack = f.path.replace(/\//g, '\\');
        map[norm] = f.status;
        map[normBack] = f.status;
        map[f.path] = f.status;
      }
    }
    return map;
  }, [gitStatus]);

  const projectName = useMemo(() => {
    if (!workspaceRoot) return '';
    return workspaceRoot.split('\\').pop()?.split('/').pop() || workspaceRoot;
  }, [workspaceRoot]);

  if (isInitializing) {
    return null;
  }

  return (
    <div className="app-shell">
      {/* Top Chrome */}
      <TopBar
        projectName={projectName}
        activeFileName={activeTab?.name || ''}
        onOpenFolder={handleOpenFolderPicker}
        onOpenQuickOpen={() => setIsQuickOpenOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleExplorer={() => setExplorerVisible((p) => !p)}
        onToggleTerminal={() => setTerminalVisible((p) => !p)}
        onToggleTheme={() => {
          const themes = ['dark', 'nord', 'light', 'warm', 'monochrome'];
          const next = themes[(themes.indexOf(appSettings.theme) + 1) % themes.length];
          const updated = { ...appSettings, theme: next as any };
          setAppSettings(updated);
          AppService.SaveSettings(updated);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleZenMode={handleToggleZenMode}
        explorerVisible={explorerVisible}
        terminalVisible={terminalVisible}
        theme={appSettings.theme as any}
      />

      {/* 3-Surface Workspace */}
      <main className="workspace-surface">
        {/* Left: Explorer & Search Sidebar */}
        <div
          className="panel-container"
          style={{
            width: explorerVisible ? explorerWidth : 0,
            opacity: explorerVisible ? 1 : 0,
          }}
        >
          <div style={{ width: explorerWidth, height: '100%', flexShrink: 0 }} className="left-sidebar-wrapper">
            <div className="left-sidebar-content">
              {sidebarTab === 'explorer' ? (
                <Explorer
                  workspaceRoot={workspaceRoot}
                  tree={fileTree}
                  selectedPath={selectedFilePath}
                  gitStatusMap={gitStatusMap}
                  gitStatus={gitStatus}
                  onSelectFile={handleOpenFile}
                  onRefresh={refreshFileTree}
                  onOpenFilePicker={handleOpenFolderPicker}
                  onRequestDelete={handleRequestDelete}
                  onShowToast={showToast}
                  onOpenDiff={handleOpenDiff}
                />
              ) : (
                <Suspense fallback={null}>
                <GlobalSearch
                  workspaceRoot={workspaceRoot}
                  onSelectResult={handleSelectSearchResult}
                />
                </Suspense>
              )}
            </div>
          </div>
        </div>

        {explorerVisible && <div className="panel-resizer" onMouseDown={handleExplorerMouseDown} />}

        {/* Center: Monaco Code Editor */}
        <div className="editor-surface-wrapper">
          <Suspense fallback={null}>
          <Editor
            tabs={openTabs}
            activeTab={activeTab}
            settings={appSettings}
            theme={appSettings.theme as any}
            onSelectTab={(path) => setActiveTabPath(path)}
            onCloseTab={handleCloseTab}
            onContentChange={handleContentChange}
            onSaveFile={handleSaveFile}
            onReloadConflict={handleReloadConflict}
            onKeepConflict={handleKeepConflict}
            onNewTab={handleNewTab}
            onReorderTabs={handleReorderTabs}
            onOpenQuickOpen={() => setIsQuickOpenOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onToggleExplorer={() => setExplorerVisible((p) => !p)}
            onToggleTerminal={() => setTerminalVisible((p) => !p)}
            onMarkersUpdate={(markers) => setProblems(markers)}
            targetLocation={targetLocation}
            workspacePath={workspaceRoot}
            isSplit={isSplit}
            splitTabPath={splitTabPath}
            recentProjects={recentProjects}
            onOpenProject={(path) => openWorkspace(path)}
            onOpenFolder={handleOpenFolderPicker}
            onToggleSplit={handleToggleSplit}
            onSelectSplitTab={(path) => setSplitTabPath(path)}
            onCloseSplit={handleCloseSplit}
          />
          </Suspense>

        </div>

        {/* Right: Integrated Terminal & Problems Panel */}
        {terminalVisible && <div className="panel-resizer" onMouseDown={handleTerminalMouseDown} />}
        <div
          className="panel-container"
          style={{
            width: terminalVisible ? terminalWidth : 0,
            opacity: terminalVisible ? 1 : 0,
          }}
        >
          <div style={{ width: terminalWidth, height: '100%', flexShrink: 0 }} className="right-panel-wrapper">
            <div className="right-panel-body">
              <div style={{ display: bottomPanelTab === 'terminal' ? 'block' : 'none', height: '100%', width: '100%' }}>
                <Suspense fallback={null}>
                <Terminal
                  tabs={terminalTabs}
                  activeId={activeTerminalId}
                  theme={appSettings.theme as any}
                  onSelectTab={(id) => setActiveTerminalId(id)}
                  onCloseTab={handleCloseTerminal}
                  onNewTerminal={() => createTerminalSession()}
                  onSessionExit={handleSessionExit}
                  onRenameTab={handleRenameTerminal}
                />
                </Suspense>
              </div>
              {bottomPanelTab === 'problems' && (
                <ProblemsPanel
                  problems={problems}
                  onSelectProblem={handleSelectProblem}
                />
              )}
            </div>
            <div className="right-panel-header">
              <button
                className={`panel-tab-btn ${bottomPanelTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setBottomPanelTab('terminal')}
              >
                <span>terminal</span>
              </button>
              <button
                className={`panel-tab-btn ${bottomPanelTab === 'problems' ? 'active' : ''}`}
                onClick={() => setBottomPanelTab('problems')}
              >
                <span>problems</span>
                <span className="panel-tab-badge">{problems.length}</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom: Status Bar */}
      <StatusBar
        gitStatus={gitStatus}
        language={activeTab?.language || 'plaintext'}
        lspLoadingMessage={lspLoadingMessage}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Overlays & Modals */}
      <Suspense fallback={null}>
      <QuickOpen
        isOpen={isQuickOpenOpen}
        workspaceRoot={workspaceRoot}
        commands={commandList}
        onSelectFile={handleOpenFile}
        onClose={() => setIsQuickOpenOpen(false)}
      />


      <CommandPalette
        isOpen={isCommandPaletteOpen}
        commands={commandList}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={appSettings}
        recentProjects={recentProjects}
        onUpdateSettings={(newSettings) => {
          setAppSettings(newSettings);
          AppService.SaveSettings(newSettings);
        }}
        onOpenRecent={(path) => openWorkspace(path)}
        onRemoveRecent={async (path, e) => {
          e.stopPropagation();
          await AppService.RemoveRecentProject(path);
          const recents = await AppService.GetRecentProjects();
          setRecentProjects(recents || []);
        }}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
      </Suspense>

      <Dialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        isDestructive={dialogState.isDestructive}
        confirmLabel={dialogState.confirmLabel}
        secondaryLabel={dialogState.secondaryLabel}
        onConfirm={dialogState.onConfirm}
        onCancel={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
        onSecondaryAction={dialogState.onSecondaryAction}
      />

      {/* Global Toast Notification */}
      <div className={`app-toast ${toast.visible ? 'visible' : ''}`}>
        <span>{toast.message}</span>
        {toast.actionLabel && toast.onAction && (
          <button 
            className="app-toast-action"
            onClick={(e) => {
              e.stopPropagation();
              toast.onAction!();
              setToast(prev => ({ ...prev, visible: false }));
            }}
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
export default App;
