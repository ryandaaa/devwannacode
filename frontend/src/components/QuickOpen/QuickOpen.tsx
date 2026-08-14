import React, { useState, useEffect, useRef } from 'react';
import { FileNode, CommandItem } from '../../types';
import { Search, Terminal, ChevronRight } from 'lucide-react';
import * as App from '../../../wailsjs/go/main/App';
import { FileIcon } from '../Common/FileIcon';
import './QuickOpen.css';

interface QuickOpenProps {
  isOpen: boolean;
  workspaceRoot: string;
  commands?: CommandItem[];
  initialQuery?: string;
  onSelectFile: (node: FileNode) => void;
  onClose: () => void;
}

export const QuickOpen: React.FC<QuickOpenProps> = ({
  isOpen,
  workspaceRoot,
  commands = [],
  initialQuery = '',
  onSelectFile,
  onClose,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [fileResults, setFileResults] = useState<FileNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);

  const isCommandMode = query.startsWith('>');
  const commandQuery = isCommandMode ? query.slice(1).trim().toLowerCase() : '';

  const filteredCommands = isCommandMode
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(commandQuery) ||
          (cmd.category && cmd.category.toLowerCase().includes(commandQuery))
      )
    : [];

  useEffect(() => {
    if (isOpen) {
      const startQuery = initialQuery || '';
      setQuery(startQuery);
      setSelectedIndex(0);
      if (!startQuery.startsWith('>')) {
        searchFiles(startQuery);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, workspaceRoot, initialQuery]);

  const searchFiles = async (q: string) => {
    if (!workspaceRoot) {
      setFileResults([]);
      return;
    }
    try {
      const requestId = ++searchRequestRef.current;
      const files = await App.SearchFiles(workspaceRoot, q, 40);
      if (requestId === searchRequestRef.current) {
        setFileResults(files || []);
        setSelectedIndex(0);
      }
    } catch (e) {
      setFileResults([]);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelectedIndex(0);
    if (!val.startsWith('>')) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => searchFiles(val), 150);
    }
  };

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const totalResults = isCommandMode ? filteredCommands.length : fileResults.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalResults));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalResults) % Math.max(1, totalResults));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isCommandMode) {
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          cmd.action();
          onClose();
        }
      } else {
        const file = fileResults[selectedIndex];
        if (file) {
          onSelectFile(file);
          onClose();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  const renderHighlightedContext = (text: string, highlight: string) => {
    if (!highlight) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <strong key={i} className="highlight-text">{part}</strong>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrapper">
          {isCommandMode ? (
            <span className="palette-prefix">&gt;</span>
          ) : (
            <Search size={14} strokeWidth={1.5} color="var(--content-tertiary)" />
          )}
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder={
              isCommandMode
                ? 'type a command...'
                : 'search files by name or content (type > for commands)...'
            }
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="palette-list">
          {isCommandMode ? (
            filteredCommands.length === 0 ? (
              <div className="palette-empty">no matching commands</div>
            ) : (
              filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  className={`palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="palette-item-label">
                    {cmd.category && <span className="palette-item-category">{cmd.category.toLowerCase()}</span>}
                    <span>{cmd.label}</span>
                  </div>
                  {cmd.shortcut && (
                    <span className="palette-item-shortcut">{cmd.shortcut}</span>
                  )}
                </div>
              ))
            )
          ) : fileResults.length === 0 ? (
            <div className="palette-empty">no files found</div>
          ) : (
            fileResults.map((file, idx) => (
              <div
                key={file.path}
                className={`quickopen-item ${idx === selectedIndex ? 'selected' : ''} ${file.matchContext ? 'has-context' : ''}`}
                onClick={() => {
                  onSelectFile(file);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="quickopen-item-top">
                  <div className="quickopen-item-main">
                    <FileIcon name={file.name} size={13} />
                    <span className="quickopen-item-name">{file.name}</span>
                  </div>
                  <span className="quickopen-item-path">{file.relPath}</span>
                </div>
                {file.matchContext && (
                  <div className="quickopen-item-context">
                    <span className="context-text">
                      {renderHighlightedContext(file.matchContext, query)}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
