'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { EmulDebugAdapter } from './emuldebugadapter';
import { Z80UnitTests } from './z80unittests';
import * as Net from 'net';
import * as assert from 'assert';
import { CoverageClass, Coverage } from './coverage';


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
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.movePCtoCursor', () => {
		// Only allowed in debug context
		if(!vscode.debug.activeDebugSession)
			return;
		// Get focussed editor/file and line
		const editor = vscode.window.activeTextEditor;
		if(!editor)
			return;
		const position = editor.selection.active;
		const filename = editor.document.fileName;
		// Send to debug adapter
		vscode.debug.activeDebugSession.customRequest('setPcToline', [filename, position.line]);
	}));

	// Command to enable code coverage display and analyzes.
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.enableCodeCoverage', () => {
		if(Coverage)
			Coverage.enableCodeCoverage();
	}));
	// Command to disable code coverage display and analyzes.
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.disableCodeCoverage', () => {
		if(Coverage)
			Coverage.disableCodeCoverage();
	}));

	// Command to execute all unit tests
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.runAllUnitTests', () => {
		Z80UnitTests.runAllUnitTests();
	}));

	// Command to run (some) unit tests
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.debugAllUnitTests', () => {
		Z80UnitTests.debugAllUnitTests();
	}));


	/*
	 The following commands are for the test adapter extension.
	 A typical sequence is:
	 1. getAllUnitTests: The test-adapter retrieves the list of available unit test cases.
	 2. initUnitTests: Initializes a unit test case run.
	 3. execUnitTestCase: Executes a unit test case and returns a TestCaseResult.
	 Note: This command just adds the test case to a list. The real execution is delayed until startUnitTests.
	 4. runUnitTests: Runs the unit tests.
	*/

	// Command to get a list of all unit tests
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.getAllUnitTests', () => {
		return Z80UnitTests.getAllUnitTests();
	}));

	// Command to initialize partial unit testing
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.initUnitTests', () => {
		Z80UnitTests.clearTestCaseList();
	}));

	// Command to (delayed) execute a single unit test case
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.execUnitTestCase', (tcLabel: string) => {
		return Z80UnitTests.execUnitTestCase(tcLabel);
	}));

	// Command to execute all unit tests
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.runPartialUnitTests', () => {
		// Send to debug adapter
		Z80UnitTests.runPartialUnitTests();
	}));

	// Command to run (some) unit tests
	context.subscriptions.push(vscode.commands.registerCommand('z80-debug.debugPartialUnitTests', () => {
		Z80UnitTests.debugPartialUnitTests();
	}));

	// Register a configuration provider for 'zesarux' debug type
	const provider = new ZesaruxConfigurationProvider()
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('z80-debug', provider));
	context.subscriptions.push(provider);

	// Initialize the Coverage singleton.
	CoverageClass.Initialize(context);
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

