import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen
} from 'lucide-react';
import { FileNode } from '../../types';
import { FileIcon } from '../Common/FileIcon';

interface ExplorerRowProps {
  node: FileNode;
  depth: number;
  selectedPath: string;
  expandedFolders: Set<string>;
  gitStatusMap: Record<string, string>;
  renamingPath: string | null;
  onSelectFile: (node: FileNode) => void;
  onToggleFolder: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onStartRename: (path: string) => void;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
  onMoveFile: (sourcePath: string, targetDirPath: string) => void;
}

export const ExplorerRow: React.FC<ExplorerRowProps> = React.memo(({
  node,
  depth,
  selectedPath,
  expandedFolders,
  gitStatusMap,
  renamingPath,
  onSelectFile,
  onToggleFolder,
  onContextMenu,
  onStartRename,
  onRenameSubmit,
  onRenameCancel,
  onMoveFile,
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const [renameValue, setRenameValue] = useState(node.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(node.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isRenaming, node.name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (renameValue.trim() && renameValue !== node.name) {
        onRenameSubmit(node.path, renameValue.trim());
      } else {
        onRenameCancel();
      }
    } else if (e.key === 'Escape') {
      onRenameCancel();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDir) {
      onToggleFolder(node.path);
    } else {
      onSelectFile(node);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartRename(node.path);
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!node.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!node.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!node.isDir) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (sourcePath && sourcePath !== node.path) {
      onMoveFile(sourcePath, node.path);
    }
  };

  // Icon determination
  const renderIcon = () => {
    if (node.isDir) {
      return isExpanded ? (
        <FolderOpen size={14} strokeWidth={1.5} color="var(--accent)" />
      ) : (
        <Folder size={14} strokeWidth={1.5} color="var(--accent)" />
      );
    }

    return <FileIcon name={node.name} size={14} />;
  };

  // Git status for this file (normalize slash styles so both Windows \ and Unix / match)
  const relNorm = node.relPath ? node.relPath.replace(/\\/g, '/') : '';
  const pathNorm = node.path ? node.path.replace(/\\/g, '/') : '';
  const rawStatus = gitStatusMap[relNorm] || 
    gitStatusMap[node.relPath] || 
    gitStatusMap[pathNorm] || 
    gitStatusMap[node.path] || '';

  const getStatusClass = (status: string) => {
    if (status.includes('M')) return 'status-m';
    if (status.includes('A')) return 'status-a';
    if (status.includes('D')) return 'status-d';
    return 'status-q';
  };

  const getStatusBadge = (status: string) => {
    if (!status) return '';
    if (status.includes('M')) return 'M';
    if (status.includes('A')) return 'A';
    if (status.includes('D')) return 'D';
    if (status.includes('?')) return 'U';
    return status.trim() || 'M';
  };

  const gitStatusBadge = getStatusBadge(rawStatus);
  const gitStatusClass = getStatusClass(rawStatus);

  const paddingLeft = depth * 16 + 8;

  if (isRenaming) {
    return (
      <div className="explorer-inline-input-wrapper" style={{ paddingLeft }}>
        <input
          ref={inputRef}
          type="text"
          className="explorer-inline-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onRenameCancel}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`explorer-row ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
        title={node.path}
      >
        {Array.from({ length: depth }).map((_, i) => (
          <div
            key={i}
            className="explorer-indent-guide"
            style={{ left: i * 16 + 14 }}
          />
        ))}

        {node.isDir ? (
          <span className={`explorer-row-chevron ${isExpanded ? 'expanded' : ''}`}>
            <ChevronRight size={12} strokeWidth={1.5} />
          </span>
        ) : (
          <span style={{ width: 12, display: 'inline-block' }} />
        )}

        <span className="explorer-row-icon">{renderIcon()}</span>
        <span className={`explorer-row-name ${gitStatusBadge ? gitStatusClass + '-text' : ''}`}>
          {node.name}
        </span>

        {gitStatusBadge && (
          <span className={`explorer-row-status ${gitStatusClass}`}>
            {gitStatusBadge}
          </span>
        )}
      </div>

      {node.isDir && isExpanded && node.children && (
        <div className="explorer-children">
          {node.children
            .filter((child) => !child.name.endsWith('.trash_tmp'))
            .map((child) => (
            <ExplorerRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              gitStatusMap={gitStatusMap}
              renamingPath={renamingPath}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
              onContextMenu={onContextMenu}
              onStartRename={onStartRename}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onMoveFile={onMoveFile}
            />
          ))}
        </div>
      )}
    </>
  );
}, (prevProps, nextProps) => {
  const isExpandedEqual = prevProps.expandedFolders.has(prevProps.node.path) === nextProps.expandedFolders.has(nextProps.node.path);
  const isSelectedEqual = (prevProps.selectedPath === prevProps.node.path) === (nextProps.selectedPath === nextProps.node.path);
  const isRenamingEqual = (prevProps.renamingPath === prevProps.node.path) === (nextProps.renamingPath === nextProps.node.path);
  const isNodeEqual = prevProps.node === nextProps.node;
  const isDepthEqual = prevProps.depth === nextProps.depth;
  const isGitStatusEqual = prevProps.gitStatusMap === nextProps.gitStatusMap;

  return (
    isExpandedEqual &&
    isSelectedEqual &&
    isRenamingEqual &&
    isNodeEqual &&
    isDepthEqual &&
    isGitStatusEqual &&
    prevProps.onSelectFile === nextProps.onSelectFile &&
    prevProps.onToggleFolder === nextProps.onToggleFolder &&
    prevProps.onContextMenu === nextProps.onContextMenu &&
    prevProps.onStartRename === nextProps.onStartRename &&
    prevProps.onRenameSubmit === nextProps.onRenameSubmit &&
    prevProps.onRenameCancel === nextProps.onRenameCancel &&
    prevProps.onMoveFile === nextProps.onMoveFile
  );
});

ExplorerRow.displayName = 'ExplorerRow';
