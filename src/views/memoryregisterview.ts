//import * as vscode from 'vscode';
import { Remote  } from '../remotes/remotefactory';
import { MemoryDumpView } from './memorydumpview';



/**
 * A Webview that shows the memory dump for certain registers.
 * I.e. it looks at the registers value and chooses a matching memory
 * range to display.
 */
export class MemoryRegisterView extends MemoryDumpView {

	/// The registers to take into account.
	protected registers = new Array<string>();


	/**
	 * Creates the basic panel.
	 */
	/*
	constructor(parent: EventEmitter) {
		super(parent);
	}
	*/


	/**
	 * Creates the webview for communication.
	 * Needs to be called after construction.
	 */
	public async asyncInit(): Promise<void> {
		super.setupWebView();	// Remove if stuff below is activated.
		/*
		TODO: Memory Register View in sidebar.
		This works (if this is defined in package.json:
		"views": {
			"debug": [
				{
					"type": "webview",
					"id": "dezog.memoryregisterview",
					"name": "Memory Dump @HL"
				}
			]
		}
		)
		However no scripts are allowed (enableScripts: true)
		So it's not possible to change any memory values.
		So I disabled for now.
		Let's see what happens to this bug report:
		https://github.com/microsoft/vscode/issues/109398

		const self=this;
		return new Promise<void>(resolve => {
			class wvp implements vscode.WebviewViewProvider {
				protected memRegView: MemoryRegisterView;
				resolveWebviewView(webviewView: vscode.Webview View, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Thenable<void>|void {
					// Use passed webview
					self.vscodeWebview=webviewView.webview;
					let es=webviewView.webview.options.enableScripts;
					es;
					// Handle messages from the webview
					self.vscodeWebview.onDidReceiveMessage(message => {
						//console.log("webView command '"+message.command+"':", message);
						self.webViewMessageReceived(message);
					});
					// Return
					resolve();
				}
			};
			const provider=new wvp();
			//const wvopts: vscode.WebviewOptions={enableScripts: true};
			vscode.window.registerWebviewViewProvider('dezog.memoryregisterview', provider);
		});
		*/
	}


	/**
	 * Is empty to bypass normal setup ov panel view.
	 * Use explicit call to asyncInit instead.
	 */
	protected setupWebView() {
	}


	/**
	 * Select the registers to display the memory contents.
	 */
	public addRegisters(addRegs: Array<string>) {
		this.registers.push(...addRegs);
	}


	/**
	 * Do not show dots between the memory blocks.
	 */
	protected getHtmlVertBreak() {
		return '\n';
	}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason Not used.	 */
	public async update(reason?: any): Promise<void> {
		if (!this.vscodeWebview)
			return;

		// Get register values
		await Remote.getRegisters();
		// Recalculate the memory addresses
		this.memDump.clearBlocks();
		if (this.vscodePanel)
			this.vscodePanel.title='';
		for (let reg of this.registers) {
			// get register value
			const value=Remote.getRegisterValue(reg);
			// add memory block
			this.addBlock(value, 1, '@'+reg);
		}

		// update
		await super.update(reason);
	}

}
