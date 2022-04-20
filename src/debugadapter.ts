import * as fs from 'fs';
import {UnifiedPath} from './misc/unifiedpath';
import * as vscode from 'vscode';
import {Breakpoint, DebugSession, InitializedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread, ContinuedEvent, CapabilitiesEvent, InvalidatedEvent} from 'vscode-debugadapter/lib/main';
import {DebugProtocol} from 'vscode-debugprotocol/lib/debugProtocol';
import {Labels} from './labels/labels';
import {Log} from './log';
import {Remote, RemoteBreakpoint} from './remotes/remotebase';
import {MemoryDumpView} from './views/memorydumpview';
import {MemoryRegisterView} from './views/memoryregisterview';
import {Settings, SettingsParameters} from './settings';
import {DisassemblyVar, ShallowVar, MemorySlotsVar, RegistersMainVar, RegistersSecondaryVar, StackVar, StructVar, MemDumpVar, ImmediateMemoryValue} from './variables/shallowvar';
import {Utility} from './misc/utility';
import {Z80RegisterHoverFormat, Z80RegistersClass, Z80Registers, } from './remotes/z80registers';
import {RemoteFactory} from './remotes/remotefactory';
import {ZxNextSpritesView} from './views/zxnextspritesview';
import {TextView} from './views/textview';
import {BaseView} from './views/baseview';
import {ZxNextSpritePatternsView} from './views/zxnextspritepatternsview';
import {MemAttribute} from './disassembler/memory';
import {Decoration} from './decoration';
import {ZSimulationView} from './remotes/zsimulator/zsimulationview';
import {ZSimRemote} from './remotes/zsimulator/zsimremote';
import {CpuHistoryClass, CpuHistory, StepHistory} from './remotes/cpuhistory';
import {StepHistoryClass} from './remotes/stephistory';
import {DisassemblyClass, Disassembly} from './disassembly/disassembly';
import {TimeWait} from './misc/timewait';
import {MemoryArray} from './disassembly/memoryarray';
import {MemoryDumpViewWord} from './views/memorydumpviewword';
import {ExpressionVariable} from './misc/expressionvariable';
import {RefList} from './misc/reflist';
import {PromiseCallbacks} from './misc/promisecallbacks';
import {Z80UnitTestRunner} from './z80unittests/z80unittestrunner';
import {DiagnosticsHandler} from './diagnosticshandler';
import {GenericWatchpoint} from './genericwatchpoint';
import {SimpleDisassembly} from './disassembly/simpledisassembly';




/// State of the debug adapter.
enum DbgAdapterState {
	NORMAL,	// Normal debugging
	UNITTEST,	// Debugging or running unit tests
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

	/// The address queue for the disassembler. This contains all stepped addresses.
	protected dasmAddressQueue = new Array<number>();

