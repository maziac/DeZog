import * as vscode from 'vscode';
import * as Net from 'net';
import {SerialPort} from 'serialport';
import {CancellationToken, DebugConfiguration, ProviderResult, WorkspaceFolder} from 'vscode';
import {DebugSessionClass} from './debugadapter';
import {Decoration, DecorationClass} from './decoration';
import {DiagnosticsHandler} from './diagnosticshandler';
import {GlobalStorage} from './globalstorage';
import {HelpProvider} from './help/helpprovider';
import {LogGlobal, LogZsimHardware, LogZsimCustomCode, LogTransport} from './log';
import { UnifiedPath } from './misc/unifiedpath';
import {Utility} from './misc/utility';
import {PackageInfo} from './whatsnew/packageinfo';
import {WhatsNewView} from './whatsnew/whatsnewview';
import {Z80UnitTestRunner} from './z80unittests/z80unittestrunner';
import {ZxNextSerialLoopback} from './remotes/dzrpbuffer/zxnextserialloopback';
import {Run} from './run';


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
				await vscode.env.clipboard.writeText(selection);
		}
		else {
			await vscode.window.showWarningMessage('No serial port found!');
		}
	}));


	// Command to test communication on a serial port
	context.subscriptions.push(vscode.commands.registerCommand('dezog.serialport.test', async () => {
		// Test first if in debug mode (= not allowed)
		const session = DebugSessionClass.singleton();
		if (session.running) {
			await vscode.window.showWarningMessage('Cannot test the serial interface.\nPlease close the debug session first!');
			return;
		}

		// Create list of ports for the user to choose from
		const list = await SerialPort.list();	// PortInfo[]
		if (list.length == 0) {
			await vscode.window.showErrorMessage('No serial port found!');
			return;
		}

		// Show the quick pick to the user
		const options = list.map(portInfo => {
			return {
				label: portInfo.path,
				description: portInfo.manufacturer ?? "",
				value: portInfo.path
			};
		});
		const selectedPortPath = await vscode.window.showQuickPick(options, {placeHolder: 'Select a port'});
		// Check if an option was selected
		if (!selectedPortPath)
			return;
		//console.log('Selected option:', selectedPortPath);

		// Start loopback test
		const zxnextLoopback = new ZxNextSerialLoopback();
		zxnextLoopback.on('info', async msg => {
			await vscode.window.showInformationMessage(msg);
		});
		zxnextLoopback.on('error', async msg => {
			await vscode.window.showErrorMessage(msg);
		});
		await zxnextLoopback.runLoopbackTest(selectedPortPath.value, 1000, 10);
		// zxnextLoopback will close itself when the loopback test is finished.
	}));

	// Command to directly run a .sna or .p file. Bypassing the debugger.
	// If command is executed from a right click in the explorer parameter 1 and 2, both contain the file path.
	// The 2nd parameter embedded in an array.
	// Therefore, parameter 2 is ignored.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.run', async (fileUri: vscode.Uri, _p2, zsim: {} = undefined as any) => {
		//vscode.window.showInformationMessage(`fileUri: ${fileUri}, Parameter 2: ${_p2}, zsim: ${zsim}`);
		//console.log(`fileUri: ${fileUri}, Parameter 2: ${_p2}, zsim: ${zsim}`);
		Run.execute(fileUri, zsim);
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
			|| event.affectsConfiguration(extensionBaseName + '.log.transport')
			|| event.affectsConfiguration(extensionBaseName + '.log.zsim.hardware')
			|| event.affectsConfiguration(extensionBaseName + '.log.zsim.customCode')) {
			const currentConfig = PackageInfo.getConfiguration();
			configureLogging(currentConfig);
		}
		// 'donated' changed
		if (event.affectsConfiguration(extensionBaseName + '.donated')) {
			// Reload complete html
			helpProvider.setMainHtml();
		}
	}));

	// Note: Weinand: "VS Code runs extensions on the node version that is built into electron (on which VS Code is based). This cannot be changed."
	//const version = process.version;
	//console.log(version);

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
	context.subscriptions.push(vscode.commands.registerCommand('dezog.disassemblyAtCursor.code', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (session.running) {
			const arr = getSelectedLineBlocks();
			for (const block of arr)
				await session.disassemblyAtCursor('code', block.filename, block.fromLine, block.toLine);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('dezog.disassemblyAtCursor.data', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (session.running) {
			const arr = getSelectedLineBlocks();
			for (const block of arr)
				await session.disassemblyAtCursor('data', block.filename, block.fromLine, block.toLine);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('dezog.disassemblyAtCursor.string', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (session.running) {
			const arr = getSelectedLineBlocks();
			for (const block of arr)
				await session.disassemblyAtCursor('string', block.filename, block.fromLine, block.toLine);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('dezog.analyzeAtCursor.disassembly', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (session.running) {
			const arr = getSelectedLineBlocks();
			await session.analyzeAtCursor('disassembly', arr);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('dezog.analyzeAtCursor.flowChart', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (session.running) {
			const arr = getSelectedLineBlocks();
			await session.analyzeAtCursor('flowChart', arr);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('dezog.analyzeAtCursor.callGraph', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (session.running) {
			const arr = getSelectedLineBlocks();
			await session.analyzeAtCursor('callGraph', arr);
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

	// Command to refresh (button) the disassembly.
	context.subscriptions.push(vscode.commands.registerCommand('dezog.disassembly.refresh', async () => {
		// Only allowed in debug context
		const session = DebugSessionClass.singleton();
		if (!session.running)
			return;
		// Execute in debug adapter
		await session.refreshDisassembler();
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
	//
}


/**
 * Returns the selected lines in the editor(s).
 * In case of multi selection there might be more than 1 block.
 * For each block the start and end lines are calculated and returned.
 * @returns An array with blocks: filename, fromLine, toLine (included).
 */
function getSelectedLineBlocks(): Array<{filename: string, fromLine: number, toLine: number}> {
	// Get focussed editor/file and line
	const editor = vscode.window.activeTextEditor;
	if (!editor)
		return [];
	// Go through all selections in case of multiple selections
	const arr: Array<{filename: string, fromLine: number, toLine: number}> = [];
	for (const selection of editor.selections) {
		let from = selection.anchor;
		let to = selection.active;
		const filename = UnifiedPath.getUnifiedPath(editor.document.fileName);
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

		// Store in array
		arr.push({filename, fromLine, toLine});
	}
	return arr;
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
	provideInlineValues(_document: vscode.TextDocument, _viewPort: vscode.Range, _context: vscode.InlineValueContext, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineValue[]> {
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
	resolveDebugConfiguration(_folder: WorkspaceFolder | undefined, config: DebugConfiguration, _token?: CancellationToken): ProviderResult<DebugConfiguration> {
		return new Promise<DebugConfiguration | undefined>((resolve, reject) => {
			(async () => {
				// Remove current debug session
				const session = DebugSessionClass.singleton();
				if (session.running) {
					// Note: this point is not reached on a "normal" restart, instead
					// a) if a restart is done and at the same time the launch.json was also changed.
					// b) a different launch.json should be started.
					// Show warning and return.
					const result = await vscode.window.showWarningMessage('DeZog is already active.', 'Terminate current session', 'Cancel');
					// Check user selection
					if (result?.toLowerCase().startsWith('terminate')) {
						// Terminate current session and start a new one
						await session.terminateRemote();	// Can lead to a 'cannot find session', see https://github.com/maziac/DeZog/issues/91
						// Because of this we will stop here simply (reject)
					}
					// Stop here.
					reject(new Error("Another session was already running."));
					return;
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
			})();
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
		if (LogGlobal.isEnabled() !== logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog") : undefined;
			// Enable or dispose
			LogGlobal.init(channelOut);
		}
	}

	// Hardware simulation log
	{
		const logToPanel = configuration.get<boolean>('log.zsim.hardware');
		if (LogZsimHardware.isEnabled() !== logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog zsim: Hardware") : undefined;
			// Enable or dispose
			LogZsimHardware.init(channelOut);
		}
	}

	// Custom code log
	{
		const logToPanel = configuration.get<boolean>('log.zsim.customCode');
		if (LogZsimCustomCode.isEnabled() !== logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog zsim: Custom Code") : undefined;
			// Enable or dispose
			LogZsimCustomCode.init(channelOut);
		}
	}

	// Transport log
	{
		const logToPanel = configuration.get<boolean>('log.transport');
		if (LogTransport.isEnabled() !== logToPanel) {
			// State has changed
			const channelOut = logToPanel ? vscode.window.createOutputChannel("DeZog Transport") : undefined;
			// Enable or dispose
			LogTransport.init(channelOut);
		}
	}
}

