import React from 'react';
import {
  FolderOpen,
  Terminal,
  Sidebar,
  Sun,
  Moon,
  Settings,
  Search,
  Minus,
  Square,
  X,
  Plus,
  Focus
} from 'lucide-react';
import * as runtime from '../../../wailsjs/runtime/runtime';
import './TopBar.css';

interface TopBarProps {
  projectName: string;
  activeFileName?: string;
  onOpenFolder: () => void;
  onOpenQuickOpen: () => void;
  onOpenCommandPalette: () => void;
  onToggleExplorer: () => void;
  onToggleTerminal: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onToggleZenMode: () => void;
  explorerVisible: boolean;
  terminalVisible: boolean;
  theme: string;
  windowStyle?: 'mac' | 'windows';
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  activeFileName,
  onOpenFolder,
  onOpenQuickOpen,
  onOpenCommandPalette,
  onToggleExplorer,
  onToggleTerminal,
  onToggleTheme,
  onOpenSettings,
  onToggleZenMode,
  explorerVisible,
  terminalVisible,
  theme,
  windowStyle = 'mac',
}) => {
  const handleMinimise = () => {
    runtime.WindowMinimise();
  };

  const handleToggleMaximise = () => {
    runtime.WindowToggleMaximise();
  };

  const handleClose = () => {
    runtime.Quit();
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {windowStyle === 'mac' && (
          <div className="window-controls-mac">
            <button className="mac-btn close" onClick={handleClose} aria-label="Close">
              <X size={8} strokeWidth={3} />
            </button>
            <button className="mac-btn minimise" onClick={handleMinimise} aria-label="Minimise">
              <Minus size={8} strokeWidth={3} />
            </button>
            <button className="mac-btn maximise" onClick={handleToggleMaximise} aria-label="Maximise">
              <Plus size={8} strokeWidth={3} />
            </button>
          </div>
        )}
      </div>

      <div className="topbar-center" onDoubleClick={handleToggleMaximise}>
        <div className="topbar-breadcrumb">
          <span className="breadcrumb-project">{projectName ? projectName : 'DevWannaCode'}</span>
          {activeFileName && (
            <>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-file">{activeFileName}</span>
            </>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <button
          className="topbar-search-mini-btn"
          onClick={onOpenQuickOpen}
          aria-label="Search files"
          title="Search files (Ctrl+P)"
        >
          <Search size={13} strokeWidth={1.2} />
          <span>search</span>
          <span className="search-shortcut">ctrl+p</span>
        </button>
        <button
          className={`topbar-btn ${explorerVisible ? 'active' : ''}`}
          onClick={onToggleExplorer}
          aria-label="Toggle Explorer"
          title="Toggle Explorer (Ctrl+B)"
        >
          <Sidebar size={15} strokeWidth={1.2} />
        </button>

        <button
          className={`topbar-btn ${terminalVisible ? 'active' : ''}`}
          onClick={onToggleTerminal}
          aria-label="Toggle Terminal"
          title="Toggle Terminal (Ctrl+`)"
        >
          <Terminal size={15} strokeWidth={1.2} />
        </button>

        <button
          className={`topbar-btn ${!explorerVisible && !terminalVisible ? 'active' : ''}`}
          onClick={onToggleZenMode}
          aria-label="Toggle Zen Mode"
          title="Toggle Zen Mode (F11)"
        >
          <Focus size={15} strokeWidth={1.2} />
        </button>

        <button
          className="topbar-btn"
          onClick={onToggleTheme}
          aria-label="Toggle Theme"
          title={`Switch Theme (Current: ${theme})`}
        >
          {theme === 'dark' || theme === 'nord' ? (
            <Sun size={15} strokeWidth={1.2} />
          ) : (
            <Moon size={15} strokeWidth={1.2} />
          )}
        </button>

        <button
          className="topbar-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={15} strokeWidth={1.2} />
        </button>

        <div className="topbar-divider" />

        {windowStyle === 'windows' && (
          <div className="window-controls">
            <button
              className="window-btn"
              onClick={handleMinimise}
              aria-label="Minimise window"
            >
              <Minus size={13} strokeWidth={1.5} />
            </button>
            <button
              className="window-btn"
              onClick={handleToggleMaximise}
              aria-label="Maximise window"
            >
              <Square size={11} strokeWidth={1.5} />
            </button>
            <button
              className="window-btn close"
              onClick={handleClose}
              aria-label="Close window"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
