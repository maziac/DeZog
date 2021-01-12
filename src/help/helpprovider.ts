import * as vscode from 'vscode';
import * as path from 'path';
import {readFileSync} from 'fs';
import {PackageInfo} from '../whatsnew/packageinfo';
import {HelpView} from './helpview';
//import {UnifiedPath} from '../misc/unifiedpath';


export class HelpProvider implements vscode.WebviewViewProvider {
	// The webview is stored here.
	protected webview: vscode.Webview;

	// A pointer to the help contents.
	protected helpView: HelpView;


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
				case 'linkClicked':
					// Strip chapter from link
					const link = message.data;
					const index = link.lastIndexOf('#');
					if (index >= 0) {
						const chapter = link.substr(index);
						// E.g. "#support"
						this.navigateToChapter(chapter);
					}
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

/* Donate button. */
button {
  background-color: yellow;
  color: black;
}

</style>

<body>

<!--\${donate}-->

${toc}

</body>
<script>

const vscode = acquireVsCodeApi();


/*
 * A link to a chapter has been clicked.
 */
function linkClicked() {
	vscode.postMessage({command: 'linkClicked', data: this.href});
    return false;
}


/*
 * Avoid tooltip on hover by removing all titles.
 * And add function call to each click.
 */
function initAnchors() {
	const links = document.getElementsByTagName('a');
	for (var i = 0; i < links.length; i++) {
		// Remove tooltip
		links[i].title = '';
		// Add function call
		links[i].onclick = linkClicked;
	}
}


/**
 * Copies the complete html of the document to the clipboard.
 */
function copyHtmlToClipboard() {
	const copyText = document.documentElement.innerHTML;
	navigator.clipboard.writeText(copyText);
}


// Init all anchors.
initAnchors();

</script>
</html>
`;

		// Get donated state
		const configuration = vscode.workspace.getConfiguration('dezog');
		const donated = configuration.get<boolean>('donated');
		// Set button
		if (!donated) {
			mainHtml = mainHtml.replace('<!--${donate}-->', `
		<button class="button-donate" style="float:right" onclick="
	vscode.postMessage({command: 'donateClicked'})">Donate...</button>`);
		}

		// Add a Reload and Copy button for debugging
		//mainHtml = mainHtml.replace('<body>', '<body><button onclick="initAnchors()">Init</button><button onclick="copyHtmlToClipboard()">Copy HTML to clipboard</button>');

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


	/**
	 * Creates a help view window with contents
	 * and makes it visible.
	 */
	public createHelpView() {
		if (!this.helpView)
			this.helpView = new HelpView();
		// Make sure the view is visible
		this.helpView.reveal();
	}


	/**
	 * User has clicked on a link.
	 * The help view is opened and it is jumped to the chapter.
	 */
	protected navigateToChapter(chapter: string) {
		// Create a new help view if it does not exist yet.
		this.createHelpView();
		// Jump to chapter
		this.helpView.navigateToChapter(chapter);
	}
}
