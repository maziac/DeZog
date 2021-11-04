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

	// USed for renaming, to track if file exists or not.
	protected fileExists: boolean;

	// Stores the function for creation or deletion.
	protected funcCreate: (fileName: string) => void;


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
		// Install the file watcher
		this.filePath = filePath;
		this.watcher = vscode.workspace.createFileSystemWatcher(this.filePath);
		//FileWatcher.filePaths.push(filePath);
		// Check if file already exists
		this.fileExists = existsSync(this.filePath);
	}


	/**
	 * When files are created this function is called.
	 * And as well if the file exists at this moment.
	 */
	public onDidCreate(func) {
		this.funcCreate = func;
		this.watcher.onDidCreate(uri => {
			this.fileExists = true;
			func(this.filePath)
		});
		// Check, to call initially
		if (this.fileExists)
			func(this.filePath);
	}


	/**
	 * Calls 'func' on a change.
	 * Unfortunately this is also called on a filename change.
	 * Although it is better to handle this as a create.
	 * Therefore it is tracked if the file exists or not.
	 */
	public onDidChange(func) {
		this.watcher.onDidChange(uri => {
			// Check if filename has changed.
			// I.e. filename was different and is now the filename we are looking for.
			if (this.fileExists) {
				// Treat as a normal file change.
				func(this.filePath)
			}
			else {
				// Treat as a file create
				this.fileExists = true;
				this.funcCreate(this.filePath);
			}
		});
	}


	/**
	 * This is called on file deletion.
	 * It is also called if the file is renamed.
	 */
	public onDidDelete(func) {
		this.watcher.onDidDelete(uri => {
			this.fileExists = false;
			func(this.filePath);
		});
	}
}
