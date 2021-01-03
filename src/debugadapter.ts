import * as fs from 'fs';
import {UnifiedPath} from './misc/unifiedpath';
import * as vscode from 'vscode';
import {Breakpoint, DebugSession, InitializedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, Thread, ContinuedEvent, CapabilitiesEvent} from 'vscode-debugadapter/lib/main';
import {DebugProtocol} from 'vscode-debugprotocol/lib/debugProtocol';
import {Labels} from './labels/labels';
import {Log} from './log';
import {RemoteBreakpoint} from './remotes/remotebase';
import {MemoryDumpView} from './views/memorydumpview';
import {MemoryRegisterView} from './views/memoryregisterview';
import {RefList} from './misc/refList';
import {Settings, SettingsParameters} from './settings';
import {DisassemblyVar, MemorySlotsVar as MemorySlotsVar, LabelVar, RegistersMainVar, RegistersSecondaryVar, StackVar /*, StructVar*/} from './variables/shallowvar';
import {Utility} from './misc/utility';
import {Z80RegisterHoverFormat, Z80RegisterVarFormat, Z80RegistersClass, Z80Registers,} from './remotes/z80registers';
import {RemoteFactory, Remote} from './remotes/remotefactory';
import {ZxNextSpritesView} from './views/zxnextspritesview';
import {TextView} from './views/textview';
import {BaseView} from './views/baseview';
import {ZxNextSpritePatternsView} from './views/zxnextspritepatternsview';
import {MemAttribute} from './disassembler/memory';
import {Decoration} from './decoration';
import {ShallowVar} from './variables/shallowvar';
import {ZSimulationView} from './remotes/zsimulator/zsimulationview';
import {ZSimRemote} from './remotes/zsimulator/zsimremote';
import {CpuHistoryClass, CpuHistory, StepHistory} from './remotes/cpuhistory';
import {StepHistoryClass} from './remotes/stephistory';
import {DisassemblyClass, Disassembly} from './misc/disassembly';
import {TimeWait} from './misc/timewait';
import {MemoryArray} from './misc/memoryarray';
import {Z80UnitTests} from './z80unittests';




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
	protected static state=DbgAdapterState.NORMAL;

	/// The address queue for the disassembler. This contains all stepped addresses.
	protected dasmAddressQueue=new Array<number>();

	/// The text document used for the temporary disassembly.
	protected disasmTextDoc: vscode.TextDocument;

	/// A list for the variables (references)
	protected listVariables=new RefList<ShallowVar>();

	/// Only one thread is supported.
	public static THREAD_ID=1;

	/// Counts the number of stackTraceRequests.
	protected stackTraceResponses=new Array<DebugProtocol.StackTraceResponse>();

	/// Will be set by startUnitTests to indicate that
	/// unit tests are running and to emit events to the caller.
	protected static unitTestHandler: ((da: DebugSessionClass) => void)|undefined;

	/// This array contains functions which are pushed on an emit (e.g. 'historySpot', not 'coverage')
	/// and which are executed after a stackTrace.
	/// The reason is that the disasm.asm file will not exist before and emits
	/// regarding this file would be lost.
	protected delayedDecorations=new Array<() => void>();

	/// Set to true if pause has been requested.
	/// Used in stepOver.
	protected pauseRequested=false;

	/// With pressing keys for stepping (i.e. F10, F11) it is possible to
	/// e.g. enter the 'stepInRequest' while the previous stepInRequest is not yet finished.
	/// I.e. before a StoppedEvent is sent. With the GUI this is not possible
	/// since the GUI disables the stepIn button. But it seems that
	/// key presses are still allowed.
	/// This variable here is set every time a step (or similar) is done.
	/// And reset when the function is finished. Should some other similar
	/// request happen a response is send but the request is ignored otherwise.
	protected processingSteppingRequest=false;


	/// This is saved text that could not be printed yet because
	// the debug console was not there.
	// It is printed a soon as the console appears.
	protected debugConsoleSavedText: string;

	/// The text written to console on event 'debug_console' is indented by this amount.
	protected debugConsoleIndentation="  ";


	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super();

		// Init line numbering
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		// Make sure the views listen on 'update' messages.
		this.on('update', BaseView.staticCallUpdateFunctions);

		/*
		this._runtime.on('stopOnStep', () => {
			this.sendEvent(new StoppedEvent('step', ZesaruxDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnBreakpoint', () => {
			this.sendEvent(new StoppedEvent('breakpoint', ZesaruxDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnException', () => {
			this.sendEvent(new StoppedEvent('exception', ZesaruxDebugSession.THREAD_ID));
		});
		this._runtime.on('breakpointValidated', (bp: ZesaruxBreakpoint) => {
			this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
		});
		this._runtime.on('output', (text, filePath, line, column) => {
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
			e.body.source = this.createSource(filePath);
			e.body.line = this.convertDebuggerLineToClient(line);
			e.body.column = this.convertDebuggerColumnToClient(column);
			this.sendEvent(e);
		});
		this._runtime.on('end', () => {
			this.sendEvent(new TerminatedEvent());
		});
		*/
	}


	/**
	 * Start the unit tests.
	 * @param configName The debug launch configuration name.
	 * @param handler
	 * @returns If it was not possible to start unit test: false.
	 */
	public static unitTests(configName: string, handler: (da: DebugSessionClass) => void): boolean {
		Utility.assert(handler);

		// Return if currently a debug session is running
		if (vscode.debug.activeDebugSession)
			return false;
		if (this.state!=DbgAdapterState.NORMAL)
			return false;

		// Start debugger
		this.unitTestHandler=handler;
		let wsFolder;
		if (vscode.workspace.workspaceFolders)
			wsFolder=vscode.workspace.workspaceFolders[0];
		this.state=DbgAdapterState.UNITTEST;
		vscode.debug.startDebugging(wsFolder, configName);

		return true;
	}

	/**
	 * Checks if the method (functionality) is implemented by the Remote.
	 */
	/*
	protected RemoteHasMethod(name: string): boolean {
		Utility.assert(Remote);
		let remote=Remote;
		let found=false;
		while (remote=Object.getPrototypeOf(remote)) {
			const className=remote.constructor.name;
			if (className=="RemoteBase")
				break;	// Stop at RemoteBase
			const methodNames=Object.getOwnPropertyNames(remote);
			found=(methodNames.indexOf(name)>=0);
			if (found) break;
		}
		return found;
	}
	*/


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
	 * @param message If defined the message is shown to the user as error.
	 */
	public terminate(message?: string) {
		(async () => {
			//DebugSessionClass.state=DbgAdapterState.NORMAL;
			if (message)
				this.showError(message);
			Log.log("Exit debugger!");
			// Remove all listeners
			this.removeAllListeners();	// Don't react on events anymore
			// Terminate
			/* Not necessary: the TerminatedRequest results in a disconnectRequest.
			try {
				await Remote?.disconnect();
			}
			catch {};
			*/
			this.sendEvent(new TerminatedEvent());
			//this.sendEvent(new ExitedEvent());
		})();
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
	 * - when the ZEsarUX socket connection is terminated
	 * Not called:
	 * - If user presses circled arrow/restart.
	 */
	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): Promise<void> {
		// Disconnect Remote etc.
		this.disconnectAll();
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
		// Clear all decorations
		if (DebugSessionClass.state==DbgAdapterState.UNITTEST) {
			// Cancel unit tests
			Z80UnitTests.cancelUnitTests();
			// Clear decoration
			Decoration?.clearAllButCodeCoverageDecorations();
		}
		else
			Decoration?.clearAllDecorations();
		DebugSessionClass.state=DbgAdapterState.NORMAL;
		// Close views, e.g. register memory view
		BaseView.staticCloseAll();
		this.removeListener('update', BaseView.staticCallUpdateFunctions);
		// Stop machine
		this.removeAllListeners();	// Don't react on events anymore
		// Disconnect
		await Remote?.disconnect();	// No await: This may take longer than 1 sec and vscode shows an error after 1 sec.
		// Clear the history instance
		CpuHistoryClass.removeCpuHistory();
		// Clear Remote
		RemoteFactory.removeRemote();
		// Remove disassembly text editor. vscode does not support closing directly, thus this hack:
		if (this.disasmTextDoc) {
			vscode.window.showTextDocument(this.disasmTextDoc.uri, {preview: true, preserveFocus: false})
				.then(() => {
					return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
				});
		}
	}


	/**
	 * 'initialize' request.
	 * Respond with supported features.
	 */
	protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): Promise<void> {

		//const dbgSession = vscode.debug.activeDebugSession;
		// build and return the capabilities of this debug adapter:
		response.body=response.body||{};

		// the adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest=false;

		// Is done in launchRequest:
		//response.body.supportsStepBack = true;

		// Maybe terminated on error
		response.body.supportTerminateDebuggee=true;

		// The PC value might be changed.
		//response.body.supportsGotoTargetsRequest = true;
		// I use my own "Move Program Counter to Cursor".
		// GotoTargetsRequest would be working now, but not in all cases.
		// If the file is not recognized yet. It does not work.
		// Thought it has something to do with loadSourcesRequest but it doesn't.
		response.body.supportsGotoTargetsRequest=false;

		// Support hovering over values (registers)
		response.body.supportsEvaluateForHovers=true;

		// Support changing of variables (e.g. registers)
		response.body.supportsSetVariable=true;

		// Supports conditional breakpoints
		response.body.supportsConditionalBreakpoints=true;

		// Handles debug 'Restart'
		response.body.supportsRestartRequest=true;

		this.sendResponse(response);

		// Note: The InitializedEvent will be send when the socket connection has been successful. Afterwards the breakpoints are set.
	}


	/**
	 * Called when 'Restart' is pressed.
	 * Disconnects and destroys the old emulator connection and sets up a new one.
	 * @param response
	 * @param args
	 */
	protected async restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments): Promise<void> {
		// Stop machine
		await this.disconnectAll();
		//Remote.disconnect().then(() => {
			// And setup a new one
			this.launch(response);
		//});
	}


	/**
	 * Prints text to the debug console.
	 */
	protected debugConsoleAppend(text: string) {
		if (vscode.debug.activeDebugSession)
			vscode.debug.activeDebugConsole.append(text);
		else {
			// Save text
			this.debugConsoleSavedText+=text;
		}
	}
	protected debugConsoleAppendLine(text: string) {
		this.debugConsoleAppend(text+'\n');
	}


	/**
	 * Called after 'initialize' request.
	 * Loads the list file and connects the socket to the zesarux debugger.
	 * Initializes zesarux.
	 * When zesarux is connected and initialized an 'initialized' event
	 * is sent.
	 * @param response
	 * @param args
	 */
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: SettingsParameters) {
		try {
			// Init static views
			BaseView.staticInit();
			ZxNextSpritePatternsView.staticInit();

			// Set root path
			Utility.setRootPath((vscode.workspace.workspaceFolders)? vscode.workspace.workspaceFolders[0].uri.fsPath:'');

			// Save args
			const rootFolder=(vscode.workspace.workspaceFolders)? vscode.workspace.workspaceFolders[0].uri.fsPath:'';
			Settings.Init(args, rootFolder);
			Settings.CheckSettings();
		}
		catch (e) {
			// Some error occurred
			response.success=false;
			response.message=e.message;
			this.sendResponse(response);
			return;
		}

		// Register to get a note when debug session becomes active
		this.debugConsoleSavedText='';
		vscode.debug.onDidChangeActiveDebugSession(dbgSession => {
			if (dbgSession) {
				vscode.debug.activeDebugConsole.append(this.debugConsoleSavedText);
				this.debugConsoleSavedText='';
			}
		});

		// Launch emulator
		await this.launch(response);
	}


	/**
	 * Launches the emulator. Can be called from launchRequest and restartRequest.
	 * @param response
	 */
	protected async launch(response: DebugProtocol.Response) {
		DebugSessionClass.state=DbgAdapterState.NORMAL;
		// Setup the disassembler
		DisassemblyClass.createDisassemblyInstance();

		// Init
		this.processingSteppingRequest=false;

		// Start the emulator and the connection.
		const msg=await this.startEmulator();
		if (msg) {
			response.message=msg;
			response.success=(msg==undefined);
		}
		else {
			// Check if reverse debugging is enabled and send capabilities
			if (Settings.launch.history.reverseDebugInstructionCount>0) {
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
	protected async startEmulator(): Promise<string|undefined> {
		try {
			// Init labels
			Labels.init(Settings.launch.smallValuesMaximum);
		}
		catch (e) {
			// Some error occurred
			this.terminate('Labels: '+e.message);
			return "Error while initializing labels.";
		}

		// Call the unit test handler. It will subscribe on events.
		if (DebugSessionClass.unitTestHandler) {
			DebugSessionClass.state=DbgAdapterState.UNITTEST;
			DebugSessionClass.unitTestHandler(this);
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
			this.terminate(err.message);
		});

		Remote.once('terminated', () => {
			// Emulator has been terminated (e.g. by unit tests)
			this.terminate();
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
			return err.message;
		}

		Remote.on('stoppedEvent', reason => {
			// Remote requests to generate a StoppedEvent e.g. because the PC or the
			// SP has been changed manually.
			this.sendEvent(new StoppedEvent(reason, DebugSessionClass.THREAD_ID));
		});

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

		return new Promise<undefined>(async resolve => {	// For now there is no unsuccessful (reject) execution
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
					StepHistory.decoder=Z80Registers.decoder;
				StepHistory.init();

				// Create memory/register dump view
				const registerMemoryView=new MemoryRegisterView();
				const regs=Settings.launch.memoryViewer.registersMemoryView;
				registerMemoryView.addRegisters(regs);
				await registerMemoryView.update();



				// Run user commands after load.
				for (const cmd of Settings.launch.commandsAfterLaunch) {
					this.debugConsoleAppendLine(cmd);
					try {
						const text=await this.evaluateCommand(cmd);
						this.debugConsoleAppendLine(text);
					}
					catch (err) {
						// Some problem occurred
						const output="Error while executing '"+cmd+"' in 'commandsAfterLaunch': "+err.message;
						this.showWarning(output);
					}
				}

				// At the end, if remote type == ZX simulator, open its window.
				// Note: it was done this way and not in the Remote itself, otherwise
				// there would be a dependency in RemoteFactory to vscode which in turn /// makes problems for the Unittests.
				if (Settings.launch.remoteType=="zsim") {
					// Adds a window that displays the ZX screen.
					const remote=Remote as ZSimRemote;
					ZSimulationView.SimulationViewFactory(remote);
				}

				// Socket is connected, allow setting breakpoints
				this.sendEvent(new InitializedEvent());
				// Respond
				resolve(undefined);

				// Check if program should be automatically started
				StepHistory.clear();
				if (DebugSessionClass.unitTestHandler) {
					// Handle continue/stop in the z80unittests.
					this.emit('initialized');
				}
				else {
					if (Settings.launch.startAutomatically) {
						// The ContinuedEvent is necessary in case vscode was stopped and a restart is done. Without, vscode would stay stopped.
						this.sendEventContinued();
						setTimeout(() => {
							// Delay call because the breakpoints are set afterwards.
							this.handleRequest(undefined, async () => {
								// Normal operation
								return await this.remoteContinue();
							});
						}, 500);
					}
					else {
						// Break
						this.sendEvent(new StoppedEvent('stop on start', DebugSessionClass.THREAD_ID));
					}
				}
				DebugSessionClass.unitTestHandler=undefined;
			});

			// Initialize Remote
			try {
				await Remote.init();
			}
			catch (e) {
				// Some error occurred
				const error=e.message||"Error";
				this.terminate('Init remote: '+error);
			}
		});
	}


	/**
	 * The breakpoints are set for a path (file).
	 * @param response
	 * @param args lines=array with line numbers. source.path=the file path
	 */
	protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): Promise<void> {
		const path=UnifiedPath.getUnifiedPath(<string>args.source.path);

		// convert breakpoints
		const givenBps=args.breakpoints||[];
		const bps=new Array<RemoteBreakpoint>();
		for (const bp of givenBps) {
			try {
				const log=Remote.evalLogMessage(bp.logMessage);
				const mbp: RemoteBreakpoint= {
					bpId: 0,
					filePath: path,
					lineNr: this.convertClientLineToDebugger(bp.line),
					address: -1,	// not known yet
					condition: (bp.condition)? bp.condition:'',
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
		const currentBreakpoints=await Remote.setBreakpoints(path, bps);
		const source=this.createSource(path);
		// Now match all given breakpoints with the available.
		const vscodeBreakpoints=givenBps.map(gbp => {
			// Search in current list
			let foundCbp;
			const lineNr=gbp.line;
			for (const cbp of currentBreakpoints) {
				const cLineNr=this.convertDebuggerLineToClient(cbp.lineNr);
				if (cLineNr==lineNr) {
					foundCbp=cbp;
					break;
				}
			}

			// Create vscode breakpoint with verification
			const verified=(foundCbp!=undefined)&&(foundCbp.address>=0);
			const bp=new Breakpoint(verified, lineNr, 0, source);
			if (foundCbp && foundCbp.address>=0) {
				// Add address to source name.
				const addrString = Utility.getLongAddressString(foundCbp.address);
				// Add hover text
				let txt=addrString;
				const labels=Labels.getLabelsForNumber64k(foundCbp.address);
				labels.map(lbl => txt+='\n'+lbl);
				(bp as any).message=txt;
			}

			// Additional print warning if not verified
			if (!verified) {
				const text=JSON.stringify(bp);
				this.debugConsoleAppendLine('Unverified breakpoint:'+text);
			}

			return bp;
		});

		// send back the actual breakpoint positions
		response.body={
			breakpoints: vscodeBreakpoints
		};
		this.sendResponse(response);
	}


	/**
	 * Returns the one and only "thread".
	 */
	protected async threadsRequest(response: DebugProtocol.ThreadsResponse): Promise<void> {
		// Just return a default thread.
		response.body={
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
	private createSource(filePath: string): Source|undefined {
		if (filePath.length==0)
			return undefined;
		const uFilePath=UnifiedPath.getUnifiedPath(filePath);
		const fname=UnifiedPath.basename(uFilePath);
		const debPath=this.convertDebuggerPathToClient(uFilePath);
		const uDebPath=UnifiedPath.getUnifiedPath(debPath);
		return new Source(fname, uDebPath, undefined, undefined, undefined);
	}


	/**
	 * Returns the stack frames.
	 */
	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): Promise<void> {
		// vscode sometimes sends 2 stack trace requests one after the other. Because the lists are cleared this can lead to race conditions.
		this.stackTraceResponses.push(response);
		if (this.stackTraceResponses.length>1)
			return;

		// Stack frames
		const sfrs=new Array<StackFrame>();

		// Need to check if disassembly is required.
		let doDisassembly=false;
		const fetchAddresses=new Array<number>();
		let frameCount=0;

		// Clear all variables
		this.listVariables.length=0;

		// Get the call stack trace.
		let callStack;
		//let slots;
		if (StepHistory.isInStepBackMode()) {
			// Get callstack
			callStack=StepHistory.getCallStack();
		}
		else {
			// Get callstack
			callStack=await Remote.getCallStackCache();
		}

		// Go through complete call stack and get the sources.
		// If no source exists than get a hexdump and disassembly later.
		frameCount=callStack.length;
		for (let index=frameCount-1; index>=0; index--) {
			const frame=callStack[index];
			// Get file for address
			const addr=frame.addr;
			const file=Labels.getFileAndLineForAddress(addr);
			// Store file, if it does not exist the name is empty
			const src=this.createSource(file.fileName);
			const lineNr=(src)? this.convertDebuggerLineToClient(file.lineNr):0;
			const sf=new StackFrame(index+1, frame.name, src, lineNr);
			sfrs.push(sf);
			// Create array with addresses that need to be fetched for disassembly
			if (!sf.source) {
				const frame=callStack[index];
				fetchAddresses.push(frame.addr);
			}
		}

		// Create memory array.
		const fetchSize=100;	// N bytes
		const memArray=new MemoryArray();
		for (const fetchAddress of fetchAddresses) {
			memArray.addRange(fetchAddress, fetchSize);	// assume 100 bytes each
		}
		// Add some more memory from the history
		const fetchHistorySize=20;
		const historyAddresses=new Array<number>();
		for (let i=1; i<=10; i++) {
			const addr=StepHistory.getPreviousAddress(i);
			if (addr==undefined)
				break;
			// Add address
			memArray.addRange(addr, fetchHistorySize);	// assume at least 4 bytes, assume some more to cover small jumps
			historyAddresses.unshift(addr);
		}

		// Check if we need to fetch any dump.
		for (const range of memArray.ranges) {
			const data=await Remote.readMemoryDump(range.address, range.size);
			range.data=data;
		}

		// Check if we need to fetch any dump.
		const fetchAddressesCount=fetchAddresses.length;

		if (!doDisassembly) {
			const checkSize=40;	// Needs to be smaller than fetch-size in order not to do a disassembly too often.
			if (fetchAddressesCount>0) {
				// Now get hex-dumps for all non existing sources.
				for (let index=0; index<fetchAddressesCount; index++) {
					// So fetch a memory dump
					const fetchAddress=fetchAddresses[index];
					// Note: because of self-modifying code it may have changed
					// since it was fetched at the beginning.
					// Check if memory changed.
					for (let k=0; k<checkSize; k++) {
						const val=Disassembly.memory.getValueAt((fetchAddress+k)&0xFFFF);
						const memAttr=Disassembly.memory.getAttributeAt(fetchAddress+k);
						const newVal=memArray.getValueAtAddress((fetchAddress+k)&0xFFFF);
						if ((val!=newVal)||(memAttr==MemAttribute.UNUSED)) {
							doDisassembly=true;
							break;
						}
					}
				}
			}
		}

		// Check if a new address was used.
		for (let i=0; i<fetchAddressesCount; i++) {
			// The current PC is for sure a code label.
			const addr=fetchAddresses[i];
			if (this.dasmAddressQueue.indexOf(addr)<0)
				this.dasmAddressQueue.unshift(addr);
			// Check if this requires a disassembly
			if (!doDisassembly) {
				const memAttr=Disassembly.memory.getAttributeAt(addr&0xFFFF);
				if (!(memAttr&MemAttribute.CODE_FIRST))
					doDisassembly=true;	// If memory was not the start of an opcode.
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
			const absFilePath=DisassemblyClass.getAbsFilePath();
			const uri=vscode.Uri.file(absFilePath);
			const editCreate=new vscode.WorkspaceEdit();
			editCreate.createFile(uri, {overwrite: true});
			await vscode.workspace.applyEdit(editCreate);
			const textDoc=await vscode.workspace.openTextDocument(absFilePath);
			// Store uri
			this.disasmTextDoc=textDoc;

			// Initialize disassembly
			Disassembly.initWithCodeAdresses([...historyAddresses, ...fetchAddresses], memArray.ranges);
			// Disassemble
			Disassembly.disassemble();
			// Read data
			const text=Disassembly.getDisassemblyText();

			// Get all source breakpoints of the disassembly file.
			const bps=vscode.debug.breakpoints;
			const disSrc=this.disasmTextDoc.uri.toString();
			const sbps=bps.filter(bp => {
				if (bp.hasOwnProperty('location')) {
					const sbp=bp as vscode.SourceBreakpoint;
					const sbpSrc=sbp.location.uri.toString();
					if (sbpSrc==disSrc)
						return true;
				}
				return false;
			}) as vscode.SourceBreakpoint[];

			// Check if any breakpoint
			const changedBps=new Array<vscode.SourceBreakpoint>();
			if (sbps.length>0) {
				// Previous text
				const prevTextLines=this.disasmTextDoc.getText().split('\n');

				// Loop all source breakpoints to compute changed BPs
				for (const sbp of sbps) {
					const lineNr=sbp.location.range.start.line;
					const line=prevTextLines[lineNr];
					const addr=parseInt(line, 16);
					if (!isNaN(addr)) {
						// Get line number
						const nLineNr=Disassembly.getLineForAddress(addr)||-1;
						// Create breakpoint
						const nLoc=new vscode.Location(this.disasmTextDoc.uri, new vscode.Position(nLineNr, 0));
						const cbp=new vscode.SourceBreakpoint(nLoc, sbp.enabled, sbp.condition, sbp.hitCondition, sbp.logMessage);
						// Store
						changedBps.push(cbp);
					}
				}
			}
			// Remove all old breakpoints.
			vscode.debug.removeBreakpoints(sbps);

			// Create and apply one replace edit
			const editReplace=new vscode.WorkspaceEdit();
			editReplace.replace(this.disasmTextDoc.uri, new vscode.Range(0, 0, this.disasmTextDoc.lineCount, 0), text);
			await vscode.workspace.applyEdit(editReplace);
			// Save after edit (to be able to set breakpoints)
			await this.disasmTextDoc.save();
			// Add all new breakpoints.
			vscode.debug.addBreakpoints(changedBps);

			// If disassembly text editor is open, then show decorations
			const editors=vscode.window.visibleTextEditors;
			for (const editor of editors) {
				if(editor.document==this.disasmTextDoc)
					Decoration.SetDisasmCoverageDecoration(editor);
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
		if (frameCount>0) {
			const absFilePath=DisassemblyClass.getAbsFilePath();
			const src=this.createSource(absFilePath) as Source;
			let indexDump=0;
			for (let i=0; i<frameCount; i++) {
				const sf=sfrs[i];
				if (sf.source)
					continue;
				// Get line number for stack address
				const addr=fetchAddresses[indexDump];
				// Get line number
				const foundLine=Disassembly.getLineForAddress(addr)||-1
				const lineNr=this.convertDebuggerLineToClient(foundLine);
				// Store
				sf.source=src;
				sf.line=lineNr;
				// Next
				indexDump++;
			}
		}

		// Send as often as there have been requests
		while (this.stackTraceResponses.length>0) {
			const resp=this.stackTraceResponses[0];
			this.stackTraceResponses.shift();
			resp.body={stackFrames: sfrs, totalFrames: 1};
			this.sendResponse(resp);
		}

		// At the end of the stack trace request the collected decoration events
		// are executed. This is because the disasm.asm did not exist before und thus
		// events like 'historySpot' would be lost.
		// Note: codeCoverage is handled differently because it is not sent during
		// step-back.
		for (const func of this.delayedDecorations)
			func();
		this.delayedDecorations.length=0;
	}


	/**
	 * Returns the different scopes. E.g. 'Disassembly' or 'Registers' that are shown in the Variables area of vscode.
	 * @param response
	 * @param args
	 */
	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): Promise<void> {
		const scopes=new Array<Scope>();
		const frameId=args.frameId;
		//const frame = this.listFrames.getObject(frameId);
		let frame;
		if (StepHistory.isInStepBackMode())
			frame=StepHistory.getCallStack().getObject(frameId);
		else {
			await Remote.getCallStackCache();	// make sure listFrames exist
			frame=Remote.getFrame(frameId);
		}
		if (!frame) {
			// No frame found, send empty response
			response.body={scopes: scopes};
			this.sendResponse(response);
			return;
		}

		// Create variable object for Registers
		const varRegistersMain=new RegistersMainVar();
		// Add to list and get reference ID
		let ref=this.listVariables.addObject(varRegistersMain);
		scopes.push(new Scope("Registers", ref));

		// Create variable object for secondary Registers
		const varRegisters2=new RegistersSecondaryVar();
		// Add to list and get reference ID
		const ref2=this.listVariables.addObject(varRegisters2);
		scopes.push(new Scope("Registers 2", ref2));

		// Get address
		if (frame) {
			// use address
			const addr=frame.addr&0xFFFF;
			// Create variable object for Disassembly
			const varDisassembly=new DisassemblyVar(addr, Settings.launch.disassemblerArgs.numberOfLines);
			// Add to list and get reference ID
			const ref=this.listVariables.addObject(varDisassembly);
			scopes.push(new Scope("Disassembly", ref));
		}

		// Create variable object for MemorySlots
		const varMemorySlots=new MemorySlotsVar();
		// Add to list and get reference ID
		ref=this.listVariables.addObject(varMemorySlots);
		scopes.push(new Scope("Memory", ref));

		// Create variable object for the stack
		const varStack=new StackVar(frame.stack, frame.stackStartAddress);
		// Add to list and get reference ID
		ref=this.listVariables.addObject(varStack);
		scopes.push(new Scope("Local Stack", ref));

		// Send response
		response.body={scopes: scopes};
		this.sendResponse(response);
	}


	/**
	 * Returns the variables for the scopes (e.g. 'Disassembly' or 'Registers')
	 * @param response
	 * @param args
	 */
	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): Promise<void> {
		// Get the associated variable object
		const ref=args.variablesReference;
		const varObj=this.listVariables.getObject(ref);
		// Check if object exists
		if (varObj) {
			// Get contents
			const varList=await varObj.getContent(args.start, args.count);
			response.body={variables: varList};
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
		const pc=Remote.getPCLong();
		Decoration.showBreak(pc, breakReason);
	}


	/**
	 * This method is called before a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 */
	protected startProcessing() {
		// Start processing
		this.processingSteppingRequest=true;
		// Reset pause request
		this.pauseRequested=false;
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
		this.processingSteppingRequest=false;
		// Do the same for the Remote
		Remote.stopProcessing();
	}


	/**
	  * vscode requested 'continue'.
	  * @param response
	  * @param args
	  */
	public async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): Promise<void> {
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

		const breakReasonString=await Remote.continue();
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

		// React depending on internal state.
		if (DebugSessionClass.state==DbgAdapterState.NORMAL) {
			// Send break
			return new StoppedEvent('break', DebugSessionClass.THREAD_ID);
		}
		else {
			// For the unit tests
			this.emit("break");
			return undefined as any;
		}
	}


	/**
	 * Is called by unit tests to simulate a 'break'.
	 */
	public async sendEventBreakAndUpdate(): Promise<void> {
		// Update memory dump etc.
		await this.update();
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
	protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): Promise<void> {
		try {
			this.pauseRequested=true;
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
	protected async reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): Promise<void> {
		this.handleRequest(response, async () => {
			// Output
			await this.startStepInfo('Reverse-Continue', true);

			// Reverse continue
			const breakReason=await StepHistory.reverseContinue();

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
	 * When the response is received by vscode it changed the current highlighted line
	 * into an unhighlighted state and shows the 'pause' button.
	 * I.e. for short commands this could lead to flickering, but if the
	 * UI is changed after command no flickering appears.
	 * On the other hand, if a command takes too long it is necessary to show
	 * the 'pause' button. So a timer assures that the response is sent after a timeout.
	 * The function takes care that the response is sent only once.
	 */
	protected handleRequest(response: any, command: () => Promise<StoppedEvent>, responseTime=750) {
		if (this.processingSteppingRequest) {
			// Response is sent immediately if already something else going on
			this.sendResponse(response);
			return;
		}

		// Start processing
		this.startProcessing();

		// Start timer to send response for long running commands
		let respTimer: NodeJS.Timeout|undefined;
		if (response) {
			respTimer=setTimeout(() => {
				// Send response after a short while so that the vscode UI can show the break button
				respTimer=undefined;
				this.sendResponse(response);
			}, responseTime);	// 1 s
		}

		// Start command
		(async () => {
			const event = await command();

			// End processing
			this.stopProcessing();

			// Update memory dump etc. (also in reverse debug because of the register display)
			await this.update({step: true});

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
	protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Over');

			// T-states info and lite history
			const stepBackMode=StepHistory.isInStepBackMode();

			// The stepOver should also step over macros, fake instructions, several instruction on the same line.
			// Therefore the stepOver is repeated until really a new
			// file/line correspondents to the PC value.
			//Remote.getRegisters();
			const prevPc=Remote.getPCLong();
			const prevFileLoc=Labels.getFileAndLineForAddress(prevPc);
			let i=0;
			let breakReason;
			const timeWait=new TimeWait(500, 200, 100);
			while (true) {
				i++;

				// Give vscode some time for a break
				await timeWait.waitAtInterval();

				// Print instruction
				const instr=await this.getCurrentInstruction(i);
				if (instr)
					this.debugConsoleIndentedText(instr);

				// Check for reverse debugging.
				if (stepBackMode) {
					// Step-Over
					breakReason=await StepHistory.stepOver();
				}
				else {
					// Normal Step-Over
					breakReason=await Remote.stepOver();
				}

				// Check for pause request
				if (this.pauseRequested) {
					breakReason="Manual break";
				}

				// Leave loop in case there is a break reason
				if (breakReason) {
					// Stop
					break;
				}

				// Get new file/line location
				//await Remote.getRegisters();
				const pc=Remote.getPCLong();
				const nextFileLoc=Labels.getFileAndLineForAddress(pc);
				// Compare with start location
				if (prevFileLoc.fileName=='')
					break;
				if (nextFileLoc.lineNr!=prevFileLoc.lineNr)
					break;
				if (nextFileLoc.fileName!=prevFileLoc.fileName)
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
		const stepBackMode=StepHistory.isInStepBackMode()||alwaysHistorical;
		if (text) {
			if (stepBackMode) {
				text='Time-travel '+text;
				if (!(CpuHistory as any))
					text+=' (Lite)';
			}
			this.debugConsoleAppendLine(text);
		}

		// If not in step back mode
		if (!stepBackMode) {
			// Checks if lite history is used.
			// If so, store the history.
			if (!(CpuHistory as any)) {
				// Store as (lite step history)
				const regsCache=Z80Registers.getCache();
				StepHistory.pushHistoryInfo(regsCache);
				const callStack=await Remote.getCallStackCache();
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
		const tStates=await Remote.getTstates();
		// Display T-states and time
		let tStatesText;
		if (tStates) {
			tStatesText='T-States: '+tStates;
			// Get frequency
			const cpuFreq=await Remote.getCpuFrequency();
			if (cpuFreq) {
				// Time
				let time=tStates/cpuFreq;
				let unit='s';
				if (time<1e-3) {
					time*=1e+6;
					unit='us';
				}
				else if (time<1) {
					time*=1e+3;
					unit='ms';
				}
				// CPU clock
				let clockStr=(cpuFreq*1E-6).toPrecision(2);
				if (clockStr.endsWith('.0'))
					clockStr=clockStr.substr(0, clockStr.length-2);
				tStatesText+=', time: '+time.toPrecision(3)+unit+'@'+clockStr+'MHz';
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
	protected async getCurrentInstruction(count=0): Promise<string|undefined> {
		const maxInstructionCount=10;
		const pc=Remote.getPC();
		const pcStr=Utility.getHexString(pc, 4);
		// Check if count too high
		if (count==maxInstructionCount)
			return pcStr+' ...';
		if (count>maxInstructionCount)
			return undefined;

		// Get instruction
		let disInstr;
		const stepBackMode=StepHistory.isInStepBackMode();
		if (stepBackMode) {
			// Reverse debug mode
			disInstr=StepHistory.getCurrentInstruction();
		}
		else {
			// Normal mode: Disassemble instruction
			const data=await Remote.readMemoryDump(pc, 4);
			disInstr=DisassemblyClass.getInstruction(pc, data);
		}
		// Construct result string
		let result;
		if (disInstr)
			result=pcStr+" "+disInstr;
		return result;
	}


	/**
	  * vscode requested 'step into'.
	  * @param response
	  * @param args
	  */
	protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Into');

			// Print instruction
			const instr=await this.getCurrentInstruction();
			if (instr)
				this.debugConsoleIndentedText(instr);

			// Check for reverse debugging.
			let breakReason;
			const stepBackMode=StepHistory.isInStepBackMode();
			if (stepBackMode) {
				// StepInto
				breakReason=await StepHistory.stepInto();
			}
			else {
				// Step-Into
				StepHistory.clear();
				// Step into
				breakReason=await Remote.stepInto();
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

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		});
	}


	/**
	 * vscode requested 'step out'.
	 * @param response
	 * @param args
	 */
	protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Out');

			// Check for reverse debugging.
			let breakReasonString;
			const stepBackMode=StepHistory.isInStepBackMode();
			if (stepBackMode) {
				// StepOut
				breakReasonString=await StepHistory.stepOut();
			}
			else {
				// Normal Step-Out
				StepHistory.clear();
				breakReasonString=await Remote.stepOut();
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

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		});
	}


	/**
	  * vscode requested 'step backwards'.
	  * @param response
	  * @param args
	  */
	protected async stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): Promise<void> {
		this.handleRequest(response, async () => {

			await this.startStepInfo('Step-Back', true);

			// Step back
			const breakReason=await StepHistory.stepBack();

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
				const instr=await this.getCurrentInstruction();
				if (instr)
					this.debugConsoleIndentedText(instr);
			}

			// Send event
			return new StoppedEvent('step', DebugSessionClass.THREAD_ID);
		});
	}


	/**
	 * Evaluates the command and executes it.
	 * The method might throw an exception if it cannot parse the command.
	 * @param command E.g. "-exec tbblue-get-register 57" or "-wpmem disable".
	 * @returns A Promise<string> with an text to output (e.g. an error).
	 */
	protected async evaluateCommand(command: string): Promise<string> {
		const expression=command.trim().replace(/\s+/g, ' ');
		const tokens=expression.split(' ');
		const cmd=tokens.shift();
		if (!cmd)
			throw Error("No command.");

		// Check for "-view"
		let viewTitle;
		if (tokens[0]=='-view') {
			tokens.shift();
			viewTitle=cmd.substr(1)+' '+tokens.join(' ');	// strip '-'
		}

		// All commands start with "-"
		let output;
		if (cmd=='-help'||cmd=='-h') {
			output = await this.evalHelp(tokens);
		}
		else if (cmd=='-LOGPOINT'||cmd=='-logpoint') {
			output = await this.evalLOGPOINT(tokens);
		}
		else if (cmd=='-ASSERTION'||cmd=='-assertion') {
			output = await this.evalASSERTION(tokens);
		}
		else if (cmd=='-eval') {
			output = await this.evalEval(tokens);
		}
		else if (cmd=='-exec'||cmd=='-e') {
			output = await this.evalExec(tokens);
		}
		else if (cmd=='-label'||cmd=='-l') {
			output = await this.evalLabel(tokens);
		}
		else if (cmd=='-md') {
			output = await this.evalMemDump(tokens);
		}
		else if (cmd=='-ms') {
			output = await this.evalMemSave(tokens);
		}
		else if (cmd=='-mv') {
			output = await this.evalMemView(tokens);
		}
		else if (cmd=='-dasm') {
			output = await this.evalDasm(tokens);
		}
		else if (cmd=='-patterns') {
			output = await this.evalSpritePatterns(tokens);
		}
		else if (cmd=='-WPMEM'||cmd=='-wpmem') {
			output = await this.evalWPMEM(tokens);
		}
		else if (cmd=='-sprites') {
			output = await this.evalSprites(tokens);
		}
		else if (cmd=='-state') {
			output = await this.evalStateSaveRestore(tokens);
		}
		// Debug commands
		else if (cmd=='-dbg') {
			output = await this.evalDebug(tokens);
		}
		//
		else {
			// Unknown command
			throw Error("Unknown command: '"+expression+"'");
		}

		// Check for output target
		if (viewTitle) {
			// Output text to new view.
			// Create new view
			const panel=new TextView(viewTitle, output);
			await panel.update();
			// Send empty response
			return '';
		}
		else {
			// Output text to console
			return output;
		}
	}


	/**
	 * Is called when hovering or when an expression is added to the watches.
	 * Or if commands are input in the debug console.
	 * both have different formats:
	 * - hovering: "word", e.g. "data_b60" or ".loop" or "HL"
	 * - debug console: starts with "-", e.g. "-wpmem enable"
	 */
	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): Promise<void> {
		// Check if its a debugger command
		const expression=args.expression.trim();
		const tokens=expression.split(' ');
		const cmd=tokens.shift();
		if (cmd==undefined) {
			this.sendResponse(response);
			return;
		}

		// Check for debug console
		if (expression.startsWith('-')) {
			try {
				if (expression.startsWith('-')) {
					const text=await this.evaluateCommand(expression);
					this.sendEvalResponse(text, response);
				}
			}
			catch (err) {
				let output="Error";
				if (err.message)
					output+=': '+err.message;
				this.sendEvalResponse(output, response);
			}
			return;
		}

		// Hover
		Log.log('evaluate.expression: '+args.expression);
		Log.log('evaluate.context: '+args.context);
		Log.log('evaluate.format: '+args.format);

		// Check if it is a register
		const name = expression;
		if (Z80RegistersClass.isRegister(name)) {
			const formatMap=(args.context=='hover')? Z80RegisterHoverFormat:Z80RegisterVarFormat;
			const formattedValue=await Utility.getFormattedRegister(name, formatMap); response.body={
				result: formattedValue,
				variablesReference: 0
			};
			this.sendResponse(response);
			return;
		}


		// Check if it is a label. A label may have a special formatting:
		// Example: LBL_TEXT 10, b
		// = Address LBL_TEXT, 10 bytes
		const match=/^@?([^\s,]+)\s*(,\s*([^\s,]*))?(,\s*([^\s,]*))?/.exec(name);
		if (match) {
			let labelString=match[1];
			let elemCountString=match[3];
			let byteWord=match[5];
			// Defaults
			if (labelString) {
				let labelValue=NaN;
				let lastLabel;
				let modulePrefix;
				// First check for module name and local label prefix (sjasmplus).
				//Remote.getRegisters().then(() => {
				const pcLongAddr = Remote.getPCLong();
				const entry = Labels.getFileAndLineForAddress(pcLongAddr);
				// Local label and prefix
				lastLabel = entry.lastLabel;
				modulePrefix = entry.modulePrefix;

				// Convert label
				try {
					labelValue = Utility.evalExpression(labelString, false, modulePrefix, lastLabel);
				} catch {}

				if (isNaN(labelValue)) {
					// Return empty response
					this.sendResponse(response);
					return;
				}

				// Is a number
				let elemCount = 100;
				if (elemCountString) {
					const readSize = Labels.getNumberFromString64k(elemCountString) || NaN;
					if (!isNaN(readSize))
						elemCount = readSize;
				}
				if (!byteWord || byteWord.length == 0)
					byteWord = "bw";	// both byte and word
				// Create fullLabel
				const fullLabel = Utility.createFullLabel(labelString, "", lastLabel);	// Note: the module is from the PC location, this could be irritating. Therefore it is left off.
				// Now create a "variable" for the bigValues or small values
				const format = (labelValue <= Settings.launch.smallValuesMaximum) ? Settings.launch.formatting.smallValues : Settings.launch.formatting.bigValues;
				Utility.numberFormatted(name, labelValue, 2, format, undefined).then(formattedValue => {
					if (labelValue <= Settings.launch.smallValuesMaximum) {
						// small value
						// Response
						response.body = {
							result: (args.context == 'hover') ? fullLabel + ': ' + formattedValue : formattedValue,
							variablesReference: 0,
							//type: "data",
							//namedVariables: 0
						}
					}
					else {
						// big value
						// Create a label variable
						const labelVar = new LabelVar(labelValue, elemCount, byteWord, this.listVariables);


						/* TODO: Implement:
						let labelVar;
						// Get sub properties
						const props = Labels.getSubLabels(byteWord);
						if (props.length == 0) {
							// Simple label
							labelVar = new LabelVar(labelValue, elemCount, byteWord, this.listVariables);
						}
						else {
							const size = Labels.getNumberFromString64k(byteWord);
							labelVar = new StructVar(labelValue, elemCount, size, byteWord, props, this.listVariables);
						}
						*/

						// Add to list
						const ref = this.listVariables.addObject(labelVar);
						// Response
						response.body = {
							result: (args.context == 'hover') ? fullLabel + ': ' + formattedValue : formattedValue,
							variablesReference: ref,
							type: "data",
							//presentationHint: ,
							namedVariables: 2,
							//indexedVariables: 100
						}
					}
					this.sendResponse(response);
				});
				//});	// Emulator.getRegisters
				return;
			}	// If labelString
		}	// If match

		// Default: return nothing
		this.sendResponse(response);
	}


	/**
	 * Prints a help text for the debug console commands.
	 * @param tokens The arguments. Unused.
 	 * @param A Promise with a text to print.
	 */
	protected async evalHelp(tokens: Array<string>): Promise<string> {
		const output=
			`Allowed commands are:
"-ASSERTION enable|disable|status":
	- enable|disable: Enables/disables all breakpoints caused by ASSERTIONs set in the sources. All ASSERTIONs are by default enabled after startup of the debugger.
	- status: Shows enable status of ASSERTION breakpoints.
"-dasm address count": Disassembles a memory area. count=number of lines.
"-eval expr": Evaluates an expression. The expression might contain
mathematical expressions and also labels. It will also return the label if
the value correspondends to a label.
"-exec|e cmd args": cmd and args are directly passed to ZEsarUX. E.g. "-exec get-registers".
"-help|h": This command. Do "-e help" to get all possible ZEsarUX commands.
"-label|-l XXX": Returns the matching labels (XXX) with their values. Allows wildcard "*".
"-LOGPOINT enable|disable|status [group]":
	- enable|disable: Enables/disables all logpoints caused by LOGPOINTs of a certain group set in the sources. If no group is given all logpoints are affected. All logpoints are by default disabled after startup of the debugger.
	- status: Shows enable status of LOGPOINTs per group.
"-md address size [dec|hex] [word] [little|big]": Memory dump at 'address' with 'size' bytes. Output is in 'hex' (default) or 'dec'imal. Per default data will be grouped in bytes. But if chosen, words are output. Last argument is the endianness which is little endian by default.
"-ms address size filename": Saves a memory dump to a file. The file is saved to the temp directory.
"-mv address size [address_n size_n]*": Memory view at 'address' with 'size' bytes. Will open a new view to display the memory contents.
"-patterns [index[+count|-endindex] [...]": Shows the tbblue sprite patterns beginning at 'index' until 'endindex' or a number of 'count' indices. The values can be omitted. 'index' defaults to 0 and 'count' to 1.
Without any parameter it will show all sprite patterns.
You can concat several ranges.
Example: "-patterns 10-15 20+3 33" will show sprite patterns at index 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
"-WPMEM enable|disable|status":
	- enable|disable: Enables/disables all WPMEM set in the sources. All WPMEM are by default enabled after startup of the debugger.
	- status: Shows enable status of WPMEM watchpoints.
"-sprites [slot[+count|-endslot] [...]": Shows the tbblue sprite registers beginning at 'slot' until 'endslot' or a number of 'count' slots. The values can be omitted. 'slot' defaults to 0 and 'count' to 1. You can concat several ranges.
Example: "-sprite 10-15 20+3 33" will show sprite slots 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
Without any parameter it will show all visible sprites automatically.
"-state save|restore|list|clear|clearall [statename]": Saves/restores the current state. I.e. the complete RAM + the registers.

Examples:
"-exec h 0 100": Does a hexdump of 100 bytes at address 0.
"-e write-memory 8000h 9fh": Writes 9fh to memory address 8000h.
"-e gr": Shows all registers.
"-eval 2+3*5": Results to "17".
"-mv 0 10": Shows the memory at address 0 to address 9.
"-sprites": Shows all visible sprites.
"-state save 1": Stores the current state as 'into' 1.
"-state restore 1": Restores the state 'from' 1.

Notes:
For all commands (if it makes sense or not) you can add "-view" as first parameter. This will redirect the output to a new view instead of the console. E.g. use "-help -view" to put the help text in an own view.
`;
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
		const expr=tokens.join(' ').trim();	// restore expression
		if (expr.length==0) {
			// Error Handling: No arguments
			throw new Error("Expression expected.");
		}
		// Evaluate expression
		let result;
		// Evaluate
		const value=Utility.evalExpression(expr);
		// convert to decimal
		result=value.toString();
		// convert also to hex
		result+=', '+value.toString(16).toUpperCase()+'h';
		// convert also to bin
		result+=', '+value.toString(2)+'b';
		// check for label
		const labels=Labels.getLabelsPlusIndexForNumber64k(value);
		if (labels.length>0) {
			result+=', '+labels.join(', ');
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
		const machineCmd=tokens.join(' ');
		const textData=await Remote.dbgExec(machineCmd);
		// Return value
		return textData;
	}


	/**
	 * Evaluates a label.
	 * @param tokens The arguments. I.e. the label.
 	 * @returns A Promise with a text to print.
	 */
	protected async evalLabel(tokens: Array<string>): Promise<string> {
		const expr=tokens.join(' ').trim();	// restore expression
		if (expr.length==0) {
			// Error Handling: No arguments
			return "Label expected.";
		}

		// Find label with regex, every star is translated into ".*"
		const rString='^'+expr.replace(/\*/g, '.*?')+'$';
		// Now search all labels
		const labels=Labels.getLabelsForRegEx(rString);
		let result='';
		if (labels.length>0) {
			labels.map(label => {
				let value = Labels.getNumberForLabel(label);
				if (value != undefined)
					value &= 0xFFFF;
				result+=label+': '+Utility.getHexString(value, 4)+'h\n';
			})
		}
		else {
			// No label found
			result='No label matches.';
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
		if (tokens.length<2) {
			// Error Handling: No arguments
			throw Error("Address and size expected.");
		}

		// Address
		const addressString=tokens[0];
		const address=Utility.evalExpression(addressString);
		if (address<0||address>0xFFFF)
			throw Error("Address ("+address+") out of range.");

		// Size
		const sizeString=tokens[1];
		const size=Utility.evalExpression(sizeString);
		if (size<0||size>0xFFFF)
			throw Error("Size ("+size+") out of range.");

		// Byte or word
		let unitSize=1; 	// Default=byte
		let bigEndian=false;
		// Hex/dec
		let hex=true;
		const typeString=tokens[2];
		if (typeString) {
			const typeStringLower=typeString.toLowerCase();
			if (typeStringLower!="hex"&&typeStringLower!="dec"&&typeStringLower!="word")
				throw Error("'hex', 'dec' or 'word' expected but got '"+typeString+"'.");
			let k=2;
			// Check for hex or dec
			if (typeString=='hex')
				k++;
			else if (typeString=='dec') {
				hex=false;
				k++;
			}
			// Check for unit size (word)
			const unitSizeString=tokens[k];
			if (unitSizeString) {
				const unitSizeStringLower=unitSizeString.toLowerCase()
				if (unitSizeStringLower!="word")
					throw Error("'word' expected but got '"+unitSizeString+"'.");
				unitSize=2;
				// Endianness
				const endianness=tokens[k+1];
				if (endianness) {
					const endiannessLower=endianness.toLowerCase();
					if (endiannessLower=="big") {
						// Big endian
						bigEndian=true;
					}
					else if (endiannessLower!="little") {
						throw Error("'little' or 'big' expected but got '"+endianness+"'.");
					}
				}
			}
		}

		// Get memory
		const data=await Remote.readMemoryDump(address, size);

		// 'Print'
		let output='';
		for (let i=0; i<size; i+=unitSize) {
			let value=data[i];
			if (unitSize==2) {
				if (bigEndian)
					value=(value<<8)+data[i+1];
				else
					value+=data[i+1]<<8;
			}
			if (hex)
				output+=Utility.getHexString(value, 2*unitSize)+' ';
			else
				output+=value+' ';
		}

		// Send response
		return output;
	}


	/**
	 * Saves a memory dump to a file.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemSave(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length<2) {
			// Error Handling: No arguments
			throw Error("Address and size expected.");
		}

		// Address
		const addressString=tokens[0];
		const address=Utility.evalExpression(addressString);
		if (address<0||address>0xFFFF)
			throw Error("Address ("+address+") out of range.");

		// Size
		const sizeString=tokens[1];
		const size=Utility.evalExpression(sizeString);
		if (size<0||size>0xFFFF)
			throw Error("Size ("+size+") out of range.");

		// Get filename
		const filename=tokens[2];
		if (!filename)
			throw Error("No filename given.");

		// Get memory
		const data=await Remote.readMemoryDump(address, size);

		// Save to .tmp/filename
		const relPath=Utility.getRelTmpFilePath(filename);
		const absPath=Utility.getAbsFilePath(relPath);
		fs.writeFileSync(absPath, data);

		// Send response
		return 'OK';
	}


	/**
	 * Shows a view with a memory dump.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemView(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length==0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		if (tokens.length%2!=0) {
			// Error Handling: No size given
			throw new Error("No size given for address '"+tokens[tokens.length-1]+"'.");
		}

		// Get all addresses/sizes.
		const addrSizes=new Array<number>();
		for (let k=0; k<tokens.length; k+=2) {
			// Address
			const addressString=tokens[k];
			const address=Utility.evalExpression(addressString);
			addrSizes.push(address);

			// Size
			const sizeString=tokens[k+1];
			const size=Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel=new MemoryDumpView();
		for (let k=0; k<tokens.length; k+=2) {
			const start=addrSizes[k];
			const size=addrSizes[k+1]
			panel.addBlock(start, size, Utility.getHexString(start&0xFFFF, 4)+'h-'+Utility.getHexString((start+size-1)&0xFFFF, 4)+'h');
		}
		panel.mergeBlocks();
		await panel.update();

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
		if (tokens.length==0) {
			// Error Handling: No arguments
			throw new Error("Address and number of lines expected.");
		}

		if (tokens.length > 2) {
			// Error Handling: Too many arguments
			throw new Error("Too many arguments.");
		}

		// Get address
		const addressString=tokens[0];
		const address=Utility.evalExpression(addressString);

		// Get size
		const countString=tokens[1];
		let count=10;	// Default
		if(tokens.length>1) {
			// Count given
			count=Utility.evalExpression(countString);
		}


		// Get memory
		const data=await Remote.readMemoryDump(address, 4*count);

		// Disassembly
		const dasmArray=DisassemblyClass.get(address, data, count);

		// Convert to text
		let txt='';
		for (const line of dasmArray) {
			txt+=Utility.getHexString(line.address, 4)+'\t'+line.instruction+'\n';
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
		const param=tokens[0]||'';
		const group=tokens[1];
		if (param=='enable'||param=='disable') {
			// Enable or disable all WPMEM watchpoints
			const enable=(param=='enable');
			await Remote.enableLogpointGroup(group, enable);
		}
		else if (param=='status') {
			// Just show
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '"+param+"'");
		}

		// Always show enable status of all Logpoints
		let result='LOGPOINT groups:';
		const enableMap=Remote.logpointsEnabled;
		if (enableMap.size==0)
			result+=' none';
		else {
			for (const [group, enable] of enableMap) {
				result+='\n  '+group+': '+((enable)? 'enabled':'disabled');
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
		const param=tokens[0]||'';
		if (param=='enable'||param=='disable') {
			// Enable or disable all ASSERTION breakpoints
			const enable=(param=='enable');
			await Remote.enableAssertionBreakpoints(enable);
		}
		else if (param=='status') {
			// Just show
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '"+param+"'");
		}

		// Show enable status of all ASSERTION breakpoints
		const enable=Remote.assertionBreakpointsEnabled;
		const enableString=(enable)? 'enabled':'disabled';
		let result='ASSERTION breakpoints are '+enableString+'.\n';;
		if (enable) {
			// Also list all assertion breakpoints
			const abps=Remote.getAllAssertionBreakpoints();
			for (const abp of abps) {
				result += Utility.getLongAddressString(abp.address);
				const labels = Labels.getLabelsForLongAddress(abp.address);
				if (labels.length>0) {
					const labelsString=labels.join(', ');
					result+=' ('+labelsString+')';
				}
				// Condition, remove the brackets
				result+=', Condition: '+Utility.getAssertionFromCondition(abp.condition)+'\n';
			}
			if (abps.length==0)
				result+='No ASSERTION breakpoints.\n';
		}
		return result;
	}


	/**
	 * WPMEM. Enable/disable/status.
	 * @param tokens The arguments.
 	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalWPMEM(tokens: Array<string>): Promise<string> {
		const param=tokens[0]||'';
		if (param=='enable'||param=='disable') {
			// Enable or disable all WPMEM watchpoints
			const enable=(param=='enable');
			await Remote.enableWPMEM(enable);
		}
		else if (param=='status') {
			// Just show
		}
		else {
			// Unknown argument
			throw Error("Unknown argument: '"+param+"'");
		}

		// Show enable status of all WPMEM watchpoints
		const enable=Remote.wpmemEnabled;
		const enableString=(enable)? 'enabled':'disabled';
		let result='WPMEM watchpoints are '+enableString+'.\n';
		if (enable) {
			// Also list all watchpoints
			const wps=Remote.getAllWpmemWatchpoints();
			for (const wp of wps) {
				result += Utility.getLongAddressString(wp.address);
				const labels=Labels.getLabelsForLongAddress(wp.address);
				if (labels.length>0) {
					const labelsString=labels.join(', ');
					result+=' ('+labelsString+')';
				}
				// Condition, remove the brackets
				result+=', size='+wp.size+'\n';
			}
			if (wps.length==0)
				result+='No WPMEM watchpoints.\n';
		}
		return result;
	}


	/**
	 * Show the sprite patterns in a view.
	 * @param tokens The arguments.
 	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalSpritePatterns(tokens: Array<string>): Promise<string> {
		// Evaluate arguments
		let title;
		let params: Array<number>|undefined=[];
		if (tokens.length==0) {
			// The view should choose the visible sprites automatically
			title='Sprite Patterns: 0-63';
			params.push(0);
			params.push(64);
		}
		else {
			// Create title
			title='Sprite Patterns: '+tokens.join(' ');
			// Get slot and count/endslot
			while (true) {
				// Get parameter
				const param=tokens.shift();
				if (!param)
					break;
				// Evaluate
				const match=/([^+-]*)(([-+])(.*))?/.exec(param);
				if (!match) // Error Handling
					throw new Error("Can't parse: '"+param+"'");
				// start slot
				const start=Utility.parseValue(match[1]);
				if (isNaN(start))	// Error Handling
					throw new Error("Expected slot but got: '"+match[1]+"'");
				// count
				let count=1;
				if (match[3]) {
					count=Utility.parseValue(match[4]);
					if (isNaN(count))	// Error Handling
						throw new Error("Can't parse: '"+match[4]+"'");
					if (match[3]=="-")	// turn range into count
						count+=1-start;
				}
				// Check
				if (count<=0)	// Error Handling
					throw new Error("Not allowed count: '"+match[0]+"'");
				// Add
				params.push(start);
				params.push(count);
			}

			const slotString=tokens[0]||'0';
			const slot=Utility.parseValue(slotString);
			if (isNaN(slot)) {
				// Error Handling: Unknown argument
				throw new Error("Expected slot but got: '"+slotString+"'");
			}
			const countString=tokens[1]||'1';
			const count=Utility.parseValue(countString);
			if (isNaN(count)) {
				// Error Handling: Unknown argument
				throw new Error("Expected count but got: '"+countString+"'");
			}
		}

		// Create new view
		const panel=new ZxNextSpritePatternsView(title, params);
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
		let params: Array<number>|undefined;
		if (tokens.length==0) {
			// The view should choose the visible sprites automatically
			title='Visible Sprites';
		}
		else {
			// Create title
			title='Sprites: '+tokens.join(' ');
			// Get slot and count/endslot
			params=[];
			while (true) {
				// Get parameter
				const param=tokens.shift();
				if (!param)
					break;
				// Evaluate
				const match=/([^+-]*)(([-+])(.*))?/.exec(param);
				if (!match) // Error Handling
					throw new Error("Can't parse: '"+param+"'");
				// start slot
				const start=Utility.parseValue(match[1]);
				if (isNaN(start))	// Error Handling
					throw new Error("Expected slot but got: '"+match[1]+"'");
				// count
				let count=1;
				if (match[3]) {
					count=Utility.parseValue(match[4]);
					if (isNaN(count))	// Error Handling
						throw new Error("Can't parse: '"+match[4]+"'");
					if (match[3]=="-")	// turn range into count
						count+=1-start;
				}
				// Check
				if (count<=0)	// Error Handling
					throw new Error("Not allowed count: '"+match[0]+"'");
				// Add
				params.push(start);
				params.push(count);
			}

			const slotString=tokens[0]||'0';
			const slot=Utility.parseValue(slotString);
			if (isNaN(slot)) {
				// Error Handling: Unknown argument
				throw new Error("Expected slot but got: '"+slotString+"'");
			}
			const countString=tokens[1]||'1';
			const count=Utility.parseValue(countString);
			if (isNaN(count)) {
				// Error Handling: Unknown argument
				throw new Error("Expected count but got: '"+countString+"'");
			}
		}

		// Create new view
		const panel=new ZxNextSpritesView(title, params);
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
		const param=tokens[0]||'';
		const stateName=tokens[1];
		if (!stateName&&
			(param=='save'||param=='restore'||param=='clear'))
			throw new Error("Parameter missing: You need to add a name for the state, e.g. '0', '1' or more descriptive 'start'");

		if (param=='save') {
			// Save current state
			await this.stateSave(stateName);
			// Send response
			return "Saved state '"+stateName+"'.";
		}
		else if (param=='restore') {
			// Restores the state
			await this.stateRestore(stateName);
			// Reload register values etc.
			this.sendEventContinued();
			this.sendEvent(new StoppedEvent('Restore', DebugSessionClass.THREAD_ID));
			return "Restored state '"+stateName+"'.";
		}
		else if (param=='list') {
			// List all files in the state dir.
			let files;
			try {
				const dir=Utility.getAbsStateFileName('');
				files=fs.readdirSync(dir);
			}
			catch {}
			let text;
			if (files==undefined||files.length==0)
				text="No states saved yet.";
			else
				text="All states:\n"+files.join('\n');
			return text;
		}
		else if (param=='clearall') {
			// Removes the files in the states directory
			try {
				const dir=Utility.getAbsStateFileName('');
				const files=fs.readdirSync(dir);
				for (const file of files) {
					const path=Utility.getAbsStateFileName(file);
					fs.unlinkSync(path);
				}
			}
			catch (e) {
				return e.message;
			}
			return "All states deleted.";
		}
		else if (param=='clear') {
			// Removes one state
			try {
				const path=Utility.getAbsStateFileName(stateName);
				fs.unlinkSync(path);
			}
			catch (e) {
				return e.message;
			}
			return "State '"+stateName+"' deleted.";
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '"+param+"'");
		}
	}


	/**
	 * Debug commands. Not shown publicly.
	 * @param tokens The arguments.
 	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalDebug(tokens: Array<string>): Promise<string> {
		const param1=tokens[0]||'';
		let unknownArg=param1;
		// Unknown argument
		throw new Error("Unknown argument: '"+unknownArg+"'");
	}


	/**
	 * Convenience method to send a response for the eval command.
	 * @param text The text to display in the debug console.
	 * @param response The response object.
	 */
	protected sendEvalResponse(text: string, response: DebugProtocol.EvaluateResponse) {
		response.body={result: text+"\n\n", type: undefined, presentationHint: undefined, variablesReference: 0, namedVariables: undefined, indexedVariables: undefined};
		this.sendResponse(response);
	}


    /**
	* Called eg. if user changes a register value.
	*/
	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments) {
		const ref=args.variablesReference;
		const name=args.name;
		const value=Utility.parseValue(args.value);

		// Get variable object
		const varObj=this.listVariables.getObject(ref);
		response.success=false;	// will be changed if successful.

		// Safety check
		if (varObj) {
			// Variables can be changed only if not in reverse debug mode
			const msg=varObj.changeable();
			if (msg) {
				// Change not allowed e.g. if in reverse debugging
				response.message=msg;
			}
			else {
				// Set value
				const formattedString=await varObj.setValue(name, value);
				// Send response
				if (formattedString) {
					response.body={value: formattedString};
					response.success=true;
				}
			}
		}
		this.sendResponse(response);
	}


	/**
	 * Change the Program Counter such that it points to the given file/line.
	 * @param filename The absolute file path.
	 * @param lineNr The lineNr. Starts at 0.
	 */
	protected async setPcToLine(filename: string, lineNr: number): Promise<void> {
		// Get address of file/line
		const realLineNr=lineNr;
		let addr=Remote.getAddrForFileAndLine(filename, realLineNr);
		if (addr<0)
			return;
		// Check if bank is the same
		const slots=Remote.getSlots();
		if (slots) {
			const bank = Z80Registers.getBankFromAddress(addr);
			if (bank >= 0) {
				const slotIndex = Z80Registers.getSlotFromAddress(addr);
				if (bank != slots[slotIndex]) {
					this.showError("Cannot set PC to a location (address="+Utility.getHexString(addr&0xFFFF,4)+"h) of a bank (bank " + bank + ") hat is currently not paged in.");
					return;
				}
			}
		}
		// Now change Program Counter
		await Remote.setProgramCounterWithEmit(addr&0xFFFF);
	}


	/**
	 * Called from vscode when the user inputs a command in the command palette.
	 * The method checks if the command is known and executes it.
	 * If the command is unknown the super method is called.
	 * @param command	The command, e.g. 'set-memory'
	 * @param response	Used for responding.
	 * @param args 	The arguments of the command. Usually just 1 text object.
	 */
	protected customRequest(command: string, response: DebugProtocol.Response, args: any) {
		switch (command) {
			case 'setPcToLine':
				const filename=args[0];
				const lineNr=args[1];
				this.setPcToLine(filename, lineNr);	// No need for 'await'
				break;

			/*
			case 'exec-cmd':
				this.cmdExec(args);
				break;
			case 'set-memory':
				this.cmdSetMemory(args[0]);
				break;
			*/
			default:
				super.customRequest(command, response, args);
				return;
		}
		// send response
		//this.sendResponse(response);
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
		const filePath=Utility.getAbsStateFileName(stateName);
		try {
			// Make sure .tmp/states directory exists
			try {
				const dir=Utility.getAbsStateFileName('');
				fs.mkdirSync(dir);
			}
			catch {}
			// Save state
			await Remote.stateSave(filePath);
		}
		catch (e) {
			const errTxt="Can't save '"+filePath+"': "+e.message;
			throw new Error(errTxt);
		}
	}


	/**
	 * Called from "-state restore N" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param stateName A state name (or number) can be appended, so that different states might be saved.
	 */
	protected async stateRestore(stateName: string): Promise<void> {
		// Load data from temp directory
		let filePath;
		try {
			// Read data
			filePath=Utility.getAbsStateFileName(stateName);
			// Restore state
			await Remote.stateRestore(filePath);
		}
		catch (e) {
			const errTxt="Can't load '"+filePath+"': "+e.message;
			throw new Error(errTxt);
		}
		// Clear history
		StepHistory.init();
		// Clear decorations
		Decoration?.clearAllDecorations();
		// Update memory etc.
		await this.update();
		// Send event
		this.sendEvent(new StoppedEvent('restore', DebugSessionClass.THREAD_ID));
	}


	/**
	 * This is a hack:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * So this function waits as long as there is still traffic to the emulator.
	 * @param timeout Timeout in ms. For this time traffic has to be quiet.
	 * @param handler This handler is called after being quiet for the given timeout.
	 */
	public async waitForBeingQuietFor(timeout: number): Promise<void> {
		await Remote.waitForBeingQuietFor(timeout);
	}



	protected async terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments): Promise<void> {
	}


	/**
	 * Output indented text to the console.
	 * @param text The output string.
	 */
	protected debugConsoleIndentedText(text: string) {
		this.debugConsoleAppendLine(this.debugConsoleIndentation+text);
	}
}


DebugSessionClass.run(DebugSessionClass);
