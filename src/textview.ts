
//import * as assert from 'assert';
import * as util from 'util';
import { EventEmitter } from 'events';
import { BaseView } from './baseview';

//import { Utility } from './utility';


/**
 * A Webview that just shows some static text.
 * Is e.g. used to run an Emulator command and display it's output.
 */
export class TextView extends BaseView {

	/**
	 * Creates the text view.
	 * @param parent The parent which may send 'update' notifications.
	 * @param title The title to use for this view.
	 * @param text The static text to show.
	 */
	constructor(parent: EventEmitter, title: string, text: string) {
		super(parent);
		// Title
		this.vscodePanel.title = title;
		// Use the text
		this.setHtml(text);
	}



	/**
	 * Sets the html code to display the text.
	 * @param text Text to display.
	 */
	protected setHtml(text: string) {
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

