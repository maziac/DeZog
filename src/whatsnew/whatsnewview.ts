import * as vscode from 'vscode';
import * as path from 'path';
import {readFileSync} from 'fs';
import {PackageInfo} from './packageinfo';
import {Version} from './version';
import {GlobalStorage} from '../globalstorage';


export class WhatsNewView {
	/// A panel (containing the webview).
	protected vscodePanel: vscode.WebviewPanel;


	/**
	 * Updates the version number.
	 * @param context The extension context.
	 * @return true if version was updated. false if version major/minor are equal.
	 * Also false if this is the first install, i.e. if there is no previous version.
	 */
	public static updateVersion(context: vscode.ExtensionContext): boolean {
		// Load data from extension storage
		const versionId = 'version';
		const previousVersion = GlobalStorage.Get<string>(versionId)!;
		const currentVersion = PackageInfo.extension.packageJSON.version;

		// Update version: "major", "minor"
		if (currentVersion !== previousVersion)
			GlobalStorage.Set(versionId, currentVersion);

		// Is there any previous version?
		if (!previousVersion)
			return false;

		// Compare
		const isNewer = Version.isNewVersion(currentVersion, previousVersion);
		return isNewer;
	}


	/**
	 * Creates the text view.
	 * @param title The title to use for this view.
	 * @param text The static text to show.
	 */
	constructor() {
		// Create vscode panel view
		this.vscodePanel = vscode.window.createWebviewPanel('', '', {preserveFocus: true, viewColumn: vscode.ViewColumn.Nine});

		// Title
		this.vscodePanel.title = "Whats New";

		// Init html
		this.setHtml();
	}


	/**
	 * Returns the html code to display the whats web html.
	 */
	public setHtml() {
		if (!this.vscodePanel.webview)
			return;
		// Add the html styles etc.
		const extPath = PackageInfo.extension.extensionPath;
		const mainHtmlFile = path.join(extPath, 'html/whatsnew.html');
		let html = readFileSync(mainHtmlFile).toString();

		// Exchange local path
		const resourcePath = vscode.Uri.file(extPath);
		const vscodeResPath = this.vscodePanel.webview.asWebviewUri(resourcePath).toString();
		html = html.replace('${vscodeResPath}', vscodeResPath);

		// Exchange extension name
		html = html.replace(/\${extensionName}/g, PackageInfo.extension.packageJSON.id);

		// Exchange extension version
		const versArray = PackageInfo.extension.packageJSON.version.split('.');
		let mainVersion = versArray.shift() || '';
		const vPart2 = versArray.shift();
		if (vPart2)
			mainVersion += '.' + vPart2;
		html = html.replace(/\${extensionMainVersion}/g, mainVersion);

		// Exchange display name
		html = html.replace(/\${extensionDisplayName}/g, PackageInfo.extension.packageJSON.displayName);

		// Exchange repository
		html = html.replace(/\${repositoryUrl}/g, PackageInfo.extension.packageJSON.repository.url);

		// Exchange repository
		html = html.replace(/\${repositoryIssues}/g, PackageInfo.extension.packageJSON.bugs.url);

		// Exchange repository
		html = html.replace(/\${repositoryHomepage}/g, PackageInfo.extension.packageJSON.repository.url);

		// Exchange changelog
		const changeLogFile = path.join(extPath, 'html/whatsnew_changelog.html');
		const changeLogHtml = readFileSync(changeLogFile).toString();
		html = html.replace('${changeLog}', changeLogHtml);

		// Set content
		this.vscodePanel.webview.html = html;
	}



}
