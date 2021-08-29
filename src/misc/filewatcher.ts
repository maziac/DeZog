import * as vscode from 'vscode';
import {existsSync} from 'fs';


/**
 * This class handles file changes.
 * Some entity can register for a certain file and is informed on any change of the file.
 * I.e. observed changes are:
 * - onDidCreate (file)
 * - onDidChange (file)
 * - onDidDelete (file)
 *
 * Usage:
 * ~~~
 * const fw = new FileWatcher();
 * fw.start('/.../launch.json', (filePath: string, deleted: boolean) => {
 *    ...
 * });
 * ...
 * fw.dispose();  // Free the file watchers.
 * ~~~
 */
export class FileWatcher extends vscode.Disposable {

	// Pointer to the watcher. Required only for disposable.
	protected watcher: vscode.FileSystemWatcher;


	/**
	 * Constructor.
	 * Dispose if not required any more.
	 */
	constructor() {
		super(() => {
			this.watcher.dispose();
		});
	}


	/**
	 * Starts watching.
	 * @param fileName Absolute filename, e.g. '/.../launch.json'
	 * @param fileChanged A function that is called when a file is created, changed or deleted.
	 */
	public start(fileName: string, fileChanged: (filePath: string, deleted: boolean) => void) {
		this.watcher = vscode.workspace.createFileSystemWatcher(fileName);

			// When files are created
		this.watcher.onDidCreate(uri => fileChanged(uri.fsPath, false));

			// When files do change
		this.watcher.onDidChange(uri => fileChanged(uri.fsPath, false));

			// When files are deleted
		this.watcher.onDidDelete(uri => fileChanged(uri.fsPath, true));// TODO: Need to test that on each new creation of sld file a delete occurs beforehand. Otherwise the detection of deleted test cases becomes more difficult.

		// Check if file exists and call the fileChanged function initially
		if (existsSync(fileName))
			fileChanged(fileName, false);
	}
}
