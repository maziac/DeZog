import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { DebugSessionClass } from './debugadapter';
import { Z80UnitTests } from './z80unittests';
import * as Net from 'net';
import { DecorationClass, Decoration } from './decoration';
import {LogSocket, LogCustomCode, LogSocketCommands, Log } from './log';
import {Utility} from './misc/utility';
import {WhatsNewContentProvider} from './whatsnew/whatsnewprovider';
import {DezogWhatsNewMgr} from './whatsnew/dezogwhatsnewmanager';
import {HelpView} from './help/helpview';


/// Config section in the settings.
const CONFIG_SECTION='dezog';


/**
 * 'activate' is called when one of the package.json activationEvents
 * fires the first time.
 * Afterwards it is not called anymore.
 * 'deactivate' is called when vscode is terminated.
 * I.e. the activationEvents just distribute the calling of the extensions
 * little bit. Instead one could as well use "*", i.e. activate on all events.
 *
 * Registers configuration provider and command palette commands.
 * @param context
 */
export function activate(context: vscode.ExtensionContext) {
	//console.log("Extension ACTIVATED");

	// Register the "Whatsnew" provider
	const whatsnewProvider=new WhatsNewContentProvider();
	const viewer=new DezogWhatsNewMgr(context);
	viewer.registerContentProvider("dezog", whatsnewProvider);
	// Show the page (if necessary)
	const differs=viewer.checkIfVersionDiffers();
	if(differs)
	{
		viewer.showPage();
	}
	// Register the additional command to view the "Whats' New" page.
	context.subscriptions.push(vscode.commands.registerCommand("dezog.whatsNew", () => viewer.showPage()));

	// Command to show the DeZog Help
	context.subscriptions.push(vscode.commands.registerCommand('dezog.help', () => new HelpView()));

	// Get and store the extension's path
	const extPath=vscode.extensions.getExtension("maziac.dezog")?.extensionPath as string;
	Utility.setExtensionPath(extPath);

	// Enable logging.
	configureLogging();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration(CONFIG_SECTION + '.logpanel')
			||event.affectsConfiguration(CONFIG_SECTION+'.socket.logpanel')
			||event.affectsConfiguration(CONFIG_SECTION+'.customcode.logpanel')) {
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
			//vscode.window.showErrorMessage(e.message); Don't show an error, otherwise it would be shown everytime that no configuration is found.
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

	// Register a configuration provider for 'dezog' debug type
	const configProvider = new DeZogConfigurationProvider()
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('dezog', configProvider));
	context.subscriptions.push(configProvider);

	/*
	Actually this did not work very well for other reasons:
	It's better to retrieve the file/lineNr from the PC value.
	Therefore I removed this.
	// Register an evaluation provider for hovering.
	// Note: Function is only called in debug context and only for the file currently being debugged.
	// Therefore '' is enough.
	vscode.languages.registerEvaluatableExpressionProvider('*', {
		provideEvaluatableExpression(
			document: vscode.TextDocument,
			position: vscode.Position
		): vscode.ProviderResult<vscode.EvaluatableExpression> {
			const wordRange = document.getWordRangeAtPosition(position, /[\w\.]+/);
			if (wordRange) {
				const filePath = document.fileName;
				if (filePath) {
					const text = document.getText(wordRange);
					// Put additionally text file path and position into 'expression',
					// Format: "word:filePath:line:column"
					// Example: "data_b60:/Volumes/SDDPCIE2TB/Projects/Z80/asm/z80-sld/main.asm:28:12
					const expression = text + ':' + filePath + ':' + position.line + ':' + position.character;
					return new vscode.EvaluatableExpression(wordRange, expression);
				}
			}
			return undefined; // Nothing found
		}
	});
	*/

	// Initialize the Coverage singleton.
	DecorationClass.Initialize(context);

}


/**
 * 'deactivate' is only called when vscode is terminated.
 */
export function deactivate() {
	//console.log("Extension DEACTIVATED");
}


/**
 * Instantiates the ZesaruxDebugAdapter and sets up the
 * socket connection to it.
 */
class DeZogConfigurationProvider implements vscode.DebugConfigurationProvider {

	private _server?: Net.Server;

	/**
	* Instantiates DebugAdapter (DebugSessionClass) and sets up the
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
 * Configures the logging from the settings.
 */
function configureLogging() {
	const configuration=vscode.workspace.getConfiguration(CONFIG_SECTION, null);

	// Global log
	{
		const logToPanel=configuration.get<boolean>('logpanel');
		const channelName=(logToPanel)? "DeZog":undefined;
		const channelOut=(channelName)? vscode.window.createOutputChannel(channelName):undefined;
		Log.init(channelOut);
	}

	// Custom code log
	{
		const logToPanel=configuration.get<boolean>('customcode.logpanel');
		const channelName=(logToPanel)? "DeZog Custom Code":undefined;
		const channelOut=(channelName)? vscode.window.createOutputChannel(channelName):undefined;
		LogCustomCode.init(channelOut);
	}

	// Socket log
	{
		const logToPanel=configuration.get<boolean>('socket.logpanel');
		const channelName=(logToPanel)? "DeZog Socket":undefined;
		const channelOut=(channelName)? vscode.window.createOutputChannel(channelName):undefined;
		LogSocket.init(channelOut);
	}

	// Enable to get a log of the commands only
	if (false) {
		const channelOut=vscode.window.createOutputChannel("DeZog Socket Commands");
		LogSocketCommands.init(channelOut, undefined);
	}
}

