/*---------------------------------------------------------------------------------------------
*  Copyright (c) Alessandro Fragnani. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import path=require("path");
import * as semver from "semver";
import * as vscode from "vscode";
//import {ContentProvider} from "./ContentProvider";
import {WhatsNewPageBuilder} from "../3rdparty/vscode-whats-new/src/PageBuilder";
import {WhatsNewManager} from "../3rdparty/vscode-whats-new/src/Manager";

export class DezogWhatsNewMgr extends WhatsNewManager {

	public checkIfVersionDiffers(): boolean {
		// load data from extension manifest
		this.extension=vscode.extensions.getExtension(`maziac.${this.extensionName}`)!;

		const previousExtensionVersion=this.context.globalState.get<string>(`${this.extensionName}.version`)!;
		const currentVersion=this.extension.packageJSON.version;
		if (previousExtensionVersion) {
			const differs: semver.ReleaseType|null=semver.diff(currentVersion, previousExtensionVersion);

			// only "patch" should be suppressed
			if (!differs||differs==="patch") {
				return false;
			}
		}

		// Update version: "major", "minor"
		this.context.globalState.update(`${this.extensionName}.version`, currentVersion);

		// Versions differ
		return true;
	}


	public showPage() {

		// Create and show panel
		const panel=vscode.window.createWebviewPanel(`${this.extensionName}.whatsNew`,
			`What's New in ${this.extension.packageJSON.displayName}`, vscode.ViewColumn.One, {enableScripts: true});

		// Get path to resource on disk
		const onDiskPath=vscode.Uri.file(
			path.join(this.context.extensionPath, "whatsnew", "whats-new.html"));
		const pageUri=onDiskPath.with({scheme: "vscode-resource"});

		// Local path to main script run in the webview
		const cssPathOnDisk=vscode.Uri.file(
			path.join(this.context.extensionPath, "whatsnew", "main.css"));
		const cssUri=cssPathOnDisk.with({scheme: "vscode-resource"});

		// Local path to main script run in the webview
		const logoPathOnDisk=vscode.Uri.file(
			path.join(this.context.extensionPath, "images", "dezog-icon.png"));
		const logoUri=logoPathOnDisk.with({scheme: "vscode-resource"});

		panel.webview.html=this.getWebviewContentLocal(pageUri.fsPath, cssUri.toString(), logoUri.toString());
	}


	protected getWebviewContentLocal(htmlFile: string, cssUrl: string, logoUrl: string): string {
		return WhatsNewPageBuilder.newBuilder(htmlFile)
			.updateExtensionDisplayName(this.extension.packageJSON.displayName)
			.updateExtensionName(this.extensionName)
			.updateExtensionVersion(this.extension.packageJSON.version)
			.updateRepositoryUrl(this.extension.packageJSON.repository.url)
			.updateRepositoryIssues(this.extension.packageJSON.bugs.url)
			.updateRepositoryHomepage(this.extension.packageJSON.repository.url)
			.updateCSS(cssUrl)
			.updateHeader(this.contentProvider.provideHeader(logoUrl))
			.updateChangeLog(this.contentProvider.provideChangeLog())
			.updateSponsors(this.contentProvider.provideSponsors())
			.build();
	}
}