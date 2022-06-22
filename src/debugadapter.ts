import * as fs from 'fs';
import * as vscode from 'vscode';
import {HtmlView} from './views/htmlview';
import {Breakpoint, CapabilitiesEvent, ContinuedEvent, DebugSession, InitializedEvent, InvalidatedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread} from 'vscode-debugadapter/lib/main';
import {DebugProtocol} from 'vscode-debugprotocol/lib/debugProtocol';
import {CallStackFrame} from './callstackframe';
import {Decoration} from './decoration';
import {DiagnosticsHandler} from './diagnosticshandler';
import {NumberType} from './disassembler/numbertype';
import {AnalyzeDisassembler} from './disassembly/analyzedisassembler';
import {Disassembly, DisassemblyClass} from './disassembly/disassembly';
import {SimpleDisassembly} from './disassembly/simpledisassembly';
import {GenericWatchpoint} from './genericwatchpoint';
import {Labels} from './labels/labels';
import {Log} from './log';
import {ExpressionVariable} from './misc/expressionvariable';
import {FileWatcher} from './misc/filewatcher';
import {PromiseCallbacks} from './misc/promisecallbacks';
import {RefList} from './misc/reflist';
import {TimeWait} from './misc/timewait';
import {UnifiedPath} from './misc/unifiedpath';
import {Utility} from './misc/utility';
import {CpuHistory, CpuHistoryClass, StepHistory} from './remotes/cpuhistory';
import {Remote, RemoteBreakpoint} from './remotes/remotebase';
import {RemoteFactory} from './remotes/remotefactory';
import {StepHistoryClass} from './remotes/stephistory';
import {Z80RegisterHoverFormat, Z80Registers, Z80RegistersClass} from './remotes/z80registers';
import {ZSimRemote} from './remotes/zsimulator/zsimremote';
import {ZSimulationView} from './remotes/zsimulator/zsimulationview';
import {Settings, SettingsParameters} from './settings/settings';
import {DisassemblyVar, ImmediateMemoryValue, MemDumpVar, MemorySlotsVar, RegistersMainVar, RegistersSecondaryVar, ShallowVar, StackVar, StructVar} from './variables/shallowvar';
import {BaseView} from './views/baseview';
import {MemoryDumpView} from './views/memorydumpview';
import {MemoryDumpViewWord} from './views/memorydumpviewword';
import {MemoryRegisterView} from './views/memoryregisterview';
import {TextView} from './views/textview';
import {ZxNextSpritePatternsView} from './views/zxnextspritepatternsview';
import {ZxNextSpritesView} from './views/zxnextspritesview';
import {Z80UnitTestRunner} from './z80unittests/z80unittestrunner';



/// State of the debug adapter.
enum DbgAdapterState {
	NORMAL,	// Normal debugging
	UNITTEST,	// Debugging or running unit tests
}


/**
 * Structure to hold the address together with the source breakpoint.
 * Used for the disassembly.
 */
interface SbpAddr {
	sbp: vscode.SourceBreakpoint;
	longAddress: number;	// -1 if undefined
	lineNr: number;	// The original line number is saved here because the lineNr of the SourceBreakpoint is changed by vscode when teh file changes.
}


/**
 * Structure used to store the address for disassembly.
 */
class StackFrameAddr extends StackFrame {
	public longAddress: number;	// The associated long address
}



/**
 * The Emulator Debug Adapter.
 * It receives the requests from vscode and sends events to it.
 */
export class DebugSessionClass extends DebugSession {
	/// The state of the debug adapter (unit tests or not)
	protected state = DbgAdapterState.NORMAL;

	/// Functions set in 'unitTestsStart'. Will be called after debugger
	/// is started and initialized.
	protected unitTestsStartCallbacks: PromiseCallbacks<DebugSessionClass> | undefined;

	/// The text document used for the temporary disassembly.

	/// A list for the VARIABLES (references)
	protected listVariables = new RefList<ShallowVar>();

	// A list with the expressions used in the WATCHes panel and the Expressions section in the VARIABLES pane.
	protected constExpressionsList = new Map<string, ExpressionVariable>();

	/// The disassembly that is shown in the VARIABLES section.
	protected disassemblyVar: DisassemblyVar;

	/// The local stack that is shown in the VARIABLES section.
	protected localStackVar: StackVar;

	/// Only one thread is supported.
	public static THREAD_ID = 1;

	/// Counts the number of stackTraceRequests.
	protected stackTraceResponses = new Array<DebugProtocol.StackTraceResponse>();

	/// This array contains functions which are pushed on an emit (e.g. 'historySpot', not 'coverage')
	/// and which are executed after a stackTrace.
	/// The reason is that the disasm.list file will not exist before and emits
	/// regarding this file would be lost.
	protected delayedDecorations = new Array<() => void>();

	/// Set to true if pause has been requested.
	/// Used in stepOver.
	protected pauseRequested = false;

	/// With pressing keys for stepping (i.e. F10, F11) it is possible to
	/// e.g. enter the 'stepInRequest' while the previous stepInRequest is not yet finished.
	/// I.e. before a StoppedEvent is sent. With the GUI this is not possible
	/// since the GUI disables the stepIn button. But it seems that
	/// key presses are still allowed.
	/// This variable here is set every time a step (or similar) is done.
	/// And reset when the function is finished. Should some other similar
	/// request happen a response is sent but the request is ignored otherwise.
	protected processingSteppingRequest = false;


	/// This is saved text that could not be printed yet because
	// the debug console was not there.
	// It is printed a soon as the console appears.
	protected debugConsoleSavedText: string;

	/// The text written to console on event 'debug_console' is indented by this amount.
	protected debugConsoleIndentation = "  ";

	/// Is true if a dezog debug session is running.
	public running = false;

	/// The file watchers used for auto reload of list files.
	protected fileWatchers: FileWatcher[] = [];

	/// The scopes (variables etc) are set in here.
	protected scopes: Array<Scope>;


