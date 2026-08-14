import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Search } from 'lucide-react';
import './ProblemsPanel.css';

export interface ProblemMarker {
  owner: string;
  resource: any; // Uri object or string
  severity: number; // 8 = Error, 4 = Warning, 2 = Info, 1 = Hint
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber?: number;
  endColumn?: number;
}

interface ProblemsPanelProps {
  problems: ProblemMarker[];
  onSelectProblem: (problem: ProblemMarker) => void;
}

export const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ problems, onSelectProblem }) => {
  const [filterText, setFilterText] = useState('');

  const filteredProblems = problems.filter((p) => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    const resPath = p.resource?.path || p.resource?.fsPath || String(p.resource || '');
    return (
      p.message.toLowerCase().includes(lower) ||
      resPath.toLowerCase().includes(lower)
    );
  });

  const errorCount = problems.filter((p) => p.severity === 8).length;
  const warningCount = problems.filter((p) => p.severity === 4).length;
  const infoCount = problems.filter((p) => p.severity === 2 || p.severity === 1).length;

  const getFileName = (resource: any) => {
    if (!resource) return 'Unknown file';
    const uriStr = typeof resource === 'string' ? resource : resource.path || resource.fsPath || String(resource);
    const parts = uriStr.split(/[/\\]/);
    return parts[parts.length - 1] || uriStr;
  };

  return (
    <div className="problems-panel-container">
      {/* Header bar */}
      <div className="problems-panel-header">
        <div className="problems-panel-counts">
          <span className="problems-count-badge error" title={`${errorCount} Errors`}>
            <AlertCircle size={13} />
            <span>{errorCount}</span>
          </span>
          <span className="problems-count-badge warning" title={`${warningCount} Warnings`}>
            <AlertTriangle size={13} />
            <span>{warningCount}</span>
          </span>
          {infoCount > 0 && (
            <span className="problems-count-badge info" title={`${infoCount} Info/Hints`}>
              <Info size={13} />
              <span>{infoCount}</span>
            </span>
          )}
        </div>

        <div className="problems-search-wrapper">
          <Search size={12} className="problems-search-icon" />
          <input
            type="text"
            className="problems-search-input"
            placeholder="Filter problems..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      </div>

      {/* List content */}
      <div className="problems-panel-content">
        {filteredProblems.length === 0 ? (
          <div className="problems-empty-state">
            <CheckCircle2 size={24} className="problems-empty-icon" />
            <p className="problems-empty-title">
              {problems.length === 0
                ? 'No problems detected in workspace'
                : 'No problems match the filter'}
            </p>
          </div>
        ) : (
          <div className="problems-list">
            {filteredProblems.map((prob, idx) => {
              const fileName = getFileName(prob.resource);
              const isError = prob.severity === 8;
              const isWarning = prob.severity === 4;

              return (
                <div
                  key={idx}
                  className={`problem-item ${isError ? 'error' : isWarning ? 'warning' : 'info'}`}
                  onClick={() => onSelectProblem(prob)}
                  title={`Jump to ${fileName}:${prob.startLineNumber}`}
                >
                  <div className="problem-icon">
                    {isError ? (
                      <AlertCircle size={14} color="var(--status-danger, #f85149)" />
                    ) : isWarning ? (
                      <AlertTriangle size={14} color="var(--status-warning, #e3b341)" />
                    ) : (
                      <Info size={14} color="var(--status-info, #58a6ff)" />
                    )}
                  </div>
                  <div className="problem-details">
                    <span className="problem-message">{prob.message}</span>
                    <span className="problem-location">
                      {fileName} <span className="problem-line-col">[{prob.startLineNumber}, {prob.startColumn}]</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
