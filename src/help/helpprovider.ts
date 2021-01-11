import * as vscode from 'vscode';
import * as path from 'path';
import {readFileSync} from 'fs';
import {PackageInfo} from '../whatsnew/packageinfo';
import {HelpView} from './helpview';


export class HelpProvider implements vscode.WebviewViewProvider {
	// The webview is stored here.
	protected webview: vscode.Webview;


	/**
	 * Called by vscode.
	 */
	resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
		// Store webview
		this.webview = webviewView.webview;

		// Allow scripts in the webview
		this.webview.options = {enableScripts: true};

		// Handle messages from the webview
		this.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'donateClicked':
					this.openDonateWebView();
					break;
			}
		});

		// Create html code
		this.setMainHtml();
	}


	/**
	 * Returns the html code to display the calculator.
	 */
	public setMainHtml() {
		if (!this.webview)
			return;

		// Get the TOC
		const toc = HelpView.getTocHtml();

		// Add html around
		let mainHtml = `
<!DOCTYPE HTML>
<html>
<head>
	<meta charset="utf-8" >
	<title>DeZog Help</title>
	<base href="\${vscodeResPath}/">
</head>

<style>

/* Normal text color for links and no underline. */
a {
	color: var(--vscode-editor-foreground);
	text-decoration: none;
}

a:hover {
	color: var(--vscode-editor-foreground);
    font-weight: bold;
}

.tooltip {
  display: none;
}

/* No bullets for list. */
ul {
	list-style: none;
    padding-left: 0.5em;
}
li > ul {
    padding-left: 1.5em;
}

</style>

<body>

<!--\${donate}-->

${toc}

</body>
<script>
/* Avoid tooltip on hover by removing all titles. */
var links = document.getElementsByTagName('a');
for(var i = 0; i < links.length; i++) {
    links[i].title = '';
}
</script>
</html>
`;

		// Get donated state
		const configuration = vscode.workspace.getConfiguration('dezog');
		const donated = configuration.get<boolean>('donated');
		// Set button
		if (!donated) {
			mainHtml = mainHtml.replace('<!--${donate}-->', `
		<button class="button-donate" style="float:right" onclick="donateClicked()">Donate...</button>`);
		}

		// Add a Reload and Copy button for debugging
		//mainHtml = mainHtml.replace('<body>', '<body><button onclick="parseStart()">Reload</button><button onclick="copyHtmlToClipboard()">Copy HTML to clipboard</button>');

		// Set content
		this.webview.html = mainHtml;
	}


	/**
	 * Opens a webview with donation information.
	 */
	protected openDonateWebView() {
		// Create vscode panel view
		const vscodePanel = vscode.window.createWebviewPanel('', '', {preserveFocus: true, viewColumn: vscode.ViewColumn.Nine});
		vscodePanel.title = 'Donate...';
		// Read the file
		const extPath = PackageInfo.extensionPath;
		const htmlFile = path.join(extPath, 'html/donate.html');
		let html = readFileSync(htmlFile).toString();
		// Exchange local path
		const resourcePath = vscode.Uri.file(extPath);
		const vscodeResPath = vscodePanel.webview.asWebviewUri(resourcePath).toString();
		html = html.replace('${vscodeResPath}', vscodeResPath);

		// Handle messages from the webview
		vscodePanel.webview.options = {enableScripts: true};
		vscodePanel.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'showExtension':
					// Switch to Extension Manager
					vscode.commands.executeCommand("workbench.extensions.search", PackageInfo.publisher)
					// And select the given extension
					const extensionName = PackageInfo.publisher + '.' + message.data;
					vscode.commands.executeCommand("extension.open", extensionName);
					break;
			}
		});

		// Set html
		vscodePanel.webview.html = html;
	}

}
