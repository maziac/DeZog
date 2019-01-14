
//import * as assert from 'assert';
import { basename } from 'path';
import * as vscode from 'vscode';
import { /*Handles,*/ Breakpoint /*, OutputEvent*/, DebugSession, InitializedEvent, Scope, Source, StackFrame, StoppedEvent, TerminatedEvent, /*BreakpointEvent,*/ OutputEvent, Thread, ContinuedEvent } from 'vscode-debugadapter/lib/main';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { CallSerializer } from './callserializer';
import { GenericWatchpoint } from './genericwatchpoint';
import { Labels } from './labels';
import { Log } from './log';
import { EmulatorBreakpoint, MachineType, /*EmulatorClass,*/ } from './emulator';
import { MemoryDumpView } from './memorydumpview';
import { MemoryRegisterView } from './memoryregisterview';
import { RefList } from './reflist';
import { Settings, SettingsParameters } from './settings';
import { /*ShallowVar,*/ DisassemblyVar, LabelVar, RegistersMainVar, RegistersSecondaryVar, StackVar } from './shallowvar';
import { Utility } from './utility';
import { Z80RegisterHoverFormat, Z80RegisterVarFormat, Z80Registers } from './z80Registers';
import { EmulatorFactory, EmulatorType, Emulator } from './emulatorfactory';
//import { StateZ80 } from './statez80';
import { StateZX16K } from './statez80';
import { ZxNextSpritesView } from './zxnextspritesview';
import { TextView } from './textview';
import { BaseView } from './baseview';
import { ZxNextSpritePatternsView } from './zxnextspritepatternsview';
//import * as del from 'del';
import { Disassembler } from './disassembler/disasm';
//import { Format } from './disassembler/format';
import { MemAttribute } from './disassembler/memory';
import { Opcode, Opcodes } from './disassembler/opcode';
//import * as assert from 'assert';
//import { fstat } from 'fs';
//import * as diff from 'diff';
//import * as fs from 'fs';
import * as BinaryFile from 'binary-file';
//import { writeFileSync } from 'fs';



/**
 * The Emulator Debug Adapter.
 * It receives the requests from vscode and sends events to it.
 */
export class EmulDebugAdapter extends DebugSession {

    /// The disassembler instance.
    protected dasm: Disassembler;

	/// The address queue for the disassembler. This contains all stepped addresses.
	protected dasmAddressQueue = new Array<number>();

	/// The text document used for the temporary disassembly.
	protected disasmTextDoc: vscode.TextDocument;

	/// A list for the variables (references)
	protected listVariables = new RefList();

	/// Only one thread is supported.
	protected static THREAD_ID = 1;

	/// Is responsible to serialize asynchronous calls (e.g. to zesarux).
	protected serializer = new CallSerializer("Main", true);

	/// Counts the number of stackTraceRequests.
	protected stackTraceResponses = new Array<DebugProtocol.StackTraceResponse>();


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
	 * Creates a new disassembler and configures it.
	 * Called on start of connection.
	 */
	public setupDisassembler() {
		// Create new disassembler.
		this.dasm = new Disassembler();
		// Configure disassembler.
		this.dasm.funcAssignLabels = (addr) => {
			return 'L' + Utility.getHexString(addr,4);
		};
		// Restore 'rst 8' opcode
		Opcodes[0xCF] = new Opcode(0xCF, "RST %s");
		// Setup configuration.
		if(Settings.launch.disassemblerArgs.esxdosRst)
		{
			//Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
		}
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
	private exit(message?: string) {
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
	 * End forcefully.
	 */
	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		// Close register memory view
		BaseView.staticCloseAll();
		this.removeListener('update', BaseView.staticCallUpdateFunctions);
		// Stop machine
		Emulator.stop(() => {
			this.sendResponse(response);
			this.exit();
		});
	}


	/**
	 * 'initialize'request.
	 * Respond with supported features.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		//const dbgSession = vscode.debug.activeDebugSession;
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

		// Supports conditional breakpoints
		response.body.supportsConditionalBreakpoints = true;

		// Handles debug 'Restart'
		response.body.supportsRestartRequest = true;

		this.sendResponse(response);

		// Note: The InitializedEvent will be send when the socket connection has been successfull. Afterwards the breakpoints are set.
	}


	/**
	 * Called when 'Restart' is pressed.
	 * Disconnects and destroys the old emulator connection and sets up a new one.
	 * @param response
	 * @param args
	 */
	protected restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments) {
		// Stop machine
		Emulator.stop(() => {
			// And setup a new one
			this.launch(response);
		});
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
			const channelOut = (Settings.launch.log.channelOutputEnabled) ? "Z80 Debugger" : undefined;
			Log.init(channelOut, Settings.launch.log.filePath);
		}
		catch(e) {
			// Some error occurred
			this.exit('Settings: ' + e.message);
			response.success = false;
			this.sendResponse(response);
			return;
		}

