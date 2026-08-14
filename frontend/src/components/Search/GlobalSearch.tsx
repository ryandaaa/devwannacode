import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search as SearchIcon, ChevronRight, ChevronDown, Loader, X, FileText } from 'lucide-react';
import { TextSearchResult } from '../../types';
import * as AppService from '../../../wailsjs/go/main/App';
import './GlobalSearch.css';

interface GlobalSearchProps {
  workspaceRoot: string;
  onSelectResult: (path: string, lineNumber: number) => void;
  onClose?: () => void;
}

interface GroupedResults {
  relPath: string;
  fileName: string;
  path: string;
  matches: TextSearchResult[];
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  workspaceRoot,
  onSelectResult,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TextSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);


  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  // Perform search with debounce
  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim() || !workspaceRoot) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const searchRes = await AppService.SearchTextContent(workspaceRoot, query.trim(), 300);
        if (requestId === searchRequestRef.current) setResults(searchRes || []);
      } catch (err) {
        console.error('Search error:', err);
        if (requestId === searchRequestRef.current) setResults([]);
      } finally {
        if (requestId === searchRequestRef.current) setIsSearching(false);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, workspaceRoot]);

  // Group results by file
  const groupedResults = useMemo(() => {
    const map = new Map<string, GroupedResults>();
    for (const res of results) {
      if (!map.has(res.path)) {
        map.set(res.path, {
          relPath: res.relPath,
          fileName: res.fileName,
          path: res.path,
          matches: [],
        });
      }
      map.get(res.path)!.matches.push(res);
    }
    return Array.from(map.values());
  }, [results]);

  const toggleFileCollapse = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  // Helper to highlight matching text
  const renderHighlightedLine = (content: string, searchTerm: string) => {
    if (!searchTerm) return content;
    const lowerContent = content.toLowerCase();
    const lowerTerm = searchTerm.toLowerCase();
    const idx = lowerContent.indexOf(lowerTerm);
    if (idx === -1) return content;

    const before = content.slice(0, idx);
    const match = content.slice(idx, idx + searchTerm.length);
    const after = content.slice(idx + searchTerm.length);

    return (
      <>
        {before}
        <span className="search-match-highlight">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div className="global-search-container">
      <div className="global-search-header">
        <span className="global-search-title">search</span>
        <span style={{ fontSize: '10px', color: 'var(--content-secondary)', opacity: 0.6, marginLeft: 'auto', fontWeight: 500 }}>
          ctrl+shift+e to return
        </span>
      </div>

      <div className="global-search-input-box">
        <div className="global-search-input-wrapper">
          <SearchIcon size={14} className="search-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="global-search-input"
            placeholder="search files in workspace..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isSearching ? (
            <Loader size={14} className="search-spinner" />
          ) : query ? (
            <button className="search-clear-btn" onClick={handleClear} title="Clear">
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="global-search-meta">
        {query.trim() === '' ? (
          <span className="search-meta-text">type a query to search across files</span>
        ) : isSearching ? (
          <span className="search-meta-text">searching...</span>
        ) : results.length === 0 ? (
          <span className="search-meta-text">no results found</span>
        ) : (
          <span className="search-meta-text">
            {results.length} match{results.length !== 1 ? 'es' : ''} in {groupedResults.length} file{groupedResults.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="global-search-results">
        {groupedResults.map((group) => {
          const isCollapsed = collapsedFiles.has(group.path);
          return (
            <div key={group.path} className="search-file-group">
              <div
                className="search-file-header"
                onClick={() => toggleFileCollapse(group.path)}
              >
                <span className="search-file-chevron">
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
                <FileText size={14} className="search-file-icon" />
                <span className="search-file-name">{group.fileName}</span>
                <span className="search-file-path">{group.relPath}</span>
                <span className="search-file-badge">{group.matches.length}</span>
              </div>

              {!isCollapsed && (
                <div className="search-matches-list">
                  {group.matches.map((item, idx) => (
                    <div
                      key={`${item.path}-${item.lineNumber}-${idx}`}
                      className="search-match-item"
                      onClick={() => onSelectResult(item.path, item.lineNumber)}
                    >
                      <span className="search-match-line-num">{item.lineNumber}</span>
                      <span className="search-match-content">
                        {renderHighlightedLine(item.lineContent, query)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
