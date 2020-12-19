import {readFileSync} from 'fs';
import { BaseView } from '../views/baseview';
import * as vscode from 'vscode';
import {Utility} from '../misc/utility';
import {UnifiedPath} from '../misc/unifiedpath';
import * as showdown from 'showdown';


/**
 * A Webview that just shows some static text.
 * Is e.g. used to run an Emulator command and display it's output.
 */
export class HelpView extends BaseView {

	/**
	 * Creates the text view.
	 */
	constructor() {
		super(false);
		// Title
		Utility.assert(this.vscodePanel);
		(this.vscodePanel as vscode.WebviewPanel).title = "DeZog Help";
		// Load usage file
		const extFolder = Utility.getExtensionPath();
		const usageFileName = 'documentation/Usage.md';
		const path = UnifiedPath.join(extFolder, usageFileName);
		const mdText = readFileSync(path).toString();
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
		const converter = new showdown.Converter();
		//converter.setOption('completeHTMLDocument', 'true');
		converter.setOption('simpleLineBreaks', true);
		//converter.setOption('simplifiedAutoLink', true);
		//converter.setOption('noHeaderId', false);
		converter.setOption('ghCompatibleHeaderId', true);
		converter.setOption('tables', true);
		//converter.setOption('tablesHeaderId', 'true');
		const html2 = converter.makeHtml(mdText);

		// Create headings number (CSS is not used because the numbers should occur also in the TOC)
		const tocCounter = [0, 0, 0];
		const startLevel = 2;
		const html = html2.replace(/<h(\d)(.*?)>/g, (match, p1, p2) => {
			const level = parseInt(p1) - startLevel;
			// Check for unaffected levels
			if (level < 0 || level >= tocCounter.length)
				return match;
			// Increase counter
			tocCounter[level]++;
			// Rest counters below
			for (let i = level + 1; i < tocCounter.length; i++)
				tocCounter[i] = 0;
			// Create aggregated count
			let countString = '';
			for (let i = 0; i <= level; i++)
				countString += tocCounter[i].toString() + '.';
			return match + ' ' + countString + ' ';
		});

		// Add the html styles etc.
		const mainHtml=`
<!DOCTYPE HTML>
<html>
<head>
	<meta charset="utf-8" >
	<title>DeZog Help</title>
	<base href="${vscodeResPath}/">
</head>

<style>
table {
    border-collapse: collapse;
}
td, th {
    border: 1px solid;
}

th {
  background: var(--vscode-merge-incomingHeaderBackground);
}

#toc_main {
  position: fixed;
  right: 1em;
  top: 1em;
  padding: 0.5em;
  border-radius: 5px;
  box-shadow: 1px 1px 5px var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

#toc_main #toc_full { display: none; } /* Hide TOC initially */

#toc_main:hover #toc_full{
  display: block; /* Show it on hover */
}

</style>

<body>

<!-- Table of contents -->
<div id="toc_main">
	<div style="text-align:right">CONTENT</div>
	<div id="toc_full">
		<div id="toc_contents"></div>
	</div>
</div>

${html}

</body>
</html>
`;

		const posthtml = require('posthtml');
		const toc = require('posthtml-toc');

		posthtml()
			.use(toc({
				after: '#toc_contents',
				title: ' '
			}))
			.process(mainHtml/*, options */)
			.then(result => {
				this.vscodePanel.webview.html = result.html;;
			});
	}

}

