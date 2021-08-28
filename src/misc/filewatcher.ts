import * as vscode from 'vscode';


/**
 * This class handles file changes.
 * Some entity can register for a certain file glob and is informed on any change of the file.
 * I.e. observed changes are:
 * - onDidCreate (file)
 * - onDidChange (file)
 * - onDidDelete (file)
 *
 * Usage:
 * ~~~
 * const fw = new FileWatcher();
 * fw.start('*.js', (filePath: string, deleted: boolean) => {
 *    ...
 * });
 * ...
 * fw.dispose();  // Free the file watchers.
 * ~~~
 */
export class FileWatcher extends vscode.Disposable {

	// Pointer to the watcher. Required only for disposable.
	protected watchers: vscode.FileSystemWatcher[];


	/**
	 * Constructor.
	 * Dispose if not required any more.
	 */
	constructor() {
		super(() => {
			this.watchers.forEach(watcher => watcher.dispose())
		});
	}


	/**
	 * Starts watching.
	 * @param filePattern E.g .'**​/*.ut.js'
	 * @param fileChanged A function that is called when a file is created, changed or deleted.
	 */
	public start(filePattern: string, fileChanged: (filePath: string, deleted: boolean) => void) {
		// Handle the case of no open folders
		if (!vscode.workspace.workspaceFolders) {
			const emptyArray: vscode.FileSystemWatcher[] = [];
			return new Promise<vscode.FileSystemWatcher[]>(resolve => emptyArray);
		}


		return Promise.all(
			// Loop over all workspace folders (in case of multiroot)
			vscode.workspace.workspaceFolders?.map(async workspaceFolder => {
				const pattern = new vscode.RelativePattern(workspaceFolder, filePattern);
				const watcher = vscode.workspace.createFileSystemWatcher(pattern);

				// When files are created
				watcher.onDidCreate(uri => fileChanged(uri.fsPath, false));

				// When files do change
				watcher.onDidChange(uri => fileChanged(uri.fsPath, false));

				// When files are deleted
				watcher.onDidDelete(uri => fileChanged(uri.fsPath, true));// TODO: Need to test that on each new creation of sld file a delete occurs beforehand. Otherwise the detection of deleted test cases becomes more difficult.

				// Now initially scan all files
				for (const uri of await vscode.workspace.findFiles(pattern)) {
					fileChanged(uri.fsPath, false);
				}

				this.watchers.push(watcher);
				return watcher;
			})
		);
	}
}
