import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FilePlus,
  FolderPlus,
  RefreshCw,
  FolderMinus,
  FolderOpen,
  Edit2,
  Trash2,
  Copy,
  ExternalLink,
  ClipboardList,
  GitCompare,
  ChevronRight
} from 'lucide-react';
import { FileNode, GitStatus } from '../../types';
import { ExplorerRow } from './ExplorerRow';
import { FileIcon } from '../Common/FileIcon';
import * as App from '../../../wailsjs/go/main/App';
import './Explorer.css';

interface ExplorerProps {
  workspaceRoot: string;
  tree: FileNode | null;
  selectedPath: string;
  gitStatusMap: Record<string, string>;
  gitStatus?: GitStatus | null;
  onSelectFile: (node: FileNode) => void;
  onRefresh: () => void;
  onOpenFilePicker: () => void;
  onRequestDelete: (path: string, isDir: boolean) => void;
  onShowToast?: (message: string) => void;
  onOpenDiff?: (node: FileNode) => void;
}

interface ContextMenuState {
  visible: boolean;
  closing: boolean;
  x: number;
  y: number;
  node: FileNode | null;
}

interface InlineCreateState {
  visible: boolean;
  parentDir: string;
  isFolder: boolean;
}

export const Explorer = React.memo<ExplorerProps>(({
  workspaceRoot,
  tree,
  selectedPath,
  gitStatusMap,
  gitStatus,
  onSelectFile,
  onRefresh,
  onOpenFilePicker,
  onRequestDelete,
  onShowToast,
  onOpenDiff,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [inlineCreate, setInlineCreate] = useState<InlineCreateState>({
    visible: false,
    parentDir: '',
    isFolder: false,
  });
  const [createName, setCreateName] = useState('');
  const [isSourceControlOpen, setIsSourceControlOpen] = useState(false);
  const [sourceControlHeight, setSourceControlHeight] = useState(200);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    closing: false,
    x: 0,
    y: 0,
    node: null,
  });

  const createInputRef = useRef<HTMLInputElement>(null);

  // Auto-expand root folder when loaded
  useEffect(() => {
    if (tree && tree.path) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.add(tree.path);
        return next;
      });
    }
  }, [tree]);

  useEffect(() => {
    if (inlineCreate.visible) {
      setTimeout(() => {
        createInputRef.current?.focus();
      }, 50);
    }
  }, [inlineCreate.visible]);

  // F2 Shortcut for Inline Rename
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.classList.contains('input')
        );
        if (selectedPath && !isInputFocused && !renamingPath) {
          e.preventDefault();
          e.stopPropagation();
          setRenamingPath(selectedPath);
          window.dispatchEvent(new CustomEvent('devwannacode:toast', {
            detail: { message: 'inline rename' }
          }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPath, renamingPath]);

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCollapseAll = () => {
    if (tree) {
      setExpandedFolders(new Set([tree.path]));
    } else {
      setExpandedFolders(new Set());
    }
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      if (onShowToast) onShowToast("Refreshed success");
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      closing: false,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  const handleContainerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceRoot) return;
    setContextMenu({
      visible: true,
      closing: false,
      x: e.clientX,
      y: e.clientY,
      node: null,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => {
      if (!prev.visible || prev.closing) return prev;
      return { ...prev, closing: true };
    });
  };

  useEffect(() => {
    let timer: any;
    if (contextMenu.closing) {
      timer = setTimeout(() => {
        setContextMenu((prev) => ({ ...prev, visible: false, closing: false }));
      }, 150); // Match CSS animation duration
    }
    return () => clearTimeout(timer);
  }, [contextMenu.closing]);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible && !contextMenu.closing) {
        closeContextMenu();
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    document.addEventListener('contextmenu', handleGlobalClick);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('contextmenu', handleGlobalClick);
    };
  }, [contextMenu.visible, contextMenu.closing]);

  // Vertical resizing logic
  const isResizingVertical = useRef(false);
  const isDragSignificant = useRef(false);
  const dragStartY = useRef(0);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingVertical.current = true;
    isDragSignificant.current = false;
    dragStartY.current = e.clientY;
    document.body.style.cursor = 'row-resize';
    document.addEventListener('mousemove', handleVerticalDrag);
    document.addEventListener('mouseup', handleVerticalDragEnd);
  };

  const handleVerticalDrag = (e: MouseEvent) => {
    if (!isResizingVertical.current) return;
    
    if (Math.abs(e.clientY - dragStartY.current) > 3) {
      if (!isDragSignificant.current) {
        isDragSignificant.current = true;
        if (e.clientY < dragStartY.current) {
          setIsSourceControlOpen(true);
        }
      }
    }

    const newHeight = window.innerHeight - e.clientY;
    const clamped = Math.max(100, Math.min(newHeight, window.innerHeight * 0.8));
    setSourceControlHeight(clamped);
  };

  const handleVerticalDragEnd = () => {
    isResizingVertical.current = false;
    document.body.style.cursor = 'default';
    document.removeEventListener('mousemove', handleVerticalDrag);
    document.removeEventListener('mouseup', handleVerticalDragEnd);

    if (!isDragSignificant.current) {
      setIsSourceControlOpen(prev => !prev);
    }
  };

  const startCreate = (isFolder: boolean, parentDir?: string) => {
    closeContextMenu();
    const targetDir = parentDir || (contextMenu.node ? (contextMenu.node.isDir ? contextMenu.node.path : workspaceRoot) : workspaceRoot);
    setInlineCreate({
      visible: true,
      parentDir: targetDir,
      isFolder,
    });
    setCreateName('');
    // Expand parent folder
    if (targetDir) {
      setExpandedFolders((prev) => new Set(prev).add(targetDir));
    }
  };

  const handleCreateSubmit = async () => {
    const rawName = createName.trim();
    if (!rawName) {
      setInlineCreate({ visible: false, parentDir: '', isFolder: false });
      return;
    }
    if (rawName.includes('..') || rawName.startsWith('/') || rawName.startsWith('\\')) {
      onShowToast?.('invalid name');
      setInlineCreate({ visible: false, parentDir: '', isFolder: false });
      return;
    }

    const cleanName = rawName.replace(/[\/\\:*?"<>|]/g, '_');
    const baseDir = inlineCreate.parentDir || workspaceRoot;
    const separator = baseDir.includes('\\') ? '\\' : '/';
    const fullPath = `${baseDir}${separator}${cleanName}`;

    try {
      if (inlineCreate.isFolder) {
        await App.CreateDirectory(fullPath);
      } else {
        await App.CreateFile(fullPath);
      }
      setInlineCreate({ visible: false, parentDir: '', isFolder: false });
      onRefresh();
      if (!inlineCreate.isFolder) {
        onSelectFile({
          name: cleanName,
          path: fullPath,
          relPath: cleanName,
          isDir: false,
          size: 0,
          modTime: new Date().toISOString(),
          extension: cleanName.includes('.') ? `.${cleanName.split('.').pop()}` : '',
        });
      }
    } catch (err) {
      console.error('Failed to create file/folder:', err);
    }
  };

  const handleRenameSubmit = async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    const rawName = newName.trim();
    if (!rawName || rawName.includes('..') || rawName.startsWith('/') || rawName.startsWith('\\')) {
      onShowToast?.('invalid name');
      return;
    }
    const cleanName = rawName.replace(/[\/\\:*?"<>|]/g, '_');
    const lastSlash = Math.max(oldPath.lastIndexOf('\\'), oldPath.lastIndexOf('/'));
    const parent = lastSlash >= 0 ? oldPath.substring(0, lastSlash) : workspaceRoot;
    const separator = parent.includes('\\') ? '\\' : '/';
    const newPath = `${parent}${separator}${cleanName}`;
    if (oldPath === newPath) return;

    try {
      await App.Rename(oldPath, newPath);
      onRefresh();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  };

  const handleMoveFile = async (sourcePath: string, targetDirPath: string) => {
    if (sourcePath === targetDirPath) return;
    const fileName = sourcePath.split(/[/\\]/).pop();
    if (!fileName) return;
    const newPath = `${targetDirPath}\\${fileName}`;
    if (sourcePath === newPath) return;

    try {
      await App.Rename(sourcePath, newPath);
      onRefresh();
    } catch (err) {
      console.error('Failed to move file:', err);
    }
  };

  const handleCopyPath = () => {
    if (contextMenu.node) {
      navigator.clipboard.writeText(contextMenu.node.path);
    }
    closeContextMenu();
  };

  const handleCopyRelativePath = () => {
    if (contextMenu.node) {
      navigator.clipboard.writeText(contextMenu.node.relPath);
    }
    closeContextMenu();
  };

  const handleRevealInOS = async () => {
    if (contextMenu.node) {
      try {
        // @ts-ignore
        await App.RevealInOS(contextMenu.node.path);
      } catch (err) {
        console.error('Failed to reveal in OS:', err);
      }
    }
    closeContextMenu();
  };

  return (
    <div className="explorer-container" onClick={closeContextMenu} onContextMenu={handleContainerContextMenu}>
      <div className="explorer-header">
        <span className="explorer-title">explorer</span>
        <div className="explorer-header-actions">
          {workspaceRoot && (
            <>
              <button
                className="explorer-header-btn"
                onClick={() => startCreate(false)}
                title="New File"
                aria-label="New File"
              >
                <FilePlus size={13} strokeWidth={1.5} />
              </button>
              <button
                className="explorer-header-btn"
                onClick={() => startCreate(true)}
                title="New Folder"
                aria-label="New Folder"
              >
                <FolderPlus size={13} strokeWidth={1.5} />
              </button>
              <button
                className="explorer-header-btn"
                onClick={handleRefreshClick}
                title="Refresh Explorer"
                aria-label="Refresh Explorer"
              >
                <RefreshCw size={12} strokeWidth={1.5} className={isRefreshing ? 'spin-anim' : ''} />
              </button>
              <button
                className="explorer-header-btn"
                onClick={handleCollapseAll}
                title="Collapse All"
                aria-label="Collapse All"
              >
                <FolderMinus size={13} strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="explorer-sections">
        {/* Top: File Tree */}
        <div className="explorer-section-tree">
          <div className="explorer-tree">
            {!workspaceRoot ? (
              <div className="explorer-empty">
                <p>No folder opened.</p>
                <button
                  className="topbar-action-btn primary"
                  onClick={onOpenFilePicker}
                  style={{ marginTop: 8 }}
                >
                  <FolderOpen size={13} strokeWidth={1.5} />
                  <span>Open Folder</span>
                </button>
              </div>
            ) : (
              <>
                {inlineCreate.visible && (
                  <div className="explorer-inline-input-wrapper" style={{ paddingLeft: 16 }}>
                    <input
                      ref={createInputRef}
                      type="text"
                      className="explorer-inline-input"
                      placeholder={inlineCreate.isFolder ? 'folder name...' : 'file name...'}
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateSubmit();
                        if (e.key === 'Escape') setInlineCreate({ visible: false, parentDir: '', isFolder: false });
                      }}
                      onBlur={() => setInlineCreate({ visible: false, parentDir: '', isFolder: false })}
                    />
                  </div>
                )}

                {tree && !tree.name.endsWith('.trash_tmp') && (
                  <ExplorerRow
                    node={tree}
                    depth={0}
                    selectedPath={selectedPath}
                    expandedFolders={expandedFolders}
                    gitStatusMap={gitStatusMap}
                    renamingPath={renamingPath}
                    onSelectFile={onSelectFile}
                    onToggleFolder={handleToggleFolder}
                    onContextMenu={handleContextMenu}
                    onStartRename={(path) => setRenamingPath(path)}
                    onRenameSubmit={handleRenameSubmit}
                    onRenameCancel={() => setRenamingPath(null)}
                    onMoveFile={handleMoveFile}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Bottom: Source Control */}
        {gitStatus && gitStatus.isRepo && gitStatus.files && gitStatus.files.length > 0 && (
          <div 
            className={`explorer-section-git ${isSourceControlOpen ? 'open' : ''}`} 
            style={{ 
              height: isSourceControlOpen ? sourceControlHeight : 28,
              transition: isResizingVertical.current ? 'none' : 'height 0.25s cubic-bezier(0.2, 0, 0, 1)'
            }}
          >
            <div 
              className="explorer-header" 
              style={{ height: 28, minHeight: 28, borderTop: 'none', cursor: 'row-resize', paddingLeft: 8 }}
              onMouseDown={handleHeaderMouseDown}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight 
                  size={14} 
                  strokeWidth={1.5} 
                  style={{ 
                    transform: isSourceControlOpen ? 'rotate(90deg)' : 'none', 
                    transition: 'transform 0.15s ease',
                    color: 'var(--content-tertiary)'
                  }} 
                />
                <span className="explorer-title">source control</span>
                <span className="explorer-title" style={{ opacity: 0.5, marginLeft: 4 }}>{gitStatus.files.length}</span>
              </div>
            </div>
            
            {/* Always render list for smooth height animation */}
            <div className="explorer-git-list" style={{ opacity: isSourceControlOpen ? 1 : 0, transition: 'opacity 0.25s' }}>
              {gitStatus.files.map((file, idx) => {
                const isModified = file.status.includes('M');
                const isAdded = file.status.includes('A') || file.status.includes('?');
                const isDeleted = file.status.includes('D');
                const ext = file.path.includes('.') ? '.' + file.path.split('.').pop() : '';
                
                const handleDiffClick = () => {
                  if (onOpenDiff) {
                    onOpenDiff({
                      name: file.path.split(/[/\\]/).pop() || file.path,
                      path: `${workspaceRoot}\\${file.path.replace(/\//g, '\\')}`,
                      relPath: file.path,
                      isDir: false,
                      size: 0,
                      extension: ext,
                      modTime: new Date().toISOString()
                    });
                  }
                };

                return (
                  <div 
                    key={idx} 
                    className="explorer-row" 
                    style={{ paddingLeft: 12 }}
                    onClick={handleDiffClick}
                  >
                    <div className="explorer-row-icon">
                      <FileIcon name={file.path.split(/[/\\]/).pop() || file.path} />
                    </div>
                    <span className="explorer-row-name" style={{ opacity: isDeleted ? 0.5 : 1 }}>
                      {file.path}
                    </span>
                    <span 
                      className={`explorer-row-status ${isModified ? 'status-m' : isAdded ? 'status-a' : isDeleted ? 'status-d' : 'status-q'}`}
                    >
                      {isModified ? 'M' : isAdded ? 'A' : isDeleted ? 'D' : 'U'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className={`context-menu ${contextMenu.closing ? 'closing' : ''}`}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => startCreate(false, contextMenu.node?.isDir ? contextMenu.node.path : undefined)}
          >
            <FilePlus size={15} strokeWidth={1.5} />
            <span>New File</span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => startCreate(true, contextMenu.node?.isDir ? contextMenu.node.path : undefined)}
          >
            <FolderPlus size={15} strokeWidth={1.5} />
            <span>New Folder</span>
          </button>

          {contextMenu.node && (
            <>
              <div className="context-menu-separator" />
              <button
                className="context-menu-item"
                onClick={() => {
                  if (contextMenu.node) {
                    setRenamingPath(contextMenu.node.path);
                  }
                  closeContextMenu();
                }}
              >
                <Edit2 size={15} strokeWidth={1.5} />
                <span>Rename</span>
              </button>
              <button
                className="context-menu-item danger"
                onClick={() => {
                  if (contextMenu.node) {
                    onRequestDelete(contextMenu.node.path, contextMenu.node.isDir);
                  }
                  closeContextMenu();
                }}
              >
                <Trash2 size={15} strokeWidth={1.5} />
                <span>Delete</span>
              </button>
              <div className="context-menu-separator" />
              {onOpenDiff && !contextMenu.node.isDir && (
                <button
                  className="context-menu-item"
                  onClick={() => {
                    if (contextMenu.node) {
                      onOpenDiff(contextMenu.node);
                    }
                    closeContextMenu();
                  }}
                >
                  <GitCompare size={15} strokeWidth={1.5} />
                  <span>View Git Diff</span>
                </button>
              )}
              <button className="context-menu-item" onClick={handleRevealInOS}>
                <ExternalLink size={15} strokeWidth={1.5} />
                <span>Reveal in File Explorer</span>
              </button>
              <div className="context-menu-separator" />
              <button className="context-menu-item" onClick={handleCopyPath}>
                <Copy size={15} strokeWidth={1.5} />
                <span>Copy Full Path</span>
              </button>
              <button className="context-menu-item" onClick={handleCopyRelativePath}>
                <ClipboardList size={15} strokeWidth={1.5} />
                <span>Copy Relative Path</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

Explorer.displayName = 'Explorer';
