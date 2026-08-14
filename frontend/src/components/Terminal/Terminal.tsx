import React, { useState } from 'react';
import { TerminalTabItem } from '../../types';
import { TerminalInstance } from './TerminalInstance';
import { Terminal as TerminalIcon, Plus, X, PanelLeft, PanelTop } from 'lucide-react';
import './Terminal.css';


interface TerminalProps {
  tabs: TerminalTabItem[];
  activeId: string;
  theme: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTerminal: () => void;
  onSessionExit: (id: string, exitCode: number) => void;
  onRenameTab?: (id: string, newTitle: string) => void;
}

export const Terminal: React.FC<TerminalProps> = ({
  tabs,
  activeId,
  theme,
  onSelectTab,
  onCloseTab,
  onNewTerminal,
  onSessionExit,
  onRenameTab,
}) => {
  const [vertical, setVertical] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const activeTab = tabs.find(t => t.id === activeId);

  const handleStartRename = (tab: TerminalTabItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingTitle(tab.title || `terminal #${tabs.findIndex(t => t.id === tab.id) + 1}`);
  };

  const handleFinishRename = (id: string) => {
    if (editingTitle.trim() && onRenameTab) {
      onRenameTab(id, editingTitle.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDownRename = (id: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFinishRename(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingTabId(null);
    }
  };

  return (
    <div className={`terminal-container ${vertical ? 'terminal-layout-vertical' : 'terminal-layout-horizontal'}`}>

      {/* ── Tab bar ── */}
      <div className={`terminal-tabs-bar ${vertical ? 'terminal-tabs-bar--vertical' : ''}`}>

        {/* Tab list */}
        <div className="terminal-tabs-list"
          style={{ flexDirection: vertical ? 'column' : 'row' }}
        >
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeId;
            const num = idx + 1;
            const tabTitle = tab.title || `terminal #${num}`;
            return (
              <div
                key={tab.id}
                className={`terminal-tab ${isActive ? 'active' : ''} ${vertical ? 'terminal-tab--vertical' : ''}`}
                onClick={() => onSelectTab(tab.id)}
                title={`${tabTitle}${tab.exited ? ` (Exited ${tab.exitCode})` : ''} — Double-click to rename`}
              >
                {/* Number badge (Vertical only) */}
                {vertical && (
                  <span className={`terminal-tab-num-vertical ${tab.exited ? 'exited' : ''} ${isActive ? 'active' : ''}`}>
                    {num}
                  </span>
                )}

                {/* Label / Inline Rename */}
                {editingTabId === tab.id ? (
                  <input
                    type="text"
                    className="terminal-tab-rename-input"
                    value={editingTitle}
                    autoFocus
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleFinishRename(tab.id)}
                    onKeyDown={(e) => handleKeyDownRename(tab.id, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="terminal-tab-label"
                    onDoubleClick={(e) => handleStartRename(tab, e)}
                  >
                    {tabTitle}
                  </span>
                )}

                <button
                  className="terminal-tab-close"
                  onClick={(e) => onCloseTab(tab.id, e)}
                  aria-label={`Close ${tab.title}`}
                  title="Close"
                >
                  <X size={11} strokeWidth={1.5} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className={`terminal-actions ${vertical ? 'terminal-actions--vertical' : ''}`}>
          {vertical ? (
            <>
              <button
                className="terminal-action-btn"
                onClick={() => setVertical((v) => !v)}
                aria-label="Switch to horizontal tabs"
                title="Horizontal tabs"
              >
                <PanelTop size={15} strokeWidth={1.5} />
              </button>
              <button
                className="terminal-action-btn"
                onClick={onNewTerminal}
                aria-label="New Terminal"
                title="New Terminal (Ctrl+Shift+`)"
              >
                <Plus size={15} strokeWidth={1.5} />
              </button>
            </>
          ) : (
            <>
              <button
                className="terminal-action-btn"
                onClick={onNewTerminal}
                aria-label="New Terminal"
                title="New Terminal (Ctrl+Shift+`)"
              >
                <Plus size={15} strokeWidth={1.5} />
              </button>
              <button
                className="terminal-action-btn"
                onClick={() => setVertical((v) => !v)}
                aria-label="Switch to vertical tabs"
                title="Vertical tabs"
              >
                <PanelLeft size={15} strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Terminal surface ── */}
      <div className="terminal-view-wrapper">
        
        {/* Terminal Title Bar (Vertical Mode Only) */}
        {vertical && tabs.length > 0 && activeTab && (
          <div className="terminal-title-bar">
            <div className="terminal-title-left">
              <TerminalIcon size={13} strokeWidth={1.5} color="var(--content-secondary)" />
              {editingTabId === activeTab.id ? (
                <input
                  type="text"
                  className="terminal-tab-rename-input"
                  value={editingTitle}
                  autoFocus
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleFinishRename(activeTab.id)}
                  onKeyDown={(e) => handleKeyDownRename(activeTab.id, e)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="terminal-title-text"
                  onDoubleClick={(e) => handleStartRename(activeTab, e)}
                  title="Double click to rename terminal"
                >
                  {activeTab.title || `terminal #${tabs.findIndex(t => t.id === activeTab.id) + 1}`}
                </span>
              )}
              {activeTab.exited && (
                <span className="terminal-title-status">(Exited {activeTab.exitCode})</span>
              )}
            </div>
            <div className="terminal-title-right">
              <button
                className="terminal-title-action"
                onClick={(e) => onCloseTab(activeTab.id, e)}
                title="Close Terminal"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}

        {tabs.length === 0 ? (
          <div className="terminal-empty">
            <TerminalIcon size={22} strokeWidth={1.5} color="var(--content-tertiary)" />
            <p>No active terminal sessions.</p>
            <button
              className="topbar-action-btn"
              onClick={onNewTerminal}
              style={{ marginTop: 4 }}
            >
              <Plus size={13} strokeWidth={1.5} />
              <span>New Terminal</span>
            </button>
          </div>
        ) : (
          <div className="terminal-instances-area">
            {tabs.map((tab) => (
              <TerminalInstance
                key={tab.id}
                id={tab.id}
                isVisible={tab.id === activeId}
                theme={theme}
                onExit={(exitCode: number) => onSessionExit(tab.id, exitCode)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
