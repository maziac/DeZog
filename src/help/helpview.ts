import {readFileSync} from 'fs';
import { BaseView } from '../views/baseview';
import * as vscode from 'vscode';
import {Utility} from '../misc/utility';
import * as showdown from 'showdown';
import {UnifiedPath} from '../misc/unifiedpath';


/**
 * A Webview that just shows some static text.
 * Is e.g. used to run an Emulator command and display it's output.
 */
export class HelpView extends BaseView {

	/**
	 * Creates the text view.
	 * @param title The title to use for this view.
	 * @param mdText The static text to show.
	 */
	constructor(title: string, mdText: string) {
		super();
		// Title
		Utility.assert(this.vscodePanel);
		(this.vscodePanel as vscode.WebviewPanel).title = title;
		// Load usage file
		const extFolder = Utility.getExtensionPath();
		const usageFileName = 'documentation/Usage.md';
		const path = UnifiedPath.join(extFolder, usageFileName);
		mdText = readFileSync(path).toString();
		// Use the text
		this.setMarkdown(mdText);
	}


	/**
	 * Sets the html code to display the text.
	 * @param mdText Markdown text to display.
	 */
	protected setMarkdown(mdText: string) {
		const extPath = Utility.getExtensionPath();
		const resourcePath = vscode.Uri.file(UnifiedPath.join(extPath, 'documentation'));
		const vscodeResPath = this.vscodePanel.webview.asWebviewUri(resourcePath);
		// Convert md -> html
		//const defaultOptions = showdown.getDefaultOptions();
		const converter = new showdown.Converter();
		//converter.setOption('completeHTMLDocument', 'true');
		converter.setOption('simpleLineBreaks', 'true');
		converter.setOption('simplifiedAutoLink', 'true');
		converter.setOption('tables', 'true');	// TODO: geht nicht
		//converter.setOption('tablesHeaderId', 'true');
		const html = converter.makeHtml(mdText);
		const mainHtml=`
<!DOCTYPE HTML>
<html>
<head>
	<meta charset="utf-8" >
	<title>This is an example for the < base > element </title>
	<base href="${vscodeResPath}/">
</head>
	<body>
	<img src="images/debug_console_tstates.jpg">
	<img src="file:///Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/documentation/images/memoryviewer2b.jpg">

${html}

	</body>
	<script src="showdown.js"> </script>
	<script src="showdown-toc.js"> </script>
</html>
`;

		// Add html body
		this.vscodePanel.webview.html = mainHtml;
	}

}

