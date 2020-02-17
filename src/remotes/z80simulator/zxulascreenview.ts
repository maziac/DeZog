//import * as assert from 'assert';
import * as vscode from 'vscode';
import {EventEmitter} from 'events';
//import {Utility} from '../../utility';
import {ZxMemory} from './zxmemory';
import {BaseView} from '../../views/baseview';


/**
 * A Webview that shows the simulated ZX Spectrum screen.
 */
export class ZxSimulationView extends BaseView {

	// Holds the gif image a string.
	protected screenGifString;

	/// The panel to show the base view in vscode.
	protected vscodePanel: vscode.WebviewPanel;

	/// We listen for 'update' on this emitter to update the html.
	protected parent: EventEmitter;

	// A pointer to the memory which holds the screen.
	protected zxMemory: ZxMemory;


	/**
	 * Creates the basic view.
	 * @param memory The memory of the CPU.
	 */
	constructor(memory: ZxMemory) {
		super(false);
		// Init
		this.zxMemory=memory;

		// create vscode panel view
		this.vscodePanel=vscode.window.createWebviewPanel('', '', {preserveFocus: true, viewColumn: vscode.ViewColumn.Nine}, {enableScripts: true});
		this.vscodePanel.title='Z80/ZX Spectrum Simulator';
		// Handle closing of the view
		this.vscodePanel.onDidDispose(() => {
			// Call overwritable function
			this.disposeView();
		});

		// Handle messages from the webview
		this.vscodePanel.webview.onDidReceiveMessage(message => {
			console.log("webView command '"+message.command+"':", message);
			this.webViewMessageReceived(message);
		});


		// Initial html page.
		this.setHtml();
	}


	/**
	 * Closes the view.
	 */
	public close() {
		this.vscodePanel.dispose();
	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		// Can be overwritten
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 * This needs to be created inside the web view.
	 */
	protected webViewMessageReceived(message: any) {
		switch (message.command) {
		}
	}


	/**
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public update() {
		try {
			// Create gif
			const gif=this.zxMemory.getUlaScreen();
			const buf=Buffer.from(gif);
			const screenGifString='data:image/gif;base64,'+buf.toString('base64');
			// Create message
			const message={
				command: 'updateScreen',
				value: screenGifString
			};
			this.sendMessageToWebView(message);
		}
		catch {}
	}


	/**
	 * Sets the html code to display the memory dump.
	 */
	protected setHtml() {
		const keyboard='';

		const html=`<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Dump</title>
		</head>

		<script>
		const vscode = acquireVsCodeApi();

		//---- Handle Messages from vscode extension --------
		window.addEventListener('message', event => {
			const message = event.data;

            switch (message.command) {
				case 'updateScreen':
				{
					screenString = message.value;
					document.getElementById("screen_img_id").src=screenString;
				}   break;
           }
        });

		</script>

		<body style="font-family: Courier">

		<!-- Display the screen gif -->
		<img id="screen_img_id" width="100%"">

		${keyboard}

		</body>
		</html>`;

		this.vscodePanel.webview.html=html;
	}
}
