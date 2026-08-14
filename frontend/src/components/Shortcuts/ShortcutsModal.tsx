import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import './ShortcutsModal.css';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  items: { label: string; keys: string[] }[];
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const groups: ShortcutGroup[] = [
    {
      title: 'global & navigation',
      items: [
        { label: 'search files', keys: ['ctrl', 'p'] },
        { label: 'command palette', keys: ['ctrl', 'k'] },
        { label: 'open folder', keys: ['ctrl', 'o'] },
        { label: 'shortcuts', keys: ['ctrl', 'shift', '/'] },
        { label: 'settings', keys: ['ctrl', ','] },
        { label: 'zen mode', keys: ['f11'] },
      ],
    },
    {
      title: 'editor & files',
      items: [
        { label: 'switch tab (mru)', keys: ['ctrl', 'tab'] },
        { label: 'go to line', keys: ['ctrl', 'g'] },
        { label: 'toggle word wrap', keys: ['alt', 'z'] },
        { label: 'duplicate line', keys: ['shift', 'alt', '↓'] },
        { label: 'save active', keys: ['ctrl', 's'] },
        { label: 'save all', keys: ['ctrl', 'shift', 's'] },
        { label: 'close tab', keys: ['ctrl', 'w'] },
        { label: 'global search', keys: ['ctrl', 'shift', 'f'] },
      ],
    },
    {
      title: 'explorer',
      items: [
        { label: 'toggle sidebar', keys: ['ctrl', 'b'] },
        { label: 'inline rename', keys: ['f2'] },
        { label: 'delete file', keys: ['del'] },
      ],
    },
    {
      title: 'terminal',
      items: [
        { label: 'toggle panel', keys: ['ctrl', '`'] },
        { label: 'new session', keys: ['ctrl', 'shift', '`'] },
        { label: 'rename tab', keys: ['double click'] },
      ],
    },
    {
      title: 'smart editing & lsp',
      items: [
        { label: 'autocomplete/snippet', keys: ['tab'] },
        { label: 'code actions', keys: ['alt', 'enter'] },
        { label: 'go to definition', keys: ['f12'] },
        { label: 'rename symbol', keys: ['f2'] },
        { label: 'format document', keys: ['shift', 'alt', 'f'] },
      ],
    },
  ];

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shortcuts-modal-header">
          <div className="shortcuts-header-title">
            <h2>shortcuts</h2>
          </div>
          <button className="shortcuts-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Content Grid */}
        <div className="shortcuts-modal-body">
          <div className="shortcuts-grid">
            {groups.map((group, gIdx) => (
              <div key={gIdx} className="shortcuts-group">
                <div className="shortcuts-group-title">
                  <span>{group.title}</span>
                </div>
                <div className="shortcuts-list">
                  {group.items.map((item, iIdx) => (
                    <div key={iIdx} className="shortcut-row">
                      <span className="shortcut-label">{item.label}</span>
                      <div className="shortcut-keys">
                        {item.keys.map((k, kIdx) => (
                          <kbd key={kIdx} className="key-badge">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="shortcuts-modal-footer">
          <span>esc to dismiss</span>
        </div>
      </div>
    </div>
  );
};
