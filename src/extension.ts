import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { DebugSessionClass } from './debugadapter';
import { Z80UnitTests } from './z80unittests';
import * as Net from 'net';
import { DecorationClass, Decoration } from './decoration';
import { LogSocket, Log } from './log';
import Lg = require("./log")
import {Utility} from './misc/utility';
import {WhatsNewContentProvider} from './whatsnew/whatsnewprovider';
import {DezogWhatsNewMgr} from './whatsnew/dezogwhatsnewmanager';


/// Config section in the settings.
const CONFIG_SECTION = 'dezog';

/**
 * Register configuration provider and command palette commands.
 * @param context
 */
export function activate(context: vscode.ExtensionContext) {

	// Register the "Whatsnew" provider
	const whatsnewProvider=new WhatsNewContentProvider();
	const viewer=new DezogWhatsNewMgr(context);
	viewer.registerContentProvider("dezog", whatsnewProvider);
	// Show the page (if necessary)
	if (viewer.checkIfVersionDiffers()) {
		setTimeout(() => {
			// Show after 1 s, so that it is shown above other stuff
			viewer.showPage();
		}, 1000);
	}
	// Register the additional command to view the "Whats' New" page.
	context.subscriptions.push(vscode.commands.registerCommand("dezog.whatsNew", () => viewer.showPage()));


	// Get and store the extension's path
	const extPath=vscode.extensions.getExtension("maziac.dezog")?.extensionPath as string;
	Utility.setExtensionPath(extPath);

	// Enable logging.
	configureLogging();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration(CONFIG_SECTION + '.logpanel')
			|| event.affectsConfiguration(CONFIG_SECTION + '.logfile')
			|| event.affectsConfiguration(CONFIG_SECTION + '.socket.logpanel')
			|| event.affectsConfiguration(CONFIG_SECTION+'.socket.logfile')) {
			configureLogging();
		}
	}));

	// Note: Weinand: "VS Code runs extensions on the node version that is built into electron (on which VS Code is based). This cannot be changed."
	const version = process.version;
	console.log(version);

	context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(s => {
		console.log(`terminated: ${s.type} ${s.name}`);
	}));

	// Command to change the program counter via menu.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.movePCtoCursor', () => {
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
		vscode.debug.activeDebugSession.customRequest('setPcToLine', [filename, position.line]);
	}));

	// Command to disable code coverage display and analyzes.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.clearAllDecorations', () => {
		Decoration?.clearAllDecorations();
	}));

	// Command to execute all unit tests
	context.subscriptions.push(vscode.commands.registerCommand('dezog.runAllUnitTests', () => {
		Z80UnitTests.runAllUnitTests();
	}));

	// Command to run (some) unit tests
	context.subscriptions.push(vscode.commands.registerCommand('dezog.debugAllUnitTests', () => {
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
	context.subscriptions.push(vscode.commands.registerCommand('dezog.getAllUnitTests', async () => {
		try {
			return await Z80UnitTests.getAllUnitTests();
		}
		catch (e) {
			// Return empty list in case no unit tests are configured.
			//vscode.window.showErrorMessage(e); // This is not an error!
			return [];
		}
	}));

	// Command to initialize partial unit testing
	context.subscriptions.push(vscode.commands.registerCommand('dezog.initUnitTests', () => {
		Z80UnitTests.clearTestCaseList();
	}));

	// Command to (delayed) execution of a single unit test case
	context.subscriptions.push(vscode.commands.registerCommand('dezog.execUnitTestCase', (tcLabel: string) => {
		return Z80UnitTests.execUnitTestCase(tcLabel);
	}));

	// Command to execute all unit tests
	context.subscriptions.push(vscode.commands.registerCommand('dezog.runPartialUnitTests', () => {
		// Send to debug adapter
		Z80UnitTests.runPartialUnitTests();
	}));

	// Command to run (some) unit tests
	context.subscriptions.push(vscode.commands.registerCommand('dezog.debugPartialUnitTests', () => {
		Z80UnitTests.debugPartialUnitTests();
	}));

	// Command to cancel the unit tests. E.g. during debugging of one unit test.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.cancelUnitTests', () => {
		return Z80UnitTests.cmdCancelAllUnitTests();
	}));

	// Register a configuration provider for 'zrcp' debug type
	const configProvider = new ZesaruxConfigurationProvider()
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('dezog', configProvider));
	context.subscriptions.push(configProvider);

	// Initialize the Coverage singleton.
	DecorationClass.Initialize(context);

}


/**
 * Called to deactivate the debug session.
 */
export function deactivate() {
}


/**
 * Instantiates the ZesaruxDebugAdapter and sets up the
 * socket connection to it.
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
				const session = new DebugSessionClass();
				session.setRunAsServer(true);
				session.start(<NodeJS.ReadableStream>socket, socket);
			}).listen(0);
		}

		// make VS Code connect to debug server instead of launching debug adapter
		const addrInfo = this._server.address() as Net.AddressInfo;
		Utility.assert(typeof addrInfo != 'string');
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


/**
 * Configures teh logging from the settings.
 */
function configureLogging() {
	const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION, null);

	// Global log
	{
		const logToPanel = configuration.get<boolean>('logpanel');
		const filepath = configuration.get<string>('logfile');
		const channelName = (logToPanel) ? "DeZog" : undefined;
		const channelOut = (channelName) ? vscode.window.createOutputChannel(channelName) : undefined;
		Log.init(channelOut, filepath);
	}

	// Socket log
	{
		const logToPanel = configuration.get<boolean>('socket.logpanel');
		const filepath = configuration.get<string>('socket.logfile');
		const channelName = (logToPanel) ? "DeZog Socket" : undefined;
		const channelOut = (channelName) ? vscode.window.createOutputChannel(channelName) : undefined;
		LogSocket.init(channelOut, filepath);
	}

	// Enable to get a log of the commands only
	if(false) {
		const channelOut = vscode.window.createOutputChannel("DeZog Socket Commands");
		Lg.LogSocketCommands = new Log();
		Lg.LogSocketCommands.init(channelOut, undefined);
	}

}
