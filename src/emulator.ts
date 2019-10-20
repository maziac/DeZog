
import * as assert from 'assert';
import { Z80Registers } from './z80Registers';
import { RefList } from './reflist';
import { Frame } from './frame';
import { EventEmitter } from 'events';
import { GenericWatchpoint, GenericBreakpoint } from './genericwatchpoint';
import { Labels } from './labels';
import { Settings, ListFile } from './settings';
import { Utility } from './utility';
//import { Opcode } from './disassembler/opcode';
//import { Memory } from './disassembler/memory';
//import { Format } from './disassembler/format';


/**
 * The breakpoint representation.
 */
export interface EmulatorBreakpoint {
	bpId: number;	///< The breakpoint ID/number (>0)
	filePath: string;	///< The file to which the breakpoint belongs
	lineNr: number;	///< The line number in the file starting at 0
	address: number;	///< Usually the pc value  to stop at (e.g. 0A7f)
	condition: string;	///< An additional condition.
	log: string|undefined;	///< An optional log message. If set the execution will not stop at the breakpoint but a log message is written instead.
}


/// The machine type, e.g. ZX81, Spectrum 16k, Spectrum 128k, etc.
/// NOT USED:
export enum MachineType {
	UNKNOWN = 0,
	ZX80,
	ZX81,
	SPECTRUM16K,
	SPECTRUM48K,
	SPECTRUM128K,
	TBBLUE

/*
	MK14     MK14
	ZX80     ZX-80
	ZX81     ZX-81
	16k      Spectrum 16k
	48k      Spectrum 48k
	128k     Spectrum 128k
	QL       QL
	P2       Spectrum +2
	P2F      Spectrum +2 (French)
	P2S      Spectrum +2 (Spanish)
	P2A40    Spectrum +2A (ROM v4.0)
	P2A41    Spectrum +2A (ROM v4.1)
	P2AS     Spectrum +2A (Spanish)
	P340     Spectrum +3 (ROM v4.0)
	P341     Spectrum +3 (ROM v4.1)
	P3S      Spectrum +3 (Spanish)
	TS2068   Timex TS 2068
	Inves    Inves Spectrum+
	48ks     Spectrum 48k (Spanish)
	128ks    Spectrum 128k (Spanish)
	TK90X    Microdigital TK90X
	TK90XS   Microdigital TK90X (Spanish)
	TK95     Microdigital TK95
	Z88      Cambridge Z88
	Sam      Sam Coupe
	Pentagon Pentagon
	Chloe140 Chloe 140 SE
	Chloe280 Chloe 280 SE
	Chrome   Chrome
	Prism    Prism
	ZXUNO    ZX-Uno
	TSConf   ZX-Evolution TS-Conf
	TBBlue   TBBlue/ZX Spectrum Next
	ACE      Jupiter Ace
	CPC464   Amstrad CPC 464
	*/

}


/// The internal machine state.
export enum EmulatorState {
	UNINITIALIZED = 0,	///< before connection to ZEsarUX.
	IDLE,				///< The normal state. Waiting for a new command.
	RUNNING,			///< When a 'continue' or 'stepOut' has been requested. Until the next break.
	RUNNING_REVERSE,	///< Not yet used. Same as 'RUNNING' but in reverse direction.
};


/// Definition of one memory page, i.e. memory slot/bank relationship.
export interface MemoryPage {
	/// Z80 start address of page.
	start: number;

	/// Z80 end address of page.
	end: number;

	/// The name of the mapped memory area.
	name: string;
};


/**
 * The representation of the Z80 emulator (e.g. Zesarux or MAME).
 * It receives the requests from the EmulDebugAdapter and communicates with
 * the EmulConnector.
 */
export class EmulatorClass extends EventEmitter {

	/// The machine type, e.g. 48k or 128k etc.
	public machineType = MachineType.UNKNOWN;

	/// Current state, e.g. RUNNING
	protected state = EmulatorState.UNINITIALIZED;

	/// The top of the stack. Used to limit the call stack.
	public topOfStack : number;

	/// A list for the frames (call stack items)
	protected listFrames = new RefList();

	/// Mirror of the emulator's breakpoints.
	protected breakpoints = new Array<EmulatorBreakpoint>();

	/// The register cache for values retrieved from emulator.
	/// Is a simple string that needs to get parsed.
	public RegisterCache: string|undefined = undefined;