	/**
	 * Create and return the singleton object.
	 */
	public static singleton(): DebugSessionClass {
		if (!this.debugAdapterSingleton) {
			this.debugAdapterSingleton = new DebugSessionClass();
		}
		return this.debugAdapterSingleton;
	}
	protected static debugAdapterSingleton: DebugSessionClass;


	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super();
		// Init line numbering
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
		/*
		// Register for start/stop events
		vscode.debug.onDidStartDebugSession(session => {
			// Check if started
			//console.log(session);
			if (session.configuration.type == 'dezog')
				this.running = true;
		});
		vscode.debug.onDidTerminateDebugSession(session => {
			// Check if started
			//console.log(session);
			if (session.configuration.type == 'dezog')
				this.running = false;
		});
		*/
		vscode.debug.onDidChangeActiveDebugSession(dbgSession => {
			if (dbgSession?.configuration.type == 'dezog') {
				vscode.debug.activeDebugConsole.append(this.debugConsoleSavedText);
				this.debugConsoleSavedText = '';
			}
		});
	}


	/**
	 * Start the unit tests.
	 * @param configName The debug launch configuration name.
	 * @returns If it was not possible to start unit test: false.
	 */
	public unitTestsStart(configName: string): Promise<DebugSessionClass> {
		// Return if currently a debug session is running
		if (this.running)
			throw Error("There is already an active debug session.");
		if (this.state != DbgAdapterState.NORMAL)
			throw Error("Debugger state is wrong.");


		// Need to find the corresponding workspace folder
		const rootFolder = Utility.getRootPath();
		const rootFolderUri = vscode.Uri.file(rootFolder);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootFolderUri);
		Utility.assert(workspaceFolder);


		// The promise is fulfilled after launch of the debugger.
		const res = new Promise<DebugSessionClass>((resolve, reject) => {
			new PromiseCallbacks<DebugSessionClass>(this, 'unitTestsStartCallbacks', resolve, reject);	// NOSONAR
		});

		// Start debugger
		this.state = DbgAdapterState.UNITTEST;
		vscode.debug.startDebugging(workspaceFolder, configName);

		return res;
	}


	/**
	 * Used to show a warning to the user.
	 * @param message The message to show.
	 */
	private showWarning(message: string) {
		Log.log(message)
		vscode.window.showWarningMessage(message);
	}


	/**
	 * Used to show an error to the user.
	 * @param message The message to show.
	 */
	private showError(message: string) {
		Log.log(message);
		vscode.window.showErrorMessage(message);
	}


	/**
	 * Exit from the debugger.
	 * Call Remote.terminate instead. The debug adapter listens for the
	 * 'terminate' event and will execute the 'terminate' function.
	 * @param message If defined the message is shown to the user as error.
	 */
	protected terminate(message?: string) {
		// Make sure every decoration gets output (important for debugging unit tests)
		this.processDelayedDecorations();
		if (message)
			this.showError(message);
		Log.log("Exit debugger!");
		// Remove all listeners
		this.removeAllListeners();	// Don't react on events anymore
		this.sendEvent(new TerminatedEvent());
	}


	/**
	 * Checks if the debugger is active. If yes terminate it.
	 * This in turn will stop the debug session.
	 */
	public async terminateRemote(): Promise<void> {
		return new Promise<void>(async resolve => {
			// Wait until vscode debugger has stopped.
			if (Remote) {
				// Terminate emulator
				await Remote.terminate();
				RemoteFactory.removeRemote();
			}

			// (Unfortunately there is no event for this, so we need to wait)
			Utility.delayedCall(time => {
				// After 5 secs give up
				if (time >= 5.0) {
					// Give up
					vscode.window.showErrorMessage('Could not terminate active debug session. Please try manually.');
					resolve();
					return true;
				}
				// Check for active debug session
				if (this.running)
					return false;  // Try again
				resolve();
				return true;  // Stop
			});
		});
	}


	/**
	 * Overload sendEvent to logger.
	 */
	public sendEvent(event: DebugProtocol.Event): void {
		Log.log(`<-: ${event.event}(${JSON.stringify(event.body)})`);
		super.sendEvent(event);
	}

	/**
	 * Overload sendRequest to logger.
	 */
	public sendRequest(command: string, args: any, timeout: number, cb: (response: DebugProtocol.Response) => void): void {
		Log.log(`<-: ${command}(${JSON.stringify(args)})`);
		super.sendRequest(command, args, timeout, (resp) => {
			// Response
			Log.log(`->: ${resp.command}(${JSON.stringify(resp.body)})`);
			// callback
			cb(resp);
		});
	}

	/**
	 * Overload sendResponse to logger.
	 */
	public sendResponse(response: DebugProtocol.Response): void {
		Log.log(`<-: ${response.command}(${JSON.stringify(response.body)})`);
		super.sendResponse(response);
	}

	/**
	 * Writes all requests to the logger.
	 * @param request The DebugProtocol request.
	 */
	protected dispatchRequest(request: DebugProtocol.Request): void {
		Log.log(`->: ${request.command}(${JSON.stringify(request.arguments)})`);
		super.dispatchRequest(request);
	}


	/**
	 * The terminateRequest is sent before the disconnectRequest to allow the debugger
	 * to terminate grace fully.
	 * After 2 secs vscode will show a notification that termination was not successfully.
	 * If the user presses the stop again the next time the disconnectRequest is called.
	 * The debugger has to send the terminateEvent for proper handling after e.g. the
	 * socket has been disconnected.
	 */
	protected async terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments): Promise<void> {
		console.log('terminateRequest');	// TODO: REMOVE
		// Disconnect Remote etc.
		await this.disconnectAll();

		// Send response after disconnect
		this.sendResponse(response);
		// When all is done proceed to disconnectRequest
		this.sendEvent(new TerminatedEvent());
	}


	/**
	 * DebugAdapter disconnects.
	 * End forcefully.
	 * Is called
	 * - when user presses red square
	 * - when the socket connection is terminated
	 * - If user presses circled arrow/restart
	 */
	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, _args: DebugProtocol.DisconnectArguments): Promise<void> {
		console.log('disconnectRequest');	// TODO: REMOVE
		// Disconnect Remote etc.
		await this.disconnectAll();	// Just in case ... Should have been done already in terminateRequest
		// Send response
		this.sendResponse(response);
	}


	/**
	 * Disconnects Remote, listeners, views.
	 * Is called
	 * - when user presses red square
	 * - when the user presses relaunch (circled arrow/restart)
	 * - when the ZEsarUX socket connection is terminated
	 */
	protected async disconnectAll(): Promise<void> {
		console.log('disconnectAll, this.running=', this.running);	// TODO: REMOVE
		// Test if running
		if (!this.running)
			return;
		this.running = false;
		console.log('disconnectAll started');	// TODO: REMOVE

		try {
			// Dispose file watchers
			this.removeReloadFileWatchers();

			// Close views, e.g. register memory view
			BaseView.staticCloseAll();
			this.removeListener('update', BaseView.staticCallUpdateFunctions);
			// Stop machine
			this.removeAllListeners();	// Don't react on events anymore
			// Disconnect
			if (Remote) {
				await Remote.disconnect();
			}
		}
		catch (e) {
			// In case of a disconnect failure.
			console.log('exception', e);
		}

		try {
			// Clear the history instance
			CpuHistoryClass.removeCpuHistory();
			// Clear Remote
			RemoteFactory.removeRemote(); // Also disposes
			// Disassembly: Remove all breakpoints
			const disasmBps = this.getDisassemblyBreakpoints();
			// Remove BPs temporary
			const removeBps = disasmBps.map(sbpAddr => sbpAddr.sbp);
			vscode.debug.removeBreakpoints(removeBps);
			/*
			// Remove disassembly text editor. vscode does not support closing directly, thus this hack:
			if (this.disasmTextDoc) {	// TODO: Maybe I should leave it open.
				vscode.window.showTextDocument(this.disasmTextDoc.uri, {preview: true, preserveFocus: false})
					.then(() => {
						return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
					});
			}
			*/

			// Clear all decorations
			if (this.state == DbgAdapterState.UNITTEST) {
				// Cancel unit tests
				await Z80UnitTestRunner.cancelUnitTests();
				// Clear decoration
				Decoration?.clearAllButCodeCoverageDecorations();
			}
			else {
				Decoration?.clearAllDecorations();
			}
			this.state = DbgAdapterState.NORMAL;
			this.running = false;
		}
		catch(e) {
			console.log('exception', e);
		}
		console.log('disconnectAll ended');	// TODO: REMOVE
	}


	/**
	 * 'initialize' request.
	 * Respond with supported features.
	 */
	protected async initializeRequest(response: DebugProtocol.InitializeResponse, _args: DebugProtocol.InitializeRequestArguments): Promise<void> {

		// Check if DeZog is already running
		if (!response.success) {	// TODO: Remove this
			response.success = false;
			response.message = 'DeZog is already active. Only 1 instance is allowed.';
			this.sendResponse(response);
			return;
		}

		//const dbgSession = vscode.debug.activeDebugSession;
		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		// the adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = false;

		// Is done in launchRequest:
		//response.body.supportsStepBack = true;

		//response.body.supportTerminateDebuggee = true;
		response.body.supportTerminateDebuggee = false;

		// Get terminateRequest before disconnectRequest
		response.body.supportsTerminateRequest = true;

		// The PC value might be changed.
		//response.body.supportsGotoTargetsRequest = true;
		// I use my own "Move Program Counter to Cursor".
		// GotoTargetsRequest would be working now, but not in all cases.
		// If the file is not recognized yet. It does not work.
		// Thought it has something to do with loadSourcesRequest but it doesn't.
		response.body.supportsGotoTargetsRequest = false;

		// Support hovering over values (registers)
		response.body.supportsEvaluateForHovers = true;

		// Support changing of variables (e.g. registers)
		response.body.supportsSetVariable = true;

		// Supports conditional breakpoints
		response.body.supportsConditionalBreakpoints = true;

		// Handles debug 'Restart'.
		// If set to false the vscode restart button still occurs and
		// vscode internally calls disconnect and launchRequest.
		response.body.supportsRestartRequest = false;

		// Allows to set values in the watch pane.
		response.body.supportsSetExpression = true;

		this.sendResponse(response);

		// Note: The InitializedEvent will be send when the socket connection has been successful. Afterwards the breakpoints are set.
	}


	/**
	 * Prints text to the debug console.
	 */
	protected debugConsoleAppend(text: string) {
		if (vscode.debug.activeDebugSession)
			vscode.debug.activeDebugConsole.append(text);
		else {
			// Save text
			this.debugConsoleSavedText += text;
		}
	}
	protected debugConsoleAppendLine(text: string) {
		this.debugConsoleAppend(text + '\n');
	}


	/**
	 * Called after 'initialize' request.
	 * Loads the list file and connects the socket (if necessary).
	 * Initializes the remote.
	 * When the remote is connected and initialized an 'initialized' event
	 * is sent.
	 * @param response
	 * @param args
	 */
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: SettingsParameters) {
		try {
			console.log('launchRequest');	// TODO: REMOVE
			this.running = true;

			// Clear any diagnostics
			DiagnosticsHandler.clear();

			// Initialize
			BaseView.staticInit();
			ZxNextSpritePatternsView.staticInit();

			// Action on changed value (i.e. when the user changed a value
			// vscode is informed and will e.g. update the watches.)
			BaseView.onChange(() => {
				// This ['variables'] seems to work:
				// See https://github.com/microsoft/debug-adapter-protocol/issues/171#issuecomment-754753935
				this.sendEvent(new InvalidatedEvent(['variables']));
				// Note: Calling this.memoryHasBeenChanged would result in an infinite loop.
			});

			// Save args
			Settings.launch = Settings.Init(args);
			Settings.CheckSettings();
			Utility.setRootPath(Settings.launch.rootFolder);

			// Persistent variable references
			this.listVariables.clear();
			this.constExpressionsList.clear();
			this.disassemblyVar = new DisassemblyVar();
			this.disassemblyVar.count = Settings.launch.disassemblerArgs.numberOfLines;
			this.localStackVar = new StackVar();
			this.scopes = [
				new Scope("Registers", this.listVariables.addObject(new RegistersMainVar())),
				new Scope("Registers 2", this.listVariables.addObject(new RegistersSecondaryVar())),
				new Scope("Disassembly", this.listVariables.addObject(this.disassemblyVar)),
				new Scope("Memory Banks", this.listVariables.addObject(new MemorySlotsVar())),
				new Scope("Local Stack", this.listVariables.addObject(this.localStackVar))
			];

			// Register to get a note when debug session becomes active
			this.debugConsoleSavedText = '';

			// Launch emulator
			await this.launch(response);
		}
		catch (e) {
			// Some error occurred
			response.success = false;
			response.message = e.message;
			this.sendResponse(response);
		}
	}


	/**
	 * Launches the emulator. Is called from launchRequest.
	 * @param response
	 */
	protected async launch(response: DebugProtocol.Response) {
		// Setup the disassembler
		DisassemblyClass.createDisassemblySingleton();

		// Init
		this.processingSteppingRequest = false;

		// Register to update the memoryview.
		this.removeListener('update', BaseView.staticCallUpdateFunctions);
		this.on('update', BaseView.staticCallUpdateFunctions);

		// Start the emulator and the connection.
		const msg = await this.startEmulator();
		if (msg) {
			response.message = msg;
			response.success = (msg == undefined);
		}
		else {
			// Check if reverse debugging is enabled and send capabilities
			if (Settings.launch.history.reverseDebugInstructionCount > 0) {
				// Enable reverse debugging
				this.sendEvent(new CapabilitiesEvent({supportsStepBack: true}));
			}
		}

		// Return
		this.sendResponse(response);
	}


	/**
	 * Starts the emulator and sets up everything for setup after
	 * connection is up and running.
	 * @returns A Promise with an error text or undefined if no error.
	 */
	protected async startEmulator(): Promise<string | undefined> {
		// Reset all decorations
		Decoration.clearAllDecorations();

		// Create the registers
		Z80RegistersClass.createRegisters();

		// Make sure the history is cleared
		CpuHistoryClass.setCpuHistory(undefined);

		// Create the Remote
		RemoteFactory.createRemote(Settings.launch.remoteType);

		Remote.on('warning', message => {
			// Some problem occurred
			this.showWarning(message);
		});

		Remote.on('debug_console', message => {
			// Show the message in the debug console
			this.debugConsoleIndentedText(message);
		});

		Remote.once('error', err => {
			// Some error occurred
			Remote.disconnect();
			this.terminate(err.message);
		});

		Remote.once('terminated', message => {
			// Emulator has been terminated (e.g. by unit tests)
			this.terminate(message);
		});

		// Check if a cpu history object has been created by the Remote.
		if (!(CpuHistory as any)) {
			// If not create a lite (step) history
			CpuHistoryClass.setCpuHistory(new StepHistoryClass());
		}

		Remote.on('coverage', coveredAddresses => {
			// coveredAddresses: Only diff of addresses since last step-command.
			this.delayedDecorations.push(() => {
				// Covered addresses (since last break) have been sent
				Decoration.showCodeCoverage(coveredAddresses);
			});
		});

		StepHistory.on('revDbgHistory', addresses => {
			// addresses: The addresses (all) of the reverse history in the right order.
			this.delayedDecorations.push(() => {
				// Reverse debugging history addresses
				Decoration.showRevDbgHistory(addresses);
			});
		});

		StepHistory.on('historySpot', (startIndex, addresses, registers) => {
			// addresses: All addresses of the history spot.
			this.delayedDecorations.push(() => {
				// Short history addresses
				Decoration.showHistorySpot(startIndex, addresses, registers);
			});
		});

		return new Promise<undefined>(async (resolve, reject) => {	// For now there is no unsuccessful (reject) execution
			Remote.once('initialized', async (text) => {
				// Print text if available, e.g. "dbg_uart_if initialized".
				if (text) {
					this.debugConsoleAppendLine(text);
				}

				// Load files
				try {
					// Reads the list file and also retrieves all occurrences of WPMEM, ASSERTION and LOGPOINT.
					Remote.readListFiles(Settings.launch);
					// This needs to be done after the labels have been read
					await Remote.initWpmemAssertionLogpoints();
				}
				catch (e) {
					// Some error occurred during loading, e.g. file not found.
					const error = e.message || "Error";
					Remote.terminate('Init remote (readListFiles): ' + error);
					reject(e);
					DebugSessionClass.singleton().unitTestsStartCallbacks?.reject(e);
					return;
				}

				// Instantiate file watchers for revEng auto re-load
				this.installReloadFileWatchers();

				// Get initial registers
				await Remote.getRegistersFromEmulator();
				await Remote.getCallStackFromEmulator();

				// Initialize Cpu- or StepHistory.
				if (!StepHistory.decoder)
					StepHistory.decoder = Z80Registers.decoder;
				StepHistory.init();

				// Run user commands after load.
				for (const cmd of Settings.launch.commandsAfterLaunch) {
					this.debugConsoleAppendLine(cmd);
					try {
						const outText = await this.evaluateCommand(cmd);
						this.debugConsoleAppendLine(outText);
					}
					catch (err) {
						// Some problem occurred
						const output = "Error while executing '" + cmd + "' in 'commandsAfterLaunch': " + err.message;
						this.showWarning(output);
					}
				}


				// Special handling for custom code
				if (Remote instanceof ZSimRemote) {
					// Start custom code (if not unit test)
					const zsim = Remote;
					if (this.state == DbgAdapterState.NORMAL) {
						// Special handling for zsim: Re-init custom code.
						zsim.customCode?.execute();
					}

					// At the end, if remote type == ZX simulator, open its window.
					// Note: it was done this way and not in the Remote itself, otherwise
					// there would be a dependency in RemoteFactory to vscode which in turn
					// makes problems for the unit tests.
					// Adds a window that displays the ZX screen.
					new ZSimulationView(zsim); // NOSONAR
				}


				// Socket is connected, allow setting breakpoints
				this.sendEvent(new InitializedEvent());
				// Respond
				resolve(undefined);

				// Check if program should be automatically started
				StepHistory.clear();
				if (this.unitTestsStartCallbacks) {
					this.unitTestsStartCallbacks.resolve(this);
				}
				else {
					if (Settings.launch.startAutomatically) {
						setTimeout(() => {
							// Delay call because the breakpoints are set afterwards.
							this.handleRequest(undefined, async () => {
								// Normal operation
								return this.remoteContinue();
							});
						}, 500);
					}
					else {
						// Break
						this.sendEvent(new StoppedEvent('stop on start', DebugSessionClass.THREAD_ID));
					}
				}
			});

			// Initialize Remote
			try {
				await Remote.init();
			}
			catch (e) {
				// Some error occurred
				const error = e.message || "Error";
				Remote.terminate('Init remote: ' + error);
				reject(e);
				DebugSessionClass.singleton().unitTestsStartCallbacks?.reject(e);
			}
		});
	}


	/**
	 * The breakpoints are set for a path (file).
	 * @param response
	 * @param args lines=array with line numbers. source.path=the file path
	 */
	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
		const path = UnifiedPath.getUnifiedPath(<string>args.source.path);

		// convert breakpoints
		const givenBps = args.breakpoints || [];
		//console.log('setBreakPointsRequest:', givenBps);

		const bps = new Array<RemoteBreakpoint>();
		for (const bp of givenBps) {
			try {
				const log = Remote.evalLogMessage(bp.logMessage);
				const mbp: RemoteBreakpoint = {
					bpId: 0,
					filePath: path,
					lineNr: this.convertClientLineToDebugger(bp.line),
					longAddress: -1,	// not known yet
					condition: (bp.condition) ? bp.condition : '',
					log: log
				};
				bps.push(mbp);
			}
			catch (e) {
				// Show error
				this.showWarning(e.message);
			}
		}


		// Set breakpoints for the file.
		if (!Remote)
			console.log("Remote undefined"); // TODO: remove
		const currentBreakpoints = await Remote.setBreakpoints(path, bps);
		const source = this.createSource(path);
		// Now match all given breakpoints with the available.
		const vscodeBreakpoints = givenBps.map(gbp => {
			// Search in current list
			let foundCbp: RemoteBreakpoint|undefined;
			const lineNr = gbp.line;
			for (const cbp of currentBreakpoints) {
				const cLineNr = this.convertDebuggerLineToClient(cbp.lineNr);
				if (cLineNr == lineNr) {
					foundCbp = cbp;
					break;
				}
			}

			// Create vscode breakpoint with verification
			const verified = (foundCbp != undefined) && (foundCbp.longAddress >= 0);
			const bp = new Breakpoint(verified, lineNr, 0, source);
			if (foundCbp && foundCbp.longAddress >= 0) {
				// Add address to source name.
				const addrString = Utility.getLongAddressString(foundCbp.longAddress);
				// Add hover text
				let txt = addrString;
				const labels = Labels.getLabelsForNumber64k(foundCbp.longAddress);
				labels.forEach(lbl => txt += '\n' + lbl);
				(bp as any).message = txt;
			}

			// Additional print warning if not verified
			if (!verified) {
				const text = JSON.stringify(bp);
				this.debugConsoleAppendLine('Unverified breakpoint: ' + text);
				//console.log('Unverified breakpoint: ' + text);
				if (foundCbp && foundCbp.error) {
					this.debugConsoleAppendLine('  Additional info: ' + foundCbp.error);
					//console.log('  Additional info: ' + foundCbp.error);
				}
			}

			return bp;
		});

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: vscodeBreakpoints
		};
		this.sendResponse(response);
	}


	/**
	 * Returns the one and only "thread".
	 */
	protected async threadsRequest(response: DebugProtocol.ThreadsResponse): Promise<void> {
		// Just return a default thread.
		response.body = {
			threads: [
				new Thread(DebugSessionClass.THREAD_ID, "thread_default")
			]
		};
		this.sendResponse(response);
	}



	/**
	 * Creates a source reference from the filePath.
	 * @param filePath
	 * @returns undefined if filePath is ''.
	 */
	private createSource(filePath: string): Source | undefined {
		if (filePath.length == 0)
			return undefined;
		const uFilePath = UnifiedPath.getUnifiedPath(filePath);
		const fname = UnifiedPath.basename(uFilePath);
		const debPath = this.convertDebuggerPathToClient(uFilePath);
		const uDebPath = UnifiedPath.getUnifiedPath(debPath);
		return new Source(fname, uDebPath, undefined, undefined, undefined);
	}


	/**
	 * Returns the stack frames.
	 */
	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, _args: DebugProtocol.StackTraceArguments): Promise<void> {
		// vscode sometimes sends 2 stack trace requests one after the other. Because the lists are cleared this can lead to race conditions.
		this.stackTraceResponses.push(response);
		if (this.stackTraceResponses.length > 1)
			return;

		// Get the call stack trace.
		let callStack;
		if (StepHistory.isInStepBackMode()) {
			// Get callstack
			callStack = StepHistory.getCallStack();
		}
		else {
			// Get callstack
			callStack = await Remote.getCallStackCache();
		}

		// Go through complete call stack and get the sources.
		// If no source exists the stack frame will have 'src' as undefined.
		const [sfrs, longCallstackAddresses] = this.stackFramesForCallStack(callStack);

//  TODO: setDisasmCoverageDecoration nicht vergessen

		try {
			// Do a new disassembly if necessary.
			const disasmUpdated = await Disassembly.setNewAddresses(longCallstackAddresses);


			// Update disasm.list
			if (disasmUpdated)
			{
				// Update the disasm.list editor
				const disasmTextDoc = await this.getOrCreateDisasmTextDoc();
				const prevLineCount = disasmTextDoc.lineCount;
				const newText = Disassembly.getDisassemblyText();

				// Save all breakpoints
				const prevBpAddresses = this.getDisassemblyBreakpoints();

				// Add new disassembly at the end
				const edit = new vscode.WorkspaceEdit();
				const uri = disasmTextDoc.uri;
				edit.insert(uri, new vscode.Position(prevLineCount, 0), newText);
				// Remove old text
				edit.delete(uri, new vscode.Range(0, 0, prevLineCount, 0));

				// Apply changes
				await vscode.workspace.applyEdit(edit);

				// Check all breakpoints
				this.disassemblyReassignBreakpoints(prevBpAddresses);

				// If disassembly text editor is open, then show decorations and update break reason
				const docEditors = this.getEditorsForTextDoc(disasmTextDoc);
				for (const editor of docEditors) {
					Decoration.setDisasmCoverageDecoration(editor);
				}
				Decoration.showBreak();	// update

				// Save after edit (to be able to set breakpoints)
				await disasmTextDoc.save();
			}
		}
		catch (e) {
			console.log(e);
		}

		// Get lines for addresses for the disassembly
		this.addDisasmSourceInfo(sfrs);

		// Send as often as there have been requests
		while (this.stackTraceResponses.length > 0) {
			const resp = this.stackTraceResponses[0];
			this.stackTraceResponses.shift();
			resp.body = {stackFrames: sfrs, totalFrames: 1};
			this.sendResponse(resp);
		}

		// At the end of the stack trace request the collected decoration events
		// are executed. This is because the disasm.list did not exist before und thus
		// events like 'historySpot' would be lost.
		// Note: codeCoverage is handled differently because it is not sent during
		// step-back.
		this.processDelayedDecorations();
	}


	/**
	 * Returns the StackFrames for a given callstack.
	 * I.e. converts into files/lines for vscode.
	 * Is called at the start of the stackTraceRequest to determine what needs to be disassembled.
	 * @param callStack The callstack from the Remote.
	 * @returns [sfrs, addresses] The StackFrames (StackFrameAddrs) for vscode and a list of
	 * addresses without reference to a file. (For the disassembly)
	 */
	protected stackFramesForCallStack(callStack: RefList<CallStackFrame>): [StackFrameAddr[], number[]] {
		const frameCount = callStack.length;
		const sfrs: StackFrameAddr[] = [];
		const longFetchAddresses: number[] = [];
		for (let index = frameCount - 1; index >= 0; index--) {
			const frame = callStack[index];
			// Get file for address
			const addr = frame.addr;
			const file = Labels.getFileAndLineForAddress(addr);
			// Store file, if it does not exist the name is empty
			let src;
			if (file.size > 0)
				src = this.createSource(file.fileName);
			const lineNr = (src) ? this.convertDebuggerLineToClient(file.lineNr) : 0;
			const sf = new StackFrameAddr(index + 1, frame.name, src, lineNr);
			sf.longAddress = addr;
			sfrs.push(sf);
			if (!src) {
				// Add to fetch addresses for disassembly
				longFetchAddresses.push(addr);
			}
		}
		return [sfrs, longFetchAddresses];
	}


	/**
	 * Returns the StackFrames for a given callstack.
	 * I.e. converts into files/lines for vscode.
	 * Called at the end of the stackTraceRequest to fill the missing
	 * source files.
	 * @param sfrs Some of the sfrs[n].src is undefined. These will be filled with the info from the disasm.list.
	 * @returns [sfrs, addresses] The StackFrames (StackFrameAddrs) for vscode and a list of
	 * addresses without reference to a file. (For the disassembly)
	 */
	protected addDisasmSourceInfo(sfrs: StackFrameAddr[]) {
		for (const sf of sfrs) {
			if (!sf.source) {
				// Get line number for stack address from disassembly
				const addr = sf.longAddress;
				const lineNr = Disassembly.getLineForAddress(addr);
				if (lineNr != undefined) {
					// Store
					sf.source = this.createSource(DisassemblyClass.getAbsFilePath());
					sf.line = this.convertDebuggerLineToClient(lineNr);
				}
			}
		}
	}


	/**
	 * Opens the text document for disasm.list.
	 * If it does not exist, it is created.
	 * @return The text document associated with disasm.list.
	 */
	protected async getOrCreateDisasmTextDoc(): Promise<vscode.TextDocument> {
		const absFilePath = DisassemblyClass.getAbsFilePath();
		const uri = vscode.Uri.file(absFilePath);
		let disasmTextDoc;
		try {
			disasmTextDoc = await vscode.workspace.openTextDocument(uri);
		}
		catch (e) {
			// If file does not exist, create it
			const editCreate = new vscode.WorkspaceEdit();
			editCreate.createFile(uri);
			await vscode.workspace.applyEdit(editCreate);
			disasmTextDoc = await vscode.workspace.openTextDocument(uri);
		}
		Utility.assert(disasmTextDoc);
		// Set the right language ID, so that editor title menu buttons can be assigned
		vscode.languages.setTextDocumentLanguage(disasmTextDoc, 'disassembly');
		return disasmTextDoc;
	}


	/**
	 * Returns the TextEditors currently visible for a given doc.
	 * @param doc The doc to search for.
	 * @returns An array of editors. Can be empty or contain even more than 1 editor for the same document.
	 */
	protected getEditorsForTextDoc(doc: vscode.TextDocument): vscode.TextEditor[] {
		const docEditors: vscode.TextEditor[] = [];
		const editors = vscode.window.visibleTextEditors;
		for (const editor of editors) {
			if (editor.document == doc) {
				docEditors.push(editor);
			}
		}
		return docEditors;
	}


	/**
	 * This is called at the end of a stack trace request btu also when a unit test case was finished debugging.
	 * Writes everything in 'delayedDecorations' into the decorations.
	 */
	protected processDelayedDecorations() {
		for (const func of this.delayedDecorations)
			func();
		this.delayedDecorations.length = 0;
	}


	/**
	 * Searches for filename and line number first in Labels.
	 * If not found it checks the disasm.list
	 * @param addr The address (long address)
	 * @returns uri and line number. If not found uri is undefined.
	 */
	protected getLocationForAddress(addr: number): {uri: vscode.Uri, lineNr: number} {
		let uri;
		let {fileName, lineNr} = Labels.getFileAndLineForAddress(addr);
		if (!fileName) {
			// Check disassembly
			lineNr = Disassembly.getLineForAddress(addr) as number;
			if (lineNr!= undefined) {
				// Found
				fileName = DisassemblyClass.getAbsFilePath();
			}
		}
		if(fileName) {
			// Found in other file
			uri = vscode.Uri.file(fileName);
		}
		return {uri, lineNr};
	}


	/**
	 * Returns all source breakpoints of teh disassembly together with
	 * their addresses.
	 */
	protected getDisassemblyBreakpoints(): SbpAddr[] {
		// Get all source breakpoints of the disassembly file.
		const bps = vscode.debug.breakpoints as vscode.SourceBreakpoint[];
		const filePath = DisassemblyClass.getAbsFilePath();
		const sbps = bps.filter(bp => {
			if (bp.location) {
				const sbpSrc = bp.location.uri.fsPath;
				if (sbpSrc == filePath)
					return true;
			}
			return false;
		});

		// Create an array with breakpoints + addresses
		const sbpAddrs = sbps.map(sbp => {
			const lineNr = sbp.location.range.start.line;	// lineNr: 0-indexed
			const bpAddr: SbpAddr = {
				sbp,
				// Get address from previous disassembly
				longAddress: Disassembly.getAddressForLine(lineNr),
				// Save original line number
				lineNr: sbp.location.range.start.line
			}
			return bpAddr;
		});

		return sbpAddrs;
	}


	/**
	 * Reassigns the breakpoints to the disassembly and list file(s).
	 * @param sbpAddrs A list with source breakpoints plus addresses.
	 */
	protected disassemblyReassignBreakpoints(sbpAddrs: SbpAddr[]) {
		// Loop all old breakpoints
		const reassignedBps: vscode.SourceBreakpoint[] = [];
		for (const sbpAddr of sbpAddrs) {
			const sbp = sbpAddr.sbp;
			const addr = sbpAddr.longAddress;
			// Check for address
			if (addr >= 0) {
				// Get the new file/line for the address
				const {uri, lineNr} = this.getLocationForAddress(addr);
				if (uri) {
					// Create bp with new location
					const nLoc = new vscode.Location(uri, new vscode.Position(lineNr, 0));	// lineNr: 0-indexed
					const nbp = new vscode.SourceBreakpoint(nLoc, sbp.enabled, sbp.condition, sbp.hitCondition, sbp.logMessage);
					// Store
					reassignedBps.push(nbp);
				}
			}
		}
		// Re-assign breakpoints
		vscode.debug.addBreakpoints(reassignedBps);	// Takes a 0-indexed lineNr and sets it at the 1-based vscode line
		//console.log('Re-assigned BPs:', reassignedBps);
	}


	/**
	 * Returns the different scopes. E.g. 'Disassembly' or 'Registers' that are shown in the Variables area of vscode.
	 * @param response
	 * @param args
	 */
	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): Promise<void> {
		//this.listVariables.tmpList.clear();		// Clear temporary list.
		const frameId = args.frameId;
		//const frame = this.listFrames.getObject(frameId);
		let frame;
		if (StepHistory.isInStepBackMode())
			frame = StepHistory.getCallStack().getObject(frameId);
		else {
			await Remote.getCallStackCache();	// make sure listFrames exist
			frame = Remote.getFrame(frameId);
		}
		if (!frame) {
			// No frame found, send empty response
			response.body = {scopes: []};
			this.sendResponse(response);
			return;
		}

		// Set disassembly address
		this.disassemblyVar.address = frame.addr & 0xFFFF;

		// Create variable object for the stack
		this.localStackVar.setFrameAddress(frame.stack, frame.stackStartAddress);

		// Send response
		response.body = {scopes: this.scopes};
		this.sendResponse(response);
	}


	/**
	 * Returns the variables for the scopes (e.g. 'Disassembly' or 'Registers')
	 * @param response
	 * @param args
	 */
	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): Promise<void> {
		// Get the associated variable object
		const ref = args.variablesReference;
		const varObj = this.listVariables.getObject(ref);
		// Check if object exists
		if (varObj) {
			// Get contents
			const varList = await varObj.getContent(args.start, args.count);
			response.body = {variables: varList};
		}
		else {
			// Return empty list
			response.body = {variables: new Array<DebugProtocol.Variable>()};
		}
		this.sendResponse(response);
	}


	/**
	 * Decorates the current PC source line with a reason.
	 * @param "Breakpoint fired: PC=811EH" or undefined (prints nothing)
	 */
	public decorateBreak(breakReason: string) {
		if (!breakReason)
			return;
		// Get PC
		const pc = Remote.getPCLong();
		Decoration.showBreak(pc, breakReason);
	}


	/**
	 * This method is called before a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 */
	protected startProcessing() {
		// Start processing
		this.processingSteppingRequest = true;
		// Reset pause request
		this.pauseRequested = false;
		// Clear decorations
		Decoration.clearBreak();
		// Do the same for the Remote
		Remote.startProcessing();
	}


	/**
	 * This method is called after a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 */
	protected stopProcessing() {
		// Stop processing
		this.processingSteppingRequest = false;
		// Do the same for the Remote
		Remote.stopProcessing();
	}


	/**
	  * vscode requested 'continue'.
	  * @param response
	  * @param args
	  */
	public async continueRequest(response: DebugProtocol.ContinueResponse, _args: DebugProtocol.ContinueArguments): Promise<void> {
		this.handleRequest(response, async () => {
			let event;

			// Check for reverse debugging.
			if (StepHistory.isInStepBackMode()) {
				await this.startStepInfo('Continue');
				// Continue
				const breakReason = await StepHistory.continue();

				// Check for output.
				if (breakReason) {
					this.debugConsoleIndentedText(breakReason);
					// Show break reason
					this.decorateBreak(breakReason);
				}
				// Send event
				event = new StoppedEvent('step', DebugSessionClass.THREAD_ID);
			}
			else {
				// Normal operation
				event = await this.remoteContinue();
			}

			// Return
			return event;
		});
	}


	/**
	 * Calls 'continue' (run) on the remote (emulator).
	 * Called at the beginning (startAutomatically) and from the
	 * vscode UI (continueRequest).
	 */
	public async remoteContinue(): Promise<StoppedEvent> {
		await this.startStepInfo('Continue');

		Decoration.clearBreak();
		StepHistory.clear();

		const breakReasonString = await Remote.continue();
		// It returns here not immediately but only when a breakpoint is hit or pause is requested.

		// Safety check on termination
		if (Remote == undefined)
			return new StoppedEvent('exception', DebugSessionClass.THREAD_ID);

		// Display break reason
		if (breakReasonString) {
			// Send output event to inform the user about the reason
			this.debugConsoleIndentedText(breakReasonString);

			// Use reason for break-decoration.
			this.decorateBreak(breakReasonString);
		}

		// Display T-states and time
		await this.endStepInfo();

		// Check if in unit test mode
		if (this.state == DbgAdapterState.UNITTEST) {
			const finished = await Z80UnitTestRunner.dbgCheckUnitTest(breakReasonString);
			if (!finished) {
				this.sendEventBreakAndUpdate();
			}
			// Send no further break
			return undefined as any;
		}

		// Send break
		return new StoppedEvent('break', DebugSessionClass.THREAD_ID);
	}


	/**
	 * Is called by unit tests to simulate a 'break'.
	 */
	public async sendEventBreakAndUpdate(): Promise<void> {
		// Update memory dump etc.
		this.update();
		// Send event
		this.sendEvent(new StoppedEvent('break', DebugSessionClass.THREAD_ID));
	}


	/**
	 * Sends a continued event to update the UI.
	 */
	public sendEventContinued() {
		// Send event
		this.sendEvent(new ContinuedEvent(DebugSessionClass.THREAD_ID));
	}


	/**
	  * vscode requested 'pause'.
	  * @param response
	  * @param args
	  */
	protected async pauseRequest(response: DebugProtocol.PauseResponse, _args: DebugProtocol.PauseArguments): Promise<void> {
		try {
			this.pauseRequested = true;
			// Pause the remote or the history
			if (StepHistory.isInStepBackMode())
				StepHistory.pause();
			else
				await Remote.pause();
		}
		catch (e) {
			this.showError(e.message);
		}
		// Response
		this.sendResponse(response);
	}


	/**
	 * vscode requested 'reverse continue'.
	 * @param response
	 * @param args
	 */
	protected async reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, _args: DebugProtocol.ReverseContinueArguments): Promise<void> {
		this.handleRequest(response, async () => {
			// Output
			await this.startStepInfo('Reverse-Continue', true);

			// Reverse continue
			const breakReason = await StepHistory.reverseContinue();

			// Check for output.
			if (breakReason) {
				this.debugConsoleIndentedText(breakReason);
				// Show break reason
				this.decorateBreak(breakReason);
			}
			// Send event
			return new StoppedEvent('break', DebugSessionClass.THREAD_ID);
		}, 100);
	}


	/**
	 * Is called by all request (step, stepInto, continue, etc.).
	 * This handles the display in the vscode UI.
	 * If the command can be handled in a short amount of time (e.g. in 1 sec)
	 * then the response is sent after the command.
	 * When the response is received by vscode it changes the current highlighted line
	 * into an un-highlighted state and shows the 'pause' button.
	 * I.e. for short commands this could lead to flickering, but if the
	 * UI is changed after command no flickering appears.
	 * On the other hand, if a command takes too long it is necessary to show
	 * the 'pause' button. So a timer assures that the response is sent after a timeout.
	 * The function takes care that the response is sent only once.
	 */
	protected handleRequest(response: any, command: () => Promise<StoppedEvent>, responseTime = 750) {
		if (this.processingSteppingRequest) {
			// Response is sent immediately if already something else going on
			this.sendResponse(response);
			return;
		}

		// Start processing
		this.startProcessing();

		// Start timer to send response for long running commands
		let respTimer: NodeJS.Timeout | undefined;
		if (response) {
			respTimer = setTimeout(() => {
				// Send response after a short while so that the vscode UI can show the break button
				respTimer = undefined;
				this.sendResponse(response);
			}, responseTime);	// 1 s
		}

		// Start command
		(async () => {
			const event = await command();

			// Note: On termination/restart Remote could be undefined
			if (!Remote)
				return;

			// End processing
			this.stopProcessing();

			// Update memory dump etc. (also in reverse debug because of the register display)
			this.update({step: true});

			// Show decorations
			//await Remote.getRegisters();
			StepHistory.emitHistory();

			// Send response
			if (respTimer) {
				// If not already done before
				clearTimeout(respTimer);
				this.sendResponse(response);
			}

			// Send event
			if (event)
				this.sendEvent(event);
		})();
	}


	/**
	  * vscode requested 'step over'.
	  * @param response	Sends the response. If undefined nothing is sent. Used by Unit Tests.
	  * @param args
	  */
	protected async nextRequest(response: DebugProtocol.NextResponse, _args: DebugProtocol.NextArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Over');

			// T-states info and lite history
			const stepBackMode = StepHistory.isInStepBackMode();

			// The stepOver should also step over macros, fake instructions, several instruction on the same line.
			// Therefore the stepOver is repeated until really a new
			// file/line correspondents to the PC value.
			//Remote.getRegisters();
			const prevPc = Remote.getPCLong();
			const prevFileLoc = Labels.getFileAndLineForAddress(prevPc);
			let i = 0;
			let breakReason;
			const timeWait = new TimeWait(500, 200, 100);
			while (true) {
				i++;

				// Give vscode some time for a break
				await timeWait.waitAtInterval();

				// Print instruction
				const instr = await this.getCurrentInstruction(i);
				if (instr)
					this.debugConsoleIndentedText(instr);

				// Check for reverse debugging.
				if (stepBackMode) {
					// Step-Over
					breakReason = await StepHistory.stepOver();
				}
				else {
					// Normal Step-Over
					breakReason = await Remote.stepOver();
				}

				// Check for pause request
				if (this.pauseRequested) {
					breakReason = "Manual break";
				}

				// Leave loop in case there is a break reason
				if (breakReason) {
					// Stop
					break;
				}

				// Get new file/line location
				//await Remote.getRegisters();
				const pc = Remote.getPCLong();
				const nextFileLoc = Labels.getFileAndLineForAddress(pc);
				// Compare with start location
				if (prevFileLoc.fileName == '')
					break;
				if (nextFileLoc.lineNr != prevFileLoc.lineNr)
					break;
				if (nextFileLoc.fileName != prevFileLoc.fileName)
					break;
			}

			// Check for output.
			if (breakReason) {
				// Show break reason
				this.debugConsoleIndentedText(breakReason);
				this.decorateBreak(breakReason);
			}


			// Print T-states
			if (!stepBackMode) {
				// Display T-states and time
				await this.endStepInfo();
			}

			// Check if in unit test mode
			if (this.state == DbgAdapterState.UNITTEST) {
				await Z80UnitTestRunner.dbgCheckUnitTest(breakReason);
			}

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		}, 100);
	}


	/**
	 * Starts to print the step info. Use in conjunction with 'endStepInfo'.
	 * Resets the t-states.
	 * Print text to debug console.
	 * Adds prefix "Time-travel " if in reverse debug mode or alwaysHistorical is true.
	 * Adds suffix " (Lite)" if no true stepping is done.
	 * @param text E.g. "Step-into"
	 * @param alwaysHistorical Prints prefix "Time-travel " even if not (yet) in back step mode.
	 */
	protected async startStepInfo(text?: string, alwaysHistorical = false): Promise<void> {
		//Log.log('startStepInfo ->');
		// Print text
		const stepBackMode = StepHistory.isInStepBackMode() || alwaysHistorical;
		if (text) {
			if (stepBackMode) {
				text = 'Time-travel ' + text;
				if (!(CpuHistory as any))
					text += ' (Lite)';
			}
			this.debugConsoleAppendLine(text);
		}

		// If not in step back mode
		if (!stepBackMode) {
			// Checks if lite history is used.
			// If so, store the history.
			if (!(CpuHistory as any)) {
				// Store as (lite step history)
				const regsCache = Z80Registers.getCache();
				StepHistory.pushHistoryInfo(regsCache);
				const callStack = await Remote.getCallStackCache();
				StepHistory.pushCallStack(callStack);
			}
			// Reset t-states counter
			await Remote.resetTstates();
		}
		//Log.log('startStepInfo <-');
	}


	/**
	 * Prints a text, the disassembly and the used T-states and time to the debug console.
	 * Assumes that something like "StepInto" has been printed before.
	 * @param disasm The corresponding disassembly.
	 */
	protected async endStepInfo(): Promise<void> {
		// Get used T-states
		const tStates = await Remote.getTstates();
		// Display T-states and time
		let tStatesText;
		if (tStates) {
			tStatesText = 'T-States: ' + tStates;
			// Get frequency
			const cpuFreq = await Remote.getCpuFrequency();
			if (cpuFreq) {
				// Time
				let time = tStates / cpuFreq;
				let unit = 's';
				if (time < 1e-3) {
					time *= 1e+6;
					unit = 'us';
				}
				else if (time < 1) {
					time *= 1e+3;
					unit = 'ms';
				}
				// CPU clock
				let clockStr = (cpuFreq * 1E-6).toPrecision(2);
				if (clockStr.endsWith('.0'))
					clockStr = clockStr.substring(0, clockStr.length - 2);
				tStatesText += ', time: ' + time.toPrecision(3) + unit + '@' + clockStr + 'MHz';
			}
		}

		if (tStatesText)
			this.debugConsoleIndentedText(tStatesText);
	}


	/**
	 * Returns the address and current instruction (at PC) as string.
	 * Works in step-back and in normal mode.
	 * Note: Does not retrieve the current PC from the remote.
	 * @param count Optional. If count is bigger than e.g. 10 only "..." is returned.
	 * If even bigger, undefined is returned.
	 * @returns E.g. "8000 LD A,6"
	 */
	protected async getCurrentInstruction(count = 0): Promise<string | undefined> {
		const maxInstructionCount = 10;
		const pc = Remote.getPC();
		const pcStr = Utility.getHexString(pc, 4);
		// Check if count too high
		if (count == maxInstructionCount)
			return pcStr + ' ...';
		if (count > maxInstructionCount)
			return undefined;

		// Get instruction
		let disInstr;
		const stepBackMode = StepHistory.isInStepBackMode();
		if (stepBackMode) {
			// Reverse debug mode
			disInstr = StepHistory.getCurrentInstruction();
		}
		else {
			// Normal mode: Disassemble instruction
			const data = await Remote.readMemoryDump(pc, 4);
			disInstr = SimpleDisassembly.getInstruction(pc, data);
		}
		// Construct result string
		let result;
		if (disInstr)
			result = pcStr + " " + disInstr;
		return result;
	}


	/**
	  * vscode requested 'step into'.
	  * @param response
	  * @param args
	  */
	protected async stepInRequest(response: DebugProtocol.StepInResponse, _args: DebugProtocol.StepInArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Into');

			// Print instruction
			const instr = await this.getCurrentInstruction();
			if (instr)
				this.debugConsoleIndentedText(instr);

			// Check for reverse debugging.
			let breakReason;
			const stepBackMode = StepHistory.isInStepBackMode();
			if (stepBackMode) {
				// StepInto
				breakReason = await StepHistory.stepInto();
			}
			else {
				// Step-Into
				StepHistory.clear();
				// Step into
				breakReason = await Remote.stepInto();
			}

			// Check for output.
			if (breakReason) {
				this.debugConsoleIndentedText(breakReason);
				// Show break reason
				this.decorateBreak(breakReason);
			}

			if (!stepBackMode) {
				// Display info
				await this.endStepInfo();
			}

			// Check if in unit test mode
			if (this.state == DbgAdapterState.UNITTEST) {
				await Z80UnitTestRunner.dbgCheckUnitTest(breakReason);
			}

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		});
	}


	/**
	 * vscode requested 'step out'.
	 * @param response
	 * @param args
	 */
	protected async stepOutRequest(response: DebugProtocol.StepOutResponse, _args: DebugProtocol.StepOutArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Out');

			// Check for reverse debugging.
			let breakReasonString;
			const stepBackMode = StepHistory.isInStepBackMode();
			if (stepBackMode) {
				// StepOut
				breakReasonString = await StepHistory.stepOut();
			}
			else {
				// Normal Step-Out
				StepHistory.clear();
				breakReasonString = await Remote.stepOut();
			}

			// Print break reason
			if (breakReasonString) {
				// Output a possible problem (end of log reached)
				this.debugConsoleIndentedText(breakReasonString);
				// Show break reason
				this.decorateBreak(breakReasonString);
			}

			if (!stepBackMode) {
				// Display info
				await this.endStepInfo();
			}

			// Check if in unit test mode
			if (this.state == DbgAdapterState.UNITTEST) {
				await Z80UnitTestRunner.dbgCheckUnitTest(breakReasonString);
			}

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		});
	}


	/**
	  * vscode requested 'step backwards'.
	  * @param response
	  * @param args
	  */
	protected async stepBackRequest(response: DebugProtocol.StepBackResponse, _args: DebugProtocol.StepBackArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Back', true);

			// Step back
			const breakReason = await StepHistory.stepBack();

			// Print break reason
			if (breakReason) {
				// Output a possible problem (end of log reached)
				this.debugConsoleIndentedText(breakReason);
				// Show break reason
				this.decorateBreak(breakReason);
			}
			else {
				// Print instruction (it's only printed if no error, as the
				// only error that can occur is 'start of history reached'.
				const instr = await this.getCurrentInstruction();
				if (instr)
					this.debugConsoleIndentedText(instr);
			}

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		});
	}


	/**
	 * Sets the value of an expression from the WATCH pane.
	 * Does so only for the top level. I.e. if top level is an L-value.
	 * E.g. a byte to change.
	 * For structures or memory array is is already supported by the
	 * StructVar and MemDumpVar.
	 */
	protected async setExpressionRequest(response: DebugProtocol.SetExpressionResponse, args: DebugProtocol.SetExpressionArguments, _request?: DebugProtocol.Request) {
		response.success = false;	// will be changed if successful.
		// Get immediate value
		const item = this.constExpressionsList.get(args.expression);
		if (item && item.immediateValue) {
			// Now set the value.
			const value = Utility.parseValue(args.value);
			const formattedString = await item.immediateValue.setValue(value);
			if (formattedString) {
				response.body = {value: formattedString};
				response.success = true;
				if (ShallowVar.memoryChanged) {
					await this.memoryHasBeenChanged();
					this.sendEvent(new InvalidatedEvent(['variables']));	// E.g. the disassembly would need to be updated on memory change
				}
				ShallowVar.clearChanged();
			}
		}
		this.sendResponse(response);
	}


	/**
	 * Evaluates the command and executes it.
	 * The method might throw an exception if it cannot parse the command.
	 * @param command E.g. "-exec tbblue-get-register 57" or "-wpmem disable".
	 * @returns A Promise<string> with an text to output (e.g. an error).
	 */
	protected async evaluateCommand(command: string): Promise<string> {
		const expression = command.trim().replace(/\s+/g, ' ');
		const tokens = expression.split(' ');
		const cmd = tokens.shift();
		if (!cmd)
			throw Error("No command.");

		// Check for "-view"
		let viewTitle;
		if (tokens[0] == '-view') {
			tokens.shift();
			viewTitle = cmd.substring(1) + ' ' + tokens.join(' ');	// strip '-'
		}

		// All commands start with "-"
		let output;
		if (cmd == '-help' || cmd == '-h') {
			output = await this.evalHelp(tokens);
		}
		else if (cmd == '-ASSERTION' || cmd == '-assertion') {
			output = await this.evalASSERTION(tokens);
		}
		else if (cmd == '-eval') {
			output = await this.evalEval(tokens);
		}
		else if (cmd == '-exec' || cmd == '-e') {
			output = await this.evalExec(tokens);
		}
		else if (cmd == '-label' || cmd == '-l') {
			output = await this.evalLabel(tokens);
		}
		else if (cmd == '-LOGPOINT' || cmd == '-logpoint') {
			output = await this.evalLOGPOINT(tokens);
		}
		else if (cmd == '-md') {
			output = await this.evalMemDump(tokens);
		}
		else if (cmd == '-msetb') {
			output = await this.evalMemSetByte(tokens);
		}
		else if (cmd == '-msetw') {
			output = await this.evalMemSetWord(tokens);
		}
		else if (cmd == '-ms') {
			output = await this.evalMemSave(tokens);
		}
		else if (cmd == '-mv') {
			output = await this.evalMemViewByte(tokens);
		}
		else if (cmd == '-mvw') {
			output = await this.evalMemViewWord(tokens);
		}
		else if (cmd == '-rmv') {
			output = await this.evalRegisterMemView(tokens);
		}
		else if (cmd == '-dasm') {
			output = await this.evalDasm(tokens);
		}
		else if (cmd == '-patterns') {
			output = await this.evalSpritePatterns(tokens);
		}
		else if (cmd == '-WPMEM' || cmd == '-wpmem') {
			output = await this.evalWPMEM(tokens);
		}
		else if (cmd == '-wpadd') {
			output = await this.evalWpAdd(tokens);
		}
		else if (cmd == '-wprm') {
			output = await this.evalWpRemove(tokens);
		}
		else if (cmd == '-reveng') {
			output = await this.evalRevEng(tokens);
		}
		else if (cmd == '-sprites') {
			output = await this.evalSprites(tokens);
		}
		else if (cmd == '-state') {
			output = await this.evalStateSaveRestore(tokens);
		}
		// Debug commands
		else if (cmd == '-dbg') {
			output = await this.evalDebug(tokens);
		}
		//
		else {
			// Unknown command
			throw Error("Unknown command: '" + expression + "'");
		}

		// Check for output target
		if (viewTitle) {
			// Output text to new view.
			const panel = new TextView(viewTitle, output);
			await panel.update();
			// Send empty response
			return 'OK';
		}
		else {
			// Output text to console
			return output;
		}
	}


	/**
	 * Is called when hovering or when an expression is added to the watches.
	 * Or if commands are input in the debug console.
	 * All have different formats:
	 * - hovering: "word", e.g. "data_b60" or ".loop" or "HL"
	 * - debug console: starts with "-", e.g. "-wpmem enable"
	 * - watch: anything else.
	 * args.context contains info that the request comes from the console, watch panel or hovering.
	 * 'watch': evaluate is run in a watch.
	 * 'repl': evaluate is run from REPL console.
	 * 'hover': evaluate is run from a data hover.
	 */
	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
		Log.log('evaluate.expression: ' + args.expression);
		Log.log('evaluate.context: ' + args.context);

		// Check if its a debugger command
		const expression = args.expression.trim();
		const tokens = expression.split(' ');
		const cmd = tokens.shift();
		if (cmd == undefined) {
			this.sendResponse(response);
			return;
		}

		// Check context
		switch (args.context) {
			// Debug Console
			case 'repl':
				let text;
				try {
					text = await this.evaluateCommand(expression);
					response.body = {result: text + "\n\n", type: undefined, presentationHint: undefined, variablesReference: 0, namedVariables: undefined, indexedVariables: undefined};
				}
				catch (err) {
					text = "Error";
					if (err.message)
						text += ': ' + err.message;
				}
				response.body = {
					result: text + "\n\n",
					type: undefined,
					presentationHint: undefined,
					variablesReference: 0,
					namedVariables: undefined,
					indexedVariables: undefined
				};
				break;

			// Hover
			case 'hover':
				let formattedValue = '';
				try {
					// Check for registers
					if (Z80RegistersClass.isRegister(expression)) {
						formattedValue = await Utility.getFormattedRegister(expression, Z80RegisterHoverFormat);
					}
					else {
						// Label
						// Check if a 2nd line (memory content) is required
						//if (!Z80RegistersClass.isSingleRegister(expression)) {
						// If hovering only the label address + byte and word contents are shown.
						// First check for module name and local label prefix (sjasmplus).
						const pcLongAddr = Remote.getPCLong();
						const entry = Labels.getFileAndLineForAddress(pcLongAddr);
						// Local label and prefix
						const lastLabel = entry.lastLabel;
						const modulePrefix = entry.modulePrefix;
						// Get label value
						const labelValue = Utility.evalExpression(expression, true, modulePrefix, lastLabel);
						if (labelValue != undefined) {
							// Get content
							const memDump = await Remote.readMemoryDump(labelValue, 2);
							// Format byte
							const memByte = memDump[0];
							const formattedByte = Utility.numberFormattedSync(memByte, 1, Settings.launch.formatting.watchByte, true);
							// Format word
							const memWord = memByte + 256 * memDump[1];
							const formattedWord = Utility.numberFormattedSync(memWord, 2, Settings.launch.formatting.watchWord, true);
							// Format output
							const addrString = Utility.getHexString(labelValue, 4) + 'h';
							if (!formattedValue)
								formattedValue = expression + ': ' + addrString;
							// Second line
							formattedValue += '\n(' + addrString + ')b=' + formattedByte + '\n(' + addrString + ')w=' + formattedWord;
						}
						//}
					}
				}
				catch {
					// Ignore any error during hovering.
				}
				// Response
				response.body = {
					result: formattedValue,
					variablesReference: 0
				}
				break;

			// Watch
			case 'watch':
				try {
					// Create or get a variable (either a variable reference or an immediate value)
					const item = await this.evaluateLabelExpression(expression);
					let result = '';
					if (item.immediateValue) {
						// Fill in immediate value (varRef is 0)
						result = await item.immediateValue.getValue();
					}
					response.body = {
						result,
						variablesReference: item.varRef,
						type: item.description,
						indexedVariables: item.count
					};
				}	// try
				catch (e) {
					// Return empty response
					response.body = {
						result: e.message,
						variablesReference: 0
					}
				}
				break;
		}

		// Respond
		this.sendResponse(response);
	}


	/**
	 * Evaluates an expression/label and creates the ShallowVar structures.
	 * @param expression E.g. "main,2,10"
	 * @returns All that is required for the VARIABLES pane or WATCHES.
	 */
	protected async evaluateLabelExpression(expression: string): Promise<ExpressionVariable> {
		// Check if expression has been evaluated already
		const response = await this.constExpressionsList.get(expression);
		if (response)
			return response;

		// Check if it is a label (or double register). A label may have a special formatting:
		// Example: "LBL_TEXT[x],w,10"  = Address: LBL_TEXT+2*x, 10 words
		// or even a complete struct
		// "invaders,INVADER,5" = Address: invaders, INVADER STRUCT, 5 elements
		// If the count is > 1 then an array is displayed. If left then 1 is assumed.
		// If the type is left, 'b' is assumed, e.g. "LBL_TEXT,,5" will show an array of 5 bytes.
		// If both are omitted, e.g. "LBL_TEXT" just the byte value contents of LBL_TEXT is shown.

		// Get everything before ;
		let text = expression;
		const k = text.indexOf(';');
		if (k >= 0)
			text = text.slice(0, k);

		// Tokenize
		const tokens = text.split(',');
		if (tokens.length > 4)
			throw Error("Too many components in expression: " + expression);

		// Label
		let labelString = (tokens[0] || '').trim();	// May also contain a number (e.g. address)
		if (!labelString)
			throw Error("No expression found.");

		// Index inside label
		const matchIndex = /(.*)[^\[]*\[([^\]]+)\]/.exec(labelString);
		let lblIndexString = '';
		if (matchIndex) {
			labelString = matchIndex[1].trim();
			lblIndexString = matchIndex[2].trim();
		}

		// Label type etc.
		let lblType = (tokens[1] || '').trim();
		let elemCountString = (tokens[2] || '').trim();

		// Endianess
		const endianess = (tokens[3] || 'little').trim().toLowerCase();
		let littleEndian = true;
		if (endianess == 'big')
			littleEndian = false;	// At the moment it is used only for immediate values
		else if (endianess != 'little') {
			throw Error("Unknown endianes: " + endianess);
		}

		// Defaults
		let labelValue;
		let lastLabel;
		let modulePrefix;
		let lblIndex = 0;
		let elemCount = 1;	// Use 1 as default
		let elemSize = 1;	// Use 1 as default (if no type/size given)

		// First check for module name and local label prefix (sjasmplus).
		const pcLongAddr = Remote.getPCLong();
		const entry = Labels.getFileAndLineForAddress(pcLongAddr);
		// Local label and prefix
		lastLabel = entry.lastLabel;
		modulePrefix = entry.modulePrefix;
		// Convert label (+expression)
		labelValue = Utility.evalExpression(labelString, true, modulePrefix, lastLabel);

		if (isNaN(labelValue))
			throw Error("Could not parse label: " + labelString);

		// Get size from type
		if (lblType) {
			//elemSize = Labels.getNumberFromString64k(lblType);
			elemSize = Utility.evalExpression(lblType, true, modulePrefix, lastLabel);
			if (isNaN(elemSize))
				throw Error("Could not parse element size.");
			if (elemSize <= 0)
				throw Error("Element size must be > 0, is " + elemSize + ".");
		}

		// And index "[x]"
		if (lblIndexString) {
			lblIndex = Utility.evalExpression(lblIndexString, false, modulePrefix, lastLabel);
			if (isNaN(lblIndex))
				throw Error("Could not parse index.");
			if (lblIndex < 0)
				throw Error("Index must be > 0, is " + lblIndex + ".");
		}

		// Check count
		if (elemCountString) {
			elemCount = Utility.evalExpression(elemCountString, true, modulePrefix, lastLabel);
			if (isNaN(elemCount))
				throw Error("Could not parse element count.");
			if (elemCount <= 0)
				throw Error("Element count must be > 0, is " + elemCount + ".");
		}
		else {
			// If no count is given try to estimate it by calculating the distance to
			// the next label.
			// Note: labelValue is 64k only. So first check if the label name is simply a name without calculation.
			// If yes, use it. If no use labelValue.
			let distAddr = Labels.getNumberForLabel(labelString);
			// If not a long address then use the 64k value
			if (distAddr == undefined)
				distAddr = labelValue;
			// Try to get the distance to the next label:
			// Note: Does not work for structs as the next label would
			// be inside the struct.
			elemCount = Labels.getDistanceToNextLabel(distAddr as number) || 1;
			// Check special case
			if (!lblType && elemCount == 2) {
				// Special case: 1 word. Exchange size and count
				elemSize = 2;
				elemCount = 1;
			}
			else {
				// Divide elemCount by elemSize
				elemCount = Math.floor((elemCount + elemSize - 1) / elemSize);
				// Limit minimal number
				if (elemCount < 1)
					elemCount = 1;
				// Limit max. number
				if (elemCount > 1000)
					elemCount = 1000;
			}
		}

		// Add index
		const indexOffset = lblIndex * elemSize;
		const labelValue64k = (labelValue + indexOffset) & 0xFFFF;

		// Create fullLabel
		//const fullLabel = Utility.createFullLabel(labelString, "", lastLabel);	// Note: the module name comes from the PC location, this could be irritating. Therefore it is left off.
		// Create a label variable
		let labelVar;
		let immediateValue;
		// Check for sub labels (i.e. check for struct)
		let props;
		let propsLength = 0
		if (lblType != undefined) {
			props = Labels.getSubLabels(lblType);
			propsLength = props.length;
		}
		// Get sub properties
		if (propsLength == 0) {
			// Check for elem size. If bigger than 6 rounding errors could occur.
			if (elemSize > 6)
				throw Error('The size of an element must be smaller than 7.');
			// Check for single value or array (no sub properties)
			if (elemCount <= 1) {
				// Create variable
				immediateValue = new ImmediateMemoryValue(labelValue64k, elemSize, littleEndian);
			}
			else {
				// Simple memdump
				labelVar = new MemDumpVar(labelValue64k, elemCount, elemSize, littleEndian);
			}
		}
		else {
			// Not 1 or 2 was given as size but e.g. a struct label
			if (propsLength > 0) {
				// Structure
				labelVar = new StructVar(labelValue64k, elemCount, elemSize, lblType, props, this.listVariables, littleEndian);
			}
			if (!labelVar) {
				// Simple memdump
				labelVar = new MemDumpVar(labelValue64k, elemCount, elemSize, littleEndian);
			}
		}

		const description = Utility.getLongAddressString(labelValue64k);
		const varRef = this.listVariables.addObject(labelVar);
		const exprVar = {
			description,
			immediateValue,
			varRef,
			count: elemCount
		};

		// Check if the address is constant, i.e. it does not contain a register
		const exprContainsRegs = Utility.exprContainsMainRegisters(labelString);
		if (!exprContainsRegs) {
			// Store, it's address is constant
			this.constExpressionsList.set(expression, exprVar);
		}
		return exprVar;
	}


	/**
	 * Prints a help text for the debug console commands.
	 * @param tokens The arguments. Unused.
	   * @param A Promise with a text to print.
	 */
	protected async evalHelp(_tokens: Array<string>): Promise<string> {
		const output =
			`Allowed commands are:
"-ASSERTION enable|disable|status":
	- enable|disable: Enables/disables all breakpoints caused by ASSERTIONs set in the sources. All ASSERTIONs are by default enabled after startup of the debugger.
	- status: Shows enable status of ASSERTION breakpoints.
"-dasm address count": Disassembles a memory area. count=number of lines.
"-eval expr": Evaluates an expression. The expression might contain mathematical expressions and also labels. It will also return the label if
the value correspondends to a label.
"-exec|e cmd args": cmd and args are directly passed to ZEsarUX. E.g. "-exec get-registers".
"-help|h": This command. Do "-e help" to get all possible ZEsarUX commands.
"-label|-l XXX": Returns the matching labels (XXX) with their values. Allows wildcard "*".
"-LOGPOINT enable|disable|status [group]":
	- enable|disable: Enables/disables all logpoints caused by LOGPOINTs of a certain group set in the sources. If no group is given all logpoints are affected.
	All logpoints are by default disabled after startup of the debugger.
	- status: Shows enable status of LOGPOINTs per group.
"-md address size [dec|hex] [word] [little|big]": Memory dump at 'address' with 'size' bytes. Output is in 'hex' (default) or 'dec'imal. Per default data will be grouped in bytes.
  But if chosen, words are output. Last argument is the endianness which is little endian by default.
"-msetb address value [repeat]:"
	- address: The address to fill. Can also be a label or expression.
	- value: The byte value to set.
	- repeat: (Optional) How often the value is repeated.
	Examples:
	"-msetb 8000h 0Fh" : Puts a 15 into memory location 0x8000.
	"-msetb 8000h 0 100h" : fills memory locations 0x8000 to 0x80FF with zeroes.
	"-msetb fill_colors_ptr+4 FEh": If fill_colors_ptr is e.g. 0xCF02 the value FEh is put into location 0xCF06.
"-msetw address value [repeat [endianness]]:"
	- address: The address to fill. Can also be a label or expression.
	- value: The word value to set.
	- repeat: (Optional) How often the value is repeated.
	- endianness: (Optional) 'little' (default) or 'big'.
	Examples:
	"-msetw 8000h AF34h" : Puts 34h into location 0x8000 and AFh into location 0x8001.
	"-msetw 8000h AF34h 1 big" : Puts AFh into location 0x8000 and 34h into location 0x8001.
	"-msetw 8000h 1234h 100h" : fills memory locations 0x8000 to 0x81FF with the word value 1234h.
"-ms address size filename": Saves a memory dump to a file. The file is saved to the temp directory.
"-mv address size [address_n size_n]*": Memory view at 'address' with 'size' bytes. Will open a new view to display the memory contents.
"-patterns [index[+count|-endindex] [...]": Shows the tbblue sprite patterns beginning at 'index' until 'endindex' or a number of 'count' indices.
	The values can be omitted. 'index' defaults to 0 and 'count' to 1.
	Without any parameter it will show all sprite patterns.
	You can concat several ranges.
	Example: "-patterns 10-15 20+3 33" will show sprite patterns at index 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
"-rmv": Shows the memory register view. I.e. a dynamic view with the memory contents the registers point to.
"-sprites [slot[+count|-endslot] [...]": Shows the tbblue sprite registers beginning at 'slot' until 'endslot' or a number of 'count' slots.
  The values can be omitted. 'slot' defaults to 0 and 'count' to 1. You can concat several ranges.
	Example: "-sprite 10-15 20+3 33" will show sprite slots 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
	Without any parameter it will show all visible sprites automatically.
"-state save|restore|list|clear|clearall [statename]": Saves/restores the current state. I.e. the complete RAM + the registers.
"-wpadd address [size] [type]": Adds a watchpoint. See below.
"-wprm address [size] [type]": Removes a watchpoint.
	- address: The address to watch
	- size: The size of the area to watch. Can be omitted. Defaults to 1.
	- type:
	    - "r": Read watchpoint
	    - "w": Write watchpoint
	    - "rw": Read/write watchpoint. Default.
"-WPMEM enable|disable|status":
	- enable|disable: Enables/disables all WPMEM set in the sources. All WPMEM are by default enabled after startup of the debugger.
	- status: Shows enable status of WPMEM watchpoints.

Some examples:
"-exec h 0 100": Does a hexdump of 100 bytes at address 0.
"-e write-memory 8000h 9fh": Writes 9fh to memory address 8000h.
"-e gr": Shows all registers.
"-eval 2+3*5": Results to "17".
"-msetb mylabel 3": Sets the data at memory location 'mylabel' to 3.
"-mv 0 10": Shows the memory at address 0 to address 9.
"-sprites": Shows all visible sprites.
"-state save 1": Stores the current state as 'into' 1.
"-state restore 1": Restores the state 'from' 1.

Notes:
For all commands (if it makes sense or not) you can add "-view" as first parameter. This will redirect the output to a new view instead of the console.
E.g. use "-help -view" to put the help text in an own view.
`;

		this.sendEvent(new StoppedEvent('Value updated'));

		/*
		For debugging purposes there are a few more:
		-dbg serializer clear: Clears the call serializer queue.
		-dbg serializer print: Prints the current function. Use this to see where
		it hangs if it hangs. (Use 'setProgress' to debug.)
		*/
		return output;
	}


	/**
	 * Evaluates a given expression.
	 * @param tokens The arguments. I.e. the expression to evaluate.
	 * @returns A Promise with a text to print.
	 */
	protected async evalEval(tokens: Array<string>): Promise<string> {
		const expr = tokens.join(' ').trim();	// restore expression
		if (expr.length == 0) {
			// Error Handling: No arguments
			throw new Error("Expression expected.");
		}
		// Evaluate expression
		let result;
		// Evaluate
		const value = Utility.evalExpression(expr);
		// convert to decimal
		result = value.toString();
		// convert also to hex
		result += ', ' + value.toString(16).toUpperCase() + 'h';
		// convert also to bin
		result += ', ' + value.toString(2) + 'b';
		// check for label
		const labels = Labels.getLabelsPlusIndexForNumber64k(value);
		if (labels.length > 0) {
			result += ', ' + labels.join(', ');
		}

		return result;
	}


	/**
	 * Executes a command in the emulator.
	 * @param tokens The arguments. I.e. the command for the emulator.
	   * @returns A Promise with a text to print.
	 */
	protected async evalExec(tokens: Array<string>): Promise<string> {
		// Execute
		const machineCmd = tokens.join(' ');
		const textData = await Remote.dbgExec(machineCmd);
		// Return value
		return textData;
	}


	/**
	 * Evaluates a label.
	 * evalEval almost gives the same information, but evalLabel allows
	 * to use wildcards.
	 * @param tokens The arguments. I.e. the label. E.g. "main" or "mai*".
	   * @returns A Promise with a text to print.
	 */
	protected async evalLabel(tokens: Array<string>): Promise<string> {
		const expr = tokens.join(' ').trim();	// restore expression
		if (expr.length == 0) {
			// Error Handling: No arguments
			return "Label expected.";
		}

		// Find label with regex, every star is translated into ".*"
		const rString = '^' + expr.replace(/\*/g, '.*?') + '$';
		// Now search all labels
		const labels = Labels.getLabelsForRegEx(rString);
		let result = '';
		if (labels.length > 0) {
			labels.forEach(label => {
				let value = Labels.getNumberForLabel(label);
				if (value != undefined)
					value &= 0xFFFF;
				result += label + ': ' + Utility.getHexString(value, 4) + 'h\n';
			})
		}
		else {
			// No label found
			result = 'No label matches.';
		}
		// return result
		return result;
	}


	/**
	 * Shows a view with a memory dump.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemDump(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: Too less arguments
			throw Error("Address and size expected.");
		}

		// Address
		const addressString = tokens[0];
		const address = Utility.evalExpression(addressString);
		if (address < 0 || address > 0xFFFF)
			throw Error("Address (" + address + ") out of range.");

		// Size
		const sizeString = tokens[1];
		const size = Utility.evalExpression(sizeString);
		if (size < 0 || size > 0xFFFF)
			throw Error("Size (" + size + ") out of range.");

		// Byte or word
		let unitSize = 1; 	// Default=byte
		let bigEndian = false;
		// Hex/dec
		let hex = true;
		const typeString = tokens[2];
		if (typeString) {
			const typeStringLower = typeString.toLowerCase();
			if (typeStringLower != "hex" && typeStringLower != "dec" && typeStringLower != "word")
				throw Error("'hex', 'dec' or 'word' expected but got '" + typeString + "'.");
			let k = 2;
			// Check for hex or dec
			if (typeString == 'hex')
				k++;
			else if (typeString == 'dec') {
				hex = false;
				k++;
			}
			// Check for unit size (word)
			const unitSizeString = tokens[k];
			if (unitSizeString) {
				const unitSizeStringLower = unitSizeString.toLowerCase()
				if (unitSizeStringLower != "word")
					throw Error("'word' expected but got '" + unitSizeString + "'.");
				unitSize = 2;
				// Endianness
				const endianness = tokens[k + 1];
				if (endianness) {
					const endiannessLower = endianness.toLowerCase();
					if (endiannessLower == "big") {
						// Big endian
						bigEndian = true;
					}
					else if (endiannessLower != "little") {
						throw Error("'little' or 'big' expected but got '" + endianness + "'.");
					}
				}
			}
		}

		// Get memory
		const data = await Remote.readMemoryDump(address, size);

		// 'Print'
		let output = '';
		for (let i = 0; i < size; i += unitSize) {
			let value = data[i];
			if (unitSize == 2) {
				if (bigEndian)
					value = (value << 8) + data[i + 1];
				else
					value += data[i + 1] << 8;
			}
			if (hex)
				output += Utility.getHexString(value, 2 * unitSize) + ' ';
			else
				output += value + ' ';
		}

		// Send response
		return output;
	}


	/**
	 * Checks if the given string is 'little' or 'big' case insensitive.
	 * Throws an exception if string evaluates to something different.
	 * @param endiannessString The string to check.
	 * @returns true for 'little' or undefined and 'false for 'big'.
	 */
	protected isLittleEndianString(endiannessString: string | undefined) {
		let littleEndian = true;
		if (endiannessString != undefined) {
			const s = endiannessString.toLowerCase();
			if (s != 'little' && s != 'big')
				throw Error("Endianness (" + endiannessString + ") unknown.");
			littleEndian = (s == 'little');
		}
		return littleEndian;
	}


	/**
	 * Sets a memory location to some value.
	 * @param valSize 1 or 2 for byte or word.
	 * @param addressString A string with a labeg or hex/decimal number or an expression that is used as start address.
	 * @param valueString The value to set.
	 * @param repeatString How often the value gets repeated. Optional. Defaults to '1'.
	 * @param endiannessString The endianness. For valSize==2. 'little' or 'big'. Optional. defaults to 'little'.
	 * @returns A Promise with a text to print.
	 */
	protected async memSet(valSize: number, addressString: string, valueString: string, repeatString?: string, endiannessString?: string): Promise<string> {
		// Address
		const address = Utility.evalExpression(addressString);
		if (address < 0 || address > 0xFFFF)
			throw Error("Address (" + address + ") out of range.");

		// Value
		const value = Utility.evalExpression(valueString);
		const maxValue = 2 ** (valSize * 8);
		if (value >= maxValue || value < (-maxValue / 2))
			throw Error("Value (" + value + ") too big (or too small).");

		// Repeat
		const repeat = (repeatString != undefined) ? Utility.evalExpression(repeatString) : 1;
		const totalSize = valSize * repeat;
		if (totalSize <= 0 || totalSize > 0xFFFF)
			throw Error("Repetition (" + repeat + ") out of range.");

		// Endianness
		const littleEndian = this.isLittleEndianString(endiannessString);

		// Set (or fill) memory

		// Prepare data
		const data = new Uint8Array(totalSize);
		let index = 0;
		for (let r = 0; r < repeat; r++) {
			let val = value;
			for (let k = 0; k < valSize; k++) {
				if (littleEndian) {
					data[index + k] = val & 0xFF;
				}
				else {
					data[index + valSize - k - 1] = val & 0xFF;
				}
				// Next
				val = val >> 8;
			}
			// Next
			index += valSize;
		}

		// Write to remote
		await Remote.writeMemoryDump(address, data);

		// Update
		this.update();

		// Send response
		return 'OK';
	}


	/**
	 * Sets a memory location to some byte value.
	 * "-msetb address value repeat"
	 * "-msetb 8000h 74h""
	 * @param tokens The arguments. I.e. the address, value and (optional) repeat.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemSetByte(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: Too less arguments
			throw Error("At least address and value expected.");
		}
		// Check count of arguments
		if (tokens.length > 3) {
			// Error Handling: Too many arguments
			throw Error("Too many arguments.");
		}

		return this.memSet(1, tokens[0] /*address*/, tokens[1] /*value*/, tokens[2] /*repeat*/);
	}


	/**
	 * Sets a memory location to some word value.
	 * "-msetw address value repeat endianness"
	 * "-msetw 8000h 7654h""
	 * @param tokens The arguments. I.e. the address, value, repeat and endianness. Only the first 2 are mandatory.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemSetWord(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: Too less arguments
			throw Error("At least address and value expected.");
		}
		// Check count of arguments
		if (tokens.length > 4) {
			// Error Handling: Too many arguments
			throw Error("Too many arguments.");
		}

		return this.memSet(2, tokens[0] /*address*/, tokens[1] /*value*/, tokens[2] /*repeat*/, tokens[3] /*endianness*/);
	}


	/**
	 * Saves a memory dump to a file.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemSave(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: No arguments
			throw Error("Address and size expected.");
		}

		// Address
		const addressString = tokens[0];
		const address = Utility.evalExpression(addressString);
		if (address < 0 || address > 0xFFFF)
			throw Error("Address (" + address + ") out of range.");

		// Size
		const sizeString = tokens[1];
		const size = Utility.evalExpression(sizeString);
		if (size < 0 || size > 0xFFFF)
			throw Error("Size (" + size + ") out of range.");

		// Get filename
		const filename = tokens[2];
		if (!filename)
			throw Error("No filename given.");

		// Get memory
		const data = await Remote.readMemoryDump(address, size);

		// Save to .tmp/filename
		const relPath = Utility.getRelTmpFilePath(filename);
		const absPath = Utility.getAbsFilePath(relPath);
		fs.writeFileSync(absPath, data);

		// Send response
		return 'OK';
	}


	/**
	 * Shows a view with a memory dump.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemViewByte(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		if (tokens.length % 2 != 0) {
			// Error Handling: No size given
			throw new Error("No size given for address '" + tokens[tokens.length - 1] + "'.");
		}

		// Get all addresses/sizes.
		const addrSizes = new Array<number>();
		for (let k = 0; k < tokens.length; k += 2) {
			// Address
			const addressString = tokens[k];
			const address = Utility.evalExpression(addressString);
			addrSizes.push(address);

			// Size
			const sizeString = tokens[k + 1];
			const size = Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel = new MemoryDumpView();
		for (let k = 0; k < tokens.length; k += 2) {
			const start = addrSizes[k];
			const size = addrSizes[k + 1]
			panel.addBlock(start, size, Utility.getHexString(start & 0xFFFF, 4) + 'h-' + Utility.getHexString((start + size - 1) & 0xFFFF, 4) + 'h');
		}
		panel.mergeBlocks();
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Shows a view with a memory dump. The memory is organized in
	 * words instead of bytes.
	 * One can choose little or blig endian.
	 * @param tokens The arguments. I.e. the address, size and endianness.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemViewWord(tokens: Array<string>): Promise<string> {
		// Check for endianness
		let littleEndian = true;
		if (tokens.length % 2 != 0) {
			// Last one should be endianness
			const endiannessString = tokens.pop()
			littleEndian = this.isLittleEndianString(endiannessString);
		}

		// Check count of arguments
		if (tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		// Get all addresses/sizes.
		const addrSizes = new Array<number>();
		for (let k = 0; k < tokens.length; k += 2) {
			// Address
			const addressString = tokens[k];
			const address = Utility.evalExpression(addressString);
			addrSizes.push(address);

			// Size
			const sizeString = tokens[k + 1];
			const size = Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel = new MemoryDumpViewWord(littleEndian);
		for (let k = 0; k < tokens.length; k += 2) {
			const start = addrSizes[k];
			const size = addrSizes[k + 1]
			panel.addBlock(start, size, Utility.getHexString(start & 0xFFFF, 4) + 'h-' + Utility.getHexString((start + 2 * size - 1) & 0xFFFF, 4) + 'h');
		}
		panel.mergeBlocks();
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Shows the register memory view.
	 * @returns A Promise with a text to print. I.e. "OK"
	 */
	protected async evalRegisterMemView(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length != 0) {
			// Error Handling: No arguments
			throw new Error("No parameters expected.");
		}

		// Create memory/register dump view
		const registerMemoryView = new MemoryRegisterView();
		const regs = Settings.launch.memoryViewer.registersMemoryView;
		registerMemoryView.addRegisters(regs);
		await registerMemoryView.update();

		// Send response
		return 'OK';
	}


	/**
	 * Shows a a small disassembly in the console.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalDasm(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and number of lines expected.");
		}

		if (tokens.length > 2) {
			// Error Handling: Too many arguments
			throw new Error("Too many arguments.");
		}

		// Get address
		const addressString = tokens[0];
		const address = Utility.evalExpression(addressString);

		// Get size
		const countString = tokens[1];
		let count = 10;	// Default
		if (tokens.length > 1) {
			// Count given
			count = Utility.evalExpression(countString);
		}


		// Get memory
		const data = await Remote.readMemoryDump(address, 4 * count);

		// Disassembly
		const dasmArray = SimpleDisassembly.getLines(address, data, count);

		// Convert to text
		let txt = '';
		for (const line of dasmArray) {
			txt += Utility.getHexString(line.address, 4) + '\t' + line.instruction + '\n';
		}

		// Send response
		return txt;
	}


	/**
	 * LOGPOINTS. Enable/disable/status.
	 * @param tokens The arguments.
	   * @returns A Promise<string> with a probably error text.
	 */
	protected async evalLOGPOINT(tokens: Array<string>): Promise<string> {
		const param = tokens[0] || '';
		const group = tokens[1];
		if (param == 'enable' || param == 'disable') {
			// Enable or disable all WPMEM watchpoints
			const enable = (param == 'enable');
			await Remote.enableLogpointGroup(group, enable);
		}
		else if (param == 'status') {
			// Just show
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}

		// Always show enable status of all Logpoints
		let result = 'LOGPOINT groups:';
		const enableMap = Remote.logpointsEnabled;
		if (enableMap.size == 0)
			result += ' none';
		else {
			for (const [grp, enabled] of enableMap) {
				result += '\n  ' + grp + ': ' + ((enabled) ? 'enabled' : 'disabled');
				if (enabled) {
					// List log breakpoints
					const lps = Remote.getLogpointsForGroup(grp);
					for (const lp of lps) {
						result += '\n    ' + Utility.getLongAddressString(lp.longAddress);
						const labels = Labels.getLabelsForLongAddress(lp.longAddress);
						if (labels.length > 0) {
							const labelsString = labels.join(', ');
							result += ' (' + labelsString + ')';
						}
					}
				}
			}
		}
		return result;
	}


	/**
	 * ASSERTION. Enable/disable/status.
	 * @param tokens The arguments.
	   * @returns A Promise<string> with a probably error text.
	 */
	protected async evalASSERTION(tokens: Array<string>): Promise<string> {
		const param = tokens[0] || '';
		if (param == 'enable' || param == 'disable') {
			// Enable or disable all ASSERTION breakpoints
			const paramEnable = (param == 'enable');
			await Remote.enableAssertionBreakpoints(paramEnable);
		}
		else if (param == 'status') {
			// Just show
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}

		// Show enable status of all ASSERTION breakpoints
		const enable = Remote.assertionBreakpointsEnabled;
		const enableString = (enable) ? 'enabled' : 'disabled';
		let result = 'ASSERTION breakpoints are ' + enableString + '.\n';
		if (enable) {
			// Also list all assertion breakpoints
			const abps = Remote.getAllAssertionBreakpoints();
			for (const abp of abps) {
				result += Utility.getLongAddressString(abp.longAddress);
				const labels = Labels.getLabelsForLongAddress(abp.longAddress);
				if (labels.length > 0) {
					const labelsString = labels.join(', ');
					result += ' (' + labelsString + ')';
				}
				// Condition, remove the brackets
				result += ', Condition: ' + Utility.getAssertionFromCondition(abp.condition) + '\n';
			}
			if (abps.length == 0)
				result += 'No ASSERTION breakpoints.\n';
		}
		return result;
	}


	/**
	 * WPMEM. Enable/disable/status.
	 * @param tokens The arguments.
	   * @returns A Promise<string> with a text to print.
	 */
	protected async evalWPMEM(tokens: Array<string>): Promise<string> {
		const param = tokens[0] || '';
		if (param == 'enable' || param == 'disable') {
			// Enable or disable all WPMEM watchpoints
			const paramEnable = (param == 'enable');
			await Remote.enableWPMEM(paramEnable);
		}
		else if (param == 'status') {
			// Just show
		}
		else {
			// Unknown argument
			throw Error("Unknown argument: '" + param + "'");
		}

		// Show enable status of all WPMEM watchpoints
		const enable = Remote.wpmemEnabled;
		const enableString = (enable) ? 'enabled' : 'disabled';
		let result = 'WPMEM watchpoints are ' + enableString + '.\n';
		if (enable) {
			// Also list all watchpoints
			const wps = Remote.getAllWpmemWatchpoints();
			for (const wp of wps) {
				result += Utility.getLongAddressString(wp.longOr64kAddress);
				const labels = Labels.getLabelsForLongOr64kAddress(wp.longOr64kAddress);
				if (labels.length > 0) {
					const labelsString = labels.join(', ');
					result += ' (' + labelsString + ')';
				}
				// Condition, remove the brackets
				result += ', size=' + wp.size + '\n';
			}
			if (wps.length == 0)
				result += 'No WPMEM watchpoints.\n';
		}
		return result;
	}


	/**
	 * Add a watchpoint.
	 * Independent of WPMEM.
	 * @param tokens The arguments. E.g. "-wpadd 0x8000 1 r"
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalWpAdd(tokens: Array<string>): Promise<string> {
		// Get parameters
		if (tokens.length < 1)
			throw Error("Expecting at least 1 argument.");
		// Address
		const addr64k = Utility.evalExpression(tokens[0]);
		// Size
		let size = 1;
		let access = 'rw';
		if (tokens[1] != undefined)
			size = Utility.evalExpression(tokens[1]);
		// Access
		if (tokens[2]) {
			if (!['r', 'w', 'rw'].includes(tokens[2]))
				throw Error("'type' must be one of r, w or rw.");
			access = tokens[2];
		}

		// Add watchpoint
		const wp: GenericWatchpoint = {
			longOr64kAddress: addr64k,
			size,
			access,
			condition: ''
		};
		await Remote.setWatchpoint(wp);

		// Send response
		return 'OK';
	}


	/**
	 * Removes a watchpoint.
	 * Independent of WPMEM.
	 * @param tokens The arguments. E.g. "-wpadd r 0x8000 1"
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalWpRemove(tokens: Array<string>): Promise<string> {
		// Get parameters
		if (tokens.length < 1)
			throw Error("Expecting at least 1 argument.");
		// Address
		const addr64k = Utility.evalExpression(tokens[1]);
		// Size
		let size = 1;
		let access = 'rw';
		if (tokens[1] != undefined)
			size = Utility.evalExpression(tokens[1]);
		// Access
		if (tokens[2]) {
			if (!['r', 'w', 'rw'].includes(tokens[2]))
				throw Error("'type' must be one of r, w or rw.");
			access = tokens[2];
		}

		// Add watchpoint
		const wp: GenericWatchpoint = {
			longOr64kAddress: addr64k,
			size,
			access,
			condition: ''
		};
		await Remote.removeWatchpoint(wp);

		// Send response
		return 'OK';
	}


	/**
	 * Reverse engineering commands:
	 * - 'dasm-rst': Disassembles all RST sub routines.
	 * @param tokens The arguments. E.g. "-reveng dasm-rst"
	 * @returns A Promise<string> with a text to print.
	 */
	// TODO: Doku
	protected async evalRevEng(tokens: Array<string>): Promise<string> {
		// Get parameters
		if (tokens.length < 1)
			throw Error("Expecting at least 1 argument.");
		// Evaluate sub command
		const subcmd = tokens[0];
		switch (subcmd) {
			case 'dasm-rst':
				{
					// Fetch memory. (Everything, since we cannot know what is used)
					const data = await Remote.readMemoryDump(0, 0x10000);
					// Create temporary disassembly instance
					const disassembler = new AnalyzeDisassembler();
					// No automatic labels
					disassembler.automaticAddresses = false;
					disassembler.specialLabels = false;
					disassembler.disassembleUnreferencedData = false;
					// Do not find interrupt labels
					disassembler.findInterrupts = false;

					// Initialize disassembly
					const rstAddrs = [0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38];
					//const rstAddrs = [0x78];
					//const rstAddrs = [0x062E, 0x0636];
					disassembler.initWithCodeAddresses(rstAddrs, [{address: 0, data}]);
					// Init label names for RST
					for (const rstAddr of rstAddrs) {
						disassembler.setLabel(rstAddr, 'RST' + Utility.getHexString(rstAddr, 2), NumberType.CODE_RST);
					}

					// Disassemble
					disassembler.disassemble();
					const text = disassembler.getDisassemblyText();
					return text;
				}
				break;
		}

		// Error
		throw Error("Unknwon sub commmand '" + subcmd + "'.");
	}


	/**
	 * Show the sprite patterns in a view.
	 * @param tokens The arguments.
	   * @returns A Promise<string> with a text to print.
	 */
	protected async evalSpritePatterns(tokens: Array<string>): Promise<string> {
		// Evaluate arguments
		let title;
		let params: Array<number> | undefined = [];
		if (tokens.length == 0) {
			// The view should choose the visible sprites automatically
			title = 'Sprite Patterns: 0-63';
			params.push(0);
			params.push(64);
		}
		else {
			// Create title
			title = 'Sprite Patterns: ' + tokens.join(' ');
			// Get slot and count/endslot
			while (true) {
				// Get parameter
				const param = tokens.shift();
				if (!param)
					break;
				// Evaluate
				const match = /([^+-]*)(([-+])(.*))?/.exec(param);
				if (!match) // Error Handling
					throw new Error("Can't parse: '" + param + "'");
				// start slot
				const start = Utility.parseValue(match[1]);
				if (isNaN(start))	// Error Handling
					throw new Error("Expected slot but got: '" + match[1] + "'");
				// count
				let countValue = 1;
				if (match[3]) {
					countValue = Utility.parseValue(match[4]);
					if (isNaN(countValue))	// Error Handling
						throw new Error("Can't parse: '" + match[4] + "'");
					if (match[3] == "-")	// turn range into count
						countValue += 1 - start;
				}
				// Check
				if (countValue <= 0)	// Error Handling
					throw new Error("Not allowed count: '" + match[0] + "'");
				// Add
				params.push(start);
				params.push(countValue);
			}

			const slotString = tokens[0] || '0';
			const slot = Utility.parseValue(slotString);
			if (isNaN(slot)) {
				// Error Handling: Unknown argument
				throw new Error("Expected slot but got: '" + slotString + "'");
			}
			const countString = tokens[1] || '1';
			const count = Utility.parseValue(countString);
			if (isNaN(count)) {
				// Error Handling: Unknown argument
				throw new Error("Expected count but got: '" + countString + "'");
			}
		}

		// Create new view
		const panel = new ZxNextSpritePatternsView(title, params);
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Show the sprites in a view.
	 * @param tokens The arguments.
	   * @returns A Promise<string> with a text to print.
	 */
	protected async evalSprites(tokens: Array<string>): Promise<string> {
		// First check for tbblue
		// Evaluate arguments
		let title;
		let params: Array<number> | undefined;
		if (tokens.length == 0) {
			// The view should choose the visible sprites automatically
			title = 'Visible Sprites';
		}
		else {
			// Create title
			title = 'Sprites: ' + tokens.join(' ');
			// Get slot and count/endslot
			params = [];
			while (true) {
				// Get parameter
				const param = tokens.shift();
				if (!param)
					break;
				// Evaluate
				const match = /([^+-]*)(([-+])(.*))?/.exec(param);
				if (!match) // Error Handling
					throw new Error("Can't parse: '" + param + "'");
				// start slot
				const start = Utility.parseValue(match[1]);
				if (isNaN(start))	// Error Handling
					throw new Error("Expected slot but got: '" + match[1] + "'");
				// count
				let countValue = 1;
				if (match[3]) {
					countValue = Utility.parseValue(match[4]);
					if (isNaN(countValue))	// Error Handling
						throw new Error("Can't parse: '" + match[4] + "'");
					if (match[3] == "-")	// turn range into count
						countValue += 1 - start;
				}
				// Check
				if (countValue <= 0)	// Error Handling
					throw new Error("Not allowed count: '" + match[0] + "'");
				// Add
				params.push(start);
				params.push(countValue);
			}

			const slotString = tokens[0] || '0';
			const slot = Utility.parseValue(slotString);
			if (isNaN(slot)) {
				// Error Handling: Unknown argument
				throw new Error("Expected slot but got: '" + slotString + "'");
			}
			const countString = tokens[1] || '1';
			const count = Utility.parseValue(countString);
			if (isNaN(count)) {
				// Error Handling: Unknown argument
				throw new Error("Expected count but got: '" + countString + "'");
			}
		}

		// Create new view
		const panel = new ZxNextSpritesView(title, params);
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Save/restore the state.
	 * @param tokens The arguments. 'save'/'restore'
	   * @returns A Promise<string> with a text to print.
	 */
	protected async evalStateSaveRestore(tokens: Array<string>): Promise<string> {
		const param = tokens[0] || '';
		const stateName = tokens[1];
		if (!stateName &&
			(param == 'save' || param == 'restore' || param == 'clear'))
			throw new Error("Parameter missing: You need to add a name for the state, e.g. '0', '1' or more descriptive 'start'");

		if (param == 'save') {
			// Save current state
			await this.stateSave(stateName);
			// Send response
			return "Saved state '" + stateName + "'.";
		}
		else if (param == 'restore') {
			// Restores the state
			await this.stateRestore(stateName);
			return "Restored state '" + stateName + "'.";
		}
		else if (param == 'list') {
			// List all files in the state dir.
			let files;
			try {
				const dir = Utility.getAbsStateFileName('');
				files = fs.readdirSync(dir);
			}
			catch {}
			let text;
			if (files == undefined || files.length == 0)
				text = "No states saved yet.";
			else
				text = "All states:\n" + files.join('\n');
			return text;
		}
		else if (param == 'clearall') {
			// Removes the files in the states directory
			try {
				const dir = Utility.getAbsStateFileName('');
				const files = fs.readdirSync(dir);
				for (const file of files) {
					const path = Utility.getAbsStateFileName(file);
					fs.unlinkSync(path);
				}
			}
			catch (e) {
				return e.message;
			}
			return "All states deleted.";
		}
		else if (param == 'clear') {
			// Removes one state
			try {
				const path = Utility.getAbsStateFileName(stateName);
				fs.unlinkSync(path);
			}
			catch (e) {
				return e.message;
			}
			return "State '" + stateName + "' deleted.";
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}
	}


	/**
	 * Debug commands. Not shown publicly.
	 * @param tokens The arguments.
	   * @returns A Promise<string> with a text to print.
	 */
	protected async evalDebug(tokens: Array<string>): Promise<string> {
		const param1 = tokens[0] || '';
		let unknownArg = param1;
		// Unknown argument
		throw new Error("Unknown argument: '" + unknownArg + "'");
	}


	/**
	* Called eg. if user changes a register value.
	*/
	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments) {
		const ref = args.variablesReference;
		const name = args.name;
		const value = Utility.parseValue(args.value);

		ShallowVar.clearChanged();

		// Get variable object
		const varObj = this.listVariables.getObject(ref);
		response.success = false;	// will be changed if successful.

		// Safety check
		if (varObj) {
			// Variables can be changed only if not in reverse debug mode
			const msg = varObj.changeable(name);
			if (msg) {
				// Change not allowed e.g. if in reverse debugging
				response.message = msg;
			}
			else {
				// Set value
				const formattedString = await varObj.setValue(name, value);
				// Send response
				if (formattedString) {
					response.body = {value: formattedString};
					response.success = true;
				}
			}
		}
		this.sendResponse(response);

		// Now check what has been changed.
		if (ShallowVar.pcChanged)
			await this.pcHasBeenChanged();
		if (ShallowVar.spChanged)
			await this.spHasBeenChanged();
		if (ShallowVar.otherRegisterChanged)
			await this.otherRegisterHasBeenChanged();
		if (ShallowVar.memoryChanged) {
			await this.memoryHasBeenChanged();
			this.sendEvent(new InvalidatedEvent(['variables']));	// E.g. the disassembly would need to be updated on memory change
		}
		ShallowVar.clearChanged();
	}


	/**
	 * Should be called if PC is manually changed.
	 */
	protected async pcHasBeenChanged() {
		// Clear any previous breakpoint decoration
		Decoration.clearBreak();
		// Refresh callstack
		await Remote.getCallStackFromEmulator();
		this.sendEvent(new StoppedEvent("PC changed", DebugSessionClass.THREAD_ID));	// Thread ID is required to update.
		await BaseView.staticCallUpdateRegisterChanged();
	}


	/**
	 * Should be called if SP is manually changed.
	 */
	protected async spHasBeenChanged() {
		await Remote.getCallStackFromEmulator();
		this.sendEvent(new InvalidatedEvent(['variables']));
		await BaseView.staticCallUpdateRegisterChanged();
	}


	/**
	 * Should be called if any  other register is manually changed.
	 * Also for PC or SP. In that case both functions are called.
	 */
	protected async otherRegisterHasBeenChanged() {
		this.sendEvent(new InvalidatedEvent(['variables']));
		await BaseView.staticCallUpdateRegisterChanged();
	}


	/**
	 * Should be called if memory content has been manually changed.
	 */
	protected async memoryHasBeenChanged() {
		//this.sendEvent(new InvalidatedEvent(['variables'])); // Not required. The VARIABLES and the WATCHes will be updated anyway. If uncommented then the WATCHes are not highlighted on a change.
		await BaseView.staticCallUpdateFunctions();
	}


	/**
	 * Change the Program Counter such that it points to the given file/line.
	 * @param filename The absolute file path.
	 * @param lineNr The lineNr. Starts at 0.
	 */
	public async setPcToLine(filename: string, lineNr: number): Promise<void> {
		// Get address of file/line
		const realLineNr = lineNr;
		let addr = Remote.getAddrForFileAndLine(filename, realLineNr);
		if (addr < 0) {
			this.showError("No valid address at cursor.");
			return;
		}

		// Check if bank is the same
		const slots = Remote.getSlots();
		if (slots) {
			const bank = Z80RegistersClass.getBankFromAddress(addr);
			if (bank >= 0) {
				const slotIndex = Z80Registers.getSlotFromAddress(addr);
				if (bank != slots[slotIndex]) {
					this.showError("Cannot set PC to a location (address=" + Utility.getHexString(addr & 0xFFFF, 4) + "h) of a bank (bank " + bank + ") that is currently not paged in.");
					return;
				}
			}
		}
		// Now change Program Counter
		await Remote.setRegisterValue('PC', addr & 0xFFFF);
		await Remote.getRegistersFromEmulator();
		StepHistory.clear();
		// Update vscode
		await this.pcHasBeenChanged();
	}


	/**
	 * Checks if all lines/addresses are currently paged in.
	 * And returns teh start and end address.
	 * @param filename The absolute file path.
	 * @param fromLineNr The line. Starts at 0.
	 * @param toLineNr The line. Starts at 0.
	 * @returns [fromAddr, toAddr] Start and end (long) address.
	 * @throws An exception if an address of a file/line is not paged in.
	 */
	protected checkFileLinesPagedIn(filename: string, fromLineNr: number, toLineNr: number): Array<number> {//</number> {fromAddr: number, toAddr: number} {
		// Get address of file/line
		let fromAddr = -1;	// Long
		while (fromLineNr <= toLineNr) {
			fromAddr = Remote.getAddrForFileAndLine(filename, fromLineNr);
			if (fromAddr >= 0)
				break;
			fromLineNr++;
		}
		let toAddr;	// Long
		while (fromLineNr <= toLineNr) {
			toAddr = Remote.getAddrForFileAndLine(filename, toLineNr);
			if (toAddr >= 0)
				break;
			toLineNr--;
		}
		if (fromAddr < 0)
			throw Error("No address found at line.");
		// Get all address of last line (not only the first)
		let addr = toAddr & 0xFFFF;
		let upperAddr = toAddr & (~0xFFFF);
		while (addr < 0xFFFF) {
			const longAddr = (addr + 1) | upperAddr;
			const fileLine = Remote.getFileAndLineForAddress(longAddr);
			if (fileLine.lineNr != toLineNr || fileLine.fileName != filename)
				break;
			// Next
			addr++;
			toAddr = longAddr;
		}

		// Check if bank is the same
		const slots = Remote.getSlots();
		Utility.assert(slots);

		// Check fromAddr and toAddr
		for (const addr of [fromAddr, toAddr]) {
			const bank = Z80RegistersClass.getBankFromAddress(fromAddr);
			if (bank >= 0) {
				const slotIndex = Z80Registers.getSlotFromAddress(addr);
				if (bank != slots[slotIndex]) {
					throw Error("Memory currently not paged in.  (address=" + Utility.getHexString(bank & 0xFFFF, 4) + "h, bank=" + bank + ")");
				}
			}
		}

		// Return
		return [fromAddr, toAddr];
	}


	/**
	 * Does a disassembly to the debug console for the address at the cursor position.
	 * @param type The disassembly type: 'code', 'data' or 'string' (data).
	 * @param filename The absolute file path.
	 * @param fromLineNr The line. Starts at 0.
	 * @param toLineNr The line. Starts at 0.
	 */
	public async disassemblyAtCursor(type: 'code' | 'data' | 'string', filename: string, fromLineNr: number, toLineNr: number): Promise<void> {
		let fromAddr: number;
		let toAddr: number;
		try {
			[fromAddr, toAddr] = this.checkFileLinesPagedIn(filename, fromLineNr, toLineNr);	// Returns long addresses

			// Read the memory.
			this.debugConsoleAppendLine('');
			let size = (toAddr - fromAddr + 1) & 0xFFFF;
			if (size > 0x800) {
				size = 0x800;
				this.debugConsoleAppendLine('Note: Disassembly limited to ' + size + ' bytes.');
			}
			fromAddr &= 0xFFFF
			//toAddr &= 0xFFFF;
			const data = await Remote.readMemoryDump(fromAddr, size + 3);

			// Disassemble
			let text = '';
			switch (type) {
				case 'code':
					text = SimpleDisassembly.getInstructionDisassembly(fromAddr, data);
					break;
				case 'data':
					text = SimpleDisassembly.getDataDisassembly(fromAddr, data, false, 16);
					break;
				case 'string':
					text = SimpleDisassembly.getDataDisassembly(fromAddr, data, true, 16);
					break;
			}

			// Output
			this.debugConsoleAppend(text + '\n');

			// Copy to clipboard
			vscode.env.clipboard.writeText(text);
			vscode.window.showInformationMessage('Disassembly copied to clipboard.');
		}
		catch (e) {
			this.debugConsoleAppendLine("Error: " + e.message);
			return;
		}
	}


	/**
	 * Does an analyze (flowchart, call graph) of the given address(es).
	 * @param type The analyze type: (smart) 'disassembly', 'flowChart' or 'callGraph'.
	 * @param arr An array with the blocks to analyze. Usually just the start line.
	 */
	public async analyzeAtCursor(type: 'disassembly' | 'flowChart' | 'callGraph', arr: Array<{filename: string, fromLine: number, toLine: number}>): Promise<void> {
		Log.log('analyzeAtCursor');
		try {
			// Get all start addresses and check banks
			const startAddrs: number[] = [];
			for (const block of arr) {
				const [fromAddr,] = this.checkFileLinesPagedIn(block.filename, block.fromLine, block.toLine);
				startAddrs.push(fromAddr);
			}

			// Get whole memory for analyzing
			const data = await Remote.readMemoryDump(0, 0x10000);

			// Create new instance to disassemble
			const analyzer = new AnalyzeDisassembler();
			// No automatic labels
			analyzer.automaticAddresses = false;
			analyzer.specialLabels = false;
			analyzer.disassembleUnreferencedData = false;
			// Do not find interrupt labels
			analyzer.findInterrupts = false;
			analyzer.enableStatistics = true;	// Required for call graphs

			// Initialize disassembly
			analyzer.initWithCodeAddresses(startAddrs, [{address: 0, data}]);
			// Set labels for the start addresses
			for (const longAddr of startAddrs) {
				// Get label
				const labels = Labels.getLabelsForLongAddress(longAddr);
				let name;
				if (labels && labels.length > 0) {
					name = labels.join(' or ');
				}
				// Set label
				if (name)
					analyzer.setLabel(longAddr & 0xFFFF, name);
			}


			switch (type) {
				case 'disassembly':
					{
						// Disassemble
						analyzer.disassemble();
						// Output disassembly text to view
						const text = analyzer.getDisassemblyText();

						// Output text to new view.
						const view = new TextView('Smart Disassembly', text);
						await view.update();
					}
					break;

				case 'flowChart':
					{
						// Output flow chart to view
						const rendered = analyzer.renderFlowChart(startAddrs);

						// Output text to new view.
						const view = new HtmlView('Flow Chart', rendered);
						await view.update();

						// Install mouse click handler
						this.installSvgClickHandler(view);
					}
					break;

				case 'callGraph':
					{
						analyzer.nodeFormatString = "${label}\\n@${address}h\\n${size} bytes\\n";
						// Output call graph to view
						const rendered = analyzer.renderCallGraph(startAddrs);

						// Output text to new view.
						const view = new HtmlView('Call Graph', rendered);
						await view.update();

						// Install mouse click handler
						this.installSvgClickHandler(view);
					}
					break;
			}
		}
		catch (e) {
			this.debugConsoleAppendLine("Error: " + e.message);
			return;
		}
	}


	/**
	 * Installs the click handler for the flow chart and call graph (SVG) views.
	 * When clicked the coressponding code block is selected.
	 * @param view The view to install the click handler.
	 */
	protected installSvgClickHandler(view: HtmlView) {
		// Handler for mouse clicks: navigate to files/lines
		view.on('click', async message => {
			const addressesString: string = message.data;	// Format e.g. "#800A.4" or "8010.4;8012.4;8013.4;"
			const longAddrString = addressesString.substring(1);	// Skip #
			// Separate addresses
			const addresses = longAddrString.split(';');
			// Find associations with file/line
			const fileLines = new Map<string, number[]>();
			let selectWholeLine = false;
			addresses.reverse();
			if (addresses[0] == '') {
				// Remove first (empty) object
				addresses.shift();
				selectWholeLine = true;
			}

			// Loop over all addresses
			for (const addressString of addresses) {
				if (!addressString)
					continue;	// Last (first) item might be ''
				const longAddr = Remote.memoryModel.parseAddress(addressString);
				const entry = Remote.getFileAndLineForAddress(longAddr);
				const fileName = entry.fileName;
				if (fileName) {
					let addrs = fileLines.get(fileName);
					if (!addrs)  {
						addrs = new Array<number>();
						fileLines.set(fileName, addrs);
					}
					addrs.push(entry.lineNr);
				}
			}

			// Loop over all files
			for (const [fileName, lineNrs] of fileLines) {
				// Loop over all lines
				const selections: vscode.Selection[] = [];
				let visibleStart = Number.MAX_SAFE_INTEGER;
				let visibleEnd = 0;
				for (const lineNr of lineNrs) {
					// Set selection
					const clmEnd = (selectWholeLine) ? Number.MAX_SAFE_INTEGER : 0;
					selections.push(new vscode.Selection(lineNr, 0, lineNr, clmEnd));
					// Extend visible range
					if (lineNr < visibleStart)
						visibleStart = lineNr;
					if (lineNr > visibleEnd)
						visibleEnd = lineNr;
				}
				// Extend visible range
				visibleStart -= 3;
				if (visibleStart < 0)
					visibleStart = 0;
				visibleEnd += 3;

				// Try to find if the file is already open in an editor.
				let document;
				for(const doc of vscode.workspace.textDocuments) {
					const docPath = UnifiedPath.getUnifiedPath(doc.uri.fsPath);
					if(docPath == fileName) {
						document = doc;
						break;
					}
				}
				if(!document) {
					// Doc not found, open it
					const uri = vscode.Uri.file(fileName);
					document = await vscode.workspace.openTextDocument(uri);
				}
				// Get editor
				const editor: vscode.TextEditor = await vscode.window.showTextDocument(document);

				// Set selections and visible range
				editor.selections = selections;
				editor.revealRange(new vscode.Range(visibleStart, 0, visibleEnd, Number.MAX_SAFE_INTEGER));
			}
		});
	}


	/**
	 * Called after a step, step-into, run, hit breakpoint, etc.
	 * Is used to update anything that need to updated after some Z80 instructions have been executed.
	 * E.g. the memory dump view.
	 * @param reason The reason is a data object that contains additional information.
	 * E.g. for 'step' it contains { step: true };
	 */
	protected update(reason?: any) {
		this.emit('update', reason);
	}


	/**
	 * Called from "-state save N" command.
	 * Stores all RAM + the registers.
	 * @param stateName A state name (or number) can be appended, so that different states might be saved.
	 */
	protected async stateSave(stateName: string): Promise<void> {
		// Save state
		const filePath = Utility.getAbsStateFileName(stateName);
		try {
			// Make sure .tmp/states directory exists
			try {
				const dir = Utility.getAbsStateFileName('');
				fs.mkdirSync(dir);
			}
			catch {}
			// Save state
			await Remote.stateSave(filePath);
		}
		catch (e) {
			const errTxt = "Can't save '" + filePath + "': " + e.message;
			throw new Error(errTxt);
		}
	}


	/**
	 * Called from "-state restore N" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param stateName A state name (or number) can be appended, so that different states might be saved.
	 */
	protected async stateRestore(stateName: string): Promise<void> {
		// Check
		if (this.processingSteppingRequest) {
			throw new Error("Can't restore state while running. Please stop first.");
		}
		// Load data from temp directory
		let filePath;
		try {
			// Read data
			filePath = Utility.getAbsStateFileName(stateName);
			// Restore state
			await Remote.stateRestore(filePath);
		}
		catch (e) {
			const errTxt = "Can't load '" + filePath + "': " + e.message;
			throw new Error(errTxt);
		}
		// Clear history
		StepHistory.init();
		// Clear decorations
		Decoration?.clearAllDecorations();
		// Update registers
		await Remote.getRegistersFromEmulator();
		await Remote.getCallStackFromEmulator();
		// Update memory etc.
		this.update();
		// Send event
		this.sendEvent(new StoppedEvent('restore', DebugSessionClass.THREAD_ID));
	}


	/**
	 * Output indented text to the console.
	 * @param text The output string.
	 */
	protected debugConsoleIndentedText(text: string) {
		this.debugConsoleAppendLine(this.debugConsoleIndentation + text);
	}


	/**
	 * Reloads all list/sld file(s).
	 * Is targeted at reverse engineering, so mainly at list files.
	 * Only the list files are reloaded, not the launch.json, nor the binary (loadObjs).
	 */

	public async reloadLabels(): Promise<void> {
		try {
			// Clear diagnostics
			DiagnosticsHandler.clear();

			// Read list files
			Remote.readListFiles(Settings.launch);
			// Re-read the watchpoints etc.
			await Remote.initWpmemAssertionLogpoints();

			// Reset a few things
			Decoration.clearAllDecorations();
			StepHistory.init();	// Is only cleared because coverage is cleared (otherwise it looks inconsistent)

			// Do disassembly anew
			this.sendEvent(new StoppedEvent("Labels reloaded", DebugSessionClass.THREAD_ID));
		}
		catch (e) {
			// Some error occurred
			Remote.terminate('Labels: ' + e.message);
			//this.showError("Error while initializing labels.");
		}
	}


	/**
	 * Install file watchers for reverse engineering auto reload.
	 */
	protected installReloadFileWatchers() {
		// Just in case
		this.removeReloadFileWatchers();
		// Get watched files
		const paths = Labels.getWatchedFiles();
		// Loop all files
		for (const path of paths) {
			// Create new file watcher
			const fileWatcher = new FileWatcher(path);
			this.fileWatchers.push(fileWatcher);
			// Watch for changes
			fileWatcher.onDidChange(() => {
				this.reloadLabels();
			});
		}
	}


	/**
	 * Remove file watchers for reverse engineering auto reload.
	 */
	protected removeReloadFileWatchers() {
		for (const fileWatcher of this.fileWatchers) {
			fileWatcher.dispose();
		}
		this.fileWatchers = [];
	}
}


DebugSessionClass.run(DebugSessionClass);