	/// The text document used for the temporary disassembly.
	protected disasmTextDoc: vscode.TextDocument;

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
	 * DebugAdapter disconnects.
	 * End forcefully.
	 * Is called
	 * - when user presses red square
	 * - when the socket connection is terminated
	 * - If user presses circled arrow/restart
	 */
	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, _args: DebugProtocol.DisconnectArguments): Promise<void> {
		// Disconnect Remote etc.
		await this.disconnectAll();
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
		// Close views, e.g. register memory view
		BaseView.staticCloseAll();
		this.removeListener('update', BaseView.staticCallUpdateFunctions);
		// Stop machine
		this.removeAllListeners();	// Don't react on events anymore
		// Disconnect
		if(Remote)
			await Remote.disconnect();
		// Clear the history instance
		CpuHistoryClass.removeCpuHistory();
		// Clear Remote
		RemoteFactory.removeRemote(); // Also disposes
		// Remove disassembly text editor. vscode does not support closing directly, thus this hack:
		if (this.disasmTextDoc) {
			vscode.window.showTextDocument(this.disasmTextDoc.uri, {preview: true, preserveFocus: false})
				.then(() => {
					return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
				});
		}

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
	}


	/**
	 * 'initialize' request.
	 * Respond with supported features.
	 */
	protected async initializeRequest(response: DebugProtocol.InitializeResponse, _args: DebugProtocol.InitializeRequestArguments): Promise<void> {

		// Check if DeZog is already running
		if (!response.success) {
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

		// Maybe terminated on error
		response.body.supportTerminateDebuggee = true;

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
	protected scopes: Array<Scope>;
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: SettingsParameters) {
		try {
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
		}
		catch (e) {
			// Some error occurred
			response.success = false;
			response.message = e.message;
			this.sendResponse(response);
			return;
		}

		// Register to get a note when debug session becomes active
		this.debugConsoleSavedText = '';

		// Launch emulator
		await this.launch(response);
	}


	/**
	 * Launches the emulator. Is called from launchRequest.
	 * @param response
	 */
	protected async launch(response: DebugProtocol.Response) {
		// Setup the disassembler
		DisassemblyClass.createDisassemblyInstance();

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
		this.sendResponse(response);
	}


	/**
	 * Starts the emulator and sets up everything for setup after
	 * connection is up and running.
	 * @returns A Promise with an error text or undefined if no error.
	 */
	protected async startEmulator(): Promise<string | undefined> {
		try {
			// Init labels
			Labels.init(Settings.launch.smallValuesMaximum);
		}
		catch (e) {
			// Some error occurred
			Remote.terminate('Labels: ' + e.message);
			return "Error while initializing labels.";
		}

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

		// Load files
		try {
			// Reads the list file and also retrieves all occurrences of WPMEM, ASSERTION and LOGPOINT.
			Remote.readListFiles(Settings.launch);
		}
		catch (err) {
			// Some error occurred during loading, e.g. file not found.
			//	this.terminate(err.message);
			this.unitTestsStartCallbacks?.reject(err);
			return err.message;
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
		const bps = new Array<RemoteBreakpoint>();
		for (const bp of givenBps) {
			try {
				const log = Remote.evalLogMessage(bp.logMessage);
				const mbp: RemoteBreakpoint = {
					bpId: 0,
					filePath: path,
					lineNr: this.convertClientLineToDebugger(bp.line),
					address: -1,	// not known yet
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
		const currentBreakpoints = await Remote.setBreakpoints(path, bps);
		const source = this.createSource(path);
		// Now match all given breakpoints with the available.
		const vscodeBreakpoints = givenBps.map(gbp => {
			// Search in current list
			let foundCbp;
			const lineNr = gbp.line;
			for (const cbp of currentBreakpoints) {
				const cLineNr = this.convertDebuggerLineToClient(cbp.lineNr);
				if (cLineNr == lineNr) {
					foundCbp = cbp;
					break;
				}
			}

			// Create vscode breakpoint with verification
			const verified = (foundCbp != undefined) && (foundCbp.address >= 0);
			const bp = new Breakpoint(verified, lineNr, 0, source);
			if (foundCbp && foundCbp.address >= 0) {
				// Add address to source name.
				const addrString = Utility.getLongAddressString(foundCbp.address);
				// Add hover text
				let txt = addrString;
				const labels = Labels.getLabelsForNumber64k(foundCbp.address);
				labels.forEach(lbl => txt += '\n' + lbl);
				(bp as any).message = txt;
			}

			// Additional print warning if not verified
			if (!verified) {
				const text = JSON.stringify(bp);
				this.debugConsoleAppendLine('Unverified breakpoint: ' + text);
				if (foundCbp && foundCbp.error) {
					this.debugConsoleAppendLine('  Additional info: ' + foundCbp.error);
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

		// Stack frames
		const sfrs = new Array<StackFrame>();

		// Need to check if disassembly is required.
		let doDisassembly = false;
		const fetchAddresses = new Array<number>();
		let frameCount = 0;

		// Get the call stack trace.
		let callStack;
		//let slots;
		if (StepHistory.isInStepBackMode()) {
			// Get callstack
			callStack = StepHistory.getCallStack();
		}
		else {
			// Get callstack
			callStack = await Remote.getCallStackCache();
		}

		// Go through complete call stack and get the sources.
		// If no source exists than get a hexdump and disassembly later.
		frameCount = callStack.length;
		for (let index = frameCount - 1; index >= 0; index--) {
			const frame = callStack[index];
			// Get file for address
			const addr = frame.addr;
			const file = Labels.getFileAndLineForAddress(addr);
			// Store file, if it does not exist the name is empty
			const src = this.createSource(file.fileName);
			const lineNr = (src) ? this.convertDebuggerLineToClient(file.lineNr) : 0;
			const sf = new StackFrame(index + 1, frame.name, src, lineNr);
			sfrs.push(sf);
			// Create array with addresses that need to be fetched for disassembly
			if (!sf.source) {
				const csFrame = callStack[index];
				fetchAddresses.push(csFrame.addr);
			}
		}

		// Create memory array.
		const memArray = new MemoryArray();
		memArray.addRangesWithSize(fetchAddresses, 100);	// Assume 100 bytes each

		// Add some more memory from the history
		const fetchHistorySize = 20;
		const historyAddresses = new Array<number>();
		for (let i = 1; i <= 10; i++) {
			const addr = StepHistory.getPreviousAddress(i);
			if (addr == undefined)
				break;
			// Add address
			memArray.addRange(addr, fetchHistorySize);	// assume at least 4 bytes, assume some more to cover small jumps
			historyAddresses.unshift(addr);
		}

		// Check if we need to fetch any dump.
		for (const range of memArray.ranges) {
			const data = await Remote.readMemoryDump(range.address, range.size);
			range.data = data;
		}

		// Check if we need to fetch any dump.
		const fetchAddressesCount = fetchAddresses.length;

		if (!doDisassembly) {
			const checkSize = 40;	// Needs to be smaller than fetch-size in order not to do a disassembly too often.
			if (fetchAddressesCount > 0) {
				// Now get hex-dumps for all non existing sources.
				for (let index = 0; index < fetchAddressesCount; index++) {
					// So fetch a memory dump
					const fetchAddress = fetchAddresses[index];
					// Note: because of self-modifying code it may have changed
					// since it was fetched at the beginning.
					// Check if memory changed.
					for (let k = 0; k < checkSize; k++) {
						const val = Disassembly.memory.getValueAt((fetchAddress + k) & 0xFFFF);
						const memAttr = Disassembly.memory.getAttributeAt(fetchAddress + k);
						const newVal = memArray.getValueAtAddress((fetchAddress + k) & 0xFFFF);
						if ((val != newVal) || (memAttr == MemAttribute.UNUSED)) {
							doDisassembly = true;
							break;
						}
					}
				}
			}
		}

		// Check if a new address was used.
		for (let i = 0; i < fetchAddressesCount; i++) {
			// The current PC is for sure a code label.
			const addr = fetchAddresses[i];
			if (this.dasmAddressQueue.indexOf(addr) < 0)
				this.dasmAddressQueue.unshift(addr);
			// Check if this requires a disassembly
			if (!doDisassembly) {
				const memAttr = Disassembly.memory.getAttributeAt(addr & 0xFFFF);
				if (!(memAttr & MemAttribute.CODE_FIRST))
					doDisassembly = true;	// If memory was not the start of an opcode.
			}
		}

		// Check if disassembly is required.
		if (doDisassembly) {
			// Do disassembly.
			/*
			const prevAddresses=new Array<number>();
			const prevData=new Array<Uint8Array>();
			// Check if history data is available.
			//if (StepHistory.isInStepBackMode())
			{
				// Add a few more previous addresses if available
				for (let i=1; i<=10; i++) {
					const addr=StepHistory.getPreviousAddress(i);
					if (addr==undefined)
						break;
					// Add address
					prevAddresses.unshift(addr);
					const data=await Remote.readMemoryDump(addr, 4);  	// An opcode is max 4 bytes long
					prevData.unshift(data);
				}
			}
			*/

			// Create text document
			const absFilePath = DisassemblyClass.getAbsFilePath();
			const uri = vscode.Uri.file(absFilePath);
			const editCreate = new vscode.WorkspaceEdit();
			editCreate.createFile(uri, {overwrite: true});
			await vscode.workspace.applyEdit(editCreate);
			const textDoc = await vscode.workspace.openTextDocument(absFilePath);
			// Store uri
			this.disasmTextDoc = textDoc;

			// Initialize disassembly
			Disassembly.initWithCodeAdresses([...historyAddresses, ...fetchAddresses], memArray.ranges as Array<{address: number, data: Uint8Array}> );
			// Disassemble
			Disassembly.disassemble();
			// Read data
			const text = Disassembly.getDisassemblyText();

			// Get all source breakpoints of the disassembly file.
			const bps = vscode.debug.breakpoints;
			const disSrc = this.disasmTextDoc.uri.toString();
			const sbps = bps.filter(bp => {
				if (bp.hasOwnProperty('location')) {
					const sbp = bp as vscode.SourceBreakpoint;
					const sbpSrc = sbp.location.uri.toString();
					if (sbpSrc == disSrc)
						return true;
				}
				return false;
			}) as vscode.SourceBreakpoint[];

			// Check if any breakpoint
			const changedBps = new Array<vscode.SourceBreakpoint>();
			if (sbps.length > 0) {
				// Previous text
				const prevTextLines = this.disasmTextDoc.getText().split('\n');

				// Loop all source breakpoints to compute changed BPs
				for (const sbp of sbps) {
					const lineNr = sbp.location.range.start.line;
					const line = prevTextLines[lineNr];
					const addr = parseInt(line, 16);
					if (!isNaN(addr)) {
						// Get line number
						const nLineNr = Disassembly.getLineForAddress(addr) || -1;
						// Create breakpoint
						const nLoc = new vscode.Location(this.disasmTextDoc.uri, new vscode.Position(nLineNr, 0));
						const cbp = new vscode.SourceBreakpoint(nLoc, sbp.enabled, sbp.condition, sbp.hitCondition, sbp.logMessage);
						// Store
						changedBps.push(cbp);
					}
				}
			}
			// Remove all old breakpoints.
			vscode.debug.removeBreakpoints(sbps);

			// Create and apply one replace edit
			const editReplace = new vscode.WorkspaceEdit();
			editReplace.replace(this.disasmTextDoc.uri, new vscode.Range(0, 0, this.disasmTextDoc.lineCount, 0), text);
			await vscode.workspace.applyEdit(editReplace);
			// Save after edit (to be able to set breakpoints)
			await this.disasmTextDoc.save();
			// Add all new breakpoints.
			vscode.debug.addBreakpoints(changedBps);

			// If disassembly text editor is open, then show decorations
			const editors = vscode.window.visibleTextEditors;
			for (const editor of editors) {
				if (editor.document == this.disasmTextDoc) {
					Decoration.setDisasmCoverageDecoration(editor);
				}
			}
			/*
			// Show document and get editor
			const editor=await vscode.window.showTextDocument(this.disasmTextDoc);
			// Update decorations
			if (editor) {
				Decoration.SetDisasmCoverageDecoration(editor);
			}
			*/
		}


		// Get lines for addresses and send response.
		// Determine line numbers (binary search)
		if (frameCount > 0) {
			const absFilePath = DisassemblyClass.getAbsFilePath();
			const src = this.createSource(absFilePath) as Source;
			let indexDump = 0;
			for (let i = 0; i < frameCount; i++) {
				const sf = sfrs[i];
				if (sf.source)
					continue;
				// Get line number for stack address
				const addr = fetchAddresses[indexDump];
				// Get line number
				const foundLine = Disassembly.getLineForAddress(addr) || -1
				const lineNr = this.convertDebuggerLineToClient(foundLine);
				// Store
				sf.source = src;
				sf.line = lineNr;
				// Next
				indexDump++;
			}
		}

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
	 * This is called at the end of a stack trace request btu also when a unit test case was finished debugging.
	 * Writes everything in 'delayedDecorations' into the decorations.
	 */
	protected processDelayedDecorations() {
		for (const func of this.delayedDecorations)
			func();
		this.delayedDecorations.length = 0;
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
			// Create new view
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
			elemCount = Labels.getDistanceToNextLabel(distAddr!) || 1;
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
			for (const [grp, enable] of enableMap) {
				result += '\n  ' + grp + ': ' + ((enable) ? 'enabled' : 'disabled');
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
				result += Utility.getLongAddressString(abp.address);
				const labels = Labels.getLabelsForLongAddress(abp.address);
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
				result += Utility.getLongAddressString(wp.address);
				const labels = Labels.getLabelsForLongAddress(wp.address);
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
		const address = Utility.evalExpression(tokens[0]);
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
			address,
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
		const address = Utility.evalExpression(tokens[1]);
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
			address,
			size,
			access,
			condition: ''
		};
		await Remote.removeWatchpoint(wp);

		// Send response
		return 'OK';
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
			const bank = Z80Registers.getBankFromAddress(addr);
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
	 * Does a disassembly to the debug console for the address at the cursor position.
	 * @param filename The absolute file path.
	 * @param fromLineNr The line. Starts at 0.
	 * @param toLineNr The line. Starts at 0.
	 */
	public async disassemblyAtCursor(filename: string, fromLineNr: number, toLineNr: number): Promise<void> {
		// Get address of file/line
		let fromAddr;
		while (fromLineNr <= toLineNr) {
			fromAddr = Remote.getAddrForFileAndLine(filename, fromLineNr)
			if (fromAddr >= 0)
				break;
			fromLineNr++;
		}
		let toAddr;
		while (fromLineNr <= toLineNr) {
			toAddr = Remote.getAddrForFileAndLine(filename, toLineNr)
			if (toAddr >= 0)
				break;
			toLineNr--;
		}
		if (fromAddr < 0)
			return;

		// Check if bank is the same
		const slots = Remote.getSlots();
		if (slots) {
			const fromBank = Z80Registers.getBankFromAddress(fromAddr);
			if (fromBank >= 0) {
				const slotIndex = Z80Registers.getSlotFromAddress(fromAddr);
				if (fromBank != slots[slotIndex]) {
					this.debugConsoleAppendLine("Memory currently not paged in.  (address=" + Utility.getHexString(fromBank & 0xFFFF, 4) + "h, bank=" + fromBank + ")");
					return;
				}
			}
			const toBank = Z80Registers.getBankFromAddress(toAddr);
			if (toBank >= 0) {
				const slotIndex = Z80Registers.getSlotFromAddress(toAddr);
				if (toBank != slots[slotIndex]) {
					this.debugConsoleAppendLine("Memory currently not paged in.  (address=" + Utility.getHexString(toBank & 0xFFFF, 4) + "h, bank=" + toBank + ")");
					return;
				}
			}
		}

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
		const dasmArray = SimpleDisassembly.getDasmMemory(fromAddr, data);

		// Output
		for (const addrInstr of dasmArray) {
			this.debugConsoleAppendLine(Utility.getHexString(addrInstr.address, 4) + " " + addrInstr.instruction);
		}
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


	/*
	protected async terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments): Promise<void> {
	}
	*/

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

	public reloadLabels() {
		try {
			// Init labels
			Labels.init(Settings.launch.smallValuesMaximum);
			// Read list files
			Remote.readListFiles(Settings.launch);

			// Reset a few things
			// TODO: E.g. code coverage, history ?

			// Do disassembly anew
			DisassemblyClass.createDisassemblyInstance();

			// Both do work: ThreadEvent or invalidatedEvent or even without
			// this.sendEvent(new ThreadEvent('started', DebugSessionClass.THREAD_ID));
//			this.sendEvent(new InvalidatedEvent(undefined, DebugSessionClass.THREAD_ID, 0));

			this.sendEvent(new StoppedEvent("Labels reloaded", DebugSessionClass.THREAD_ID));
		}
		catch (e) {
			// Some error occurred
			Remote.terminate('Labels: ' + e.message);
			return "Error while initializing labels.";
		}

	}
}


DebugSessionClass.run(DebugSessionClass);