		// Launch emulator
		this.launch(response);
	}


	/**
	 * Launches the emulator. Can be called from launchRequest and restartRequest.
	 * @param response
	 */
	protected async launch(response: DebugProtocol.Response) {
		// Setup the disassembler
		this.setupDisassembler();

		// Start the emulator and the connection.
		this.startEmulator(msg => {
			response.message = msg;
			response.success = (msg == undefined);
			this.sendResponse(response);
		});
	}


	/**
	 * Starts the emulator and sets up everything for setup after
	 * connection is up and running.
	 */
	protected startEmulator(handler: (msg?: string)=>void) {
		/*
		try {
			// Clear all temporary files
			//Utility.removeAllTmpFiles();
			// Do not clear otherwise the states might be cleared.
		}
		catch(e) {
			// Some error occurred
			this.exit('Removing temporary files: ' + e.message);
			handler("Error while removing temp files.");
			return;
		}
		*/

		try {
			// init labels
			Labels.init();
		}
		catch(e) {
			// Some error occurred
			this.exit('Labels: ' + e.message);
			handler("Error while initializing labels.");
			return;
		}

		// Create the machine
		EmulatorFactory.createEmulator(EmulatorType.ZESARUX_EXT);
		Emulator.init();

		Emulator.once('initialized', () => {
			// Array for found watchpoints: WPMEM
			const watchPointLines = new Array<{address: number, line: string}>();
			const assertLines = new Array<{address: number, line: string}>();
			// Load files
			try {
				// Load user list and labels files
				for(let listFile of Settings.launch.listFiles) {
					const sources = listFile.srcDirs as Array<string>;
					Labels.loadAsmListFile(listFile.path, listFile.mainFile, sources, listFile.filter, listFile.asm, listFile.addOffset, (address, line) => {
						// Quick search for WPMEM
						if(line.indexOf('WPMEM') >= 0) {
							// Add watchpoint at this address
							watchPointLines.push({address: address, line: line});
						}
						// Quick search for ASSERT
						if(line.indexOf('ASSERT') >= 0) {
							// Add assert line at this address
							assertLines.push({address: address, line: line});
						}
					});
				}
			}
			catch(err) {
				// Some error occurred during loading, e.g. file not found.
				this.exit(err.message);
			}


			this.serializer.exec(() => {
				// WPMEM
				// Finishes off the loading of the list and labels files
				Labels.finish();
				// convert labels in watchpoints.
				const watchpoints = new Array<GenericWatchpoint>();
				for(let entry of watchPointLines) {
					// WPMEM:
					// Syntax:
					// WPMEM [addr [, length [, access]]]
					// with:
					//	addr = address (or label) to observe (optional). Defaults to current address.
					//	length = the count of bytes to observe (optional). Default = 1.
					//	access = Read/write access. Possible values: r, w or rw. Defaults to rw.
					// e.g. WPMEM LBL_TEXT, 1, w
					// or
					// WPMEM ,1,w, MWV&B8h/0

					// Now check more thoroughly: group1=address, group3=length, group5=access, group7=condition
					const match = /;.*WPMEM(?=[,\s]|$)\s*([^\s,]*)?(\s*,\s*([^\s,]*)(\s*,\s*([^\s,]*)(\s*,\s*([^,]*))?)?)?/.exec(entry.line);
					if(match) {
						// get arguments
						let addressString = match[1];
						let lengthString = match[3];
						let access = match[5];
						let cond = match[7];	// This is supported only with "fast-breakpoints" not with the unmodified ZEsarUX. Also the new (7.1) faster memory breakpoints do not support conditions.
						// defaults
						let entryAddress: number|undefined = entry.address;
						if(addressString && addressString.length > 0)
							entryAddress = Labels.getNumberFromString(addressString);
						if(isNaN(entryAddress))
							continue;	// could happen if the WPMEM is in an area that is conditionally not compiled, i.e. label does not exist.
						let length = 1;
						if(lengthString && lengthString.length > 0) {
							length = Labels.getNumberFromString(lengthString) || NaN;
							if(isNaN(length))
								continue;
						}
						else {
							if(!addressString || addressString.length == 0) {
								// If both, address and length are not defined it is checked
								// if there exists bytes in the list file (i.e.
								// numbers after the address field.
								// If not the "WPMEM" is assumed to be inside a
								// macro and omitted.
								const match = /^[0-9a-f]+\s[0-9a-f]+/i.exec(entry.line);
								if(!match)
									continue;
							}

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
						watchpoints.push({address: entryAddress, size: length, access: access, conditions: cond || ''});
					}
				}
				// Set watchpoints (memory guards)
				Emulator.setWPMEM(watchpoints);
				// "Return"
				this.serializer.endExec();
			});


			this.serializer.exec(() => {
				// ASSERTs
				const assertMap = new Map<number,GenericWatchpoint>();
				// Convert ASSERTS to watchpoints
				for(let entry of assertLines) {
					// ASSERT:
					// Syntax:
					// ASSERT var comparison expr [&&|| var comparison expr]
					// with:
					//  var: a variable, i.e. a register like A or HL
					//  comparison: one of '<', '>', '==', '!=', '<=', '=>'.
					//	expr: a mathematical expression that resolves into a constant
					// Examples:
					// - ASSERT A < 5
					// - ASSERT HL <= LBL_END+2
					// - ASSERT B > (MAX_COUNT+1)/2

					// ASSERTs are breakpoints with "inverted" condition.
					// Now check more thoroughly: group1=var, group2=comparison, group3=expression
					try {
						const matchAssert = /;.*\bASSERT\b/.exec(entry.line);
						if(!matchAssert) {
							// Eg. could be that "ASSERTx" was found.
							continue;
						}

						// Get part of the string after the "ASSERT"
						const part = entry.line.substr(matchAssert.index + matchAssert[0].length).trim();

						// Check if no condition was set = ASSERT false = Always break
						let conds = '';
						if(part.length > 0) {
							// Some condition is set
							const regex = /\s*([a-z]+)\s*([<>=!]+)\s*([^;|&]*)(\|\||&&*)?/gi;
							let match = regex.exec(part);
							if(!match)	// At least one match should be found
								throw Error("Expecting 'ASSERT var comparison expr'.");
							let concatString;
							while (match) {
								// Get arguments
								let varString = match[1] || "";
								varString = varString.trim();
								let compString = match[2] || "";
								compString = compString.trim();
								let exprString = match[3] || "";
								exprString = exprString.trim();
								concatString = match[4] || "";
								concatString = concatString.trim();

								// Check and "invert" the assert condition.
								// Check register / variable
								if(!Z80Registers.isRegister(varString))
									throw Error("Don't know '" + varString + "'");

								// Convert to a number
								const exprValue = Utility.evalExpression(exprString, false); // don't evaluate registers

								// Check comparison
								let resComp;
								if(compString.length > 0) {
									// The ASSERT condition needs to be negated for the breakpoint.
									switch(compString) {
										// >= :
										case '<':	resComp = '>='; break;
										// <= :
										case '>':	resComp = '<='; break;
										// > :
										case '<=':	resComp = '>'; break;
										// < :
										case '>=':	resComp = '<'; break;
										// != :
										case '==':	resComp = '!='; break;
										// == :
										case '!=':	resComp = '=='; break;
									}
								}
								if(!resComp)
									throw Error("Don't know comparison '" + compString + "'");

								// Check concatenation
								let resConcat = '';
								if(concatString.length > 0) {
									// Invert
									if(concatString == "&&")
										resConcat = "||";
									else if(concatString == "||")
										resConcat = "&&";
									else
										throw Error("Cannot handle concatenation with '" + concatString + "'. Use '&&' or '||' instead.");
									resConcat = ' ' + resConcat;
								}

								// Now create condition for zesarux.
								const condPart = varString + ' ' + resComp + ' ' + exprValue.toString();
								if(conds.length > 0)
									conds += ' ';
								conds += condPart + resConcat;
								// Next
								match = regex.exec(part);
							}
							// Check
							if(concatString.length > 0)	// has to end without concatenation symbol
								throw Error("Expected condition after concatenation symbol '" + concatString + "'");
						}

						// Check if ASSERT for that address already exists.
						let bp = assertMap.get(entry.address);
						if(bp && conds.length > 0) {
							// Already exists: just add condition.
							// Check that 2nd condition is not too complicated.
							if(conds.indexOf("&&") >= 0)
								throw Error("Condition too complicated. 2 ASSERTs at the same address are combined and the 2nd condition must not include a '||' condition.");
							// Concatenate conditions.
							bp.conditions += ' || ' + conds;
						}
						else {
							// Breakpoint for address does not yet exist. Create a new one.
							const assertBp = {address: entry.address, size: 1, access: "p", conditions: conds || ''};
							assertMap.set(entry.address, assertBp);
						}
					}
					catch(e) {
						vscode.window.showWarningMessage("Problem with ASSERT. Could not evaluate: '" + entry.line + "': " + e + "");
					}
				}

				// Convert map to array.
				const assertsArray = Array.from(assertMap.values());
				// Set assert breakpoints
				Emulator.setASSERT(assertsArray);
				// "Return"
				this.serializer.endExec();
			});


			this.serializer.exec(() => {
				// Create memory/register dump view
				let registerMemoryView = new MemoryRegisterView(this);
				const regs = Settings.launch.memoryViewer.registersMemoryView;
				registerMemoryView.addRegisters(regs);
				registerMemoryView.update();
				// "Return"
				this.serializer.endExec();
			});

			// Run user commands after load.
			for(const cmd of Settings.launch.commandsAfterLaunch) {
				this.serializer.exec(() => {
					vscode.debug.activeDebugConsole.appendLine(cmd);
					try {
						this.evaluateCommand(cmd, text => {
							vscode.debug.activeDebugConsole.appendLine(text);
							// "Return"
							this.serializer.endExec();
						});
					}
					catch(err) {
						// Some problem occurred
						const output = "Error while executing '" + cmd + "' in 'commandsAfterLaunch': " + err.message;
						this.showWarning(output);
						// "Return"
						this.serializer.endExec();
					}
				});
			}

			this.serializer.exec(() => {
				// Socket is connected, allow setting breakpoints
				this.sendEvent(new InitializedEvent());
				this.serializer.endExec();
				// Respond
				handler();
			});

			this.serializer.exec(() => {
				// Check if program should be automatically started
				if(Settings.launch.startAutomatically) {
					// The ContinuedEvent is necessary in case vscode was stopped and a restart is done. Without, vscode would stay stopped.
					this.sendEvent(new ContinuedEvent(EmulDebugAdapter.THREAD_ID));
					setTimeout(() => {
						// Delay call because the breakpoints are set afterwards.
						this.emulatorContinue();
					}, 500);
				}
				else {
					this.sendEvent(new StoppedEvent('stop on start', EmulDebugAdapter.THREAD_ID));
				}
				this.serializer.endExec();
			});
		});

		Emulator.on('warning', message => {
			// Some problem occurred
			this.showWarning(message);
		});

		Emulator.once('error', err => {
			// Some error occurred
			Emulator.stop(()=>{});
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
				var mbp: EmulatorBreakpoint;
				mbp = {
					bpId: 0,
					filePath: path,
					lineNr: this.convertClientLineToDebugger(bp.line),
					address: -1,	// not known yet
					condition: (bp.condition) ? bp.condition : ''
				};
				return mbp;
			});


			// Set breakpoints for the file.
			Emulator.setBreakpoints(path, bps,
				currentBreakpoints => {
					/*
					// Go through original list of vscode breakpoints and check if they are verified or not
					let source = this.createSource(path);
					const vscodeBreakpoints = givenBps.map(gbp => {
						let verified = false;
						// Check if breakpoint is present in currentBreakpoints
						const lineNr = this.convertClientLineToDebugger(gbp.line);
						for(let cbp of currentBreakpoints) {
							if(cbp.lineNr == lineNr && cbp.filePath == path) {
								verified = true;
								break;
							}
						}
						// Create new breakpoint
						let bp = new Breakpoint(verified, gbp.line, gbp.column, source);
						return bp;
					});
					*/

					const source = this.createSource(path);
					const vscodeBreakpoints = currentBreakpoints.map(cbp => {
						const lineNr = this.convertDebuggerLineToClient(cbp.lineNr);
						const verified = (cbp.address >= 0);	// Is not verified if no address is set
						let bp = new Breakpoint(verified, lineNr, 0, source);
						return bp;
					});


					// send back the actual breakpoint positions
					response.body = {
						breakpoints: vscodeBreakpoints
					};
					this.sendResponse(response);
					this.serializer.endExec();
				},

				// Handle temporary disassembler breakpoints
				(bp: EmulatorBreakpoint) => {
					// Check if it is the right path
					const relFilePath = Utility.getRelTmpDisasmFilePath();
					const absFilePath = Utility.getAbsFilePath(relFilePath);
					if(bp.filePath == absFilePath) {
						// Get address from line number
						const lines = this.dasm.getDisassemblyLines();
						const lineCount = lines.length;
						let lineNr = bp.lineNr;
						while(lineNr < lineCount) {
							const line = lines[lineNr];
							const addr = parseInt(line, 16);
							if(!isNaN(addr)) {
								// create breakpoint object
								const ebp = { bpId: 0, filePath: bp.filePath, lineNr: lineNr, address: addr, condition: bp.condition };
								return ebp;
							}
							lineNr++;
						}
					}
					return undefined;
				}

			);
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

		// Stack frames
		const sfrs = new Array<StackFrame>();

		// Need to check if disassembly is required.
		let doDisassembly = false;
		const fetchAddresses = new Array<number>();
		const fetchData = new Array<Uint8Array>();
		let frameCount = 0;


		// Serialize
		this.serializer.exec(() => {
			// Clear all variables
			this.listVariables.length = 0;

			// Get the call stack trace.
			Emulator.stackTraceRequest(frames => {

				// Check frames for end
				const frameRealCount = frames.length;
				for(; frameCount<frameRealCount; frameCount++) {
					const frame = frames[frameCount];
					// Check if end
					if(frame.name === null) {
						// rest of stack trace is garbage
						break;
					}
				}

				// Go through complete call stack and get the sources.
				// If no source exists than get a hexdump and disassembly later.
				for(let index=0; index<frameCount; index++) {
					const frame = frames[index];
					// Get file for address
					const addr = frame.addr;
					const file = Labels.getFileAndLineForAddress(addr);
					// Store file, if it does not exist the name is empty
					const src = this.createSource(file.fileName);
					const lineNr = (src) ? this.convertDebuggerLineToClient(file.lineNr) : 0;
					const sf = new StackFrame(index+1, frame.name, src, lineNr);
					sfrs.push(sf);
				}

				// Create array with addresses that need to be fetched for disassembly
				for(let index=0; index<frameCount; index++) {
					const sf = sfrs[index];
					if(!sf.source)
						fetchAddresses.push(frames[index].addr);
				}

				// Check if we need to fetch any dump.
				const fetchAddressesCount = fetchAddresses.length;
				if(fetchAddressesCount == 0) {
					// No dumps to fetch
					this.serializer.endExec();
					return;
				}

				// Now get hexdumps for all non existing sources.
				let fetchCount = 0;
				for(let index=0; index<fetchAddressesCount; index++) {
					// So fetch a memory dump
					const fetchAddress = fetchAddresses[index];
					const fetchSize = 100;	// N bytes
					Emulator.getMemoryDump(fetchAddress, fetchSize, data => {
						// Save data for later writing
						fetchData.push(data);
						// Note: because of self-modifying code it may have changed
						// since it was fetched at the beginning.
						// Check if memory changed.
						if(!doDisassembly) {
							const checkSize = 40;	// Needs to be smaller than fetchsize in order not to do a disassembly too often.
							for(let k=0; k<checkSize; k++) {
								const val = this.dasm.memory.getValueAt(fetchAddress+k);
								const memAttr = this.dasm.memory.getAttributeAt(fetchAddress+k);
								if((val != data[k]) || (memAttr == MemAttribute.UNUSED)) {
									doDisassembly = true;
									break;
								}
							}
						}
						// Check for end
						fetchCount ++;
						if(fetchCount >= fetchAddressesCount) {
							// All dumps fetched
							this.serializer.endExec();
						}
					});
				}
			});
		});


		// Create the temporary disassembly file if necessary.
		if(!this.disasmTextDoc) {
			this.serializer.exec(() => {
				if(!doDisassembly) {
					// No disassembly required.
					this.serializer.endExec();
					return;
				}
				// Create text document
				const relFilePath = Utility.getRelTmpDisasmFilePath();
				const absFilePath = Utility.getAbsFilePath(relFilePath);
				const uri = vscode.Uri.file(absFilePath);
				const editCreate = new vscode.WorkspaceEdit();
				editCreate.createFile(uri, {overwrite: true});
				vscode.workspace.applyEdit(editCreate).then(() => {
					vscode.workspace.openTextDocument(absFilePath).then(textDoc => {
						// Store uri
						this.disasmTextDoc = textDoc;
						// End
						this.serializer.endExec();
					});
				});
			});
		}


		// Check if disassembly is required.
		this.serializer.exec(() => {
			// Check if a new address was used.
			const fetchAddressesCount = fetchAddresses.length;
			for(let i=0; i<fetchAddressesCount; i++) {
				// The current PC is for sure a code label.
				const addr = fetchAddresses[i];
				if(this.dasmAddressQueue.indexOf(addr) < 0)
					this.dasmAddressQueue.unshift(addr);
				// Check if this requires a  disassembly
				if(!doDisassembly) {
					const memAttr = this.dasm.memory.getAttributeAt(addr);
					if(!(memAttr & MemAttribute.CODE_FIRST))
						doDisassembly = true;	// If memory was not the start of an opcode.
				}
			}

			// Check if disassembly is required.
			if(!doDisassembly) {
				// End
				this.serializer.endExec();
				return;
			}

			this.serializer.setProgress("Do disassembly");
			// Do disassembly.
			// Write new fetched memory
			const count = fetchAddresses.length;
			for(let i=0; i<count; i++) {
				this.dasm.setMemory(fetchAddresses[i], fetchData[i]);
			}
			this.dasm.setAddressQueue(this.dasmAddressQueue);
			// Disassemble
			this.dasm.memory.clrAssignedAttributesAt(0x0000, 0x10000);	// Clear all memory attributes before next disassembly.
			this.dasm.initLabels();	// Clear all labels.
			this.dasm.disassemble();
			// Read data
			const text = this.dasm.getDisassemblyText();
			// Get all source breakpoints of the disassembly file.
			const bps = vscode.debug.breakpoints;
			const disSrc = this.disasmTextDoc.uri.toString();
			const sbps = bps.filter(bp => {
				if(bp.hasOwnProperty('location')) {
					const sbp = bp as vscode.SourceBreakpoint;
					const sbpSrc = sbp.location.uri.toString();
					if(sbpSrc == disSrc)
						return true;
				}
				return false;
			}) as vscode.SourceBreakpoint[];

			this.serializer.setProgress("Check if any breakpoint");
			// Check if any breakpoint
			const changedBps = new Array<vscode.SourceBreakpoint>();
			if(sbps.length > 0) {
				// Previous text
				const prevTextLines = this.disasmTextDoc.getText().split('\n');

				// Loop all source breakpoints to compute changed BPs
				for(const sbp of sbps) {
					const lineNr = sbp.location.range.start.line;
					const line = prevTextLines[lineNr];
					const addr = parseInt(line, 16);
					if(!isNaN(addr)) {
						// Get new line
						const lines = this.dasm.getDisassemblyLines();
						const nLineNr = this.searchLines(lines, addr);
						// Create breakpoint
						const nLoc = new vscode.Location(this.disasmTextDoc.uri, new vscode.Position(nLineNr, 0));
						const cbp = new vscode.SourceBreakpoint(nLoc, sbp.enabled, sbp.condition, sbp.hitCondition, sbp.logMessage);
						// Store
						changedBps.push(cbp);
					}
				}
			}

			this.serializer.setProgress("Remove all old breakpoints");
			// Remove all old breakpoints.
			vscode.debug.removeBreakpoints(sbps);

			// Create and apply one replace edit
			const editReplace = new vscode.WorkspaceEdit();
			editReplace.replace(this.disasmTextDoc.uri, new vscode.Range(0, 0, this.disasmTextDoc.lineCount, 0), text);
			this.serializer.setProgress("applyEdit");
			vscode.workspace.applyEdit(editReplace).then(() => {
				// Save after edit (to be able to set breakpoints)
				this.serializer.setProgress("disasmTextDoc.save");
				this.disasmTextDoc.save().then(() => {
					this.serializer.setProgress("debug.addBreakpoints");
					// Add all new breakpoints.
					vscode.debug.addBreakpoints(changedBps);
					// End
					this.serializer.endExec();
				});
			});
		});


		// Get lines for addresses and send response.
		this.serializer.exec(() => {
			// Determine line numbers (binary search)
			if(frameCount > 0) {
				const relFilePath = Utility.getRelTmpDisasmFilePath();
				const absFilePath = Utility.getAbsFilePath(relFilePath);
				const src = this.createSource(absFilePath) as Source;
				const lines = this.dasm.getDisassemblyLines();
				let indexDump = 0;
				for(let i=0; i<frameCount; i++) {
					const sf = sfrs[i];
					if(sf.source)
						continue;
					// Get line number for stack address
					const addr = fetchAddresses[indexDump];
					const foundLine = this.searchLines(lines, addr);
					const lineNr = this.convertDebuggerLineToClient(foundLine);
					// Store
					sf.source = src;
					sf.line = lineNr;
					// Next
					indexDump ++;
				}
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
	}


	/**
	 * Does a search to find the (last) line that correspondents to the
	 * given address.
	 * The array usually contains lines with a starting address.
	 * But it may also contain empty lines or lines not starting with a number.
	 * Those lines are skipped.
	 * @param allLines An array to be searched. Can contain lines without address.
	 * @param addr The address to find.
	 * @return -1 if not found, otherwise the line number.
	 */
	protected searchLines(allLines: Array<string>, addr: number) {
		// find each new line and count the lines
		let i = allLines.length;
		while(i > 0) {
			i --;
			const line = allLines[i];
			const la = parseInt(line, 16);
			if(la == addr)
				return  i;
		}
		// Not found
		return -1;
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
			const frame = Emulator.getFrame(frameId);
			if(!frame) {
				// No frame found, send empty response
				response.body = {scopes: scopes};
				this.sendResponse(response);
				this.serializer.endExec();
				return;
			}

			// More serialization
			const innerSerializer = new CallSerializer("innerScopesRequest");

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
			this.emulatorContinue(data => {
					// Send output event to inform the user about the reason
					const e: DebugProtocol.OutputEvent = new OutputEvent(data + '\n', 'console');
					this.sendEvent(e);
				}
			);
			this.sendResponse(response);
			this.serializer.endExec();
		});
	}


	/**
	 * Calls 'continue' (run) on the emulator.
	 * Called at the beginning (startAutomatically) and from the
	 * vscode UI (continueRequest).
	 * @param stopHandler(string) Is called when continue has been stopped,
	 * e.g. by a breakpoint. Can be omitted.
	 */
	protected emulatorContinue(stopHandler:(data: string)=>void = ()=>{}) {
		Emulator.continue(data => {
			// It returns here not immediately but only when a breakpoint is hit or pause is requested.

			// Update memory dump etc.
			this.update();

			// call handler
			stopHandler(data);

			// Send break
			this.sendEvent(new StoppedEvent('break', EmulDebugAdapter.THREAD_ID));

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
			Emulator.pause();
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
			Emulator.reverseContinue( () => {
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
			Emulator.stepOver( () => {
				// Update memory dump etc.
				this.update({step: true});

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
			Emulator.stepInto( () => {
				// Update memory dump etc.
				this.update({step: true});

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
			Emulator.stepOut( () => {
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
			Emulator.stepBack( () => {
				// Update memory dump etc.
				this.update({step: true});

				// Response
				this.sendResponse(response);
				this.serializer.endExec();

				// Send event
				this.sendEvent(new StoppedEvent('step', EmulDebugAdapter.THREAD_ID));
			});
		});
	}


	/**
	 * Evaluates the command and executes it.
	 * The method might throw an exception if it cannot parse the command.
	 * @param command E.g. "-exec tbblue-get-register 57" or "-wpmem disable".
	 * @param handler A handler that is called after the execution. Can be omitted.
	 */
	protected evaluateCommand(command: string, handler = (text)=>{}) {
		const expression = command.trim();
		const tokens = expression.split(' ');
		const cmd = tokens.shift();
		// All commands start with "-"
		if(cmd == '-help' || cmd == '-h') {
			this.evalHelp(tokens, handler);
		}
		else if (cmd == '-ASSERT' || cmd == '-assert') {
			this.evalASSERT(tokens, handler);
		}
		else if (cmd == '-eval') {
			this.evalEval(tokens, handler);
		}
		else if (cmd == '-exec' || cmd == '-e') {
			this.evalExec(tokens, handler);
		}
		else if (cmd == '-label' || cmd == '-l') {
			this.evalLabel(tokens, handler);
		}
		else if (cmd == '-md') {
			this.evalMemDump(tokens, handler);
		}
		else if (cmd == '-patterns') {
			this.evalSpritePatterns(tokens, handler);
		}
		else if (cmd == '-WPMEM' || cmd == '-wpmem') {
			this.evalWPMEM(tokens, handler);
		}
		else if (cmd == '-sprites') {
			this.evalSprites(tokens, handler);
		}
		else if (cmd == '-state') {
			this.evalStateSaveRestore(tokens, handler);
		}
		// Debug commands
		else if (cmd == '-dbg') {
			this.evalDebug(tokens, handler);
		}
		//
		else {
			// Unknown command
			throw new Error("Unknown command: '" + expression + "'");
		}
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
			try {
				if(expression.startsWith('-')) {
					this.evaluateCommand(expression, text => {
						this.sendEvalResponse(text, response);
					});
					// End
					return;
				}
			}
			catch(err) {
				const output = "Error: " + err.message;
				this.sendEvalResponse(output, response);
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
			const match = /^@?([^\s,]+)\s*(,\s*([^\s,]*))?(,\s*([^\s,]*))?/.exec(name);
			if(match) {
				let labelString = match[1];
				let sizeString = match[3];
				let byteWord = match[5];
				// Defaults
				if(labelString) {
					let labelValue = NaN;
					let lastLabel;
					let modulePrefix;
					// First check for module name and local label prefix (sjasmplus).
					if(Emulator.RegisterCache) {
						// Get current pc
						const pc = Z80Registers.parsePC(Emulator.RegisterCache);
						const entry = Labels.getFileAndLineForAddress(pc);
						// Local label and prefix
						lastLabel = entry.lastLabel;
						modulePrefix = entry.modulePrefix;
					}

					// Convert label
					try {
						labelValue = Utility.evalExpression(labelString, false, modulePrefix, lastLabel);
					} catch {}

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


	/**
	 * Prints a help text for the debug console commands.
	 * @param tokens The arguments. Unused.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalHelp(tokens: Array<string>, handler: (text:string)=>void) {
		const output =
`Allowed commands are:
"-ASSERT enable|disable|status":
	- enable|disable: Enables/disables all breakpoints caused by ASSERTs set in the sources. All ASSERTs are by default enabled after startup of the debugger.
	- status: Shows enable status of WPMEM watchpoints.
"-eval expr": Evaluates an expression. The expression might contain
mathematical expressions and also labels. It will also return the label if
the value correspondends to a label.
"-exec|e [-view] cmd args": cmd and args are directly passed to ZEsarUX. E.g. "-exec get-registers". If you add "-view" the output will go into a new view instead of the console.
"-help|h": This command. Do "-e help" to get all possible ZEsarUX commands.
"-label|-l XXX": Returns the matching labels (XXX) with their values. Allows wildcard "*".
"-md address size [address_n size_n]*": Memory Dump at 'address' with 'size' bytes. Will open a new view to display the memory dump.
"-patterns [index[+count|-endindex] [...]": Shows the tbblue sprite patterns beginning at 'index' until 'endindex' or a number of 'count' indices. The values can be omitted. 'index' defaults to 0 and 'count' to 1.
Without any parameter it will show all sprite patterns.
You can concat several ranges with a ",".
Example: "-patterns 10-15 20+3 33" will show sprite patterns at index 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
"-WPMEM enable|disable|status":
	- enable|disable: Enables/disables all WPMEM set in the sources. All WPMEM are by default enabled after startup of the debugger.
	- status: Shows enable status of WPMEM watchpoints.
"-sprites [slot[+count|-endslot] [...]": Shows the tbblue sprite registers beginning at 'slot' until 'endslot' or a number of 'count' slots. The values can be omitted. 'slot' defaults to 0 and 'count' to 1. You can concat several ranges with a ",".
Example: "-sprite 10-15 20+3 33" will show sprite slots 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
Without any parameter it will show all visible sprites automatically.
"-state save|restore": Saves/restores the current state. I.e. the complete RAM + the registers.
Examples:
"-exec h 0 100": Does a hexdump of 100 bytes at address 0.
"-e write-memory 8000h 9fh": Writes 9fh to memory address 8000h.
"-e gr": Shows all registers.
"-eval 2+3*5": Results to "17".
"-md 0 10": Shows the memory at address 0 to address 9.
"-sprites": Shows all visible sprites.
Notes:
"-exec run" will not work at the moment and leads to a disconnect.
`;
/*
For debugging purposes there are a few more:
-dbg serializer clear: Clears the call serializer queue.
-dbg serializer print: Prints the current function. Use this to see where
it hangs if it hangs. (Use 'setProgress' to debug.)
*/
		handler(output);
	}


	/**
	 * Evaluates a given expression.
	 * @param tokens The arguments. I.e. the expression to evaluate.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalEval(tokens: Array<string>, handler: (text:string)=>void) {
		const expr = tokens.join(' ').trim();	// restore expression
		if(expr.length == 0) {
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
		const labels = Labels.getLabelsPlusIndexForNumber(value);
		if(labels.length > 0) {
			result += ', ' + labels.join(', ');
		}

		handler(result);
	}


	/**
	 * Executes a command in the emulator.
	 * @param tokens The arguments. I.e. the command for the emulator.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalExec(tokens: Array<string>, handler: (text:string)=>void) {
		// Check for "-view"
		let redirectToView = false;
		if(tokens[0] == '-view') {
			redirectToView = true;
			tokens.shift();
		}
		// Execute
		const machineCmd = tokens.join(' ');
		if(machineCmd.length == 0) {
			// No command given
			throw new Error('No command given.');
		}
		else {
			Emulator.dbgExec(machineCmd, (data) => {
				if(redirectToView) {
					// Create new view
					const panel = new TextView(this, "exec: "+machineCmd, data);
					panel.update();
					// Send response
					handler('OK');
				}
				else {
					// Print to console
					handler(data);
				}
			});
		}
	}


	/**
	 * Evaluates a label.
	 * @param tokens The arguments. I.e. the label.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalLabel(tokens: Array<string>, handler: (text:string)=>void) {
		const expr = tokens.join(' ').trim();	// restore expression
		if(expr.length == 0) {
			// Error Handling: No arguments
			const output = "Label expected.";
			handler(output);
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
		handler(result);
	}


	/**
	 * Shows a view with a memory dump.
	 * @param tokens The arguments. I.e. the address and size.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalMemDump(tokens: Array<string>, handler: (text:string)=>void) {
		// check count of arguments
		if(tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		if(tokens.length % 2 != 0) {
			// Error Handling: No size given
			throw new Error("No size given for address '" + tokens[tokens.length-1] + "'.");
		}

		// Get all addresses/sizes.
		const addrSizes = new Array<number>();
		for(let k=0; k<tokens.length; k+=2) {
			// address
			const addressString = tokens[k];
			const address = Utility.evalExpression(addressString);
			addrSizes.push(address);

			// size
			const sizeString = tokens[k+1];
			const size = Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel = new MemoryDumpView(this);
		for(let k=0; k<tokens.length; k+=2)
			panel.addBlock(addrSizes[k], addrSizes[k+1]);
		panel.mergeBlocks();
		panel.update();

		// Send response
		handler('OK');
	}


	/**
	 * ASSERT. Enable/disable/status.
	 * @param tokens The arguments.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalASSERT(tokens: Array<string>, handler: (text:string)=>void) {
		const show = () => {
			// Always show enable status of all WPMEM watchpoints
			const enable = Emulator.assertBreakpointsEnabled;
			const enableString = (enable) ? 'enabled' : 'disabled';
			handler('ASSERT breakpoints are ' + enableString + '.');
		}

		const param = tokens[0] || '';
		if(param == 'enable' || param == 'disable') {
			// enable or disable all assert breakpoints
			const enable = (param == 'enable');
			Emulator.enableAssertBreakpoints(enable, () => {
				// Print to console
				show();
			});
		}
		else if(param == 'status') {
			// just show
			show();
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}
	}


	/**
	 * WPMEM. Enable/disable/status.
	 * @param tokens The arguments.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalWPMEM(tokens: Array<string>, handler: (text:string)=>void) {
		const show = () => {
			// Always show enable status of all WPMEM watchpoints
			const enable = Emulator.wpmemEnabled;
			const enableString = (enable) ? 'enabled' : 'disabled';
			handler('WPMEM watchpoints are ' + enableString + '.');
		}

		const param = tokens[0] || '';
		if(param == 'enable' || param == 'disable') {
			// enable or disable all WPMEM watchpoints
			const enable = (param == 'enable');
			Emulator.enableWPMEM(enable, () => {
				// Print to console
				show();
			});
		}
		else if(param == 'status') {
			// just show
			show();
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}
	}


	/**
	 * Show the sprite patterns in a view.
	 * @param tokens The arguments.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalSpritePatterns(tokens: Array<string>, handler: (text:string)=>void) {
		// First check for tbblue
		if(Emulator.machineType != MachineType.TBBLUE)
			throw new Error("Command is available only on tbblue (ZX Next).");
		// Evaluate arguments
		let title;
		let params: Array<number>|undefined = [];
		if(tokens.length == 0) {
			// The view should choose the visible sprites automatically
			title = 'Sprite Patterns: 0-63';
			params.push(0);
			params.push(64);
		}
		else {
			// Create title
			title = 'Sprite Patterns: ' + tokens.join(' ');
			// Get slot and count/endslot
			while(true) {
				// Get parameter
				const param = tokens.shift();
				if(!param)
					break;
				// Evaluate
				const match = /([^+-]*)(([-+])(.*))?/.exec(param);
				if(!match) // Error Handling
					throw new Error("Can't parse: '" + param + "'");
				// start slot
				const start = Utility.parseValue(match[1]);
				if(isNaN(start))	// Error Handling
					throw new Error("Expected slot but got: '" + match[1] + "'");
				// count
				let count = 1;
				if(match[3]) {
					count = Utility.parseValue(match[4]);
					if(isNaN(start))	// Error Handling
						throw new Error("Can't parse: '" + match[4] + "'");
					if(match[3] == "-")	// turn range into count
						count += 1 - start;
				}
				// Check
				if(count <= 0)	// Error Handling
					throw new Error("Not allowed count: '" + match[0] + "'");
				// Add
				params.push(start);
				params.push(count);
			}

			const slotString = tokens[0] || '0';
			const slot = Utility.parseValue(slotString);
			if(isNaN(slot)) {
				// Error Handling: Unknown argument
				throw new Error("Expected slot but got: '" + slotString + "'");
			}
			const countString = tokens[1] || '1';
			const count = Utility.parseValue(countString);
			if(isNaN(count)) {
				// Error Handling: Unknown argument
				throw new Error("Expected count but got: '" + countString + "'");
			}
		}

		// Create new view
		const panel = new ZxNextSpritePatternsView(this, title, params);
		panel.update();

		// Send response
		handler('OK');
	}


	/**
	 * Show the sprites in a view.
	 * @param tokens The arguments.
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalSprites(tokens: Array<string>, handler: (text:string)=>void) {
		// First check for tbblue
		if(Emulator.machineType != MachineType.TBBLUE)
			throw new Error("Command is available only on tbblue (ZX Next).");
		// Evaluate arguments
		let title;
		let params: Array<number>|undefined;
		if(tokens.length == 0) {
			// The view should choose the visible sprites automatically
			title = 'Visible Sprites';
		}
		else {
			// Create title
			title = 'Sprites: ' + tokens.join(' ');
			// Get slot and count/endslot
			params = [];
			while(true) {
				// Get parameter
				const param = tokens.shift();
				if(!param)
					break;
				// Evaluate
				const match = /([^+-]*)(([-+])(.*))?/.exec(param);
				if(!match) // Error Handling
					throw new Error("Can't parse: '" + param + "'");
				// start slot
				const start = Utility.parseValue(match[1]);
				if(isNaN(start))	// Error Handling
					throw new Error("Expected slot but got: '" + match[1] + "'");
				// count
				let count = 1;
				if(match[3]) {
					count = Utility.parseValue(match[4]);
					if(isNaN(start))	// Error Handling
						throw new Error("Can't parse: '" + match[4] + "'");
					if(match[3] == "-")	// turn range into count
						count += 1 - start;
				}
				// Check
				if(count <= 0)	// Error Handling
					throw new Error("Not allowed count: '" + match[0] + "'");
				// Add
				params.push(start);
				params.push(count);
			}

			const slotString = tokens[0] || '0';
			const slot = Utility.parseValue(slotString);
			if(isNaN(slot)) {
				// Error Handling: Unknown argument
				throw new Error("Expected slot but got: '" + slotString + "'");
			}
			const countString = tokens[1] || '1';
			const count = Utility.parseValue(countString);
			if(isNaN(count)) {
				// Error Handling: Unknown argument
				throw new Error("Expected count but got: '" + countString + "'");
			}
		}

		// Create new view
		const panel = new ZxNextSpritesView(this, title, params);
		panel.update();

		// Send response
		handler('OK');
	}


	/**
	 * Save/restore the state.
	 * @param tokens The arguments. 'save'/'restore'
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalStateSaveRestore(tokens: Array<string>, handler: (text:string)=>void) {
		const stateName = tokens[1];
		if(!stateName)
			throw new Error("Parameter missing: You need to add a name for the state, e.g. '0', '1' or more descriptive 'start'");

		const param = tokens[0] || '';
		if(param == 'save') {
			// Save current state
			this.stateSave(stateName, text => {
				if(!text)	// Error text ?
					text = 'OK';
				// Send response
				handler('OK');
			});
		}
		else if(param == 'restore') {
			// Restores the state
			this.stateRestore(stateName, text => {
				if(!text)	// Error text ?
					text = 'OK';
				// Send response
				handler(text);
				// Reload register values etc.
				this.sendEvent(new ContinuedEvent(EmulDebugAdapter.THREAD_ID));
				this.sendEvent(new StoppedEvent('Restore', EmulDebugAdapter.THREAD_ID));
			});
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}
	}


	/**
	 * Debug commands. Not shown publicly.
	 * @param tokens The arguments. 'serializer clear'|'serializer print'
 	 * @param handler(text) A handler that is called after the execution.
	 */
	protected evalDebug(tokens: Array<string>, handler: (text:string)=>void) {
		const param1 = tokens[0] || '';
		let unknownArg = param1;
		if(param1 == 'serializer') {
			const param2 = tokens[1] || '';
			unknownArg = param2;
			if(param2 == 'clear') {
				// Clear the call serializer queue
				this.serializer.clrQueue();
				handler('OK');
				return;
			}
			else if(param2 == 'print') {
				// Print the current function.
				const current = this.serializer.getCurrentFunction();
				const text = 'Progress: ' + current.progress +'\n' +
				'Func: ' + current.func;
				handler(text);
				return;
			}
		}
		// Unknown argument
		throw new Error("Unknown argument: '" + unknownArg + "'");
	}


	/**
	 * Convenience method to send a response for the eval command.
	 * @param text The text to display in the debug console.
	 * @param response The response object.
	 */
	protected sendEvalResponse(text: string, response:DebugProtocol.EvaluateResponse) {
		response.body = { result: text + "\n\n", type: undefined, presentationHint: undefined, variablesReference:0, namedVariables: undefined, indexedVariables: undefined };
		this.sendResponse(response);
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
		Emulator.setProgramCounter(addr, () => {
			// line is not updated. See https://github.com/Microsoft/vscode/issues/51716
			//this.sendEvent(new StoppedEvent('PC-change', EmulDebugAdapter.THREAD_ID));
			this.sendEvent(new ContinuedEvent(EmulDebugAdapter.THREAD_ID));
			this.sendEvent(new StoppedEvent('PC-change', EmulDebugAdapter.THREAD_ID));
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
	 * @param handler(errorText?) Is called when data was saved. errorText is undefined if
	 * successful, otherwise it contains the error description.
	 */
	protected stateSave(stateName: string, handler:(errorText?: string) => void) {
		// Save state
		Emulator.stateSave(stateData => {
			let filePath;
			try {
				// Save data to temp directory
				filePath = Utility.getAbsStateFileName(stateName);
				const binFile = new BinaryFile(filePath, "w");
				(async function () {
					await binFile.open();
					await stateData.write(binFile);
					await binFile.close();
					handler();
				}) ();
			}
			catch(e) {
				const errTxt = "Can't save '" + filePath + "': " + e.message;
				handler(errTxt);
			}
		});
	}


	/**
	 * Called from "-state restore N" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * @param stateName A state name (or number) can be appended, so that different states might be saved.
	 * @param handler(errorText?) Is called when data was saved. errorText is undefined if
	 * successful, otherwise it contains the error description.
	 */
	protected stateRestore(stateName: string, handler:(errorText?: string) => void) {
		// Load data from temp directory
		let filePath;
		let errTxt;
		try {
			// Read data
			filePath = Utility.getAbsStateFileName(stateName);
			const binFile = new BinaryFile(filePath, "r");
			const stateData = new StateZX16K();
			(async function () {
				await binFile.open();
				await stateData.read(binFile);
				await binFile.close();
				// Restore state
				Emulator.stateRestore(stateData, () => {
					handler();
				});
			}) ();
		}
		catch(e) {
			errTxt = "Can't load '" + filePath + "': " + e.message;
			handler(errTxt);
		}
	}
}
