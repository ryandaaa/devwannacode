import React from 'react';
import './LspOverlays.css';

export interface HoverData {
  contents: string;
  range?: any;
}

export interface CodeActionData {
  title: string;
  kind: string;
  edit?: any;
  command?: any;
}

interface OverlaysProps {
  hover: { visible: boolean; data: HoverData | null; position: { top: number; left: number } };
  codeActions: { visible: boolean; data: CodeActionData[]; position: { top: number; left: number }, selectedIndex: number };
  onSelectCodeAction: (action: CodeActionData) => void;
}

const renderMarkdown = (markdown: string) => {
  // Simple markdown to HTML for hover/signature
  // Strip code block markers if present at edges
  let text = markdown.trim();
  if (text.startsWith('```')) {
    const lines = text.split('\n');
    if (lines[0].startsWith('```')) lines.shift();
    if (lines[lines.length - 1].startsWith('```')) lines.pop();
    text = lines.join('\n');
  }
  return text;
};

export const LspOverlays: React.FC<OverlaysProps> = ({ hover, codeActions, onSelectCodeAction }) => {
  return (
    <>
      {hover.visible && hover.data && (
        <div className="lsp-overlay lsp-hover" style={{ top: hover.position.top, left: hover.position.left }}>
          <pre className="lsp-markdown">{renderMarkdown(hover.data.contents)}</pre>
        </div>
      )}

      {codeActions.visible && codeActions.data.length > 0 && (
        <div className="lsp-overlay lsp-code-actions" style={{ top: codeActions.position.top, left: codeActions.position.left }}>
          <div className="code-actions-header">Quick Fixes</div>
          <div className="code-actions-list">
            {codeActions.data.map((action, idx) => (
              <div 
                key={idx} 
                className={`code-action-item ${idx === codeActions.selectedIndex ? 'selected' : ''}`}
                onClick={() => onSelectCodeAction(action)}
              >
                <span className="code-action-kind">{action.kind ? `[${action.kind}] ` : ''}</span>
                {action.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