	/// The WPMEM watchpoints can only be enabled/disabled alltogether.
	public wpmemEnabled = false;

	/// The assert breakpoints can only be enabled/disabled alltogether.
	public assertBreakpointsEnabled = false;

	/// The logpoints can be enabled/disabled per group.
	public logpointsEnabled = new Map<string, boolean>();


	/// The addresses of the revision history in the right order.
	protected revDbgHistory = new Array<number>();

	/// If code coverage display and measurement is enabled.
	protected codeCoverageEnabled = false;

	/// Stores the wpmem watchpoints
	protected watchpoints = new Array<GenericWatchpoint>();


	/// Stores the assert breakpoints
	protected assertBreakpoints = new Array<GenericBreakpoint>();

	/// Stores the log points
	protected logpoints = new Map<string, Array<GenericBreakpoint>>();


	/// Initializes the machine.
	public init() {
		// Init the registers
		Z80Registers.init();
	}


	/**
	 * Creates an array of watch points from the text lines.
	 * @param watchPointLines An array with address and line (text) pairs.
	 * @return An array with watch points (GenericWatchpoints).
	 */
	protected createWatchPoints(watchPointLines: Array<{address: number, line: string}>): Array<GenericWatchpoint> {
		// convert labels in watchpoints.
		const watchpoints = new Array<GenericWatchpoint>();

		let i =-1;
		for(let entry of watchPointLines) {
			i = i+1;
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

			try {
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
						entryAddress = Utility.evalExpression(addressString, false); // don't evaluate registers
					if(isNaN(entryAddress))
						continue;	// could happen if the WPMEM is in an area that is conditionally not compiled, i.e. label does not exist.
					let length = 1;
					if(lengthString && lengthString.length > 0) {
						length = Utility.evalExpression(lengthString, false); // don't evaluate registers
					}
					else {
						if(!addressString || addressString.length == 0) {
							// If both, address and length are not defined it is checked
							// if there exists bytes in the list file (i.e.
							// numbers after the address field).
							// If not the "WPMEM" is assumed to be inside a
							// macro and omitted.
							const match = /^[0-9a-f]+\s[0-9a-f]+/i.exec(entry.line);
							if(!match)
								continue;
						}
					}
					if(access && access.length > 0) {
						if( access != 'r' && access != 'w' && access != 'rw') {
							console.log("Wrong access mode in watch point. Allowed are only 'r', 'w' or 'rw' but found '" + access + "' in line: '" + entry.line + "'");
							continue;
						}
					}
					else
						access = 'rw';
					// set watchpoint
					watchpoints.push({address: entryAddress, size: length, access: access, conditions: cond || ''});
				}
			}
			catch(e) {
				throw "Problem with ASSERT. Could not evaluate: '" + entry.line + "': " + e + "";
			}
		}

