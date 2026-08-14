import React, { useState, useEffect } from 'react';
import { GitBranch, Loader2, CheckCircle2 } from 'lucide-react';
import { GitStatus } from '../../types';
import './StatusBar.css';

const TIPS = [
  "tip: press ctrl+p to quick open files",
  "tip: press ctrl+tab to switch recent tabs (mru)",
  "tip: press f2 to rename symbol in editor or file in explorer",
  "tip: press alt+enter on errors for quick fix code actions",
  "tip: press ctrl+k for command palette",
  "tip: press ctrl+` to toggle integrated terminal",
  "tip: press ctrl+shift+f to search across workspace",
  "tip: type emmet abbreviation (e.g. div.box) and press tab",
  "tip: press ctrl+, to configure settings & lsp",
  "tip: press ctrl+shift+/ for keyboard shortcuts cheat sheet",
];

interface StatusBarProps {
  gitStatus: GitStatus | null;
  language: string;
  lspLoadingMessage: string;
  onOpenCommandPalette: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  gitStatus,
  language,
  lspLoadingMessage,
  onOpenCommandPalette,
}) => {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  useEffect(() => {
    const handleCursorChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ line: number; col: number }>;
      if (customEvent.detail) {
        setCursorPos(customEvent.detail);
      }
    };
    window.addEventListener('devwannacode:cursor', handleCursorChange);
    return () => {
      window.removeEventListener('devwannacode:cursor', handleCursorChange);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const formatLanguage = (lang: string) => {
    if (!lang || lang === 'plaintext') return 'Plain Text';
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  };

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        {gitStatus?.isRepo ? (
          <div className="statusbar-item" title={`Branch: ${gitStatus.branch}`}>
            <GitBranch size={12} strokeWidth={1.5} />
            <span>{gitStatus.branch || 'main'}</span>

            {(gitStatus.addedLines > 0 || gitStatus.deletedLines > 0) && (
              <div className="statusbar-git-summary">
                {gitStatus.addedLines > 0 && (
                  <span className="statusbar-git-add">+{gitStatus.addedLines}</span>
                )}
                {gitStatus.deletedLines > 0 && (
                  <span className="statusbar-git-del">-{gitStatus.deletedLines}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="statusbar-item">
            <span>No Git</span>
          </div>
        )}

        {lspLoadingMessage && (
          <>
            <div className="statusbar-divider" />
            <div className="statusbar-item statusbar-lsp-loader" title="Downloading Language Server">
              {lspLoadingMessage === 'Ready' ? (
                 <CheckCircle2 size={12} strokeWidth={2} style={{ color: 'var(--success-color)' }} />
              ) : (
                 <Loader2 size={12} strokeWidth={2} className="lucide-spin" />
              )}
              <span>{lspLoadingMessage === 'Ready' ? 'LSP Ready' : lspLoadingMessage}</span>
            </div>
          </>
        )}
      </div>

      <div className="statusbar-center">
        <span className="statusbar-tip">{TIPS[currentTipIndex]}</span>
      </div>

      <div className="statusbar-right">
        <div className="statusbar-item" style={{ fontWeight: 600 }}>
          <span>DevWannaCode</span>
        </div>

        <div className="statusbar-divider" />

        <div
          className="statusbar-item interactive"
          onClick={onOpenCommandPalette}
          title="Encoding"
        >
          <span>UTF-8</span>
        </div>

        <div className="statusbar-divider" />

        <div
          className="statusbar-item interactive"
          onClick={onOpenCommandPalette}
          title="Line Ending"
        >
          <span>CRLF</span>
        </div>

        <div className="statusbar-divider" />

        <div
          className="statusbar-item interactive"
          onClick={onOpenCommandPalette}
          title="Language Mode"
        >
          <span>{formatLanguage(language)}</span>
        </div>

        <div className="statusbar-divider" />

        <div className="statusbar-item" title="Cursor Position">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
        </div>
      </div>
    </footer>
  );
};
