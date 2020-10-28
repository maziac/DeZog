import * as vscode from 'vscode';
import { Remote  } from '../remotes/remotefactory';
import {Settings} from '../settings';
import { MemoryDumpView } from './memorydumpview';


/// Config section in the settings.
const CONFIG_SECTION='dezog';


/**
 * A Webview that shows the memory dump for certain registers.
 * I.e. it looks at the registers value and chooses a matching memory
 * range to display.
 */
export class MemoryRegisterView extends MemoryDumpView {

	/**
	 * Creates the register view depending on the preference
	 * settings.
	 */
	static async CreateMemoryRegisterView(): Promise<void> {
		const configuration=vscode.workspace.getConfiguration(CONFIG_SECTION, null);
		const location=configuration.get<string>('memoryregisterview.location');

		if (location=='none')
			return;	// Do nothing

		// Create view
		const registerMemoryView=new MemoryRegisterView();
		const regs=Settings.launch.memoryViewer.registersMemoryView;
		registerMemoryView.addRegisters(regs);

		// Check where to locate the view
		if (location=='editor') {
			// As with v1.5 and before: editor area
			registerMemoryView.setupWebView();
		}
		else {
			// Default: sidebar
			await registerMemoryView.asyncInit();
		}
		await registerMemoryView.update();
	}


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
	 * Creates the webview for communication
	 * in the sidebar.
	 * Needs to be called after construction.
	 */
	public async asyncInit(): Promise<void> {
		// Sidebar
		/*
		 Note: Requires this in package.json:
		"views": {
			"debug": [
				{
					"type": "webview",
					"id": "dezog.memoryregisterview",
					"name": "Memory Dump"
				}
			]
		}
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
			this.vscodePanel.title='Memory View for Registers';

		// Get register values
		await Remote.getRegisters();

		// If run the first time
		if (!this.vscodeWebview.html) {
			for (let reg of this.registers) {
				// Get register value
				const value=Remote.getRegisterValue(reg);
				// Create new block
				this.memDump.addBlock(value, 1, '@'+reg);
			}
		}
		else {
			// Change blocks
			let i=0;
			for (let reg of this.registers) {
				// Get register value
				const value=Remote.getRegisterValue(reg);
				// Change existing mem block
				this.memDump.changeBlock(i, value, 1);
				// Next
				i++;
			}
		}

		// update
		await super.update(reason);
	}

}
