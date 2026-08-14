import React, { useEffect, useRef } from 'react';
import './AutocompletePopup.css';

export interface EditorCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText: string;
  textEdit?: { range: any; newText: string };
  isSnippet?: boolean;
  sortText?: string;
}

interface Props {
  items: EditorCompletionItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (item: EditorCompletionItem) => void;
  onHover: (index: number) => void;
}

const getKindIcon = (kind?: number) => {
  // Rough mapping based on LSP CompletionItemKind
  switch (kind) {
    case 1: case 2: return { class: 'ac-kind-method', icon: 'm' }; // Method/Function
    case 3: case 4: return { class: 'ac-kind-method', icon: 'f' }; // Constructor/Field
    case 5: case 6: return { class: 'ac-kind-variable', icon: 'v' }; // Variable/Class
    case 7: return { class: 'ac-kind-class', icon: 'c' }; // Interface
    case 8: return { class: 'ac-kind-module', icon: 'M' }; // Module
    case 9: return { class: 'ac-kind-variable', icon: 'p' }; // Property
    case 10: return { class: 'ac-kind-module', icon: 'U' }; // Unit
    case 11: return { class: 'ac-kind-variable', icon: 'V' }; // Value
    case 12: return { class: 'ac-kind-class', icon: 'E' }; // Enum
    case 13: return { class: 'ac-kind-keyword', icon: 'k' }; // Keyword
    case 14: return { class: 'ac-kind-snippet', icon: 'S' }; // Snippet
    case 15: return { class: 'ac-kind-method', icon: 'C' }; // Color
    case 21: return { class: 'ac-kind-variable', icon: 'c' }; // Constant
    case 22: return { class: 'ac-kind-class', icon: 'S' }; // Struct
    case 23: return { class: 'ac-kind-method', icon: 'E' }; // Event
    case 24: return { class: 'ac-kind-method', icon: 'O' }; // Operator
    case 25: return { class: 'ac-kind-class', icon: 'T' }; // TypeParameter
    default: return { class: 'ac-kind-keyword', icon: '?' };
  }
};

export const AutocompletePopup: React.FC<Props> = ({ items, selectedIndex, position, onSelect, onHover }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll selected item into view
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        const top = selectedEl.offsetTop;
        const bottom = top + selectedEl.offsetHeight;
        const viewTop = listRef.current.scrollTop;
        const viewBottom = viewTop + listRef.current.offsetHeight;

        if (top < viewTop) {
          listRef.current.scrollTop = top;
        } else if (bottom > viewBottom) {
          listRef.current.scrollTop = bottom - listRef.current.offsetHeight;
        }
      }
    }
  }, [selectedIndex]);

  return (
    <div 
      className="autocomplete-popup" 
      style={{ top: position.top, left: position.left }}
    >
      <div className="autocomplete-header">
        <span>SUGGESTIONS ({items.length})</span>
      </div>
      <div className="autocomplete-list" ref={listRef}>
        {items.map((item, idx) => {
          const kind = getKindIcon(item.kind);
          return (
            <div 
              key={idx}
              className={`autocomplete-item ${idx === selectedIndex ? 'selected' : ''}`}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onHover(idx)}
            >
              <div className={`ac-kind-icon ${kind.class}`}>{kind.icon}</div>
              <div className="ac-label">{item.label}</div>
              {item.detail && <div className="ac-detail">{item.detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
