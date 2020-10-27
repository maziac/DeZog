import * as vscode from 'vscode';
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
		//super.setupWebView();	// Remove if stuff below is activated.
		/*
		TODO: Memory Register View in sidebar.
		This works (if this is defined in package.json:
		"views": {
			"debug": [
				{
					"type": "webview",
					"id": "dezog.memoryregisterview",
					"name": "Memory Dump"
				}
			]
		}
		)
		*/

		const self=this;
		return new Promise<void>(resolve => {
			class wvp implements vscode.WebviewViewProvider {
				protected memRegView: MemoryRegisterView;
				resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Thenable<void>|void {
					// Use passed webview
					self.vscodeWebview=webviewView.webview;
					webviewView.webview.options={
						// Allow scripts in the webview
						enableScripts: true
					};
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
			vscode.window.registerWebviewViewProvider('dezog.memoryregisterview', provider, {webviewOptions: {retainContextWhenHidden: true}});
		});

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
	//protected getHtmlVertBreak() {
	//	return '\n';
	//}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason Not used.	 */
	public async update(reason?: any): Promise<void> {
		if (!this.vscodeWebview)
			return;

		// Title
		if (this.vscodePanel)
			this.vscodePanel.title='Memory Dump for Registers';

		// Get register values
		await Remote.getRegisters();

		// Recalculate the memory addresses
		let change=(this.memDump.metaBlocks.length>0);
		let i=0;
		for (let reg of this.registers) {
			// Get register value
			const value=Remote.getRegisterValue(reg);
			// Check if memory block already exists
			if (change) {
				// Change existing mem block
	//			this.memDump.changeBlock(i, value, 1);
			}
			else {
				// Create new block
				this.memDump.addBlock(value, 1, '@'+reg);
			}
			// Next
			i++;
		}

		// update
		await super.update(reason);
	}

}
