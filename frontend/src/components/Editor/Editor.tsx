import React, { useRef, useEffect, useState, useMemo } from 'react';
import MonacoEditor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { EditorTab, AppSettings } from '../../types';
import { EditorTabs } from './EditorTabs';
import { AutocompletePopup, EditorCompletionItem } from './AutocompletePopup';
import { parseSnippet, SnippetSession, SnippetPlaceholder } from './SnippetEngine';
import { expandHtmlAbbreviation, expandCssAbbreviation } from './EmmetEngine';
import { findMatchingTagRanges } from './htmlTagMatcher';
import { registerColorProviders } from './colorProvider';
import { LspOverlays, HoverData, CodeActionData } from './LspOverlays';
import { AlertCircle, FilePlus, Search, Folder, Terminal, Command, FolderOpen } from 'lucide-react';
import * as AppService from '../../../wailsjs/go/main/App';
import './Editor.css';
import { connectLSP, setMonacoInstance } from '../../services/simpleLsp';

interface EditorProps {
  tabs: EditorTab[];
  activeTab: EditorTab | null;
  settings: AppSettings;
  theme: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string, e: React.MouseEvent) => void;
  onContentChange: (path: string, newContent: string) => void;
  onSaveFile: (path: string, content?: string) => void;
  onReloadConflict: (path: string) => void;
  onKeepConflict: (path: string) => void;
  onNewTab: () => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onOpenQuickOpen?: () => void;
  onOpenCommandPalette?: () => void;
  onToggleExplorer?: () => void;
  onToggleTerminal?: () => void;
  onMarkersUpdate?: (markers: any[]) => void;
  targetLocation?: { path: string; line: number; col: number; timestamp: number } | null;
  workspacePath?: string;
  isSplit?: boolean;
  splitTabPath?: string;
  onToggleSplit?: () => void;
  onSelectSplitTab?: (path: string) => void;
  onCloseSplit?: () => void;
  recentProjects?: any[];
  onOpenProject?: (path: string) => void;
  onOpenFolder?: () => void;
}

const isImageFile = (path: string): boolean => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext);
};

const isMarkdownFile = (path: string): boolean => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return ['md', 'markdown'].includes(ext);
};

const MAX_VISIBLE_COMPLETIONS = 80;

const ImageViewer: React.FC<{ path: string; name: string }> = ({ path, name }) => {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(false);
    AppService.GetFileBase64(path)
      .then((dataUrl: string) => {
        if (isMounted) {
          setSrc(dataUrl);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        console.error('Failed to load image base64:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [path]);

  if (loading) {
    return (
      <div className="image-viewer-container">
        <span className="image-viewer-status">loading image...</span>
      </div>
    );
  }

  if (error || !src) {
    return (
      <div className="image-viewer-container">
        <span className="image-viewer-status error">failed to load image</span>
      </div>
    );
  }

  return (
    <div className="image-viewer-container">
      <div className="image-viewer-wrapper">
        <img src={src} alt={name} className="image-viewer-img" />
      </div>
      <div className="image-viewer-meta">
        <span>{name}</span>
      </div>
    </div>
  );
};

const MarkdownViewer: React.FC<{ content: string }> = ({ content }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      import('marked'),
      import('dompurify'),
      import('@monaco-editor/react')
    ]).then(async ([{ marked }, { default: DOMPurify }, { loader }]) => {
      if (!isMounted) return;
      try {
        const renderer = new marked.Renderer();
        renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
          const validLang = lang || 'plaintext';
          const encodedCode = encodeURIComponent(text);
          const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

          return `<div class="markdown-code-block">
            <div class="markdown-code-header">
              <span class="markdown-code-lang">${validLang}</span>
              <button class="markdown-copy-btn" data-code="${encodedCode}" type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy</span>
              </button>
            </div>
            <pre><code class="language-${validLang}">${escapedText}</code></pre>
          </div>`;
        };

        const rawHtml = marked.parse(content, { renderer, async: false }) as string;
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
          ADD_ATTR: ['data-code', 'type'],
          ADD_TAGS: ['button']
        });

        if (!isMounted) return;
        setHtmlContent(cleanHtml);

        // Colorize code blocks using Monaco's tokenizer
        setTimeout(async () => {
          if (!containerRef.current || !isMounted) return;
          try {
            const monaco = await loader.init();
            const codeElements = containerRef.current.querySelectorAll('pre code');
            codeElements.forEach((el) => {
              monaco.editor.colorizeElement(el as HTMLElement, { theme: 'vs-dark', tabSize: 2 });
            });
          } catch (err) {
            console.warn('Monaco colorize error in markdown preview:', err);
          }
        }, 40);
      } catch (e) {
        console.error('Markdown parse error:', e);
        if (isMounted) setHtmlContent('<p>Error rendering markdown</p>');
      }
    }).catch(e => {
      console.error('Failed to load markdown dependencies:', e);
      if (isMounted) setHtmlContent('<p>Error loading preview</p>');
    });

    return () => { isMounted = false; };
  }, [content]);

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.markdown-copy-btn') as HTMLButtonElement | null;
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const rawCode = btn.getAttribute('data-code');
      const code = rawCode ? decodeURIComponent(rawCode) : (btn.closest('.markdown-code-block')?.querySelector('code')?.textContent || '');
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          btn.classList.add('copied');
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span style="color:#3fb950">Copied!</span>`;
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>`;
          }, 2000);
        });
      }
    }
  };

  return (
    <div className="markdown-preview-container" ref={containerRef} onClick={handleContainerClick}>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
};

