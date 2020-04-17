
import * as util from 'util';
import { BaseView } from './baseview';
import {WebviewPanel} from 'vscode';
import {Utility} from '../misc/utility';

//import { Utility } from './utility';


/**
 * A Webview that just shows some static text.
 * Is e.g. used to run an Emulator command and display it's output.
 */
export class TextView extends BaseView {

	/**
	 * Creates the text view.
	 * @param title The title to use for this view.
	 * @param text The static text to show.
	 */
	constructor(title: string, text: string) {
		super();
		// Title
		Utility.assert(this.vscodePanel);
		(this.vscodePanel as WebviewPanel).title = title;
		// Use the text
		this.setHtml(text);
	}



	/**
	 * Sets the html code to display the text.
	 * @param text Text to display.
	 */
	protected setHtml(text: string) {
		if (!this.vscodePanel)
			return;

		const format = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Dump</title>
		</head>

		<body style="font-family: Courier">

		<div style="word-wrap:break-word">

%s

		</div>

		</body>

		</html>`;

		// Exchange each newline into <br>
		const brText = text.replace(/\n/g, '<br>');
		// Add html body
		const html = util.format(format, brText);
		this.vscodePanel.webview.html = html;
	}

}

