import React, { useRef, useState } from 'react';
import { X, FileCode, Plus, Columns } from 'lucide-react';
import { EditorTab } from '../../types';

interface EditorTabsProps {
  tabs: EditorTab[];
  activePath: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onToggleSplit?: () => void;
  isSplit?: boolean;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTabs,
  onToggleSplit,
  isSplit,
}) => {

  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      // Convert vertical scroll to horizontal scroll
      if (e.deltaY !== 0) {
        scrollRef.current.scrollLeft += e.deltaY;
      }
    }
  };
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="editor-tabs-container">
      <div 
        className="editor-tabs-scroll-area" 
        ref={scrollRef} 
        onWheel={handleWheel}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.path === activePath;
          const isDragged = draggedIndex === index;
          const isDragOver = dragOverIndex === index;
          
          let dragClass = '';
          if (isDragOver && draggedIndex !== null && draggedIndex !== index) {
            dragClass = draggedIndex < index ? 'drag-over-right' : 'drag-over-left';
          }

          return (
            <div
              key={tab.path}
              draggable
              onDragStart={(e) => {
                setDraggedIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                // Optional: set a custom drag image or data
                e.dataTransfer.setData('text/plain', index.toString());
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedIndex !== index) {
                  setDragOverIndex(index);
                }
              }}
              onDragLeave={(e) => {
                if (dragOverIndex === index) {
                  setDragOverIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedIndex !== null && draggedIndex !== index) {
                  onReorderTabs(draggedIndex, index);
                }
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              className={`editor-tab ${isActive ? 'active' : ''} ${isDragged ? 'dragging' : ''} ${dragClass}`}
              onClick={() => onSelectTab(tab.path)}
              title={tab.path}
            >
              <FileCode size={13} strokeWidth={1.5} color={isActive ? 'var(--content-primary)' : 'var(--content-tertiary)'} />
              <span>{tab.name}</span>

              {tab.isDirty && (
                <span className="editor-tab-dirty" title="Unsaved changes">●</span>
              )}

              <button
                className="editor-tab-close"
                onClick={(e) => onCloseTab(tab.path, e)}
                aria-label={`Close ${tab.name}`}
                title="Close Tab (Ctrl+W)"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>
      
      <div className="editor-tabs-actions">
        {onToggleSplit && (
          <button 
            className={`editor-tabs-add-btn ${isSplit ? 'active' : ''}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSplit && onToggleSplit(); }}
            title={isSplit ? "Close Split View" : "Split Editor Right (Ctrl+\\)"}
          >
            <Columns size={14} strokeWidth={1.5} />
          </button>
        )}
        <button 
          className="editor-tabs-add-btn" 
          onClick={onNewTab}
          title="New Untitled File"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>

    </div>
  );
};
