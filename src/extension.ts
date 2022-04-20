import * as vscode from 'vscode';
import {WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken} from 'vscode';
import {DebugSessionClass} from './debugadapter';
import * as Net from 'net';
import {DecorationClass, Decoration} from './decoration';
import {LogTransport, LogCustomCode, LogGlobal} from './log';
import {Utility} from './misc/utility';
import {PackageInfo} from './whatsnew/packageinfo';
import {WhatsNewView} from './whatsnew/whatsnewview';
import {HelpProvider} from './help/helpprovider';
import {GlobalStorage} from './globalstorage';
import {Z80UnitTestRunner} from './z80unittests/z80unittestrunner';
import {DiagnosticsHandler} from './diagnosticshandler';
import {SerialPort} from 'serialport';



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

	// Init package info
	PackageInfo.Init(context);

	// Init global storage
	GlobalStorage.Init(context);

	// Init/subscribe diagnostics
	DiagnosticsHandler.Init(context);

	// Save the extension path also to PackageInfo
	const extPath = context.extensionPath;
	// it is also stored here as Utility does not include vscode which is more unit-test-friendly.
	Utility.setExtensionPath(extPath);

	// Check version and show 'What's new' if necessary.
	const mjrMnrChanged = WhatsNewView.updateVersion(context);
	if (mjrMnrChanged) {
		// Major or minor version changed so show the whatsnew page.
		new WhatsNewView();	// NOSONAR
	}
	// Register the additional command to view the "Whats' New" page.
	context.subscriptions.push(vscode.commands.registerCommand("dezog.whatsNew", () => new WhatsNewView()));


	// Register the 'DeZog Help' webview
	const helpProvider = new HelpProvider();
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("dezog.helpview", helpProvider, {webviewOptions: {retainContextWhenHidden: false}})
	);

	// Command to show the DeZog Help
	context.subscriptions.push(vscode.commands.registerCommand('dezog.help', () => helpProvider.createHelpView()));

	// Command to show the available serial ports
	context.subscriptions.push(vscode.commands.registerCommand('dezog.serialport.list', async () => {
		const list = await SerialPort.list();	// PortInfo[]
		if (list.length > 0) {
			const items = list.map(item => item.path);
			const selection = await vscode.window.showInformationMessage('Serial ports (click to copy):', ...items);
			// Copy selected item to clipboard.
			if(selection)
				vscode.env.clipboard.writeText(selection);
		}
		else {
			vscode.window.showInformationMessage('No serial port found!');
		}
	}));


	// Enable e.g. logging.
	const extension = PackageInfo.extension;
	const packageJSON = extension.packageJSON;
	const extensionBaseName = packageJSON.name;
	const configuration = PackageInfo.getConfiguration();
	configureLogging(configuration);
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		// Logging changed
		if (event.affectsConfiguration(extensionBaseName + '.log.global')
			|| event.affectsConfiguration(extensionBaseName+'.log.transport')
			|| event.affectsConfiguration(extensionBaseName + '.log.customCode')) {
			const configuration = PackageInfo.getConfiguration();
			configureLogging(configuration);
		}
		// 'donated' changed
		if (event.affectsConfiguration(extensionBaseName + '.donated')) {
			// Reload complete html
			helpProvider.setMainHtml();
		}
	}));

	// Note: Weinand: "VS Code runs extensions on the node version that is built into electron (on which VS Code is based). This cannot be changed."
	const version = process.version;
	console.log(version);

	context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(s => {
		console.log(`terminated: ${s.type} ${s.name}`);
	}));


	// Command to change the program counter via menu.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.movePCtoCursor', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (!session.running)
			return;
		// Get focussed editor/file and line
		const editor = vscode.window.activeTextEditor;
		if (!editor)
			return;
		const position = editor.selection.anchor;
		const filename = editor.document.fileName;
		// Execute in debug adapter
		await session.setPcToLine(filename, position.line);
	}));

	// Command to do a disassembly at the cursor's position.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.disassemblyAtCursor', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (!session.running)
			return;
		// Get focussed editor/file and line
		const editor = vscode.window.activeTextEditor;
		if (!editor)
			return;
		// Go through all selections in case of multiple selections
		for (const selection of editor.selections) {
			let from = selection.anchor;
			let to = selection.active;
			const filename = editor.document.fileName;
			// Adjust
			if (from.line > to.line) {
				// exchange
				const tmp = from;
				from = to;
				to = tmp;
			}
			const fromLine = from.line;
			let toLine = to.line;
			if (toLine > fromLine) {
				if (to.character == 0)
					toLine--;
			}
			// Execute in debug adapter
			await session.disassemblyAtCursor(filename, fromLine, toLine);
		}
	}));

	// Command to disable code coverage display and analyzes.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.clearAllDecorations', () => {
		Decoration?.clearAllDecorations();
	}));


	// Command to reload the list file(s).
	context.subscriptions.push(vscode.commands.registerCommand('dezog.reload', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (!session.running)
			return;
		// Execute in debug adapter
		await session.reloadLabels();
	}));

	// Register a configuration provider for 'dezog' debug type
	const configProvider = new DeZogConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('dezog', configProvider));

	// Registers the debug inline value provider
	const asmDocSelector: vscode.DocumentSelector = {scheme: 'file'};
	const inlineValuesProvider = new DeZogInlineValuesProvider();
	context.subscriptions.push(vscode.languages.registerInlineValuesProvider(asmDocSelector, inlineValuesProvider));

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
	DecorationClass.Initialize();

	// Initialize the unit tester.
	Z80UnitTestRunner.Init();
}


