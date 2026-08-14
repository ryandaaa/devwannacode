export interface FileNode {
  name: string;
  path: string;
  relPath: string;
  isDir: boolean;
  size: number;
  modTime?: any;
  extension: string;
  matchContext?: string;
  children?: FileNode[];
}

export interface TextSearchResult {
  path: string;
  relPath: string;
  fileName: string;
  lineNumber: number;
  lineContent: string;
}


export interface EditorTab {
  path: string;
  name: string;
  isDirty: boolean;
  content: string;
  originalContent: string;
  language: string;
  line: number;
  col: number;
  hasConflict?: boolean;
  isDiff?: boolean;
  headContent?: string;
}

export interface TerminalTabItem {
  id: string;
  title: string;
  exited: boolean;
  exitCode: number;
}

export interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileChange[];
  addedLines: number;
  deletedLines: number;
  summary: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'nord' | 'warm' | 'monochrome';
  fontSize: number;
  wordWrap: 'off' | 'on';
  minimap: boolean;
  formatOnSave: boolean;
  defaultShell: 'powershell' | 'cmd' | 'bash';
  enableLsp: boolean;
  accentColor?: string;
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: any;
}

export interface WorkspaceState {
  lastWorkspace: string;
  openTabs: string[];
  activeTab: string;
  isSplit?: boolean;
  splitTabPath?: string;
  explorerWidth: number;
  terminalWidth: number;
  explorerVisible: boolean;
  terminalVisible: boolean;
}

export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  exited: boolean;
  exitCode: number;
}

export interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  category?: string;
  action: () => void;
}
