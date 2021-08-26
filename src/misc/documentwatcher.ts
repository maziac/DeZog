import * as vscode from 'vscode';
import * as minimatch from 'minimatch';


/**
 * This class handles document and file changes.
 * Some entity can register for a certain file glob and is informed on any change of either the file or the opened document.
 * I.e. observed changes are:
 * - onDidOpenTextDocument
 * - onDidChangeTextDocument
 * - onDidCreate (file)
 * - onDidChange (file)
 * - onDidDelete (file)
*/
export class DocumentWatcher extends vscode.Disposable {

	// The pattern to search for.
	protected filePattern: string;

	// Pointer to the watcher. Required only for disposable.
	protected watchers: vscode.FileSystemWatcher[];


	/**
	 * Constructor.
	 * Dispose if not required any more.
	 * @param filePattern E.g .'**​/*.ut.js'
	 */
	constructor(filePattern: string) {
		super(this.watchers.map(watcher => watcher.dispose()));
		this.filePattern = filePattern;
		this.disp
	}


	/**
	 * Starts watching.
	 * @param watchDocuments And watch for documents if true
	 */
	public start(watchDocuments = true) {
		// Handle the case of no open folders
		if (!vscode.workspace.workspaceFolders) {
			const emptyArray: vscode.FileSystemWatcher[] = [];
			return new Promise<vscode.FileSystemWatcher[]>(resolve => emptyArray);
		}

		// Loop over all workspace folders (in case of multiroot)
		vscode.workspace.workspaceFolders?.map(async workspaceFolder => {
			const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.ut.js');
			watcher = vscode.workspace.createFileSystemWatcher(pattern);

			// When files are created
			watcher.onDidCreate(uri => this.fileChanged(uri));

			// When files do change
			watcher.onDidChange(uri => this.fileChanged(uri));

			// When files are deleted
			watcher.onDidDelete(uri => this.fileDeleted(uri));

			// Text documents
			if (watchDocuments) {
				// When text documents are opened
				vscode.workspace.onDidOpenTextDocument(doc => this.docChanged(doc));

				// When text documents are changed
				vscode.workspace.onDidChangeTextDocument(event => this.docChanged(event.document));
			}

			// Now initially scan all files
			for (const uri of await vscode.workspace.findFiles(pattern)) {
				this.fileChanged(uri);
			}

			this.watchers.push(watcher);
			return watcher;
		});
	}


	/**
	 * File has changed, read it.
	 * @param uri The file uri.
	 */
	protected async fileChanged(uri: vscode.Uri) {
		// Read file
		const rawContent = await vscode.workspace.fs.readFile(uri);
		const contents = new TextDecoder().decode(rawContent);
		// Handle text changes
		this.notify(uri, contents);
	}


	/**
	 * File was deleted.
	 * @param uri The file uri.
	 */
	protected async fileDeleted(uri: vscode.Uri) {
		// Empty contents
		this.notify(uri, '');
	}


	/**
	 * A TextDocument has changed.
	 * @param doc The Textdocument.
	 */
	protected docChanged(doc: vscode.TextDocument) {
		// Ignore files with wrong pattern
		if (doc.uri.scheme !== 'file')
			return;
		if (!minimatch(doc.uri.path, this.filePattern))
			return;
		// Right file changed, notify
		this.notify(doc.uri, doc.getText());
	}


	/**
	 * Notify caller that a file or a document has changed.
	 * @param uri The file path.
	 * @param contents The string contents of the file.
	 */
	protected notify(uri: vscode.Uri, contents: string) {

	}

}