export const Editor = React.memo<EditorProps>(({
  tabs,
  activeTab,
  settings,
  theme,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSaveFile,
  onReloadConflict,
  onKeepConflict,
  onNewTab,
  onReorderTabs,
  onOpenQuickOpen,
  onOpenCommandPalette,
  onToggleExplorer,
  onToggleTerminal,
  onMarkersUpdate,
  targetLocation,
  workspacePath,
  isSplit,
  splitTabPath,
  onToggleSplit,
  onSelectSplitTab,
  onCloseSplit,
  recentProjects = [],
  onOpenProject,
  onOpenFolder,
}) => {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitWidthPercent, setSplitWidthPercent] = useState<number>(50);
  const isDraggingSplitRef = useRef<boolean>(false);
  const [previewTabPaths, setPreviewTabPaths] = useState<Record<string, boolean>>({});

  // Custom Autocomplete State
  const [acVisible, setAcVisible] = useState(false);
  const [acItems, setAcItems] = useState<EditorCompletionItem[]>([]);
  const [acIndex, setAcIndex] = useState(0);
  const [acPosition, setAcPosition] = useState<{top: number, left: number}>({top: 0, left: 0});
  const [javaHint, setJavaHint] = useState<{visible: boolean, text: string, top: number, left: number}>({ visible: false, text: '', top: 0, left: 0 });
  
  // LSP Overlays State
  const [hoverState, setHoverState] = useState<{ visible: boolean; data: HoverData | null; position: { top: number; left: number } }>({ visible: false, data: null, position: { top: 0, left: 0 } });
  const [codeActionsState, setCodeActionsState] = useState<{ visible: boolean; data: CodeActionData[]; position: { top: number; left: number }, selectedIndex: number }>({ visible: false, data: [], position: { top: 0, left: 0 }, selectedIndex: 0 });

  // Custom Autocomplete Ref State
  const acStateRef = useRef({
    visible: false,
    rawItems: [] as EditorCompletionItem[],
    filteredItems: [] as EditorCompletionItem[],
    index: 0,
    line: 0,
    startCol: 0
  });

  // Snippet Session Ref State
  const snippetSessionRef = useRef<SnippetSession | null>(null);

  // Context Keys for Monaco Keybindings
  const ctxKeysRef = useRef<{
    customAcVisible: any;
    inSnippetSession: any;
    canExpandAbbreviation: any;
  } | null>(null);

  const activeTabRef = useRef(activeTab);
  const onSaveFileRef = useRef(onSaveFile);
  const onContentChangeRef = useRef(onContentChange);
  const settingsRef = useRef(settings);
  
  useEffect(() => {
    activeTabRef.current = activeTab;
    onSaveFileRef.current = onSaveFile;
    onContentChangeRef.current = onContentChange;
    settingsRef.current = settings;
  }, [activeTab, onSaveFile, onContentChange, settings]);

  useEffect(() => {
    if (editorRef.current && activeTab && !isImageFile(activeTab.path)) {
      const supportedLspLanguages = ['go', 'java', 'html', 'css', 'json', 'typescript', 'javascript', 'python'];
      if (settings.enableLsp !== false && supportedLspLanguages.includes(activeTab.language)) {
        const client = connectLSP({
          languageId: activeTab.language,
          documentText: () => {
            const currentContent = editorRef.current?.getValue();
            return currentContent !== undefined ? currentContent : (activeTabRef.current?.content || '');
          },
          documentUri: `file:///${activeTab.path.replace(/\\/g, '/')}`,
          workspaceUri: workspacePath ? `file:///${workspacePath.replace(/\\/g, '/')}` : undefined,
          editor: editorRef.current as any
        });
        lspClientRef.current = client;
      } else {
        lspClientRef.current = null;
      }
    }
  }, [activeTab?.path, activeTab?.language, settings.enableLsp, workspacePath]);

  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = moveEvent.clientX - rect.left;
      const newPercent = Math.max(20, Math.min(80, (relativeX / rect.width) * 100));
      setSplitWidthPercent(newPercent);
    };

    const handleMouseUp = () => {
      isDraggingSplitRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Setup rich custom Monaco themes
  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    // Default Dark Theme (Original)
    monaco.editor.defineTheme('devwanna-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7A7A7A', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#0A0A0A',
        'editor.foreground': '#EDEDED',
        'editor.lineHighlightBackground': '#151515',
        'editor.selectionBackground': '#2A2A2A',
        'editorCursor.foreground': '#EDEDED',
        'editorLineNumber.foreground': '#4A4A4A',
        'editorLineNumber.activeForeground': '#EDEDED',
        'editorGutter.background': '#0A0A0A',
        'editorIndentGuide.background': '#1C1C1C',
        'editorIndentGuide.activeBackground': '#3A3A3A',
        'editorBracketMatch.background': '#1C1C1C',
        'editorBracketMatch.border': '#3A3A3A',
      },
    });

    // Authentic Nord Theme
    monaco.editor.defineTheme('devwanna-nord', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '4C566A', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#2E3440', 
        'editor.foreground': '#D8DEE9',
        'editor.lineHighlightBackground': '#3B4252',
        'editor.selectionBackground': '#434C5E80',
        'editorCursor.foreground': '#88C0D0',
        'editorLineNumber.foreground': '#4C566A',
        'editorLineNumber.activeForeground': '#D8DEE9',
        'editorGutter.background': '#2E3440',
        'editorIndentGuide.background': '#3B4252',
        'editorIndentGuide.activeBackground': '#4C566A',
        'editorBracketMatch.background': '#3B4252',
        'editorBracketMatch.border': '#88C0D0',
      },
    });

    // Linear Light Theme
    monaco.editor.defineTheme('devwanna-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '9CA3AF', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#111827',
        'editor.lineHighlightBackground': '#F3F4F6',
        'editor.selectionBackground': '#DBEAFE',
        'editorCursor.foreground': '#3B82F6',
        'editorLineNumber.foreground': '#D1D5DB',
        'editorLineNumber.activeForeground': '#6B7280',
        'editorGutter.background': '#FFFFFF',
        'editorIndentGuide.background': '#F3F4F6',
        'editorIndentGuide.activeBackground': '#E5E7EB',
      },
    });

    // Warm Theme (Claude-inspired)
    monaco.editor.defineTheme('devwanna-warm', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '8A8782', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#FDFBF7',
        'editor.foreground': '#2D2B2A',
        'editor.lineHighlightBackground': '#F0EDE6',
        'editor.selectionBackground': '#E0DBD1',
        'editorCursor.foreground': '#D97757',
        'editorLineNumber.foreground': '#B5B2AC',
        'editorLineNumber.activeForeground': '#5C5A57',
        'editorGutter.background': '#FDFBF7',
        'editorIndentGuide.background': '#E8E4DB',
        'editorIndentGuide.activeBackground': '#D9D5CB',
        'editorBracketMatch.background': '#E8E4DB',
        'editorBracketMatch.border': '#D97757',
      },
    });

    // Monochrome Theme (Vercel-inspired)
    monaco.editor.defineTheme('devwanna-monochrome', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '666666', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#FFFFFF',
        'editor.lineHighlightBackground': '#111111',
        'editor.selectionBackground': '#333333',
        'editorCursor.foreground': '#FFFFFF',
        'editorLineNumber.foreground': '#444444',
        'editorLineNumber.activeForeground': '#FFFFFF',
        'editorGutter.background': '#000000',
        'editorIndentGuide.background': '#222222',
        'editorIndentGuide.activeBackground': '#444444',
        'editorBracketMatch.background': '#222222',
        'editorBracketMatch.border': '#FFFFFF',
      },
    });

    // Auto-Rename Matching Tag via Monaco Linked Editing Ranges
    if (monaco.languages?.registerLinkedEditingRangeProvider) {
      const tagLanguages = ['html', 'xml', 'javascriptreact', 'typescriptreact'];
      tagLanguages.forEach((lang) => {
        monaco.languages.registerLinkedEditingRangeProvider(lang, {
          provideLinkedEditingRanges(model: any, position: any) {
            return findMatchingTagRanges(monaco, model, position);
          },
        });
      });
    }

    // Color Swatches & Color Picker Provider for CSS, HTML, JS, TS, JSON
    registerColorProviders(monaco);
  };

  const lspClientRef = useRef<any>(null);
  const completionRequestIdRef = useRef(0);
  const completionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOnMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    setMonacoInstance(monaco);

    // The first LSP effect can run before Monaco has mounted. Connect again
    // here so the initial editor is not left without a language client.
    const mountedTab = activeTabRef.current;
    const supportedLspLanguages = ['go', 'java', 'html', 'css', 'json', 'typescript', 'javascript', 'python'];
    if (mountedTab && settingsRef.current.enableLsp !== false && supportedLspLanguages.includes(mountedTab.language)) {
      lspClientRef.current = connectLSP({
        languageId: mountedTab.language,
        documentText: () => editorInstance.getValue(),
        documentUri: `file:///${mountedTab.path.replace(/\\/g, '/')}`,
        workspaceUri: workspacePath ? `file:///${workspacePath.replace(/\\/g, '/')}` : undefined,
        editor: editorInstance as any,
      });
    }

    // Listen to diagnostic markers and report up to App
    const updateMarkers = () => {
      if (onMarkersUpdate && monaco?.editor) {
        const markers = monaco.editor.getModelMarkers({});
        onMarkersUpdate(markers);
      }
    };

    updateMarkers();
    monaco.editor.onDidChangeMarkers(() => {
      updateMarkers();
    });

    // Initialize Context Keys
    ctxKeysRef.current = {
      customAcVisible: editorInstance.createContextKey('customAcVisible', false),
      inSnippetSession: editorInstance.createContextKey('inSnippetSession', false),
      canExpandAbbreviation: editorInstance.createContextKey('canExpandAbbreviation', false)
    };

    // Track cursor movement
    editorInstance.onDidChangeCursorPosition((e) => {
      window.dispatchEvent(new CustomEvent('devwannacode:cursor', { detail: { line: e.position.lineNumber, col: e.position.column } }));
      const st = acStateRef.current;
      if (st.visible) {
        if (e.position.lineNumber !== st.line || e.position.column < st.startCol) {
          setAcVisible(false);
          st.visible = false;
          ctxKeysRef.current?.customAcVisible.set(false);
        }
      }
      setHoverState(prev => prev.visible ? { ...prev, visible: false } : prev);
      setCodeActionsState(prev => prev.visible ? { ...prev, visible: false } : prev);
      updateAbbreviationHint();
    });

    const injectSnippet = (editorInstance: any, model: any, position: any, range: any, snippetText: string) => {
      const { plainText, session } = parseSnippet(snippetText);
      // Capture the replacement start before applying the edit. Recomputing
      // it from the old cursor after a multiline insertion can shift the
      // first placeholder by one or more characters.
      const baseOffset = model.getOffsetAt({
        lineNumber: range.startLineNumber,
        column: range.startColumn,
      });

      editorInstance.executeEdits('snippet-inject', [{ range, text: plainText }]);
      
      const insertedPosition = model.getPositionAt(baseOffset + plainText.length);
      
      if (session.placeholders.length > 0 || session.finalCursor !== undefined) {
        // Setup decorations for all placeholders
        const newDecorations = session.placeholders.map(p => {
           const start = model.getPositionAt(baseOffset + p.start);
           const end = model.getPositionAt(baseOffset + p.end);
           return {
             range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
             options: { stickiness: monaco.editor.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }
           };
        });
        
        if (session.finalCursor !== undefined) {
           const finalStart = model.getPositionAt(baseOffset + session.finalCursor);
           newDecorations.push({
             range: new monaco.Range(finalStart.lineNumber, finalStart.column, finalStart.lineNumber, finalStart.column),
             options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }
           });
        }

        const decorationIds = model.deltaDecorations([], newDecorations);
        
        session.placeholders.forEach((p, i) => {
           p.decorationId = decorationIds[i];
        });
        if (session.finalCursor !== undefined) {
           session.finalDecorationId = decorationIds[decorationIds.length - 1];
        }

        snippetSessionRef.current = session;
        ctxKeysRef.current?.inSnippetSession.set(true);
        
        if (session.placeholders.length > 0) {
          const firstId = session.placeholders[0].decorationId;
          const r = model.getDecorationRange(firstId!);
          if (r) {
             editorInstance.setSelection(r);
             editorInstance.revealPositionInCenter(r.getStartPosition());
          }

          // HTML5 Emmet has a multiline prefix before its first placeholder.
          // Resolve the title range from the actual model text so the whole
          // default title is selected even if line/offset conversion changes.
          if (snippetText.startsWith('<!DOCTYPE html>')) {
            const documentText = model.getValue();
            const titleOpen = documentText.indexOf('<title>', baseOffset);
            const titleClose = titleOpen >= 0 ? documentText.indexOf('</title>', titleOpen + 7) : -1;
            if (titleOpen >= 0 && titleClose > titleOpen) {
              const titleStart = model.getPositionAt(titleOpen + 7);
              const titleEnd = model.getPositionAt(titleClose);
              const titleRange = new monaco.Range(
                titleStart.lineNumber,
                titleStart.column,
                titleEnd.lineNumber,
                titleEnd.column,
              );
              editorInstance.setSelection(titleRange);
              editorInstance.revealPositionInCenter(titleStart);
            }
          }
        } else if (session.finalDecorationId) {
          const r = model.getDecorationRange(session.finalDecorationId);
          if (r) {
             editorInstance.setPosition(r.getStartPosition());
             editorInstance.revealPositionInCenter(r.getStartPosition());
          }
          snippetSessionRef.current = null;
        }
      } else if (insertedPosition) {
        editorInstance.setPosition(insertedPosition);
        editorInstance.revealPositionInCenter(insertedPosition);
      }
    };

    const applyCompletion = (item: EditorCompletionItem) => {
      const st = acStateRef.current;
      setAcVisible(false);
      st.visible = false;
      
      const position = editorInstance.getPosition();
      const model = editorInstance.getModel();
      if (!position || !model) return;
      
      const wordInfo = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, position.column);

      const snippetText = item.insertText || item.label;
      injectSnippet(editorInstance, model, position, range, snippetText);
    };

    const expandLanguageAbbreviation = (): boolean => {
      const tab = activeTabRef.current;
      if (!tab || !['java', 'go', 'html', 'css', 'javascript', 'typescript'].includes(tab.language)) return false;

      const position = editorInstance.getPosition();
      const model = editorInstance.getModel();
      if (!position || !model) return false;

      const word = model.getWordUntilPosition(position);
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const tokenMatch = linePrefix.match(/(?:^|\s)(\S+)$/);
      const abbreviation = (tab.language === 'html' || tab.language === 'css') && tokenMatch
        ? tokenMatch[1]
        : model.getWordUntilPosition(position).word;
      const javaSnippets: Record<string, string> = {
        psvm: 'public static void main(String[] args) {\n\t${1}\n}',
        main: 'public static void main(String[] args) {\n\t${1}\n}',
        sout: 'System.out.println(${1});',
        serr: 'System.err.println(${1});',
        for: 'for (int i = 0; i < ${1:count}; i++) {\n\t${2}\n}',
        fore: 'for (Object item : ${1:iterable}) {\n\t${2}\n}',
        if: 'if (${1:condition}) {\n\t${2}\n}',
        ifelse: 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}',
        while: 'while (${1:condition}) {\n\t${2}\n}',
        do: 'do {\n\t${2}\n} while (${1:condition});',
        switch: 'switch (${1:key}) {\n\tcase ${2:value}:\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}',
        trycatch: 'try {\n\t${1}\n} catch (Exception e) {\n\t${2}\n}',
        tryf: 'try {\n\t${1}\n} finally {\n\t${2}\n}',
        catch: 'catch (Exception e) {\n\t${1}\n}',
      };
      const goSnippets: Record<string, string> = {
        main: 'func main() {\n\t${1}\n}',
        fn: 'func ${1:name}() {\n\t${2}\n}',
        err: 'if err != nil {\n\t${1:return err}\n}',
        ife: 'if err != nil {\n\t${1:return err}\n}',
        forr: 'for _, item := range ${1:iterable} {\n\t${2}\n}',
        struct: 'type ${1:Name} struct {\n\t${2}\n}',
        iface: 'type ${1:Name} interface {\n\t${2}\n}',
      };
      const jsSnippets: Record<string, string> = {
        clg: 'console.log(${1});',
        cwe: 'console.warn(${1});',
        cerr: 'console.error(${1});',
        fn: 'function ${1:name}() {\n\t${2}\n}',
        arrow: 'const ${1:name} = () => {\n\t${2}\n};',
        if: 'if (${1:condition}) {\n\t${2}\n}',
        for: 'for (let i = 0; i < ${1:count}; i++) {\n\t${2}\n}',
        foreach: '${1:array}.forEach((item) => {\n\t${2}\n});',
        imp: 'import ${1:module} from "${2:path}";',
        exp: 'export default ${1:module};',
      };
      const abbreviationStart = tokenMatch ? position.column - tokenMatch[1].length : word.startColumn;
      let snippet: string | null = null;
      
      if (tab.language === 'html') {
         snippet = expandHtmlAbbreviation(abbreviation);
      } else if (tab.language === 'css') {
         snippet = expandCssAbbreviation(abbreviation);
      } else {
         const snippets = tab.language === 'java' ? javaSnippets : tab.language === 'go' ? goSnippets : jsSnippets;
         snippet = snippets[abbreviation] || null;
      }
      
      if (!snippet) return false;

      const range = new monaco.Range(position.lineNumber, abbreviationStart, position.lineNumber, position.column);
      injectSnippet(editorInstance, model, position, range, snippet);

      return true;
    };

    function updateAbbreviationHint() {
      const tab = activeTabRef.current;
      const position = editorInstance.getPosition();
      const model = editorInstance.getModel();
      
      if (!tab || !['java', 'go', 'html', 'css', 'javascript', 'typescript'].includes(tab.language) || !position || !model) {
        setJavaHint((current) => current.visible ? { ...current, visible: false } : current);
        ctxKeysRef.current?.canExpandAbbreviation.set(false);
        return;
      }
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const tokenMatch = linePrefix.match(/(?:^|\s)(\S+)$/);
      const word = (tab.language === 'html' || tab.language === 'css') && tokenMatch
        ? tokenMatch[1]
        : model.getWordUntilPosition(position).word;
      
      if (!word) {
        setJavaHint((current) => current.visible ? { ...current, visible: false } : current);
        ctxKeysRef.current?.canExpandAbbreviation.set(false);
        return;
      }

      let snippet: string | null = null;
      if (tab.language === 'html') {
         const validHtmlTags = new Set(['a', 'article', 'aside', 'button', 'div', 'form', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'html', 'label', 'li', 'main', 'nav', 'p', 'script', 'section', 'select', 'span', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul', 'body', 'input', 'img', 'br', 'link', 'meta']);
         const hasEmmetOperator = /[.#>+*:[\]{}()]/.test(word);
         const plainTag = /^[A-Za-z][\w:-]*$/.test(word);
         const isValidPlainTag = plainTag && validHtmlTags.has(word.toLowerCase());
         if (word === '!' || hasEmmetOperator || isValidPlainTag) {
           snippet = expandHtmlAbbreviation(word);
         }
      } else if (tab.language === 'css') {
         snippet = expandCssAbbreviation(word);
      } else {
         const javaSnippets: Record<string, string> = { psvm: '1', main: '1', sout: '1', serr: '1', for: '1', fore: '1', if: '1', ifelse: '1', while: '1', do: '1', switch: '1', trycatch: '1', tryf: '1', catch: '1' };
         const goSnippets: Record<string, string> = { main: '1', fn: '1', err: '1', ife: '1', forr: '1', struct: '1', iface: '1' };
         const jsSnippets: Record<string, string> = { clg: '1', cwe: '1', cerr: '1', fn: '1', arrow: '1', if: '1', for: '1', foreach: '1', imp: '1', exp: '1' };
         const snippets = tab.language === 'java' ? javaSnippets : tab.language === 'go' ? goSnippets : jsSnippets;
         snippet = snippets[word] ? '1' : null;
      }

      if (snippet) {
         const scrolledPos = editorInstance.getScrolledVisiblePosition(position);
         if (scrolledPos) {
           setJavaHint({
             visible: true,
             text: `Tab to expand '${word}'`,
             top: scrolledPos.top + 22,
             left: scrolledPos.left
           });
           ctxKeysRef.current?.canExpandAbbreviation.set(true);
           editorInstance.trigger('keyboard', 'hideSuggestWidget', null);
         }
      } else {
         setJavaHint((current) => current.visible ? { ...current, visible: false } : current);
         ctxKeysRef.current?.canExpandAbbreviation.set(false);
      }
    }

    (editorInstance as any).applyCustomCompletion = applyCompletion;

    // --- Tab Commands via Context Keys ---

    editorInstance.addCommand(monaco.KeyCode.Tab, () => {
      const st = acStateRef.current;
      if (st.visible) {
        const item = st.filteredItems[st.index];
        if (item) {
          applyCompletion(item);
          return;
        }
      }
      if (ctxKeysRef.current?.canExpandAbbreviation.get()) {
        if (expandLanguageAbbreviation()) return;
      }
      const session = snippetSessionRef.current;
      const model = editorInstance.getModel();
      if (!session || !model) return;

      session.activeIndex++;
      let targetId: string | undefined;

      if (session.activeIndex < session.placeholders.length) {
        targetId = session.placeholders[session.activeIndex].decorationId;
      } else if (session.finalDecorationId) {
        targetId = session.finalDecorationId;
        snippetSessionRef.current = null;
        ctxKeysRef.current?.inSnippetSession.set(false);
      } else {
        snippetSessionRef.current = null;
        ctxKeysRef.current?.inSnippetSession.set(false);
      }

      if (targetId) {
         const range = model.getDecorationRange(targetId);
         if (range) {
            editorInstance.setSelection(range);
            editorInstance.revealPositionInCenter(range.getStartPosition());
         }
      }
      
      if (!snippetSessionRef.current) {
         const allIds = session.placeholders.map(p => p.decorationId).concat(session.finalDecorationId ? [session.finalDecorationId] : []);
         model.deltaDecorations(allIds.filter(Boolean) as string[], []);
      }
    }, 'customAcVisible || canExpandAbbreviation || inSnippetSession');

    editorInstance.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
      const session = snippetSessionRef.current;
      const model = editorInstance.getModel();
      if (!session || !model) return;

      session.activeIndex = Math.max(0, session.activeIndex - 1);
      const targetId = session.placeholders[session.activeIndex]?.decorationId;

      if (targetId) {
         const range = model.getDecorationRange(targetId);
         if (range) {
            editorInstance.setSelection(range);
            editorInstance.revealPositionInCenter(range.getStartPosition());
         }
      }
    }, 'inSnippetSession');

    // --- Overlay Commands ---

    editorInstance.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, async () => {
      if (!lspClientRef.current) return;
      const pos = editorInstance.getPosition();
      const selection = editorInstance.getSelection();
      if (!pos || !selection) return;
      const result = await lspClientRef.current.getCodeActions(pos.lineNumber, pos.column, selection.startLineNumber, selection.startColumn);
      if (result && result.length > 0) {
        const scrolledPos = editorInstance.getScrolledVisiblePosition(pos);
        if (scrolledPos) {
           setCodeActionsState({
             visible: true,
             data: result,
             position: { top: scrolledPos.top + 22, left: scrolledPos.left },
             selectedIndex: 0
           });
        }
      }
    });

    editorInstance.addCommand(monaco.KeyCode.F2, async () => {
      if (!lspClientRef.current) return;
      const pos = editorInstance.getPosition();
      if (!pos) return;
      // In a real app we'd show an input box. For now, prompt the user.
      const newName = prompt('Enter new name:');
      if (newName) {
         const result = await lspClientRef.current.rename(pos.lineNumber, pos.column, newName);
         if (result && result.changes) {
           // Apply workspace edit (simplistic implementation for current document)
           const uri = Object.keys(result.changes)[0];
           if (uri && result.changes[uri]) {
             const edits = result.changes[uri].map((e: any) => ({
               range: new monaco.Range(e.range.start.line + 1, e.range.start.character + 1, e.range.end.line + 1, e.range.end.character + 1),
               text: e.newText
             }));
             editorInstance.executeEdits('rename', edits);
           }
         }
      }
    });

    editorInstance.addCommand(monaco.KeyCode.F12, async () => {
      if (!lspClientRef.current) return;
      const pos = editorInstance.getPosition();
      if (!pos) return;
      const result = await lspClientRef.current.getDefinition(pos.lineNumber, pos.column);
      if (result) {
         const def = Array.isArray(result) ? result[0] : result;
         if (def && def.range) {
           // Jump if in same file
           editorInstance.revealLineInCenter(def.range.start.line + 1);
           editorInstance.setPosition({ lineNumber: def.range.start.line + 1, column: def.range.start.character + 1 });
         }
      }
    });

    editorInstance.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, async () => {
      if (!lspClientRef.current) return;
      const result = await lspClientRef.current.formatDocument();
      if (result && result.length > 0) {
         const edits = result.map((e: any) => ({
           range: new monaco.Range(e.range.start.line + 1, e.range.start.character + 1, e.range.end.line + 1, e.range.end.character + 1),
           text: e.newText
         }));
         editorInstance.executeEdits('format', edits);
      }
    });
    
    // Hover is triggered on mouse move via monaco.editor.onMouseMove, but we can also map a shortcut if needed.
    // For simplicity, let's trigger hover on F1 (since F1 is often command palette, but Monaco handles it).
    editorInstance.onMouseMove((e) => {
      if (!lspClientRef.current) return;
      if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
        const pos = e.target.position;
        if (pos) {
          // Debounce hover?
          lspClientRef.current.getHover(pos.lineNumber, pos.column).then((result: any) => {
              if (result && result.contents) {
               let contentsStr = '';
               if (typeof result.contents === 'string') {
                 contentsStr = result.contents;
               } else if (result.contents.value) {
                 contentsStr = result.contents.value;
               } else if (Array.isArray(result.contents)) {
                 contentsStr = result.contents.map((c: any) => c.value || c).join('\n\n');
               }
               if (contentsStr) {
                 const scrolledPos = editorInstance.getScrolledVisiblePosition(pos);
                 if (scrolledPos) {
                   setHoverState({
                     visible: true,
                     data: { contents: contentsStr },
                     position: { top: scrolledPos.top + 22, left: scrolledPos.left }
                   });
                 }
               }
             } else {
               setHoverState(prev => prev.visible ? { ...prev, visible: false } : prev);
             }
          });
        }
      } else {
        setHoverState(prev => prev.visible ? { ...prev, visible: false } : prev);
      }
    });

    editorInstance.onKeyDown((e) => {
      const st = acStateRef.current;
      
      if (e.keyCode === monaco.KeyCode.Escape) {
          if (st.visible) {
            setAcVisible(false);
            st.visible = false;
            ctxKeysRef.current?.customAcVisible.set(false);
            return;
          } else if (snippetSessionRef.current) {
            const allIds = snippetSessionRef.current.placeholders.map(p => p.decorationId).concat(snippetSessionRef.current.finalDecorationId ? [snippetSessionRef.current.finalDecorationId] : []);
            editorInstance.getModel()?.deltaDecorations(allIds.filter(Boolean) as string[], []);
            snippetSessionRef.current = null;
            ctxKeysRef.current?.inSnippetSession.set(false);
            return;
          } else if (codeActionsState.visible) {
            e.preventDefault();
            e.stopPropagation();
            setCodeActionsState(prev => ({ ...prev, visible: false }));
            return;
          } else if (hoverState.visible) {
            setHoverState(prev => prev.visible ? { ...prev, visible: false } : prev);
          }
      }

      if (codeActionsState.visible) {
        if (e.keyCode === monaco.KeyCode.UpArrow) {
          e.preventDefault();
          e.stopPropagation();
          setCodeActionsState(prev => ({ ...prev, selectedIndex: Math.max(0, prev.selectedIndex - 1) }));
          return;
        }
        if (e.keyCode === monaco.KeyCode.DownArrow) {
          e.preventDefault();
          e.stopPropagation();
          setCodeActionsState(prev => ({ ...prev, selectedIndex: Math.min(prev.data.length - 1, prev.selectedIndex + 1) }));
          return;
        }
        if (e.keyCode === monaco.KeyCode.Enter) {
          e.preventDefault();
          e.stopPropagation();
          const action = codeActionsState.data[codeActionsState.selectedIndex];
          if (action && action.edit && action.edit.changes) {
            const uri = Object.keys(action.edit.changes)[0];
            if (uri) {
               const edits = action.edit.changes[uri].map((ed: any) => ({
                 range: new monaco.Range(ed.range.start.line + 1, ed.range.start.character + 1, ed.range.end.line + 1, ed.range.end.character + 1),
                 text: ed.newText
               }));
               editorInstance.executeEdits('code-action', edits);
            }
          }
          setCodeActionsState(prev => ({ ...prev, visible: false }));
          return;
        }
      }

      if (st.visible) {
        if (e.keyCode === monaco.KeyCode.UpArrow) {
          e.preventDefault();
          e.stopPropagation();
          const newIdx = Math.max(0, st.index - 1);
          setAcIndex(newIdx);
          st.index = newIdx;
          return;
        }
        if (e.keyCode === monaco.KeyCode.DownArrow) {
          e.preventDefault();
          e.stopPropagation();
          const newIdx = Math.min(st.filteredItems.length - 1, st.index + 1);
          setAcIndex(newIdx);
          st.index = newIdx;
          return;
        }
        if (e.keyCode === monaco.KeyCode.Enter) {
          e.preventDefault();
          e.stopPropagation();
          const item = st.filteredItems[st.index];
          if (item) applyCompletion(item);
          return;
        }
      }
    });

    editorInstance.onKeyUp((e) => {
      const key = e.browserEvent.key;
      if (acStateRef.current.visible) {
        if (/^[a-zA-Z0-9_]$/.test(key) || key === 'Backspace') {
          filterCompletions(editorInstance);
        }
      }
    });

    // Monaco's typing event is more reliable than browser keyup events,
    // especially when the editor is embedded inside the Wails webview.
    (editorInstance as any).onDidType((text: string) => {
      console.log('[LSP] typed:', JSON.stringify(text));

      // Smart HTML closing tags: <div> becomes <div></div>, with the cursor
      // kept between the tags. Void elements intentionally stay unclosed.
      if (text.endsWith('>') && activeTabRef.current?.language === 'html') {
        const position = editorInstance.getPosition();
        const model = editorInstance.getModel();
        if (position && model) {
          const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
          const openingTag = linePrefix.match(/<([A-Za-z][\w:-]*)(?:\s[^<>]*?)?>$/);
          const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
          if (openingTag && !voidTags.has(openingTag[1].toLowerCase()) && !linePrefix.endsWith('/>')) {
            const closingTag = `</${openingTag[1]}>`;
            editorInstance.executeEdits('html-auto-close-tag', [{
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              text: closingTag,
            }]);
            editorInstance.setPosition(position);
          }
        }
      }

      const typedCharacter = text.slice(-1);
      const advertisedTriggers = lspClientRef.current?.triggerCharacters || ['.'];
      const language = activeTabRef.current?.language;
      const languageTrigger =
        (language === 'html' && typedCharacter === '<') ||
        (language === 'css' && typedCharacter === '.');
      const htmlAbbreviationTrigger = language === 'html' && typedCharacter === '!';

      // Any non-identifier character changes the completion context. Trigger
      // characters are allowed through so HTML '<' can request tag completion.
      if (!/[A-Za-z0-9_$.]$/.test(text) && !languageTrigger && !htmlAbbreviationTrigger) {
        setJavaHint((current) => current.visible ? { ...current, visible: false } : current);
        completionRequestIdRef.current++;
        if (completionDebounceRef.current) {
          clearTimeout(completionDebounceRef.current);
          completionDebounceRef.current = null;
        }
        if (acStateRef.current.visible) {
          setAcVisible(false);
          acStateRef.current.visible = false;
          ctxKeysRef.current?.customAcVisible.set(false);
        }
        return;
      }
      updateAbbreviationHint();
      if (typedCharacter.trim() !== '' && (advertisedTriggers.includes(typedCharacter) || languageTrigger)) {
        console.log(`[LSP] Typed completion trigger (${typedCharacter})`);
        fetchAndShowCompletions(editorInstance, typedCharacter);
      } else if (/[A-Za-z0-9_$]/.test(text)) {
        // Ask the active language server for suggestions while typing, but
        // debounce requests so fast typing stays responsive.
        if (completionDebounceRef.current) {
          clearTimeout(completionDebounceRef.current);
        }
        completionDebounceRef.current = setTimeout(() => {
          fetchAndShowCompletions(editorInstance);
        }, 250);
      }
    });

    // Override Monaco's built-in Ctrl+Space suggest command. The custom LSP
    // popup must be the only completion UI for this editor.
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      if (acStateRef.current.visible) return;
      console.log('[LSP] Manual completion trigger (Ctrl+Space)');
      fetchAndShowCompletions(editorInstance);
    });

    // Custom Save Command (Ctrl+S) inside Monaco
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const currentTab = activeTabRef.current;
      if (currentTab) {
        if (settingsRef.current.formatOnSave !== false) {
          try {
            const action = editorInstance.getAction('editor.action.formatDocument');
            if (action) {
              await action.run();
            }
          } catch (e) {
            console.warn('Format on save failed:', e);
          }
        }
        
        // Force flush latest content before save
        const latestContent = editorInstance.getValue();
        if (debounceTimersRef.current[currentTab.path]) {
          clearTimeout(debounceTimersRef.current[currentTab.path]);
        }
        onContentChangeRef.current(currentTab.path, latestContent);
        
        // Pass content explicitly to avoid React state race conditions!
        onSaveFileRef.current(currentTab.path, latestContent);
      }
    });

    const duplicateLines = (direction: 'up' | 'down') => {
      const actionId = direction === 'up' ? 'editor.action.copyLinesUpAction' : 'editor.action.copyLinesDownAction';
      const action = editorInstance.getAction(actionId);
      let executed = false;
      if (action) {
        try {
          action.run();
          executed = true;
        } catch (e) {
          console.warn('Action failed, using fallback:', e);
        }
      }

      if (!executed) {
        const selection = editorInstance.getSelection();
        const model = editorInstance.getModel();
        if (selection && model) {
          const startLine = selection.startLineNumber;
          const endLine = selection.endLineNumber;
          const lines: string[] = [];
          for (let i = startLine; i <= endLine; i++) {
            lines.push(model.getLineContent(i));
          }
          const textToDuplicate = lines.join('\n') + '\n';
          if (direction === 'up') {
            editorInstance.executeEdits('duplicate-up', [{
              range: new monaco.Range(startLine, 1, startLine, 1),
              text: textToDuplicate
            }]);
          } else {
            const isLastLine = endLine >= model.getLineCount();
            if (isLastLine) {
              const maxCol = model.getLineMaxColumn(endLine);
              editorInstance.executeEdits('duplicate-down', [{
                range: new monaco.Range(endLine, maxCol, endLine, maxCol),
                text: '\n' + lines.join('\n')
              }]);
            } else {
              editorInstance.executeEdits('duplicate-down', [{
                range: new monaco.Range(endLine + 1, 1, endLine + 1, 1),
                text: textToDuplicate
              }]);
            }
          }
        }
      }

      window.dispatchEvent(new CustomEvent('devwannacode:toast', {
        detail: { message: direction === 'up' ? 'duplicate line up' : 'duplicate line down' }
      }));
    };

    // Go to Line Command (Ctrl+G)
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      editorInstance.getAction('editor.action.gotoLine')?.run();
    });

    // Toggle Word Wrap Command (Alt+Z)
    editorInstance.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
      const currentWrap = editorInstance.getOption(monaco.editor.EditorOption.wordWrap);
      const newWrap = currentWrap === 'off' ? 'on' : 'off';
      editorInstance.updateOptions({ wordWrap: newWrap });
      window.dispatchEvent(new CustomEvent('devwannacode:toast', {
        detail: { message: `word wrap: ${newWrap}` }
      }));
    });

    // Duplicate Line Down (Shift+Alt+Down)
    editorInstance.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
      duplicateLines('down');
    });

    // Duplicate Line Up (Shift+Alt+Up)
    editorInstance.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
      duplicateLines('up');
    });

    // Ctrl+Tab (Next Tab) inside Monaco
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => {
      window.dispatchEvent(new CustomEvent('devwannacode:switch_tab', { detail: { direction: 'next' } }));
    });

    // Ctrl+Shift+Tab (Prev Tab) inside Monaco
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
      window.dispatchEvent(new CustomEvent('devwannacode:switch_tab', { detail: { direction: 'prev' } }));
    });

    // Capture keydown directly on DOM element to ensure shortcuts are captured
    const domNode = editorInstance.getDomNode();
    if (domNode) {
      domNode.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
          e.preventDefault();
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('devwannacode:switch_tab', {
            detail: { direction: e.shiftKey ? 'prev' : 'next' }
          }));
        } else if (e.altKey && e.shiftKey) {
          if (e.key === 'ArrowUp' || e.code === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            duplicateLines('up');
          } else if (e.key === 'ArrowDown' || e.code === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            duplicateLines('down');
          }
        }
      }, true);
    }

    // Initial position
    const pos = editorInstance.getPosition();
    if (pos) {
      window.dispatchEvent(new CustomEvent('devwannacode:cursor', { detail: { line: pos.lineNumber, col: pos.column } }));
    }
  };

  useEffect(() => {
    const handleGotoLine = () => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.getAction('editor.action.gotoLine')?.run();
      }
    };
    const handleToggleWordWrap = () => {
      if (editorRef.current && monacoRef.current) {
        const currentWrap = editorRef.current.getOption(monacoRef.current.editor.EditorOption.wordWrap);
        const newWrap = currentWrap === 'off' ? 'on' : 'off';
        editorRef.current.updateOptions({ wordWrap: newWrap });
        window.dispatchEvent(new CustomEvent('devwannacode:toast', {
          detail: { message: `word wrap: ${newWrap}` }
        }));
      }
    };
    window.addEventListener('devwannacode:gotoline', handleGotoLine);
    window.addEventListener('devwannacode:toggle_wordwrap', handleToggleWordWrap);
    return () => {
      window.removeEventListener('devwannacode:gotoline', handleGotoLine);
      window.removeEventListener('devwannacode:toggle_wordwrap', handleToggleWordWrap);
    };
  }, []);

  // Sync cursor position whenever active tab changes or targetLocation is set
  useEffect(() => {
    if (editorRef.current && activeTab && !isImageFile(activeTab.path)) {
      editorRef.current.focus();
      if (targetLocation && (
        targetLocation.path === activeTab.path ||
        targetLocation.path.replace(/\\/g, '/').toLowerCase() === activeTab.path.replace(/\\/g, '/').toLowerCase()
      )) {
        editorRef.current.revealLineInCenter(targetLocation.line);
        editorRef.current.setPosition({ lineNumber: targetLocation.line, column: targetLocation.col });
      } else {
        const pos = editorRef.current.getPosition();
        if (pos) {
          window.dispatchEvent(new CustomEvent('devwannacode:cursor', { detail: { line: pos.lineNumber, col: pos.column } }));
        }
      }
    }
  }, [activeTab?.path, targetLocation]);

  const monacoTheme = `devwanna-${theme}`;
  const splitActiveTab = isSplit ? (tabs.find((t) => t.path === splitTabPath) || (tabs.length > 1 ? tabs.find((t) => t.path !== activeTab?.path) : null) || activeTab) : null;

  const renderBreadcrumbs = (tab: EditorTab | null, isSplitTag = false) => {
    if (!tab) return null;
    const isMd = isMarkdownFile(tab.path);
    const isPreview = Boolean(previewTabPaths[tab.path]);

    return (
      <div className="editor-breadcrumbs">
        {isSplitTag && <span className="breadcrumb-segment" style={{ color: 'var(--accent)', fontWeight: 600 }}>[split right]</span>}
        {isSplitTag && <span className="breadcrumb-separator">›</span>}
        {(workspacePath && tab.path.startsWith(workspacePath)
          ? (workspacePath.split(/[/\\]/).pop() || '') + '/' + tab.path.slice(workspacePath.length).replace(/^[/\\]+/, '')
          : tab.path
        ).split(/[/\\]/).map((segment, idx, arr) => (
          <span key={idx} className="breadcrumb-segment" onClick={onOpenQuickOpen} style={{ cursor: 'pointer' }} title="Search files (Ctrl+P)">
            {segment}
            {idx < arr.length - 1 && <span className="breadcrumb-separator">›</span>}
          </span>
        ))}

        {isMd && (
          <div className="markdown-toggle-container">
            <button
              className={`markdown-toggle-btn ${!isPreview ? 'active' : ''}`}
              onClick={() => setPreviewTabPaths((prev) => ({ ...prev, [tab.path]: false }))}
            >
              code
            </button>
            <button
              className={`markdown-toggle-btn ${isPreview ? 'active' : ''}`}
              onClick={() => setPreviewTabPaths((prev) => ({ ...prev, [tab.path]: true }))}
            >
              preview
            </button>
          </div>
        )}
      </div>
    );
  };

  const commonOptions = {
    fontSize: settings.fontSize || 14,
    fontFamily: "'JetBrains Mono', 'Geist Mono', 'Consolas', 'Courier New', monospace",
    wordWrap: (settings.wordWrap === 'on' ? 'on' : 'off') as 'on' | 'off',
    minimap: { enabled: settings.minimap || false },
    lineNumbers: 'on' as const,
    lineNumbersMinChars: 4,
    lineDecorationsWidth: 20,
    renderLineHighlight: 'line' as const,
    cursorBlinking: 'smooth' as const,
    cursorWidth: 2,
    smoothScrolling: true,
    automaticLayout: true,
    tabSize: 2,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 },
    scrollbar: {
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
    },
    wordBasedSuggestions: 'off' as const,
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    snippetSuggestions: 'none' as const,
    autoClosingBrackets: 'always' as const,
    autoClosingQuotes: 'always' as const,
    autoClosingDelete: 'always' as const,
    autoSurround: 'languageDefined' as const,
    autoIndent: 'full' as const,
    bracketPairColorization: { enabled: true },
    linkedEditing: true,
    colorDecorators: true,
    colorDecoratorsLimit: 500,
    stickyScroll: {
      enabled: true,
      maxLineCount: 3,
      defaultModel: 'foldingProviderModel' as const,
    },
    folding: true,
    foldingHighlight: true,
    foldingStrategy: 'auto' as const,
    showFoldingControls: 'mouseover' as const,
    unfoldOnClickAfterEndOfLine: true,
  };

  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchAndShowCompletions = async (editor: any, triggerChar?: string) => {
    if (!lspClientRef.current) return;
    const requestId = ++completionRequestIdRef.current;
    const position = editor.getPosition();
    const model = editor.getModel();
    if (!position || !model) return;

    const rawItems = await lspClientRef.current.getCompletions(position.lineNumber, position.column, triggerChar);
    // A newer completion request may have been started while this one was
    // waiting on the language server. Never let an older response hide or
    // replace the newer popup.
    if (requestId !== completionRequestIdRef.current) return;
    if (!rawItems || rawItems.length === 0) {
      setAcVisible(false);
      acStateRef.current.visible = false;
      return;
    }

    const wordInfo = model.getWordUntilPosition(position);
    const query = wordInfo.word.toLowerCase();
    const matching = query ? rawItems.filter((it: any) => it.label.toLowerCase().includes(query)) : rawItems;
    const filtered = matching.slice(0, MAX_VISIBLE_COMPLETIONS);

    if (filtered.length === 0) {
      setAcVisible(false);
      acStateRef.current.visible = false;
      ctxKeysRef.current?.customAcVisible.set(false);
      return;
    }

    const scrolledPos = editor.getScrolledVisiblePosition(position);
    setAcItems(filtered);
    setAcIndex(0);
    setAcPosition({ top: scrolledPos.top + 22, left: scrolledPos.left });
    setAcVisible(true);
    ctxKeysRef.current?.customAcVisible.set(true);

    acStateRef.current = {
      visible: true,
      rawItems: rawItems,
      filteredItems: filtered,
      index: 0,
      line: position.lineNumber,
      startCol: wordInfo.startColumn
    };
  };

  const filterCompletions = (editor: any) => {
    const st = acStateRef.current;
    if (!st.visible) return;

    const position = editor.getPosition();
    const model = editor.getModel();
    if (!position || !model) return;

    const wordInfo = model.getWordUntilPosition(position);
    const query = wordInfo.word.toLowerCase();

    const filtered = st.rawItems
      .filter((it: any) => {
        const lbl = it.label.toLowerCase();
        // Prefix-first matching
        if (lbl.startsWith(query)) return true;
        // Then case-insensitive substring matching
        if (lbl.includes(query)) return true;
        return false;
      })
      .sort((a: any, b: any) => {
        const aLbl = a.label.toLowerCase();
        const bLbl = b.label.toLowerCase();
        const aStarts = aLbl.startsWith(query);
        const bStarts = bLbl.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      })
      .slice(0, MAX_VISIBLE_COMPLETIONS);

    if (filtered.length === 0) {
      setAcVisible(false);
      st.visible = false;
      ctxKeysRef.current?.customAcVisible.set(false);
      return;
    }

    const scrolledPos = editor.getScrolledVisiblePosition(position);
    setAcItems(filtered);
    setAcIndex(0);
    setAcPosition({ top: scrolledPos.top + 22, left: scrolledPos.left });
    st.filteredItems = filtered;
    st.index = 0;
  };

  const renderTabContent = (tab: EditorTab | null) => {
    if (!tab) return null;
    if (isImageFile(tab.path)) {
      return <ImageViewer path={tab.path} name={tab.name} />;
    }
    if (isMarkdownFile(tab.path) && previewTabPaths[tab.path]) {
      return <MarkdownViewer content={tab.content} />;
    }
    return (
      <div className="monaco-wrapper" style={{ position: 'relative', height: '100%', width: '100%' }}>
        <MonacoEditor
          height="100%"
          path={`file:///${tab.path.replace(/\\/g, '/')}`}
          language={tab.language}
          defaultValue={tab.content}
          theme={monacoTheme}
          beforeMount={handleBeforeMount}
          onMount={handleOnMount}
          onChange={(val) => {
            const newVal = val || '';
            if (lspClientRef.current) {
              lspClientRef.current.updateDocument(newVal);
            }
            if (debounceTimersRef.current[tab.path]) {
              clearTimeout(debounceTimersRef.current[tab.path]);
            }
            debounceTimersRef.current[tab.path] = setTimeout(() => {
              onContentChange(tab.path, newVal);
            }, 250);
          }}
          options={commonOptions}
        />
        {acVisible && (
          <AutocompletePopup
            items={acItems}
            selectedIndex={acIndex}
            position={acPosition}
            onSelect={(item) => (editorRef.current as any)?.applyCustomCompletion?.(item)}
            onHover={(idx) => { 
              setAcIndex(idx); 
              acStateRef.current.index = idx; 
            }}
          />
        )}
        {javaHint.visible && !acVisible && (
          <div className="java-abbreviation-hint" style={{ top: javaHint.top, left: javaHint.left }}>
            {javaHint.text}
          </div>
        )}
        <LspOverlays 
          hover={hoverState}
          codeActions={codeActionsState}
          onSelectCodeAction={(action) => {
             if (action.edit && action.edit.changes && editorRef.current) {
                const uri = Object.keys(action.edit.changes)[0];
                if (uri && monacoRef.current) {
                   const edits = action.edit.changes[uri].map((ed: any) => ({
                     range: new monacoRef.current.Range(ed.range.start.line + 1, ed.range.start.character + 1, ed.range.end.line + 1, ed.range.end.character + 1),
                     text: ed.newText
                   }));
                   (editorRef.current as any).executeEdits('code-action', edits);
                }
             }
             setCodeActionsState(prev => ({ ...prev, visible: false }));
          }}
        />
      </div>
    );
  };

  return (
    <div className="editor-container" ref={containerRef}>
      {isSplit ? (
        <div className="editor-split-wrapper">
          {/* Left Editor Group Pane */}
          <div className="editor-split-pane" style={{ width: `${splitWidthPercent}%` }}>
            <EditorTabs
              tabs={tabs}
              activePath={activeTab?.path || ''}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onNewTab={onNewTab}
              onReorderTabs={onReorderTabs}
              onToggleSplit={onToggleSplit}
              isSplit={isSplit}
            />
            {activeTab ? (
              <div className="editor-pane-inner">
                {renderBreadcrumbs(activeTab)}
                {renderTabContent(activeTab)}
              </div>
            ) : (
              <div className="editor-empty-state">
                <span className="empty-secondary">no file open in left pane.</span>
              </div>
            )}
          </div>

          {/* Resizer Divider */}
          <div className="panel-resizer" onMouseDown={handleSplitMouseDown} />

          {/* Right Editor Group Pane */}
          <div className="editor-split-pane" style={{ width: `${100 - splitWidthPercent}%` }}>
            <EditorTabs
              tabs={tabs}
              activePath={splitActiveTab?.path || ''}
              onSelectTab={(path) => onSelectSplitTab ? onSelectSplitTab(path) : onSelectTab(path)}
              onCloseTab={onCloseTab}
              onNewTab={onNewTab}
              onReorderTabs={onReorderTabs}
              onToggleSplit={onCloseSplit || onToggleSplit}
              isSplit={true}
            />
            {splitActiveTab ? (
              <div className="editor-pane-inner">
                {renderBreadcrumbs(splitActiveTab, true)}
                {renderTabContent(splitActiveTab)}
              </div>
            ) : (
              <div className="editor-empty-state">
                <span className="empty-secondary">no file open in right split pane.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Single Editor View */
        <>
          <EditorTabs
            tabs={tabs}
            activePath={activeTab?.path || ''}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onNewTab={onNewTab}
            onReorderTabs={onReorderTabs}
            onToggleSplit={onToggleSplit}
            isSplit={false}
          />

          {activeTab?.hasConflict && (
            <div className="editor-conflict-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} strokeWidth={1.5} />
                <span>File was modified externally. Local unsaved changes exist.</span>
              </div>
              <div className="editor-conflict-actions">
                <button
                  className="editor-conflict-btn"
                  onClick={() => onReloadConflict(activeTab.path)}
                >
                  Reload From Disk
                </button>
                <button
                  className="editor-conflict-btn danger"
                  onClick={() => onKeepConflict(activeTab.path)}
                >
                  Keep My Changes
                </button>
              </div>
            </div>
          )}

          {activeTab ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {renderBreadcrumbs(activeTab)}
              {renderTabContent(activeTab)}
            </div>
          ) : (
            <div className="editor-empty-state">
              {/* Background Art */}
              <div className="editor-empty-bg-art">
                <img src="/logo.webp" alt="logo" style={{ width: 300, height: 300, opacity: 0.03, pointerEvents: 'none' }} />
              </div>
              
              <div className="editor-empty-content">
                <pre className="editor-empty-ascii">
{`██████╗ ███████╗██╗   ██╗██╗    ██╗ █████╗ ███╗   ██╗███╗   ██╗ █████╗  ██████╗ ██████╗ ██████╗ ███████╗
██╔══██╗██╔════╝██║   ██║██║    ██║██╔══██╗████╗  ██║████╗  ██║██╔══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║  ██║█████╗  ██║   ██║██║ █╗ ██║███████║██╔██╗ ██║██╔██╗ ██║███████║██║     ██║   ██║██║  ██║█████╗  
██║  ██║██╔══╝  ╚██╗ ██╔╝██║███╗██║██╔══██║██║╚██╗██║██║╚██╗██║██╔══██║██║     ██║   ██║██║  ██║██╔══╝  
██████╔╝███████╗ ╚████╔╝ ╚███╔███╔╝██║  ██║██║ ╚████║██║ ╚████║██║  ██║╚██████╗╚██████╔╝██████╔╝███████╗
╚═════╝ ╚══════╝  ╚═══╝   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝`}
                </pre>
                
                <div className="editor-empty-metadata">
                  <span className="metadata-badge">v1.0-alpha</span>
                  <span className="metadata-dot">•</span>
                  <span className="metadata-path">{workspacePath || 'no workspace loaded'}</span>
                </div>

                <div className="empty-bento-container">
                  <div className="empty-bento">
                    <div className="bento-header">actions</div>
                    <button className="bento-btn bento-wide bento-accent" onClick={onOpenFolder}>
                      <FolderOpen size={14} strokeWidth={1.5} /> open folder
                    </button>
                    <button className="bento-btn bento-medium" onClick={onOpenQuickOpen}>
                      <Search size={14} strokeWidth={1.5} /> open file
                    </button>
                    <button className="bento-btn bento-small" onClick={onNewTab}>
                      <FilePlus size={14} strokeWidth={1.5} /> new file
                    </button>
                    <button className="bento-btn bento-medium" onClick={onOpenCommandPalette}>
                      <Command size={14} strokeWidth={1.5} /> palette
                    </button>
                    <button className="bento-btn bento-small" onClick={onToggleTerminal}>
                      <Terminal size={14} strokeWidth={1.5} /> terminal
                    </button>
                  </div>

                  <div className="empty-bento recent-projects-bento">
                    <div className="bento-header">recent workspaces</div>
                    {recentProjects && recentProjects.length > 0 ? (
                      recentProjects.slice(0, 4).map((proj: any) => (
                        <button 
                          key={proj.path} 
                          className="bento-btn bento-wide bento-recent" 
                          onClick={() => onOpenProject && onOpenProject(proj.path)}
                        >
                          <Folder size={14} strokeWidth={1.5} /> 
                          <div className="recent-text">
                            <span className="recent-name">{proj.name || proj.path.split(/[/\\]/).pop()}</span>
                            <span className="recent-path">{proj.path}</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="bento-wide bento-empty-text">no recent workspaces</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

Editor.displayName = 'Editor';

export default Editor;
