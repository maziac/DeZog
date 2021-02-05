import * as vscode from 'vscode';


/**
 * Reads the package.json of the extension.
 */
export class PackageInfo {

	// The extension info is stored here after setting the extensionPath.
	public static extension: vscode.Extension<any>;


	/**
	 * Sets the extension path.
	 * Called on extension activation.
	 */
	public static Init(context: vscode.ExtensionContext) {
		// Store path
		//this.extensionPath = path;
		// Get package info from globalState
		const _extension = context.globalState["_extension"]
		const extensionName = _extension.id;
		// Store extension info
		this.extension = vscode.extensions.getExtension(extensionName)!;
	}

}

