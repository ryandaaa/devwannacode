import React, { useState, useEffect } from 'react';
import { X, Trash2, FolderOpen, Code, Globe, ExternalLink } from 'lucide-react';
import { AppSettings, RecentProject } from '../../types';
import { BrowserOpenURL } from '../../../wailsjs/runtime';
import './SettingsModal.css';

import * as AppService from '../../../wailsjs/go/main/App';
import * as runtime from '../../../wailsjs/runtime/runtime';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  recentProjects: RecentProject[];
  onUpdateSettings: (newSettings: AppSettings) => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string, e: React.MouseEvent) => void;
  onClose: () => void;
}

type TabKey = 'editor' | 'terminal' | 'appearance' | 'projects' | 'about' | 'lsp';

const LspManager = () => {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [progressMsg, setProgressMsg] = useState<Record<string, string>>({});

  const fetchStatus = async () => {
    try {
      const res = await AppService.GetLSPStatus();
      setStatuses(res as Record<string, boolean>);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();

    const onStart = (data: any) => {
      if (data?.language) {
        setLoading(prev => ({ ...prev, [data.language]: true }));
        setProgressMsg(prev => ({ ...prev, [data.language]: data.message || 'Starting install...' }));
      }
    };
    const onProgress = (data: any) => {
      if (data?.language && data?.message) {
        setProgressMsg(prev => ({ ...prev, [data.language]: data.message }));
      }
    };
    const onSuccess = (data: any) => {
      if (data?.language) {
        setLoading(prev => ({ ...prev, [data.language]: false }));
        setProgressMsg(prev => ({ ...prev, [data.language]: '' }));
        fetchStatus();
      }
    };
    const onError = (data: any) => {
      if (data?.language) {
        setLoading(prev => ({ ...prev, [data.language]: false }));
        setProgressMsg(prev => ({ ...prev, [data.language]: 'Error: ' + data.error }));
      }
    };

    runtime.EventsOn('lsp:install:start', onStart);
    runtime.EventsOn('lsp:install:progress', onProgress);
    runtime.EventsOn('lsp:install:success', onSuccess);
    runtime.EventsOn('lsp:install:error', onError);

    return () => {
      runtime.EventsOff('lsp:install:start');
      runtime.EventsOff('lsp:install:progress');
      runtime.EventsOff('lsp:install:success');
      runtime.EventsOff('lsp:install:error');
    };
  }, []);

  const handleInstall = async (lang: string) => {
    setLoading(prev => ({ ...prev, [lang]: true }));
    setProgressMsg(prev => ({ ...prev, [lang]: 'Initiating...' }));
    try {
      await AppService.InstallLSP(lang);
      fetchStatus();
    } catch (err: any) {
      setProgressMsg(prev => ({ ...prev, [lang]: 'Error: ' + err }));
    } finally {
      setLoading(prev => ({ ...prev, [lang]: false }));
    }
  };

  const lspConfigs = [
    { id: 'go', name: 'Go (gopls)', desc: 'Official Go language server' },
    { id: 'java', name: 'Java (JDTLS)', desc: 'Eclipse JDT Language Server' },
    { id: 'typescript', name: 'TypeScript/JavaScript', desc: 'ts-language-server (requires npm)' },
    { id: 'html', name: 'HTML/CSS/JSON', desc: 'VS Code Extracted LSPs (requires npm)' },
    { id: 'python', name: 'Python (Pyright)', desc: 'Pyright language server' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {lspConfigs.map(config => {
        const isInstalled = statuses[config.id];
        const isLoading = loading[config.id];
        return (
          <div key={config.id} className="settings-item-row" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
            <div className="settings-item-info">
              <span className="settings-item-label">{config.name}</span>
              <span className="settings-item-desc">{config.desc}</span>
              {isLoading && (
                <span className="settings-item-desc" style={{ color: 'var(--accent)', marginTop: 4 }}>
                  {progressMsg[config.id] || 'Installing...'}
                </span>
              )}
              {!isLoading && progressMsg[config.id] && progressMsg[config.id].startsWith('Error') && (
                <span className="settings-item-desc" style={{ color: '#d97757', marginTop: 4 }}>
                  {progressMsg[config.id]}
                </span>
              )}
            </div>
            <button 
              className="settings-seg-btn"
              style={{ padding: '6px 12px', background: isInstalled ? 'rgba(255,255,255,0.05)' : 'var(--accent)', color: isInstalled ? 'var(--content-secondary)' : '#000' }}
              disabled={isLoading}
              onClick={() => handleInstall(config.id)}
            >
              {isLoading ? 'Installing...' : (isInstalled ? 'Reinstall' : 'Install')}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings: currentSettings,
  recentProjects,
  onUpdateSettings,
  onOpenRecent,
  onRemoveRecent,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('editor');

  const openExternalUrl = (url: string, e: React.MouseEvent) => {
    e.preventDefault();
    try {
      if (typeof BrowserOpenURL === 'function') {
        BrowserOpenURL(url);
        return;
      }
    } catch {
      // fallback
    }
    if ((window as any).runtime?.BrowserOpenURL) {
      (window as any).runtime.BrowserOpenURL(url);
    } else {
      window.open(url, '_blank');
    }
  };

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

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* Sidebar */}
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">
            settings
          </div>
          <div className="settings-nav">
            <button 
              className={`settings-nav-item ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              editor
            </button>
            <button 
              className={`settings-nav-item ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => setActiveTab('terminal')}
            >
              terminal
            </button>
            <button 
              className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              appearance
            </button>
            <button 
              className={`settings-nav-item ${activeTab === 'lsp' ? 'active' : ''}`}
              onClick={() => setActiveTab('lsp')}
            >
              language servers
            </button>
            <button 
              className={`settings-nav-item ${activeTab === 'projects' ? 'active' : ''}`}
              onClick={() => setActiveTab('projects')}
            >
              recent projects
            </button>
            <button 
              className={`settings-nav-item ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              about
            </button>
          </div>
        </div>

        {/* Content Pane */}
        <div className="settings-content-pane">
          <div className="settings-content-header">
            <div className="settings-content-title">
              {activeTab === 'editor' && 'editor settings'}
              {activeTab === 'terminal' && 'terminal settings'}
              {activeTab === 'appearance' && 'appearance'}
              {activeTab === 'lsp' && 'language servers'}
              {activeTab === 'projects' && 'recent projects'}
              {activeTab === 'about' && 'about'}
            </div>
            <button className="settings-close-btn" onClick={onClose} aria-label="close settings">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          
          <div className="settings-scroll-area">
            
            {activeTab === 'editor' && (
              <div className="settings-group">
                <div className="settings-group-title">text editor</div>
                
                <div className="settings-item-row">
                  <div className="settings-item-info">
                    <span className="settings-item-label">font size</span>
                    <span className="settings-item-desc">controls the font size in pixels</span>
                  </div>
                  <div className="settings-slider-container">
                    <input
                      type="range"
                      className="settings-slider"
                      value={currentSettings.fontSize}
                      min={10}
                      max={32}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...currentSettings,
                          fontSize: parseInt(e.target.value) || 14,
                        })
                      }
                    />
                    <input
                      type="number"
                      className="settings-num-input"
                      value={currentSettings.fontSize}
                      min={10}
                      max={32}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...currentSettings,
                          fontSize: parseInt(e.target.value) || 14,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="settings-item-row">
                  <div className="settings-item-info">
                    <span className="settings-item-label">word wrap</span>
                    <span className="settings-item-desc">wrap lines that exceed viewport width</span>
                  </div>
                  <button 
                    className={`settings-toggle ${currentSettings.wordWrap === 'on' ? 'on' : ''}`}
                    onClick={() => onUpdateSettings({
                      ...currentSettings,
                      wordWrap: currentSettings.wordWrap === 'on' ? 'off' : 'on'
                    })}
                  >
                    <div className="settings-toggle-thumb" />
                  </button>
                </div>

                <div className="settings-item-row">
                  <div className="settings-item-info">
                    <span className="settings-item-label">minimap</span>
                    <span className="settings-item-desc">show code minimap on right side</span>
                  </div>
                  <button 
                    className={`settings-toggle ${currentSettings.minimap ? 'on' : ''}`}
                    onClick={() => onUpdateSettings({
                      ...currentSettings,
                      minimap: !currentSettings.minimap
                    })}
                  >
                    <div className="settings-toggle-thumb" />
                  </button>
                </div>

                <div className="settings-item-row">
                  <div className="settings-item-info">
                    <span className="settings-item-label">smart autocomplete (LSP)</span>
                    <span className="settings-item-desc">enable language server features (requires restart)</span>
                  </div>
                  <button 
                    className={`settings-toggle ${currentSettings.enableLsp !== false ? 'on' : ''}`}
                    onClick={() => onUpdateSettings({
                      ...currentSettings,
                      enableLsp: currentSettings.enableLsp === false ? true : false
                    })}
                  >
                    <div className="settings-toggle-thumb" />
                  </button>
                </div>

                <div className="settings-item-row">
                  <div className="settings-item-info">
                    <span className="settings-item-label">format on save</span>
                    <span className="settings-item-desc">automatically format code when saving a file</span>
                  </div>
                  <button 
                    className={`settings-toggle ${currentSettings.formatOnSave !== false ? 'on' : ''}`}
                    onClick={() => onUpdateSettings({
                      ...currentSettings,
                      formatOnSave: !(currentSettings.formatOnSave !== false)
                    })}
                  >
                    <div className="settings-toggle-thumb" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'terminal' && (
              <div className="settings-group">
                <div className="settings-group-title">integrated terminal</div>

                <div className="settings-item-row">
                  <div className="settings-item-info">
                    <span className="settings-item-label">default shell</span>
                    <span className="settings-item-desc">shell environment used for new terminals</span>
                  </div>
                  <div className="settings-segmented">
                    <button 
                      className={`settings-seg-btn ${currentSettings.defaultShell === 'powershell' ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ ...currentSettings, defaultShell: 'powershell' })}
                    >
                      powershell
                    </button>
                    <button 
                      className={`settings-seg-btn ${currentSettings.defaultShell === 'cmd' ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ ...currentSettings, defaultShell: 'cmd' })}
                    >
                      cmd
                    </button>
                    <button 
                      className={`settings-seg-btn ${currentSettings.defaultShell === 'bash' ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ ...currentSettings, defaultShell: 'bash' })}
                    >
                      bash
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-group">
                <div className="settings-group-title">workbench</div>

                <div className="settings-item-row" style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: 'none' }}>
                  <div className="settings-item-info" style={{ marginBottom: 12 }}>
                    <span className="settings-item-label">color theme</span>
                    <span className="settings-item-desc">global application aesthetic</span>
                  </div>
                  
                  <div className="settings-theme-grid">
                    <div className={`settings-theme-card ${currentSettings.theme === 'dark' ? 'active' : ''}`} onClick={() => onUpdateSettings({ ...currentSettings, theme: 'dark' })}>
                      <div className="theme-mockup dark-mockup">
                        <div className="tm-sidebar"></div>
                        <div className="tm-main">
                          <div className="tm-header"></div>
                          <div className="tm-content">
                            <div className="tm-line" style={{ width: '60%' }}></div>
                            <div className="tm-line" style={{ width: '40%' }}></div>
                            <div className="tm-line" style={{ width: '70%' }}></div>
                          </div>
                        </div>
                      </div>
                      <span className="theme-label">dark</span>
                    </div>

                    <div className={`settings-theme-card ${currentSettings.theme === 'nord' ? 'active' : ''}`} onClick={() => onUpdateSettings({ ...currentSettings, theme: 'nord' })}>
                      <div className="theme-mockup nord-mockup">
                        <div className="tm-sidebar"></div>
                        <div className="tm-main">
                          <div className="tm-header"></div>
                          <div className="tm-content">
                            <div className="tm-line" style={{ width: '60%' }}></div>
                            <div className="tm-line" style={{ width: '40%' }}></div>
                            <div className="tm-line" style={{ width: '70%' }}></div>
                          </div>
                        </div>
                      </div>
                      <span className="theme-label">nord</span>
                    </div>

                    <div className={`settings-theme-card ${currentSettings.theme === 'light' ? 'active' : ''}`} onClick={() => onUpdateSettings({ ...currentSettings, theme: 'light' })}>
                      <div className="theme-mockup light-mockup">
                        <div className="tm-sidebar"></div>
                        <div className="tm-main">
                          <div className="tm-header"></div>
                          <div className="tm-content">
                            <div className="tm-line" style={{ width: '60%' }}></div>
                            <div className="tm-line" style={{ width: '40%' }}></div>
                            <div className="tm-line" style={{ width: '70%' }}></div>
                          </div>
                        </div>
                      </div>
                      <span className="theme-label">light</span>
                    </div>

                    <div className={`settings-theme-card ${currentSettings.theme === 'warm' ? 'active' : ''}`} onClick={() => onUpdateSettings({ ...currentSettings, theme: 'warm' })}>
                      <div className="theme-mockup warm-mockup">
                        <div className="tm-sidebar"></div>
                        <div className="tm-main">
                          <div className="tm-header"></div>
                          <div className="tm-content">
                            <div className="tm-line" style={{ width: '60%' }}></div>
                            <div className="tm-line" style={{ width: '40%' }}></div>
                            <div className="tm-line" style={{ width: '70%' }}></div>
                          </div>
                        </div>
                      </div>
                      <span className="theme-label">warm</span>
                    </div>

                    <div className={`settings-theme-card ${currentSettings.theme === 'monochrome' ? 'active' : ''}`} onClick={() => onUpdateSettings({ ...currentSettings, theme: 'monochrome' })}>
                      <div className="theme-mockup monochrome-mockup">
                        <div className="tm-sidebar"></div>
                        <div className="tm-main">
                          <div className="tm-header"></div>
                          <div className="tm-content">
                            <div className="tm-line" style={{ width: '60%' }}></div>
                            <div className="tm-line" style={{ width: '40%' }}></div>
                            <div className="tm-line" style={{ width: '70%' }}></div>
                          </div>
                        </div>
                      </div>
                      <span className="theme-label">monochrome</span>
                    </div>
                  </div>
                </div>

                <div className="settings-item-row" style={{ borderBottom: 'none', justifyContent: 'flex-start', gap: 32 }}>
                  <div className="settings-item-info">
                    <span className="settings-item-label">accent color</span>
                    <span className="settings-item-desc">custom highlight color for active ui elements</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input 
                      type="color" 
                      className="settings-color-picker"
                      style={{ width: 40, height: 24, padding: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
                      value={currentSettings.accentColor || '#88c0d0'} 
                      onChange={(e) => onUpdateSettings({ ...currentSettings, accentColor: e.target.value })}
                    />
                    <button 
                      className="settings-reset-btn"
                      style={{ padding: '4px 12px', fontSize: 11, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 4, color: 'var(--content-secondary)', cursor: 'pointer' }}
                      onClick={() => onUpdateSettings({ ...currentSettings, accentColor: '' })}
                      title="Reset to default"
                    >
                      reset
                    </button>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'lsp' && (
              <div className="settings-group">
                <div className="settings-group-title">smart helpers (lsp)</div>
                <LspManager />
              </div>
            )}

            {activeTab === 'projects' && (
              <div className="settings-group">
                <div className="settings-group-title">history</div>
                
                {recentProjects.length === 0 ? (
                  <div style={{ color: 'var(--content-tertiary)', fontSize: 12, marginTop: 16, fontFamily: 'var(--font-ui)' }}>
                    no recent projects.
                  </div>
                ) : (
                  recentProjects.map((p) => (
                    <div key={p.path} className="recent-project-row" onClick={() => { onOpenRecent(p.path); onClose(); }}>
                      <div className="recent-project-info">
                        <FolderOpen size={15} strokeWidth={1.5} color="var(--content-tertiary)" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span className="recent-project-name">{p.name.toLowerCase()}</span>
                          <span className="recent-project-path">{p.path}</span>
                        </div>
                      </div>
                      <button
                        className="recent-project-del"
                        onClick={(e) => onRemoveRecent(p.path, e)}
                        title="remove from history"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-group">
                <div className="settings-group-title">about devwannacode</div>
                
                <div className="settings-about-brand">
                  <span className="settings-about-title">devwannacode</span>
                  <span className="settings-about-version">v1.0.0</span>
                </div>

                <div className="settings-about-desc">
                  a minimalist, high-performance desktop ide built with wails, react & typescript.
                </div>

                <div className="settings-group-title" style={{ marginTop: 24 }}>links</div>

                <div className="settings-item-row" style={{ cursor: 'pointer' }} onClick={(e) => openExternalUrl('https://github.com/ryandaaa/devwannacode', e)}>
                  <div className="settings-item-info">
                    <span className="settings-item-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Code size={14} /> github repo
                    </span>
                    <span className="settings-item-desc">https://github.com/ryandaaa/devwannacode</span>
                  </div>
                  <ExternalLink size={14} color="var(--content-tertiary)" />
                </div>

                <div className="settings-item-row" style={{ cursor: 'pointer' }} onClick={(e) => openExternalUrl('https://code.devwanna.tech', e)}>
                  <div className="settings-item-info">
                    <span className="settings-item-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={14} /> landing page
                    </span>
                    <span className="settings-item-desc">https://code.devwanna.tech</span>
                  </div>
                  <ExternalLink size={14} color="var(--content-tertiary)" />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
