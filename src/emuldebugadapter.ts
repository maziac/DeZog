

import { basename } from 'path';
import * as vscode from 'vscode';
import { /*Handles,*/ Breakpoint /*, OutputEvent*/, DebugSession, InitializedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, /*BreakpointEvent,*/ /*OutputEvent,*/ Thread, ContinuedEvent } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { CallSerializer } from './callserializer';
import { GenericWatchpoint } from './genericwatchpoint';
import { Labels } from './labels';
import { Log } from './log';
import { Machine, MachineBreakpoint, MachineClass } from './machine';
import { MemoryDumpView } from './memorydumpview';
import { MemoryRegisterView } from './memoryregisterview';
import { RefList } from './reflist';
import { Settings, SettingsParameters } from './settings';
import { /*ShallowVar,*/ DisassemblyVar, LabelVar, RegistersMainVar, RegistersSecondaryVar, StackVar } from './shallowvar';
import { Utility } from './utility';
import { Z80RegisterHoverFormat, Z80RegisterVarFormat, Z80Registers } from './z80Registers';



/**
 * The Emulator Debug Adapter.
 * It receives the requests from vscode and sends events to it.
 */
export class EmulDebugAdapter extends DebugSession {

	/// A list for the variables (references)
	protected listVariables = new RefList();

	/// Only one thread is supported.
	protected static THREAD_ID = 1;

	/// Is responsible to serialize asynchronous calls (e.g. to zesarux).
	protected serializer = new CallSerializer("Main", true);

	/// Counts the number of stackTraceRequests.
	protected stackTraceResponses = new Array<DebugProtocol.StackTraceResponse>();

	/// Used to display the memory at the register locations.
	protected registerMemoryView: MemoryRegisterView;

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super();

		// Start logging
		Log.clear();