/**
 * 'deactivate' is only called when vscode is terminated.
 */
export function deactivate() {
	//console.log("Extension DEACTIVATED");
}



/**
 * This debug inline values provider simply provides nothing.
 * This is to prevent that the default debug inline values provider is used instead,
 * which would show basically garbage.
 *
 * So for settings.json "debug.inlineValues":
 * - false: The inline provider is not called
 * - true/"auto": The inline provider is called but returns nothing.
 *
 * I'm not using the vscode approach for debug values but decorations instead because:
 * - The decorations implementation is ready and working fine. To change would give
 *   no advantage other than additional effort and bugs.
 * - vscode only shows the inline values for the currently debugged file.
 *   The decorations show them on all files, i.e. it is easier to follow where the
 *   instruction history came from.
 */
class DeZogInlineValuesProvider implements vscode.InlineValuesProvider {
	//onDidChangeInlineValues?: vscode.Event<void> | undefined;
	provideInlineValues(document: vscode.TextDocument, viewPort: vscode.Range, context: vscode.InlineValueContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineValue[]> {
		return undefined;
	}

}



/**
 * Instantiates the ZesaruxDebugAdapter and sets up the
 * socket connection to it.
 */
class DeZogConfigurationProvider implements vscode.DebugConfigurationProvider {

	// Is set if a DeZog instance is already running.
	private _server?: Net.Server;


	/**
	 * Instantiates DebugAdapter (DebugSessionClass) and sets up the
	 * socket connection to it.
	 * Is called once per vscode window.
	 * I.e. each window has a separate environment.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		return new Promise<DebugConfiguration | undefined>(async resolve => {

			// Remove current debug session
			const session = DebugSessionClass.singleton();
			if (session.running) {
				// Already running, show warning and return.
				const result = await vscode.window.showWarningMessage('DeZog is already active.', 'Terminate current session', 'Cancel');
				// Check user selection
				if (result?.toLowerCase().startsWith('terminate')) {
					// Terminate current session and start a new one
					await session.terminateRemote();
				}
				else {
					// Cancel. If undefined returned no popup will appear.
					resolve(undefined);
				}
			}

			// Check if (DeZog) already running
			if (!this._server) {
				// Start port listener on launch of first debug session (random port)
				this._server = Net.createServer(socket => {
					session.setRunAsServer(true);
					session.start(<NodeJS.ReadableStream>socket, socket);
				}).listen(0);
			}

			// Make VS Code connect to debug server
			const addrInfo = this._server.address() as Net.AddressInfo;
			Utility.assert(typeof addrInfo != 'string');
			config.debugServer = addrInfo.port;
			resolve(config);
		});
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
function configureLogging(configuration: vscode.WorkspaceConfiguration) {
	// Global log
	{
		const logToPanel = configuration.get<boolean>('log.global');
		if (LogGlobal.isEnabled() != logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog") : undefined;
			// Enable or dispose
			LogGlobal.init(channelOut);
		}
	}

	// Custom code log
	{
		const logToPanel = configuration.get<boolean>('log.customCode');
		if (LogCustomCode.isEnabled() != logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog Custom Code") : undefined;
			// Enable or dispose
			LogCustomCode.init(channelOut);
		}
	}

	// Transport log
	{
		const logToPanel = configuration.get<boolean>('log.transport');
		if (LogTransport.isEnabled() != logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog Transport") : undefined;
			// Enable or dispose
			LogTransport.init(channelOut);
		}
	}
}

