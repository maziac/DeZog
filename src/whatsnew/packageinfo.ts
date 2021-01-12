import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import {readFileSync} from 'fs';


/**
 * Reads the package.json of the extension.
 */
export class PackageInfo {

	// The extensions path is stored here.
	public static extensionPath: string;

	// The publisher name (maziac) is stored here after setting the extensionPath.
	public static publisher: string;

	// The extension name (without publisher) is stored here after setting the extensionPath.
	public static extensionBaseName: string;

	// The extension name (plus publisher) is stored here after setting the extensionPath.
	public static extensionName: string;

	// The extension info is stored here after setting the extensionPath.
	public static extension: vscode.Extension<any>;


	/**
	 * Sets the extension path.
	 * Called on extension activation.
	 */
	public static setExtensionPath(path: string) {
		// Store path
		this.extensionPath = path;
		// Unfortunately there seems no other way than reading the package.json manually to get the extension name.
		const pkgJsonFile = "/package.json";
		const pkgJsonPath = this.extensionPath + pkgJsonFile;
		const pkgJsonData = readFileSync(pkgJsonPath, 'utf8');
		const parseErrors: jsonc.ParseError[] = [];
		const pkgJson = jsonc.parse(pkgJsonData, parseErrors, {allowTrailingComma: true});
		this.publisher = pkgJson.publisher;
		this.extensionName = pkgJson.publisher + '.' + pkgJson.name;
		this.extensionBaseName = pkgJson.name;
		// Store extension info
		this.extension = vscode.extensions.getExtension(this.extensionName)!;
	}

}

