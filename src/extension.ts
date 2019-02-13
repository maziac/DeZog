'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { EmulDebugAdapter } from './emuldebugadapter';
import * as Net from 'net';
import * as assert from 'assert';


/**
 * Register configuration provider and command palette commands.
 * @param context
 */
export function activate(context: vscode.ExtensionContext) {

	// Note: Weinand: "VS Code runs extensions on the node version that is built into electron (on which VS Code is based). This cannot be changed."
	const version = process.version;
	console.log(version);

	context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(s => {

		console.log(`terminated: ${s.type} ${s.name}`);

		//setTimeout(() => {
		//	process.exit(0);
		//}, 100);

	}));

	// Command to change the program counter via menu.
	context.subscriptions.push(vscode.commands.registerCommand('extension.z80-debug.movePCtoCursor', config => {
		// Get focussed editor/file and line
		const editor = vscode.window.activeTextEditor;
		if(!editor)
			return;
		const position = editor.selection.active;
		const filename = editor.document.fileName;
		// Send to debug adapter
		if(vscode.debug.activeDebugSession)
			vscode.debug.activeDebugSession.customRequest('setPcToline', [filename, position.line] );


		/*
		return vscode.window.showInputBox({
			placeHolder: "e.g. get-breakpoints",
			prompt: 'Enter a command that is send to ZEsarUX',
			validateInput: () => null
		}).then(text => {
			if(text && text.length > 0) {
				if(vscode.debug.activeDebugSession)
					vscode.debug.activeDebugSession.customRequest('exec-cmd', text);
			}
		});
		*/
	}));

	// register a configuration provider for 'zesarux' debug type
	const provider = new ZesaruxConfigurationProvider()
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('z80-debug', provider));
	context.subscriptions.push(provider);
}

/**
 * Called to deactivate the debug session.
 */
export function deactivate() {
}

/**
 * Instantiates the ZesaruxDebugAdapter and sets up the
 * soccket connection to it.
 */
class ZesaruxConfigurationProvider implements vscode.DebugConfigurationProvider {

	private _server?: Net.Server;

	/**
	* Instantiates the ZesaruxDebugAdapter and sets up the
 	* soccket connection to it.
 	*/
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// start port listener on launch of first debug session
		if (!this._server) {

			// start listening on a random port
			this._server = Net.createServer(socket => {
				const session = new EmulDebugAdapter();
				session.setRunAsServer(true);
				session.start(<NodeJS.ReadableStream>socket, socket);
			}).listen(0);
		}

		// make VS Code connect to debug server instead of launching debug adapter
		const addrInfo = this._server.address() as Net.AddressInfo;
		assert(typeof addrInfo != 'string');
		config.debugServer = addrInfo.port;

		return config;
	}

	/**
	 * End.
	 */
	dispose() {
		if (this._server) {
			this._server.close();
		}
	}
}