		return watchpoints;
	}


	/**
	 * Creates an array of asserts from the text lines.
	 * @param watchPointLines An array with address and line (text) pairs.
	 * @return An array with asserts (GenericWatchpoints).
	 */
	protected createAsserts(assertLines: Array<{address: number, line: string}>) {
		const assertMap = new Map<number,GenericBreakpoint>();
		// Convert ASSERTS to watchpoints
		for(let entry of assertLines) {
			// ASSERT:
			// Syntax:
			// ASSERT var comparison expr [&&|| expr]
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
					const regex = /\s*([^;]*)/i;
					let match = regex.exec(part);
					if(!match)	// At least one match should be found
						throw "Expecting 'ASSERT expr'.";
					conds = match[1];
				}

				// Negate the expression
				conds = '!(' + conds + ')';

				// Check if ASSERT for that address already exists.
				if(conds.length > 0) {
					let bp = assertMap.get(entry.address);
					if(bp) {
						// Already exists: just add condition.
						bp.conditions = '(' + bp.conditions + ') || (' + conds + ')';
					}
					else {
						// Breakpoint for address does not yet exist. Create a new one.
						const assertBp = {address: entry.address, conditions: conds, log: undefined};
						assertMap.set(entry.address, assertBp);
					}
				}
			}
			catch(e) {
				console.log("Problem with ASSERT. Could not evaluate: '" + entry.line + "': " + e + "");
			}
		}

		// Convert map to array.
		const assertsArray = Array.from(assertMap.values());

		return assertsArray;
	}


	/**
	 * Creates an array of log points from the text lines.
	 * @param watchPointLines An array with address and line (text) pairs.
	 * @return An array with log points (GenericWatchpoints).
	 */
	protected createLogPoints(watchPointLines: Array<{address: number, line: string}>): Map<string, Array<GenericBreakpoint>> {
		// convert labels in watchpoints.
		const logpoints = new Map<string, Array<GenericBreakpoint>>();
		for(let entry of watchPointLines) {
			// LOGPOINT:
			// Syntax:
			// LOGPOINT [group] text ${(var):signed} text ${reg:hex} text ${w@(reg)} text ¢{b@(reg):unsigned}
			// e.g. LOGPOINT [SPRITES] Status=${A}, Counter=${(sprite.counter):unsigned}

			// Now check more thoroughly i.e. for comma
			const match = /;.*LOGPOINT\s(\s*\[\s*(\w*)\s*\]\s)?(.*)$/.exec(entry.line);
			if(match) {
				// get arguments
				const group = match[2] || "DEFAULT";
				const logMsg = '[' + group + '] ' + match[3];
				// Create group if not existent
				let array = logpoints.get(group);
				if(!array) {
					array = new Array<GenericBreakpoint>();
					logpoints.set(group, array);
				}
				// Convert labels
				try {
					const log = this.evalLogMessage(logMsg);
					// set watchpoint
					array.push({address: entry.address, conditions: '', log: log});
				}
				catch(e) {
					// Show error
					console.log(e);
				}
			}
		}

		return logpoints;
	}



	/**
	 * Evaluates a log message, i.e. a message that was given for a logpoint.
	 * The format is checked and also the labels are changed into numbers.
	 * Throws an exception in case of a formatting error.
	 * @param logMsg A message in log format, e.g. "Status=${w@(status_byte):unsigned}"
	 * @returns The converted string. I.e. label names are converted to numbers.
	 */
	protected evalLogMessage(logMsg: string|undefined): string|undefined {
		if(!logMsg)
			return undefined

		// Search all "${...}""
		const result = logMsg.replace(/\${\s*(.*?)\s*}/g, (match, inner) => {
			// Check syntax
			const matchInner = /(([bw]@)?\s*\(\s*(.*?)\s*\)|(\w*)\s*)\s*(:\s*(unsigned|signed|hex))?\s*/i.exec(inner);
			if(!matchInner)
				throw "Log message format error: '" + match + "' in '" + logMsg + "'";
			const end = (matchInner[6]) ? ':' + matchInner[6] : '';
			let addr = matchInner[3] || '';
			if(addr.length) {
				const access = matchInner[2] || '';
				// Check if it is a register
				if(Z80Registers.isRegister(addr)) {
					// e.g. addr == "HL" in "(HL)"
					return "${" + access + "(" + addr + ")" + end + "}";
				}
				else {
					// Check variable for label
					try {
						//console.log('evalLogMessage: ' + logMsg + ': ' + addr);
						const converted = Utility.evalExpression(addr, false);
						return "${" + access + "(" + converted.toString() + ")" + end + "}";
					}
					catch (e) {
						// If it cannot be converted (e.g. a register name) an exception will be thrown.
						throw "Log message format error: " + e.message + " in '" + logMsg + "'";
					}
				}
			}
			else {
				// Should be a register (Note: this is not 100% fool proof since there are more registers defined than allowed in logs)
				const reg = matchInner[4];
				if(!Z80Registers.isRegister(reg))
					throw "Log message format error: Unsupported register '" + reg + "' in '" + logMsg + "'";
				return "${" + reg + end + "}";
			}
		});

		console.log('evalLogMessage: ' + result);
		return result;
	}


	/**
	 * Reads the list file and also retrieves all occurrences of
	 * WPMEM, ASSERT and LOGPOINT.
	 * Also sets WPMEM, ASSERT and LOGPOINT break/watchpoints.
	 * May throw an error.
	 * @param listFiles An array with all list files.
	 * @param sources An array with directories where the source files are located.
	 */
	public readListFiles(listFiles: Array<ListFile>) {
		// Array for found watchpoints: WPMEM, ASSERT breakpoints, LOGPOINT watchpoints
		const watchPointLines = new Array<{address: number, line: string}>();
		const assertLines = new Array<{address: number, line: string}>();
		const logPointLines = new Array<{address: number, line: string}>();
		// Load user list and labels files
		for(const listFile of listFiles) {
			const file = {
				path: Utility.getAbsFilePath(listFile.path),
				mainFile: listFile.mainFile,
				srcDirs: listFile.srcDirs || [""],
				filter: listFile.filter,
				asm: listFile.asm || "sjasmplus",
				addOffset: listFile.addOffset || 0
			};
			Labels.loadAsmListFile(file.path, file.mainFile, file.srcDirs, file.filter, file.asm, file.addOffset, (address, line) => {
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
				// Quick search for LOGPOINT
				if(line.indexOf('LOGPOINT') >= 0) {
					// Add assert line at this address
					logPointLines.push({address: address, line: line});
				}
			});
		}

		// Finishes off the loading of the list and labels files
		Labels.finish();

		// calculate top of stack, execAddress
		this.topOfStack = Labels.getNumberFromString(Settings.launch.topOfStack);
		if(isNaN(this.topOfStack))
			throw Error("Cannot evaluate 'topOfStack' (" + Settings.launch.topOfStack + ").");

		// Set watchpoints (memory guards)
		const watchpoints = this.createWatchPoints(watchPointLines);
		this.setWPMEM(watchpoints);

		// ASSERTs
		// Set assert breakpoints
		const assertsArray = this.createAsserts(assertLines);
		this.setASSERT(assertsArray);

		// LOGPOINTs
		const logPointsMap = this.createLogPoints(logPointLines);
		this.setLOGPOINT(logPointsMap);
	}


	/**
	 * Stops a machine/the debugger.
	 * This will e.g. disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * Very much like 'terminate' but does not send the 'terminated' event.
	 * @param handler is called after the connection is disconnected.
	 */
	public disconnect(handler: () => void) {
		// please override.
	}


	/**
	 * Terminates the machine/the debugger.
	 * This should disconnect the socket and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator or on a 'restartRequest'.
	 * Has to emit the "this.emit('terminated')".
	 * @param handler is called after the connection is terminated.
	 */
	public terminate(handler: () => void) {
		// please override.
	}


	/**
	 * Override this to retrieve the registers from the emulator.
	 * @param handler(registersString) Passes 'registersString' to the handler.
	 */
	public getRegistersFromEmulator(handler: (registersString: string) => void) {
		assert(false);	// override this
	}


	/**
	* Gets the registers from cache. If cache is empty retrieves the registers from
	* the emulator.
	* @param handler(registersString) Passes 'registersString' to the handler.
	*/
	public getRegisters(handler: (registersString: string) => void) {
		if(this.RegisterCache) {
			// Already exists, return immediately
			handler(this.RegisterCache);
		}
		else {
			// get new data
			this.getRegistersFromEmulator(regs => {
				// Store received data
				this.RegisterCache = regs;
				//const regs = data || '';	// Just to remove warning
				handler(regs);
			});
		}
	}


	/**
	 * Returns a specific register value.
	 * @param register The register to return, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param handler(value) The handler that is called with the value when command has finished.
	 */
	public getRegisterValue(register: string, handler: (value: number) => void) {
		this.getRegisters((regsString) => {
			const value = Z80Registers.getRegValueByName(register, regsString);
			handler(value);
		});
	}


	/**
	 * Sets the value for a specific register.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 * @param handler The handler that is called when command has finished.
	 */
	public setRegisterValue(register: string, value: number, handler?: (resp) => void) {
		assert(false);	// override this
	}

	/**
	 * Returns a specific register value as a formatted string.
	 * @param register The register to return, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param handler(formattedString) The 'formattedString' is passed to handler.
	 */
	public getVarFormattedRegister(register: string, handler: (formattedString: string) => void) {
		this.getRegisters((regsString) => {
			Z80Registers.getVarFormattedReg(register, regsString,  handler);
		});
	}


	/**
	 * Returns the stack frames.
	 * @param handler The handler to call when ready.
	 */
	public stackTraceRequest(handler:(frames: RefList)=>void): void {
		assert(false);	// override this
	}


	/**
	 * @param The reference number to the frame.
	 * @returns The associated frame or undefined.
	 */
	public getFrame(ref: number): Frame|undefined {
		const frame = this.listFrames.getObject(ref);
		return frame;
	}


	/**
	 * 'continue' debugger program execution.
	 * @param contExecHandler The handler that is called when the run command is executed.
	 * @param contStoppedHandler(reason, tStates, cpuFreq) The handler that is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public continue(contStoppedHandler: (reason: string, tStates?: number, time?: number)=>void) {
		assert(false);	// override this
	}


	/**
	 * 'pause' the debugger.
	 */
	public pause(): void {
		assert(false);	// override this
	}


	 /**
	  * 'reverse continue' debugger program execution.
	  * @param handler The handler that is called when it's stopped e.g. when a breakpoint is hit.
	  */
	 public reverseContinue(handler:(error?: string)=>void) : void {
		assert(false);	// override this
	}

	/**
	 * 'step over' an instruction in the debugger.
	 * @param handler(disasm, tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public stepOver(handler:(disasm: string, tStates?: number, cpuFreq?: number, error?: string)=>void): void {
		assert(false);	// override this
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step is performed.
	 * 'disasm' is the disassembly of the current line.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public stepInto(handler:(disasm: string, tStates?: number, time?: number, error?: string)=>void): void {
		assert(false);	// override this
	}


	/**
	 * 'step out' of current call.
	 * @param handler(tStates, cpuFreq) The handler that is called after the step out is performed.
	 * tStates contains the number of tStates executed.
	 * cpuFreq contains the CPU frequency at the end.
	 */
	public stepOut(handler:(tStates?: number, cpuFreq?: number, error?: string)=>void): void {
		assert(false);	// override this
	}


	/**
	 * 'step backwards' the program execution in the debugger.
	  * @param handler(instruction, error) The handler that is called after the step is performed.
	  * error: If defined this holds the exception message.
	  */
	public stepBack(handler:(error: string)=>void): void {
		assert(false);	// override this
	}


	/**
	 * If system state is running, a break is done.
	 */
	protected breakIfRunning() {
		// Break if currently running
		if(this.state == EmulatorState.RUNNING || this.state == EmulatorState.RUNNING_REVERSE) {
			// Break
			this.pause();
		}
	}


	/**
	 * Sets the watchpoint array.
	 * @param watchPoints A list of addresses to put a guard on.
	 */
	public setWPMEM(watchPoints: Array<GenericWatchpoint>) {
		this.watchpoints = [...watchPoints];
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableWPMEM(enable: boolean, handler: () => void) {
		assert(false);	// override this
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	public setWatchpoints(watchPoints: Array<GenericWatchpoint>, handler?: (watchpoints:Array<GenericWatchpoint>) => void) {
		assert(false);	// override this
	}


	/**
	 * Sets the ASSERTs array.
	 * @param assertBreakpoints A list of addresses to put a guard on.
	 */
	public setASSERT(assertBreakpoints: Array<GenericBreakpoint>) {
		this.assertBreakpoints = [...assertBreakpoints];
	}


	/**
	 * Set all assert breakpoints.
	 * Called only once.
	 * @param assertBreakpoints A list of addresses to put an assert breakpoint on.
	 */
	public setAssertBreakpoints(assertBreakpoints: Array<GenericBreakpoint>) {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableAssertBreakpoints(enable: boolean, handler: () => void) {
		assert(false);	// override this
	}


	/**
	 * Sets the LOGPOINTs array.
	 * @param logpoints A list of addresses with messages to put a logpoint on.
	 */
	public setLOGPOINT(logpoints: Map<string, Array<GenericBreakpoint>>) {
		this.logpoints = logpoints;
		this.logpointsEnabled = new Map<string, boolean>();
		// All groups:
		for (const [group] of this.logpoints) {
			this.logpointsEnabled.set(group, false);
		}
	}


	/**
	 * Set all log points.
	 * Called only once.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 * @param handler() Is called after the last logpoint is set.
	 */
	public setLogpoints(logpoints: Array<GenericBreakpoint>, handler: (logpoints: Array<GenericBreakpoint>) => void) {
		assert(false);	// override this
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * @param group The group to enable/disable. If undefined: all groups. E.g. "UNITTEST".
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableLogpoints(group: string, enable: boolean, handler: () => void) {
		assert(false);	// override this
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public setBreakpoint(bp: EmulatorBreakpoint): number {
		assert(false);	// override this
		// return
		return 0;
	}


	/**
	 * Set all ASSERT breakpoints.
	 * Called only once.
	 * @param asserts A list of addresses with asserts (conditions). If the condition is not true the
	 * breakpoint will fire.
	 * Note: the emulator will change the generic condition format into a proprietary one
	 * on its own.
	 * @param handler() Is called after the last asssert is set.
	 * @param errorHandler(errText) Is called if an error occurs. E.g.
	 * if a condition cannot be parsed.
	 */
	/*
	public setASSERTs(asserts: Array<EmulatorBreakpoint>, finalHandler: () => void, errorHandler: (errText: string) => void) {
		assert(false);	// override this
	}
	*/

	/**
	 * Clears one breakpoint.
	 */
	protected removeBreakpoint(bp: EmulatorBreakpoint) {
	}


	/**
	 * Set all breakpoints for a file.
	 * Determines which breakpoints already exist, which are new and which need to be removed.
	 * Calls setBreakpoint and removeBreakpoint which communicate with the emulator.
	 * If system is running, first break, then set the breakpoint(s).
	 * But, because the run-handler is not known here, the 'run' is not continued afterwards.
	 * @param path The file (which contains the breakpoints).
	 * @param givenBps The breakpoints in the file.
	 * @param handler(bps) On return the handler is called with all breakpoints.
	 * @param tmpDisasmFileHandler(bp) If a line cannot be determined then this handler
	 * is called to check if the breakpoint was set in the temporary disassembler file. Returns
	 * an EmulatorBreakpoint.
	 */
	public setBreakpoints(path: string, givenBps:Array<EmulatorBreakpoint>,
		handler:(bps: Array<EmulatorBreakpoint>)=>void,
		tmpDisasmFileHandler:(bp: EmulatorBreakpoint)=>EmulatorBreakpoint) {

		try {
			// get all old breakpoints for the path
			const oldBps = this.breakpoints.filter(bp => bp.filePath == path);

			// Create new breakpoints
			const currentBps = new Array<EmulatorBreakpoint>();
			givenBps.forEach( bp => {
				let ebp;
				// get PC value of that line
				let addr = Labels.getAddrForFileAndLine(path, bp.lineNr);
				// Check if valid line
				if(addr >= 0) {
					// Now search last line with that pc
					const file = Labels.getFileAndLineForAddress(addr);
					// Check if right file
					if(path.valueOf() == file.fileName.valueOf()) {
						// create breakpoint object
						ebp = { bpId: 0, filePath: file.fileName, lineNr: file.lineNr, address: addr, condition: bp.condition, log: bp.log };
					}
				}
				else {
					// Check if there is a routine for the temporary disassembly file
					ebp = tmpDisasmFileHandler(bp);
				}

				// add to array
				if(!ebp) {
					// Breakpoint position invalid
					ebp = { bpId: 0, filePath: path, lineNr: bp.lineNr, address: -1, condition: '', log: undefined };
				}
				currentBps.push(ebp);
			});

			// Now check which breakpoints are new or removed (this includes 'changed').
			const newBps = currentBps.filter(bp => bp.address >= 0 && oldBps.filter(obp => (obp.condition == bp.condition) && (obp.log == bp.log) && (obp.address == bp.address)).length == 0);
			const removedBps = oldBps.filter(bp => bp.address >= 0  && currentBps.filter(obp => (obp.condition == bp.condition) && (obp.log == bp.log) && (obp.address == bp.address)).length == 0);

			// remove old breakpoints
			removedBps.forEach(bp => {
				// from zesarux
				this.removeBreakpoint(bp);
			});

			// Add new breakpoints and find free breakpoint ids
			newBps.forEach(bp => {
				// set breakpoint
				this.setBreakpoint(bp);
			});

			// get all breakpoints for the path
			//const resultingBps = this.breakpoints.filter(bp => bp.filePath == path);

			// call handler
			handler(currentBps);
		}
		catch(e) {
			console.log("Error: ", e);
		}
	}


	/**
	 * Returns a disassembly of the given address area.
	 * Can be used e.g. to disassemble ROM areas.
	 * Note 1: in the past the disassembly capabilities of the emulator's disassembler
	 * have been used. Now the internal disassembler is used.
	 * I.e. no need to override this anymore.
	 * Note 2: Unfortunately I cannot use the advanced z80dismblr here: it showed that
	 * when e.g. disassembling the ZX Spectrum only few parts of the ROM are disassembled
	 * because a lot is done via hidden calls, i.e. calls that are hidden in data areas.
	 * So it is better to use the 'stupid' brute force disassembly: It may decode some
	 * data as code but at least it decodes all the area.
	 * @param start The start address for the disassembly.
	 * @param size The size of the memory area.
	 * @returns The disassembly as text. Format, e.g.:
	 *   0065 RST 38
	 *   0066 PUSH AF
	 *   0067 PUSH HL
	 *   0068 LD HL,(5CB0)
	 */
/*
	public getDisassembly(start: number, size: number, handler:(text)=>void) {
		this.getMemoryDump(start, size, (data) => {
			// data contains an array of bytes.

			// convert hex values to bytes
			const buffer = new Memory();
			buffer.setMemory(start, data);

			// disassemble all lines
			let address = start;
			const end = start + size;
			let text = '';
			while(address < end) {
				// Get opcode
				const opcode = Opcode.getOpcodeAt(buffer, address);
				// disassemble
				const opCodeDescription = opcode.disassemble();
				const line = Format.formatDisassembly(buffer, false, 4, 12, 5, 8, address, opcode.length, opCodeDescription.mnemonic);
				// add to disassembly
				text += line + '\n';
				// Next address
				address += opcode.length;
			}

			// Use
			handler(text);
		});
	}
*/

	/**
	 * Sends a command to the emulator.
	 * @param cmd E.g. 'get-registers'.
	 * @param handler The response (data) is returned.
	 */
	public dbgExec(cmd: string, handler:(data)=>void) {
		assert(false);	// override this
	}


	/**
	 * Reads a memory dump and converts it to a number array.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public getMemoryDump(address: number, size: number, handler:(data: Uint8Array, addr: number)=>void) {
		assert(false);	// override this
	}


	/**
	 * Writes a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 * @param handler(response) The handler that is called when zesarux has received the data.
	 */
	public writeMemoryDump(address: number, dataArray: Uint8Array, handler:() => void) {
		assert(false);	// override this
	}


	/**
	 * Writes one memory value to the emulator.
	 * The write is followed by a read and the read value is returned
	 * in the handler.
	 * @param address The address to change.
	 * @param value The new value.
	 */
	public writeMemory(address, value, handler:(realValue: number) => void) {
		assert(false);	// override this
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an arry of MemoryPages.
	 * @param handler(memoryPages) The handler that receives the memory pages list.
	 */
	public getMemoryPages(handler:(memoryPages: MemoryPage[])=>void) {
		assert(false);	// override this
	}


	/**
	 * Change the program counter.
	 * @param address The new address for the program counter.
	 * @param handler that is called when the PC has been set.
	 */
	public setProgramCounter(address: number, handler:() => void) {
		assert(false);	// override this
	}


	// ZX Next related ---------------------------------

	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @param value(value) Calls 'handler' with the value of the register.
	 */
	public getTbblueRegister(registerNr: number, handler: (value)=>void) {
		assert(false);	// override this
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @param handler(paletteArray) Calls 'handler' with a 256 byte Array<number> with the palette values.
	 */
	public getTbblueSpritesPalette(paletteNr: number, handler: (paletteArray)=>void) {
		assert(false);	// override this
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @param handler(xl, xr, yt, yb) Calls 'handler' with the clipping dimensions.
	 */
	public getTbblueSpritesClippingWindow(handler: (xl: number, xr: number, yt: number, yb: number)=>void) {
		assert(false);	// override this
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @param handler(sprites) Calls 'handler' with an array of sprite data.
	 */
	public getTbblueSprites(slot: number, count: number, handler: (sprites)=>void) {
		assert(false);	// override this
	}

	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @param handler(patterns) Calls 'handler' with an array of sprite pattern data.
	 */
	public getTbblueSpritePatterns(index: number, count: number, handler: (patterns)=>void) {
		assert(false);	// override this
	}


	/**
	 * This is a hack:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * So this function waits as long as there is still traffic to the emulator.
	 * @param timeout Timeout in ms. For this time traffic has to be quiet.
	 * @param handler This handler is called after being quiet for the given timeout.
	 */
	public executeAfterBeingQuietFor(timeout: number, handler: () => void) {
		assert(false);	// override this
	}


	/**
	 * Clears the instruction history.
	 * For reverse debugging and code coverage.
	 * This is e.g. overridden in ZesaruxEmulator to delete the transaction logs.
	 */
	public clearInstructionHistory() {
		this.revDbgHistory.length = 0;
	}


	/**
	 * Emits 'history' to signal that the files should be decorated.
	 */
	public emitRevDbgHistory() {
		this.emit('history', this.revDbgHistory);
	}

}

