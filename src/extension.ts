'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { EmulDebugAdapter } from './emuldebugadapter';
import * as Net from 'net';


/**
 * Register configuration provider and command palette commands.
 * @param context
 */
export function activate(context: vscode.ExtensionContext) {

	/* Nothing used at the moment:
	// Command to send an arbitrary command through the socket to
	// zesarux and print the output to the console.
	context.subscriptions.push(vscode.commands.registerCommand('extension.z80-debug.exec-cmd', config => {
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
	}));
	*/

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
		config.debugServer = this._server.address().port;

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
