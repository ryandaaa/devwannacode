import type * as MonacoNamespace from 'monaco-editor';

let monaco: typeof MonacoNamespace;

export function setMonacoInstance(instance: typeof MonacoNamespace) {
  monaco = instance;
}

export interface LSPClientOptions {
  languageId: string;
  documentText: () => string;
  documentUri: string;
  workspaceUri?: string;
  editor?: MonacoNamespace.editor.IStandaloneCodeEditor;
}



class SimpleLSPClient {
  private ws: WebSocket;
  private messageId = 1;
  private docVersion = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private receiveBuffer: Uint8Array = new Uint8Array(0);
  private encoder = new TextEncoder();
  private decoder = new TextDecoder('utf-8');
  private isInitialized = false;
  private decorationsCollection: MonacoNamespace.editor.IEditorDecorationsCollection | null = null;
  private semanticUpdateTimer: any = null;
  private updateTimer: any = null;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private openedDocumentUri: string | null = null;
  public triggerCharacters: string[] = ['.'];

  constructor(private options: LSPClientOptions) {
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    this.ws = new WebSocket(`ws://127.0.0.1:9999/lsp?lang=${options.languageId}`);
    
    if (this.options.editor) {
      this.decorationsCollection = this.options.editor.createDecorationsCollection([]);
    }

    this.ws.onopen = () => {
      this.initialize();
    };

    this.ws.onerror = (e) => {
      console.error('[LSP] WebSocket error:', e);
      window.dispatchEvent(new CustomEvent('devwannacode:lsp_error', { detail: { error: 'LSP WebSocket Connection Failed' } }));
    };

    this.ws.onclose = (e) => {
      console.log('[LSP] WebSocket closed:', e.code, e.reason);
      this.resolveReady();
      window.dispatchEvent(new CustomEvent('devwannacode:lsp_error', { detail: { error: `LSP Connection Closed: ${e.reason || e.code}` } }));
    };

    this.ws.onmessage = (event) => {
      let newData: Uint8Array;
      if (typeof event.data === 'string') {
        newData = this.encoder.encode(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        newData = new Uint8Array(event.data);
      } else {
        return;
      }

      const combined = new Uint8Array(this.receiveBuffer.length + newData.length);
      combined.set(this.receiveBuffer, 0);
      combined.set(newData, this.receiveBuffer.length);
      this.receiveBuffer = combined;

      this.processBuffer();
    };
  }

  private findHeaderDelimiter(buf: Uint8Array): { index: number; length: number } | null {
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === 13 && buf[i + 1] === 10 && i + 3 < buf.length && buf[i + 2] === 13 && buf[i + 3] === 10) {
        return { index: i, length: 4 };
      }
      if (buf[i] === 10 && buf[i + 1] === 10) {
        return { index: i, length: 2 };
      }
    }
    return null;
  }

  private processBuffer() {
    while (true) {
      const delim = this.findHeaderDelimiter(this.receiveBuffer);
      if (!delim) break;

      const headerStr = this.decoder.decode(this.receiveBuffer.subarray(0, delim.index));
      const match = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        console.error('[LSP] Invalid header in buffer:', headerStr);
        this.receiveBuffer = this.receiveBuffer.slice(delim.index + delim.length);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const headerLength = delim.index + delim.length;

      if (this.receiveBuffer.length < headerLength + contentLength) {
        break; // Not enough data yet
      }

      const payloadBytes = this.receiveBuffer.subarray(headerLength, headerLength + contentLength);
      this.receiveBuffer = this.receiveBuffer.slice(headerLength + contentLength);

      try {
        const payloadStr = this.decoder.decode(payloadBytes);
        const msg = JSON.parse(payloadStr);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          if (msg.error) {
            this.pendingRequests.get(msg.id)!.reject(msg.error);
          } else {
            this.pendingRequests.get(msg.id)!.resolve(msg.result);
          }
          this.pendingRequests.delete(msg.id);
        }
      } catch (e) {
        console.error('[LSP] parse error:', e);
      }
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`LSP socket is not open (${this.ws.readyState})`));
    }
    const id = this.messageId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });
    
    const byteLength = this.encoder.encode(payload).length;
    this.ws.send(`Content-Length: ${byteLength}\r\n\r\n${payload}`);
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });
  }

  private sendNotification(method: string, params: any) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    });
    
    const byteLength = this.encoder.encode(payload).length;
    this.ws.send(`Content-Length: ${byteLength}\r\n\r\n${payload}`);
  }

  public updateOptions(newOptions: LSPClientOptions) {
    const uriChanged = this.options.documentUri !== newOptions.documentUri;
    const previousDocumentUri = this.options.documentUri;
    this.options = newOptions;

    if (this.options.editor && !this.decorationsCollection) {
      this.decorationsCollection = this.options.editor.createDecorationsCollection([]);
    }

    if (uriChanged) {
      this.docVersion = 1;
      
      console.log('[LSP] Switching to document', this.options.documentUri);
      if (this.ws.readyState === WebSocket.OPEN) {
        if (this.openedDocumentUri) {
          this.sendNotification('textDocument/didClose', {
            textDocument: { uri: previousDocumentUri }
          });
        }
        this.sendNotification('textDocument/didOpen', {
          textDocument: {
            uri: this.options.documentUri,
            languageId: this.options.languageId,
            version: this.docVersion,
            text: this.options.documentText()
          }
        });
        this.openedDocumentUri = this.options.documentUri;
        this.triggerSemanticTokens();
      }
    }
  }

  private async initialize() {
    console.log('[LSP] Sending initialize request...');
    
    let rootUri = this.options.workspaceUri;
    if (!rootUri) {
      rootUri = this.options.documentUri.substring(0, this.options.documentUri.lastIndexOf('/'));
    }
    
    try {
      const initResult = await this.sendRequest('initialize', {
        processId: null,
        rootUri: rootUri,
        initializationOptions: {
          completeUnimported: true,
          deepCompletion: true,
          usePlaceholders: true
        },
        capabilities: {
          textDocument: {
            completion: {
              contextSupport: true,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                deprecatedSupport: true,
                preselectSupport: true,
                insertReplaceSupport: true,
                labelDetailsSupport: true
              },
              completionItemKind: {
                valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
              }
            },
            signatureHelp: {
              dynamicRegistration: false,
              signatureInformation: {
                documentationFormat: ['markdown', 'plaintext'],
                parameterInformation: { labelOffsetSupport: true }
              }
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ['markdown', 'plaintext']
            },
            definition: {
              dynamicRegistration: false,
              linkSupport: false
            },
            rename: {
              dynamicRegistration: false,
              prepareSupport: false
            },
            codeAction: {
              dynamicRegistration: false,
              codeActionLiteralSupport: {
                codeActionKind: { valueSet: ['', 'quickfix', 'refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite', 'source', 'source.organizeImports'] }
              },
              dataSupport: true,
              resolveSupport: { properties: ['edit'] }
            },
            formatting: {
              dynamicRegistration: false
            },
            semanticTokens: {
              requests: { full: true },
              tokenTypes: ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'],
              tokenModifiers: []
            }
          }
        }
      });
      console.log('[LSP] Initialized successfully!', initResult);
      if (initResult && initResult.capabilities && initResult.capabilities.completionProvider && initResult.capabilities.completionProvider.triggerCharacters) {
        this.triggerCharacters = initResult.capabilities.completionProvider.triggerCharacters;
        console.log('[LSP] Trigger characters:', this.triggerCharacters);
      }
      this.isInitialized = true;
      this.resolveReady();
      window.dispatchEvent(new CustomEvent('devwannacode:lsp_ready', { detail: { language: this.options.languageId } }));
    } catch (err) {
      console.error('[LSP] Initialize failed:', err);
      // Unblock completion callers even when the server rejects initialize.
      this.resolveReady();
      window.dispatchEvent(new CustomEvent('devwannacode:lsp_error', { detail: { error: `LSP Init Failed: ${err}` } }));
    }

    this.sendNotification('initialized', {});
    
    console.log('[LSP] Sending didOpen for', this.options.documentUri);
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: this.options.documentUri,
        languageId: this.options.languageId,
        version: this.docVersion,
        text: this.options.documentText()
      }
    });
    this.openedDocumentUri = this.options.documentUri;

    this.triggerSemanticTokens();

  }

  public async getCompletions(line: number, column: number, triggerChar?: string): Promise<any[]> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return [];
    this.flushPendingChanges();
    try {
      const params: any = {
        textDocument: { uri: this.options.documentUri },
        position: { line: line - 1, character: column - 1 }
      };

      if (triggerChar) {
        params.context = {
          triggerKind: 2,
          triggerCharacter: triggerChar
        };
      } else {
        params.context = {
          triggerKind: 1
        };
      }

      console.log(`[LSP] getCompletions params:`, JSON.stringify(params));
      let result = await this.sendRequest('textDocument/completion', params);
      console.log(`[LSP] getCompletions result:`, result);
      
      let items = Array.isArray(result) ? result : (result?.items || []);
      // gopls can answer with an incomplete empty list while it is still
      // processing the latest didChange/package analysis. Retry once after a
      // short delay so a transient indexing state does not look like broken
      // autocomplete to the user.
      if (!Array.isArray(result) && result?.isIncomplete && items.length === 0 && this.ws.readyState === WebSocket.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        if (this.ws.readyState === WebSocket.OPEN) {
          console.log('[LSP] Completion result incomplete; retrying once');
          result = await this.sendRequest('textDocument/completion', params);
          console.log(`[LSP] getCompletions retry result:`, result);
          items = Array.isArray(result) ? result : (result?.items || []);
        }
      }
      if (!items || items.length === 0) {
        console.log('[LSP] No completion items returned');
        return [];
      }

      console.log(`[LSP] getCompletions (${this.options.languageId}):`, items.length, 'items returned');

      return items.map((item: any) => {
        let insertText = item.insertText || item.label;
        if (item.textEdit && item.textEdit.newText) {
          insertText = item.textEdit.newText;
        }
        return {
          label: item.label,
          kind: item.kind || 1,
          detail: item.detail || '',
          documentation: item.documentation ? (typeof item.documentation === 'string' ? item.documentation : item.documentation.value) : '',
          insertText: insertText,
          isSnippet: item.insertTextFormat === 2,
          sortText: item.sortText
        };
      });
    } catch (e) {
      console.error('[LSP] getCompletions error:', e);
      return [];
    }
  }

  public async getSignatureHelp(line: number, column: number): Promise<any | null> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return null;
    this.flushPendingChanges();
    try {
      return await this.sendRequest('textDocument/signatureHelp', {
        textDocument: { uri: this.options.documentUri },
        position: { line: line - 1, character: column - 1 }
      });
    } catch (e) {
      console.error('[LSP] getSignatureHelp error:', e);
      return null;
    }
  }

  public async getHover(line: number, column: number): Promise<any | null> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return null;
    this.flushPendingChanges();
    try {
      return await this.sendRequest('textDocument/hover', {
        textDocument: { uri: this.options.documentUri },
        position: { line: line - 1, character: column - 1 }
      });
    } catch (e) {
      console.error('[LSP] getHover error:', e);
      return null;
    }
  }

  public async getDefinition(line: number, column: number): Promise<any | null> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return null;
    this.flushPendingChanges();
    try {
      return await this.sendRequest('textDocument/definition', {
        textDocument: { uri: this.options.documentUri },
        position: { line: line - 1, character: column - 1 }
      });
    } catch (e) {
      console.error('[LSP] getDefinition error:', e);
      return null;
    }
  }

  public async rename(line: number, column: number, newName: string): Promise<any | null> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return null;
    this.flushPendingChanges();
    try {
      return await this.sendRequest('textDocument/rename', {
        textDocument: { uri: this.options.documentUri },
        position: { line: line - 1, character: column - 1 },
        newName: newName
      });
    } catch (e) {
      console.error('[LSP] rename error:', e);
      return null;
    }
  }

  public async formatDocument(): Promise<any | null> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return null;
    this.flushPendingChanges();
    try {
      return await this.sendRequest('textDocument/formatting', {
        textDocument: { uri: this.options.documentUri },
        options: { tabSize: 2, insertSpaces: true }
      });
    } catch (e) {
      console.error('[LSP] formatDocument error:', e);
      return null;
    }
  }

  public async getCodeActions(line: number, column: number, startLine: number, startColumn: number): Promise<any[] | null> {
    await this.ready;
    if (this.ws.readyState !== WebSocket.OPEN) return null;
    this.flushPendingChanges();
    try {
      return await this.sendRequest('textDocument/codeAction', {
        textDocument: { uri: this.options.documentUri },
        range: {
          start: { line: startLine - 1, character: startColumn - 1 },
          end: { line: line - 1, character: column - 1 }
        },
        context: { diagnostics: [] }
      });
    } catch (e) {
      console.error('[LSP] getCodeActions error:', e);
      return null;
    }
  }

  private pendingNewText: string | null = null;

  public updateDocument(newText: string) {
    this.pendingNewText = newText;
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      this.flushPendingChanges();
    }, 150);
  }

  private flushPendingChanges() {
    if (this.pendingNewText !== null) {
      if (this.ws.readyState === WebSocket.OPEN && this.isInitialized) {
        this.sendNotification('textDocument/didChange', {
          textDocument: { uri: this.options.documentUri, version: ++this.docVersion },
          contentChanges: [{ text: this.pendingNewText }]
        });
        console.log('[LSP] didChange sent:', this.options.languageId, this.options.documentUri, 'version', this.docVersion);
        this.triggerSemanticTokens();
      }
      this.pendingNewText = null;
    }
  }

  private triggerSemanticTokens() {
    if (!this.decorationsCollection || !this.options.editor) return;

    clearTimeout(this.semanticUpdateTimer);
    this.semanticUpdateTimer = setTimeout(async () => {
      try {
        const result = await this.sendRequest('textDocument/semanticTokens/full', {
          textDocument: { uri: this.options.documentUri }
        });

        if (result && result.data) {
          this.applySemanticTokens(result.data);
        }
      } catch (e) {
        // Ignore semantic errors
      }
    }, 300); // debounce
  }

  private applySemanticTokens(data: number[]) {
    if (!this.decorationsCollection || !this.options.editor) return;

    let currentLine = 1;
    let currentCol = 1;
    const decorations: MonacoNamespace.editor.IModelDeltaDecoration[] = [];
    const typeMap = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator'];

    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i];
      const deltaStart = data[i+1];
      const length = data[i+2];
      const tokenType = data[i+3];
      
      if (deltaLine > 0) {
        currentLine += deltaLine;
        currentCol = deltaStart + 1;
      } else {
        currentCol += deltaStart;
      }
      
      const typeStr = typeMap[tokenType];
      
      if (['function', 'method', 'variable', 'parameter', 'property', 'type', 'class', 'interface', 'struct'].includes(typeStr)) {
        decorations.push({
          range: new monaco.Range(currentLine, currentCol, currentLine, currentCol + length),
          options: { inlineClassName: `semantic-${typeStr}` }
        });
      }
    }

    this.decorationsCollection.set(decorations);
  }
}

const activeClients = new Map<string, SimpleLSPClient>();

export function connectLSP(options: LSPClientOptions): SimpleLSPClient {
  if (activeClients.has(options.languageId)) {
    const client = activeClients.get(options.languageId)!;
    client.updateOptions(options);
    return client;
  }
  const client = new SimpleLSPClient(options);
  activeClients.set(options.languageId, client);
  return client;
}
