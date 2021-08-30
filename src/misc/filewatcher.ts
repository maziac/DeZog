import * as vscode from 'vscode';
import {existsSync} from 'fs';


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


	/**
	 * Constructor.
	 * Dispose if not required any more.
	 */
	constructor(filePath: string) {
		super(() => {
			this.watcher.dispose();
		});
		this.watcher = vscode.workspace.createFileSystemWatcher(filePath);
		this.filePath = filePath;
	}


	/**
	 * When files are created this function is called.
	 * And as well if the file exists at this moment.
	 */
	public onDidCreate(func) {
		this.watcher.onDidCreate(() => {
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
		this.watcher.onDidChange(() => {
			func(this.filePath)
		});
	}


	/**
	 * Just route.
	 */
	public onDidDelete(func) {
		this.watcher.onDidDelete(() => {
			func(this.filePath)
		});
	}
}