		// Init line numbering
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);


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
		Log.log(message)
		vscode.window.showErrorMessage(message);
	}


	/**
	 * Exit from the debugger.
	 * @param message If defined the message is shown to the user as error.
	 */
	private exit(message: string|undefined) {
		if(message)
			this.showError(message);
		Log.log("Exit debugger!");
		this.sendEvent(new TerminatedEvent());
		//this.sendEvent(new ExitedEvent());
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
	 * Debugadapter disconnects.
	 */
	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		// Close register memory view
		this.registerMemoryView.close();
		// Stop machine
		Machine.stop(() => {
			this.sendResponse(response);
		});
	}

	/**
	 * 'initialize'request.
	 * Respond with supported features.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		// the adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = false;

		// make VS Code to show a 'step back' button
		response.body.supportsStepBack = true;

		// Maybe terminated on error
		response.body.supportTerminateDebuggee = true;

		// The PC value might be changed.
		response.body.supportsGotoTargetsRequest = true;

		// Support hovering over values (registers)
		response.body.supportsEvaluateForHovers = true;

		// Support changing of variables (e.g. registers)
		response.body.supportsSetVariable = true;

		this.sendResponse(response);

		// Note: The InitializedEvent will be send when the socket connection has been successfull. Afterwards the breakpoints are set.
	}


	/**
	 * Called after 'initialize' request.
	 * Loads the list file and connects the socket to the zesarux debugger.
	 * Initializes zesarux.
	 * When zesarux is connected and initialized an 'InitializedEvent'
	 * is sent.
	 * @param response
	 * @param args
	 */
	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: SettingsParameters) {

		try {
			// Save args
			const rootFolder = (vscode.workspace.workspaceFolders) ?vscode.workspace.workspaceFolders[0].uri.path : '';
			Settings.Init(args, rootFolder);
		}
		catch(e) {
			// Some error occurred
			this.exit('Settings: ' + e.message);
			return;
		}

		try {
			// Clear all temporary files
			Utility.removeAllTmpFiles();
		}
		catch(e) {
			// Some error occurred
			this.exit('Removing temporary files: ' + e.message);
			return;
		}

		try {
			// init labels
			Labels.init();
		}
		catch(e) {
			// Some error occurred
			this.exit('Labels: ' + e.message);
			return;
		}

		// Create the machine
		MachineClass.create();
		Machine.init();

		Machine.once('initialized', () => {
			//Array for found watchpoints: WPMEM
			const watchPointLines = new Array<{address: number, line: string}>();
			// Load files
			try {
				// Load user list and labels files
				for(var listFile of Settings.launch.listFiles) {
					Labels.loadAsmListFile(listFile.path, listFile.useFiles, listFile.filter, listFile.addOffset, listFile.useLabels, (address, line) => {
						// quick search for WPMEM
						if(line.indexOf('WPMEM') >= 0) {
							// Add watchpoint at this address
							watchPointLines.push({address: address, line: line});
						}
					});
				}
				for(var labelsFile of Settings.launch.labelsFiles)
					Labels.loadAsmLabelsFile(labelsFile);
			}
			catch(err) {
				// Some error occurred during loading, e.g. file not found.
				this.exit(err.message);
			}

			// Load list and labels file according machine
			//const dir = __dirname;


			// Now get all disassemblies
			for(var area of Settings.launch.disassemblies) {
				this.serializer.exec(() => {
					// get disassembly
					Machine.getDisassembly(area[0] /*address*/, area[1] /*size*/, (text) => {
						// save as temporary file
						const fileName = 'TMP_DISASSEMBLY_' + area[0] + '(' + area[1] + ').asm';
						const absFileName = Utility.writeTmpFile(fileName, text);
						// add disassembly file without labels
						Labels.loadAsmListFile(absFileName, false, undefined, 0, listFile.useLabels);
						// "Return"
						this.serializer.endExec();
					});
				});
			};

			this.serializer.exec(() => {
				// Finishes off the loading of the list and labels files
				Labels.finish();
				// convert labels in watchpoints.
				const watchpoints = new Array<GenericWatchpoint>();
				for(let entry of watchPointLines){
					// WPMEM:
					// Syntax:
					// WPMEM [addr [, length [, access]]]
					// with:
					//	addr = address (or label) to observe (optional). Defaults to current address.
					//	length = the count of bytes to observe (optional). Default = 1.
					//	access = Read/write access. Possible values: r, w or rw. Defaults to rw.
					// e.g. WPMEM LBL_TEXT, 1, w

					// now check more thoroughly: group1=address, group3=length, group5=access
					const match = /;.*WPMEM(?=[,\s])\s*([^\s,]*)?(\s*,\s*([^\s,]*)(\s*,\s*([^\s,]*))?)?/.exec(entry.line);
					if(match) {
						// get arguments
						let addressString = match[1];
						let lengthString = match[3];
						let access = match[5];
						// defaults
						let address = entry.address;
						if(addressString && addressString.length > 0)
							address = Labels.getNumberFromString(addressString) || NaN;
						if(isNaN(address))
							continue;	// could happen if the WPMEM is in an area that is conditionally not compiled, i.e. label does not exist.
						let length = 1;
						if(lengthString && lengthString.length > 0) {
							length = Labels.getNumberFromString(lengthString) || NaN;
							if(isNaN(length))
								continue;
						}
						if(access && access.length > 0) {
							if( access != 'r' && access != 'w' && access != 'rw') {
								this.showWarning("Wrong access mode in watch point. Allowed are only 'r', 'w' or 'rw' but found '" + access + "' in line: '" + entry.line + "'");
								continue;
							}
						}
						else
							access = 'rw';
						// set watchpoint
						watchpoints.push({address: address, length: length, access: access});
					}
				}

				// Set watchpoints (memory guards)
				Machine.setWPMEM(watchpoints, () => {
				// "Return"
				this.serializer.endExec();
				});
			});

			this.serializer.exec(() => {
				// Create memory/register dump view
				this.registerMemoryView = new MemoryRegisterView(this);
				const regs = Settings.launch.memoryViewer.registersMemoryView;
				this.registerMemoryView.addRegisters(regs);
				this.registerMemoryView.update();
				// Send stop
				this.sendEvent(new StoppedEvent('entry', EmulDebugAdapter.THREAD_ID));
				// socket is connected, allow setting breakpoints
				this.sendEvent(new InitializedEvent());
				// "Return"
				this.serializer.endExec();
				// Respond
				this.sendResponse(response);
			});
		});

		Machine.on('warning', message => {
			// Some problem occurred
			this.showWarning(message);
		});

		Machine.once('error', err => {
			// Some error occurred
			Machine.stop(()=>{});
			this.exit(err.message);
		});

	}



	/**
	 * The breakpoints are set for a path (file).
	 * @param response
	 * @param args lines=array with line numbers. source.path=the file path
	 */
	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		// Serialize
		this.serializer.exec(() => {

			const path = <string>args.source.path;

			// convert breakpoints
			const givenBps = args.breakpoints || [];
			const bps = givenBps.map(bp => {
				var mbp: MachineBreakpoint;
				mbp = {
					bpId: 0,
					filePath: path,
					lineNr: this.convertClientLineToDebugger(bp.line),
					condition: (bp.condition) ? bp.condition : ''
				};
				return mbp;
			});


			// Set breakpoints for the file.
			Machine.setBreakpoints(path, bps, (currentBreakpoints) => {
				// Convert breakpoints for vscode
				const vscodeBreakpoints = new Array<Breakpoint>();
				currentBreakpoints.forEach( bp => {
					var vscBp = new Breakpoint(true, this.convertDebuggerLineToClient(bp.lineNr));
					vscodeBreakpoints.push(vscBp);
				});

				// send back the actual breakpoint positions
				response.body = {
					breakpoints: vscodeBreakpoints
				};
				this.sendResponse(response);
				this.serializer.endExec();
			});
		});

	}


	/**
	 * Returns the one and only "thread".
	 */
	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
		// Serialize
		this.serializer.exec(() => {
			// Just return a default thread.
			response.body = {
				threads: [
					new Thread(EmulDebugAdapter.THREAD_ID, "thread_default")
				]
			};
			this.sendResponse(response);
			this.serializer.endExec();
		});
	}



	/**
	 * Creates a source reference from the filePath.
	 * @param filePath
	 * @returns undefined if filePath is ''.
	 */
	private createSource(filePath: string): Source|undefined {
		if(filePath.length == 0)
			return undefined;
		const fname = basename(filePath);
		const debPath = this.convertDebuggerPathToClient(filePath);
		return new Source(fname, debPath, undefined, undefined, undefined);
	}

	/**
	 * Returns the stack frames.
	 */
	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
		// vscode sometimes sends 2 stack trace requests one after the other. Because the lists are cleared this can lead to race conditions.
		this.stackTraceResponses.push(response);
		if(this.stackTraceResponses.length > 1)
			return;

		// Serialize
		this.serializer.exec(() => {
			// Clear all variables
			this.listVariables.length = 0;

			// Get the call stack trace
			Machine.stackTraceRequest((frames) => {

				// Create new array but only upto end of stack (name == null)
				const sfrs = new Array<StackFrame>();
				var index = 1;
				for(const frame of frames) {
					const src = this.createSource(frame.fileName);
					const lineNr = (src) ? this.convertDebuggerLineToClient(frame.lineNr) : 0;
					const sf = new StackFrame(index, frame.name, src, lineNr);
					sfrs.push(sf);
					if(frame.name === null)
						break;	// rest of stack trace is garbage
					index++;
				}

				// Send as often as there have been requests
				while(this.stackTraceResponses.length > 0) {
					const resp = this.stackTraceResponses[0];
					this.stackTraceResponses.shift();
					resp.body = {stackFrames: sfrs,	totalFrames: 1};
					this.sendResponse(resp);
				}

				// end the serialized call:
				this.serializer.endExec();
			});
		});
	}


	/**
	 * Returns the different scopes. E.g. 'Disassembly' or 'Registers' that are shown in the Variables area of vscode.
	 * @param response
	 * @param args
	 */
	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		this.serializer.exec(() => {

			const scopes = new Array<Scope>();
			const frameId = args.frameId;
			//const frame = this.listFrames.getObject(frameId);
			const frame = Machine.getFrame(frameId);
			if(!frame) {
				// No frame found, send empty response
				response.body = {scopes: scopes};
				this.sendResponse(response);
				return;
			}

			// More serialization
			const innerSerializer = new CallSerializer("innerScopesRequest");

			// Serialize Disassembly
			innerSerializer.exec(() => {
				// get address
				if(frame) {
					// use address
					const addr = frame.addr;
					// Create variable object for Disassembly
					const varDisassembly = new DisassemblyVar(addr, 8);
					// Add to list and get reference ID
					const ref = this.listVariables.addObject(varDisassembly);
					scopes.push(new Scope("Disassembly", ref));
				}
				// Return
				innerSerializer.endExec();
			});

			// Serialize main Registers
			innerSerializer.exec(() => {
				// TODO: later (with change in zesarux) I need to include the frame ID/callstack address as well
				// Create variable object for Registers
				const varRegistersMain = new RegistersMainVar();
				// Add to list and get reference ID
				const ref = this.listVariables.addObject(varRegistersMain);
				scopes.push(new Scope("Registers", ref));

				// TODO: later (with change in zesarux) I need to include the frame ID/callstack address as well
				// Create variable object for secondary Registers
				const varRegisters2 = new RegistersSecondaryVar();
				// Add to list and get reference ID
				const ref2 = this.listVariables.addObject(varRegisters2);
				scopes.push(new Scope("Registers 2", ref2));

				// Return
				innerSerializer.endExec();
			});

			// Serialize the Stack
			innerSerializer.exec(() => {
				// Create variable object for the stack
				const varStack = new StackVar(frame.stack, frame.stackStartAddress);
				// Add to list and get reference ID
				const ref = this.listVariables.addObject(varStack);
				scopes.push(new Scope("Stack", ref));

				// Send response
				response.body = {scopes: scopes};
				this.sendResponse(response);

				// Return
				innerSerializer.endExec();
				this.serializer.endExec();
			});
		});
	}


	/**
	 * Returns the variables for the scopes (e.g. 'Disassembly' or 'Registers')
	 * @param response
	 * @param args
	 */
	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
		// Get the associated variable object
		const ref = args.variablesReference;
		const varObj = this.listVariables.getObject(ref);
		// Serialize
		this.serializer.exec(() => {
			// Check if object exists
			if(!varObj) {
				// Return empty list
				var variables = new Array<DebugProtocol.Variable>();
				response.body = {variables: variables};
				this.sendResponse(response);
				// end the serialized call:
				this.serializer.endExec();
				return;
			}
			// Get contents
			varObj.getContent((varList) => {
				response.body = {variables: varList};
				this.sendResponse(response);
				// end the serialized call:
				this.serializer.endExec();
			}, args.start, args.count);
		});
	}


	/**
	  * vscode requested 'continue'.
	  * @param response
	  * @param args
	  */
	 protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		// Serialize
		this.serializer.exec(() => {
			// Continue debugger
			Machine.continue( () => {
				// It returns here not immediately but only when a breakpoint is hit or pause is requested.

				// Update memory dump etc.
				this.update();

				this.sendEvent(new StoppedEvent('break', EmulDebugAdapter.THREAD_ID));
			});

			// Response is sent immediately
			this.sendResponse(response);
			this.serializer.endExec();
		});
	}


	/**
	  * vscode requested 'pause'.
	  * @param response
	  * @param args
	  */
	 protected pauseRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		// Serialize
		this.serializer.exec(() => {
			// Pause the debugger
			Machine.pause();
			// Response is sent immediately
			this.sendResponse(response);
			this.serializer.endExec();
		});
	}


	 /**
	  * vscode requested 'reverse continue'.
	  * @param response
	  * @param args
	  */
	 protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) : void {
		// Serialize
		this.serializer.exec(() => {
			// Continue debugger
			Machine.reverseContinue( () => {
				// Update memory dump etc.
				this.update();

				// It returns here not immediately but only when a breakpoint is hit or pause is requested.
				this.sendEvent(new StoppedEvent('break', EmulDebugAdapter.THREAD_ID));
			});

			// Response is sent immediately
			this.sendResponse(response);
			this.serializer.endExec();
		});

	}

	 /**
	  * vscode requested 'step over'.
	  * @param response
	  * @param args
	  */
	 protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		// Serialize
		this.serializer.exec(() => {
			// Step-Over
			Machine.stepOver( () => {
				// Update memory dump etc.
				this.update();

				// Response
				this.sendResponse(response);
				this.serializer.endExec();

				// Send event
				this.sendEvent(new StoppedEvent('step', EmulDebugAdapter.THREAD_ID));
			});
		});
	}


	/**
	  * vscode requested 'step into'.
	  * @param response
	  * @param args
	  */
	protected stepInRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		// Serialize
		this.serializer.exec(() => {
			// Step-Into
			Machine.stepInto( () => {
				// Update memory dump etc.
				this.update();

				// Response
				this.sendResponse(response);
				this.serializer.endExec();

				// Send event
				this.sendEvent(new StoppedEvent('step', EmulDebugAdapter.THREAD_ID));
			});

		});
	}


	 /**
	  * vscode requested 'step out'.
	  * @param response
	  * @param args
	  */
	 protected stepOutRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		// Serialize
		this.serializer.exec(() => {
			// Step-Out
			Machine.stepOut( () => {
				// Update memory dump etc.
				this.update();

				// Send event
				this.sendEvent(new StoppedEvent('step', EmulDebugAdapter.THREAD_ID));
			});

			// Response is sent immediately
			this.sendResponse(response);
			this.serializer.endExec();
		});
	}


	/**
	  * vscode requested 'step backwards'.
	  * @param response
	  * @param args
	  */
	 protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
		// Serialize
		this.serializer.exec(() => {
			// Step-Back
			Machine.stepBack( () => {
				// Update memory dump etc.
				this.update();

				// Response
				this.sendResponse(response);
				this.serializer.endExec();

				// Send event
				this.sendEvent(new StoppedEvent('step', EmulDebugAdapter.THREAD_ID));
			});
		});
	}


	/**
	 * Is called when hovering or when an expression is added to the watches.
	 * Or if commands are input in the debug console.
	 */
	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		// Check if its a debugger command
		const expression = args.expression.trim();
		const tokens = expression.split(' ');
		const cmd = tokens.shift();
		if(cmd) {
			if(cmd.startsWith('-')) {
				// All commands start with "-"
				if(cmd == '-help' || cmd == '-h') {
					// print help
					//const output = new OutputEvent('Allowed commands are:', 'console');
					//this.sendEvent(output);
					const output =
`Allowed commands are:
  "-eval expr": Evaluates an expression. The expression might contain mathematical expressions and also labels.
  "-exec|e cmd args": cmd and args are directly passed to ZEsarUX. E.g. "-exec get-registers".
  "-help|h": This command. Do "-e help" to get all possible ZEsarUX commands.
  "-label|-l XXX": Returns the matching labels (XXX) with their values. Allows wildcard "*".
  "-md address size [address_n size_n]*": Memory Dump at 'address' with 'size' bytes. Will open a new view to display the memory dump.
  "-WPMEM enable|disable": Enables/disables all WPMEM set in the sources. All WPMEM are by default enabled after startup of the debugger.
  "-WPMEM show": Shows enable status of WPMEM watchpoints.
  Examples:
  "-exec h 0 100": Does a hexdump of 100 bytes at address 0.
  "-e write-memory 8000h 9fh": Writes 9fh to memory address 8000h.
  "-e gr": Shows all registers.
  "-eval 2+3*5": Results to "17".
  "-md 0 10": Shows the memory at address 0 to address 9.
Notes:
  "-exec run" will not work at the moment and leads to a disconnect.
`;
					response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
					this.sendResponse(response);
				}
				else if (cmd == '-eval') {
					const expr = tokens.join(' ').trim();	// restore expression
					if(expr.length == 0) {
						// Error Handling: No arguments
						const output = "Expression expected.\n\n";
						response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
						return;
					}
					// Evaluate expression
					let result;
					try {
						// Evaluate
						const value = Utility.evalExpression(expr);
						// convert to decimal
						result = value.toString();
						// convert also to hex
						result += ', ' + value.toString(16).toUpperCase() + 'h';
						// convert also to bin
						result += ', ' + value.toString(2) + 'b';
					}
					catch(e) {
						result = e.message;
					}
					response.body = { result: result, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
					this.sendResponse(response);
				}
				else if (cmd == '-exec' || cmd == '-e') {
					const machineCmd = tokens.join(' ');
					if(machineCmd.length == 0) {
						// No command given
						response.body = { result: 'No command given.\n\n', type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
					}
					else {
						Machine.dbgExec(machineCmd, (data) => {
							// Print to console
							response.body = { result: data+'\n\n', type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
							this.sendResponse(response);
						});
					}
				}
				else if (cmd == '-label' || cmd == '-l') {
					const expr = tokens.join(' ').trim();	// restore expression
					if(expr.length == 0) {
						// Error Handling: No arguments
						const output = "Label expected.\n\n";
						response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
						return;
					}
					// Find labelwith regex, every star is translated into ".*"
					const rString = '^' + Utility.replaceAll(expr, '*', '.*?') + '$';
					// Now search all labels
					const labels = Labels.getLabelsForRegEx(rString);
					let result = '';
					if(labels.length > 0) {
						labels.map(label => {
							const value = Labels.getNumberForLabel(label);
							result += label +': ' + Utility.getHexString(value, 4) + 'h\n';
						})
					}
					else {
						// No label found
						result = 'No label matches.';
					}
					// return result
					response.body = { result: result, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
					this.sendResponse(response);
				}
				else if (cmd == '-md') {
					// check count of arguments
					if(tokens.length == 0) {
						// Error Handling: No arguments
						const output = "Address and size expected.\n\n";
						response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
						return;
					}

					if(tokens.length % 2 != 0) {
						// Error Handling: No size given
						const output = "No size given for address '" + tokens[tokens.length-1] + "'.\n\n";
						response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
						return;
					}

					// Get all addresses/sizes.
					const addrSizes = new Array<number>();
					for(let k=0; k<tokens.length; k+=2) {
						// address
						const addressString = tokens[k];
						const address = Labels.getNumberFromString(addressString) || NaN;
						if(isNaN(address)) {
							// Error Handling: Unknown argument
							const output = "Expected address but got: '" + addressString + "'\n\n";
							response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
							this.sendResponse(response);
							return;
						}
						addrSizes.push(address);

						// size
						const sizeString = tokens[k+1];
						const size = Labels.getNumberFromString(sizeString) || NaN;
						if(isNaN(size)) {
							// Error Handling: Unknown argument
							const output = "Expected size but got: '" + sizeString + "'\n\n";
							response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
							this.sendResponse(response);
							return;
						}
						addrSizes.push(size);
					}

					// Create new view
					const panel = new MemoryDumpView(this);
					for(let k=0; k<tokens.length; k+=2)
						panel.addBlock(addrSizes[k], addrSizes[k+1]);
					panel.mergeBlocks();
					panel.update();

					// Send response
					response.body = { result: 'OK\n\n', type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
				}
				else if (cmd == '-WPMEM' || cmd == '-wpmem') {
					const param = tokens[0] || '';
					if(param == 'enable' || param == 'disable') {
						// enable or disable all WPMEM watchpoints
						const enable = (param == 'enable');
						Machine.enableWPMEM(enable, () => {
							// Print to console
							const enableString = (enable) ? 'enabled' : 'disabled';
							response.body = { result: 'WPMEM watchpoints ' + enableString + '\n\n', type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
							this.sendResponse(response);
						});
					}
					else if(param == 'show') {
						// show enable status of all WPMEM watchpoints
						const enable = Machine.wpmemEnabled;
						const enableString = (enable) ? 'enabled' : 'disabled';
							response.body = { result: 'WPMEM watchpoints are ' + enableString + '.\n\n', type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
					}
					else {
						// Unknown argument
						const output = "Unknown argument: '" + param + "'\n\n";
						response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
						this.sendResponse(response);
					}
				}
				else {
					// Unknown command
					const output = "Unknown command: '" + expression + "'\n\n";
					response.body = { result: output, type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
					this.sendResponse(response);
				}

				// End
				return;
			}
		}

		// Serialize
		this.serializer.exec(() => {
			Log.log('evaluate.expression: ' + args.expression);
			Log.log('evaluate.context: ' + args.context);
			Log.log('evaluate.format: ' + args.format);

			// get the name
			const name = expression;
			// Check if it is a register
			if(Z80Registers.isRegister(name)) {
				const formatMap = (args.context == 'hover') ? Z80RegisterHoverFormat : Z80RegisterVarFormat;
				Utility.getFormattedRegister(name, formatMap, (formattedValue) => {
					response.body = {
						result: formattedValue,
						variablesReference: 0
					};
					this.sendResponse(response);
					this.serializer.endExec();
				});
				return;
			}

			// Check if it is a label. A label may have a special formatting:
			// Example: LBL_TEXT 10, b
			// = Addresse LBL_TEXT, 10 bytes
			const match = /^([^\s,]+)\s*(,\s*([^\s,]*))?(,\s*([^\s,]*))?/.exec(name);
			if(match) {
				const labelString = match[1];
				var sizeString = match[3];
				var byteWord = match[5];
				// Defaults
				if(labelString) {
					var labelValue = Labels.getNumberFromString(labelString) || NaN;
					if(!isNaN(labelValue)) {
						var size = 100;
						if(sizeString) {
							const readSize = Labels.getNumberFromString(sizeString) || NaN;
							if(!isNaN(readSize))
								size = readSize;
						}
						if(!byteWord || byteWord.length == 0)
							byteWord = "bw";	// both byte and word
						// Now create a "variable" for the bigValues or small values
						const format = (labelValue <= Settings.launch.smallValuesMaximum) ? Settings.launch.formatting.smallValues : Settings.launch.formatting.bigValues;
						Utility.numberFormatted(name, labelValue, 2,
							format, undefined, (formattedValue) => {
								if(labelValue <= Settings.launch.smallValuesMaximum) {
									// small value
									// Response
									response.body = {
										result: (args.context == 'hover') ? name+': '+formattedValue : formattedValue,
										variablesReference: 0,
										//type: "data",
										//amedVariables: 0
									}
								}
								else {
									// big value
									// Create a label variable
									const labelVar = new LabelVar(labelValue, size, byteWord, this.listVariables);
									// Add to list
									const ref = this.listVariables.addObject(labelVar);
									// Response
									response.body = {
										result: (args.context == 'hover') ? name+': '+formattedValue : formattedValue,
										variablesReference: ref,
										type: "data",
										//presentationHint: ,
										namedVariables: 2,
										//indexedVariables: 100
									}
								};
								this.sendResponse(response);
								this.serializer.endExec();
							});
						return;
					}
				}
			}

			// Default: return nothing
			this.sendResponse(response);
			this.serializer.endExec();
		});

	}



	// TODO: Don't know yet how to deal with this.
	protected gotoRequest(response: DebugProtocol.GotoResponse, args: DebugProtocol.GotoArguments): void {
		// Serialize
		this.serializer.exec( () => {
			this.sendResponse(response);
		});
	}


    /**
	* Called eg. if user changes a register value.
	*/
	protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments): void {
		const ref = args.variablesReference;
		const name = args.name;
		const value = Utility.parseValue(args.value);

		// Serialize
		this.serializer.exec( () => {
			// get variable object
			const varObj = this.listVariables.getObject(ref);
			// safety check
			if(varObj) {
				// Set value
				varObj.setValue(name, value, (formattedString) => {
					// Send response
					response.body = {value: formattedString};
					this.sendResponse(response);
				});
			}
			else {
				this.sendResponse(response);
			}
			// End serializer
			this.serializer.endExec();
		});
	}

	/**
	 * Change the Program Counter such that it points to the given file/line.
	 * @param filename The absolute file path.
	 * @param lineNr The lineNr. Starts at 0.
	 */
	protected setPcToline(filename: string, lineNr: number) {
		// Get address of file/line
		const realLineNr = lineNr; //this.convertClientLineToDebugger(lineNr);
		const addr = Labels.getAddrForFileAndLine(filename, realLineNr);
		if( addr < 0 )
			return;
		// Now change Program Counter
		Machine.setProgramCounter(addr, () => {
			// line is not updated. See https://github.com/Microsoft/vscode/issues/51716
			this.sendEvent(new StoppedEvent('PC-change', EmulDebugAdapter.THREAD_ID));
			this.sendEvent(new ContinuedEvent(EmulDebugAdapter.THREAD_ID));
		});
	}


	/**
	 * Not used at the moment.
	 * Called from vscode when the user inputs a command in the command palette.
	 * The method checks if the command is known and executes it.
	 * If the command is unknown the super method is called.
	 * @param command	The command, e.g. 'set-memory'
	 * @param response	Used for responding.
	 * @param args 	The arguments of the command. Usually just 1 text object.
	 */
	protected customRequest(command: string, response: DebugProtocol.Response, args: any) {
		switch(command) {
			case 'setPcToline':
				const filename = args[0];
				const lineNr = args[1];
				this.setPcToline(filename, lineNr);
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
	 */
	protected update() {
	//	this.memoryDumpView.update();
		this.emit('update');
	}
}

