import * as vscode from 'vscode';
import {existsSync} from 'fs';
//import {Utility} from './utility';


/**
 * This class handles file changes.
 * Some entity can register for a certain file and is informed on any change of the file.
 * I.e. observed changes are:
 * - onDidCreate (file)
 * - onDidChange (file)
 * - onDidDelete (file)
 * When not needed anymore you need to call 'dispose()' on the file viewer to free it.
 * Compared to the vscode.FileSystemWatcher the FileWatcher class should be used on exact file names only.
 * Not on glob patterns.
 */
export class FileWatcher extends vscode.Disposable {

	// Pointer to the watcher. Required only for disposable.
	protected watcher: vscode.FileSystemWatcher;

	/// Remembers the file path (just for onDidCreate)
	protected filePath: string;

	// For debugging: check which file watchers are present.
	//protected static filePaths: string[] = [];	// Could also be removed after debugging


	/**
	 * Constructor.
	 * Dispose if not required any more.
	 */
	constructor(filePath: string) {
		super(() => {
			this.watcher.dispose();
			// Remove filepath on dispose
			/*
			for (let k = FileWatcher.filePaths.length - 1; k >= 0; k--) {
				if (FileWatcher.filePaths[k] == this.filePath) {
					// Remove
					FileWatcher.filePaths.splice(k, 1);
					return;
				}
			}
			Utility.assert(false, "Not found: " + this.filePath);
			*/
		});
		this.watcher = vscode.workspace.createFileSystemWatcher(filePath);
		this.filePath = filePath;
		//FileWatcher.filePaths.push(filePath);
	}


	/**
	 * When files are created this function is called.
	 * And as well if the file exists at this moment.
	 */
	public onDidCreate(func) {
		this.watcher.onDidCreate((fname) => {
			func(this.filePath)
		});

		// Check, to call initially
		if (existsSync(this.filePath))
			func(this.filePath);
	}


	/**
	 * Just route.
	 */
	public onDidChange(func) {
		this.watcher.onDidChange((fname) => {
			func(this.filePath)
		});
	}


	/**
	 * Just route.
	 */
	public onDidDelete(func) {
		this.watcher.onDidDelete((fname) => {
			func(this.filePath)
		});
	}
}
