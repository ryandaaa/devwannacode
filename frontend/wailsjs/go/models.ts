export namespace filesystem {
	
	export class FileNode {
	    name: string;
	    path: string;
	    relPath: string;
	    isDir: boolean;
	    size: number;
	    modTime: string;
	    extension: string;
	    matchContext?: string;
	    children?: FileNode[];
	
	    static createFrom(source: any = {}) {
	        return new FileNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.relPath = source["relPath"];
	        this.isDir = source["isDir"];
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	        this.extension = source["extension"];
	        this.matchContext = source["matchContext"];
	        this.children = this.convertValues(source["children"], FileNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TextSearchResult {
	    path: string;
	    relPath: string;
	    fileName: string;
	    lineNumber: number;
	    lineContent: string;
	
	    static createFrom(source: any = {}) {
	        return new TextSearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.relPath = source["relPath"];
	        this.fileName = source["fileName"];
	        this.lineNumber = source["lineNumber"];
	        this.lineContent = source["lineContent"];
	    }
	}

}

export namespace git {
	
	export class FileChange {
	    path: string;
	    status: string;
	    staged: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.status = source["status"];
	        this.staged = source["staged"];
	    }
	}
	export class Status {
	    isRepo: boolean;
	    branch: string;
	    ahead: number;
	    behind: number;
	    files: FileChange[];
	    addedLines: number;
	    deletedLines: number;
	    summary: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isRepo = source["isRepo"];
	        this.branch = source["branch"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.files = this.convertValues(source["files"], FileChange);
	        this.addedLines = source["addedLines"];
	        this.deletedLines = source["deletedLines"];
	        this.summary = source["summary"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace settings {
	
	export class RecentProject {
	    path: string;
	    name: string;
	    lastOpened: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.lastOpened = source["lastOpened"];
	    }
	}
	export class Settings {
	    theme: string;
	    fontSize: number;
	    wordWrap: string;
	    minimap: boolean;
	    formatOnSave: boolean;
	    defaultShell: string;
	    enableLsp: boolean;
	    accentColor?: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.fontSize = source["fontSize"];
	        this.wordWrap = source["wordWrap"];
	        this.minimap = source["minimap"];
	        this.formatOnSave = source["formatOnSave"];
	        this.defaultShell = source["defaultShell"];
	        this.enableLsp = source["enableLsp"];
	        this.accentColor = source["accentColor"];
	    }
	}
	export class WorkspaceState {
	    lastWorkspace: string;
	    openTabs: string[];
	    activeTab: string;
	    isSplit: boolean;
	    splitTabPath: string;
	    explorerWidth: number;
	    terminalWidth: number;
	    explorerVisible: boolean;
	    terminalVisible: boolean;
	    windowWidth: number;
	    windowHeight: number;
	    windowX: number;
	    windowY: number;
	    isMaximized: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lastWorkspace = source["lastWorkspace"];
	        this.openTabs = source["openTabs"];
	        this.activeTab = source["activeTab"];
	        this.isSplit = source["isSplit"];
	        this.splitTabPath = source["splitTabPath"];
	        this.explorerWidth = source["explorerWidth"];
	        this.terminalWidth = source["terminalWidth"];
	        this.explorerVisible = source["explorerVisible"];
	        this.terminalVisible = source["terminalVisible"];
	        this.windowWidth = source["windowWidth"];
	        this.windowHeight = source["windowHeight"];
	        this.windowX = source["windowX"];
	        this.windowY = source["windowY"];
	        this.isMaximized = source["isMaximized"];
	    }
	}

}

export namespace terminal {
	
	export class SessionInfo {
	    id: string;
	    title: string;
	    cwd: string;
	    shell: string;
	    exited: boolean;
	    exitCode: number;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.cwd = source["cwd"];
	        this.shell = source["shell"];
	        this.exited = source["exited"];
	        this.exitCode = source["exitCode"];
	    }
	}

}

