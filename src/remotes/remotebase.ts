
import {Z80RegistersClass, Z80_REG, Z80Registers} from './z80registers';
import {RefList} from '../misc/reflist';
import {CallStackFrame} from '../callstackframe';
import {EventEmitter} from 'events';
import {GenericWatchpoint, GenericBreakpoint} from '../genericwatchpoint';
import {Labels, SourceFileEntry} from '../labels/labels';
import {Settings/*, ListFile*/} from '../settings/settings';
import {Utility} from '../misc/utility';
import {BaseMemory} from '../disassembler/core/basememory';
import {Opcode, OpcodeFlag} from '../disassembler/core/opcode';
import {Disassembly, DisassemblyClass} from '../disassembler/disassembly';
import {MemoryBank, MemoryModel} from './MemoryModel/memorymodel';
import {Log} from '../log';




/**
 * Breakpoint reason numbers.
 * Are used in DZRP as well, so be cautious when changing values.
 */
export enum BREAK_REASON_NUMBER {
	NO_REASON = 0,		// 0=no break reason (e.g.a step-over)
	MANUAL_BREAK = 1,		// 1=User (manual) break
	BREAKPOINT_HIT = 2,	// 2=breakpoint hit
	WATCHPOINT_READ = 3,	// 3=watchpoint hit read access
	WATCHPOINT_WRITE = 4,	// 4=watchpoint hit write access
	CPU_ERROR = 5,		// 5=CPU error, e.g. error in custom javascript code

	// Internally used
	STEPPING_NOT_ALLOWED = 100,	// For ZxNextRemote if trying to step code used for debugging.
	BREAK_INTERRUPT = 101,	// zsim only: breakpoint at interrupt

	UNKNOWN = 255		// 255=some other error
}


/**
 * The breakpoint representation.
 */
export interface RemoteBreakpoint extends GenericBreakpoint {
	bpId: number,	///< The breakpoint ID/number (>0). Mandatory.
	filePath?: string,	///< The file to which the breakpoint belongs
	lineNr: number	///< The line number in the file starting at 0
}



/**
 * The Remote's base class.
 * It implements, provides stubs or interfaces to deal with:
 * - step, run (continue), etc.
 * - reverse debugging
 * - breakpoints
 *
 * Breakpoints:
 * The 'breakpoints' array contains all breakpoints set by the
 * vscode UI. I.e. the breakpoints you set manually/the red dot
 * at the start of the line.
 * vscode sends a setBreakPointsRequest with the breakpoints, they
 * are converted into the RemoteBreakpoint type and set with
 * setBreakPoints. The Remote will now compare the breakpoints with the internal
 * 'breakpoints' array and set/remove all changed breakpoints.
 *
 * The additional 'watchpoints', 'assertionBreakpoints' and 'logpoints'
 * arrays can be enabled/disabled as a group via a debug command.
 * - 'watchPoints': These are associated with the WPMEM keyword and create
 * a memory watchpoint (a breakpoint that is hit if a memory address is
 * accessed).
 * - 'assertionBreakpoints': These are very much like conditional breakpoints but associated with the ASSERTION keyword.
 * - 'logpoints': These are just like breakpoints with a log message but associated with the LOGPOINT keyword.
 * Note: The attached emulator may use the same mechanism for all these
 * kinds of breakpoints but in DeZog they are differentiated.
 *
 */
export class RemoteBase extends EventEmitter {

	// Maximum stack items to handle.
	static MAX_STACK_ITEMS = 100;

	/// The top of the stack. Used to limit the call stack.
	/// 64k address.
	public topOfStack: number;


	/**
	 * Sets the global Remote variable.
	 */
	public static setGlobalRemote(remote: RemoteBase) {
		Remote = remote;
	}

	/// true if Remote supports ASSERTIONs.
	public supportsASSERTION = false;

	/// true if Remote supports WPMEMs.
	public supportsWPMEM = false;

	/// true if Remote supports LOGPOINTs.
	public supportsLOGPOINT = false;

	/// true if Remote supports break on interrupt (only zsim does).
	public supportsBreakOnInterrupt = false;

	/// A list for the frames (call stack items). Is cached here.
	protected listFrames: RefList<CallStackFrame>;

	/// Mirror of the remote's breakpoints.
	protected breakpoints = new Array<RemoteBreakpoint>();

	/// The WPMEM watchpoints can only be enabled/disabled alltogether.
	public wpmemEnabled = false;

	/// The virtual stack used during reverse debugging.
	protected reverseDbgStack: RefList<CallStackFrame>;

	/// Stores the wpmem watchpoints (this is a smaller list, if watchpoints can be given manually)
	protected wpmemWatchpoints = new Array<GenericWatchpoint>();

	/// Stores the assertion breakpoints
	protected assertionBreakpoints = new Array<GenericBreakpoint>();

	/// The assertion breakpoints can only be enabled/disabled alltogether.
	public assertionBreakpointsEnabled = false;

	/// Stores the log points
	protected logpoints = new Map<string, Array<GenericBreakpoint>>();

	/// The logpoints can be enabled/disabled per group.
	public logpointsEnabled = new Map<string, boolean>();

	/// Memory slots. Contain the used banks.
	/// If undefined the data has to be retrieved from the remote.
	//protected slots: number[]|undefined=undefined;

	/// The used memory model. E.g. if and how slots are used.
	public memoryModel: MemoryModel;


	/// Constructor.
	/// Override this.
	constructor() {
		super();
	}


	/**
	 * Call this to dispose any resources.
	 */
	public dispose() {
		Remote = undefined as any;
	}


	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', exception);
	/// Don't override this, override 'doInitialization' instead.
	/// Take care to implement the emits otherwise the system will hang on a start.
	public async init(): Promise<void> {
		// Call custom initialization
		await this.doInitialization();
	}


	/**
	 * Initializes the WPMEM, ASSERTION and LOGPOINT arrays.
	 * Beforehand any existing arrays are cleared.
	 */
	public async initWpmemAssertionLogpoints() {
		// Remove any previously set watchpoints (this is for re-load, on start the arrays would anyhow be empty).
		// Remove WPMEM breakpoints
		const prevWpmemEnabled = this.wpmemEnabled;
		if(prevWpmemEnabled)
			await this.enableWPMEM(false);
		// Remove ASSERTION breakpoints
		const prevAssertionBreakpointsEnabled = this.assertionBreakpointsEnabled;
		if (prevAssertionBreakpointsEnabled)
			await this.enableAssertionBreakpoints(false);
		// Remove Logpoints
		const prevEnabledLpGroups: string[] = [];
		for (const [group, enabled] of this.logpointsEnabled) {
			if (enabled)
				prevEnabledLpGroups.push(group);
		}
		await this.enableLogpointGroup(undefined, false);

		// Set watchpoints (memory guards)
		const watchPointLines = Labels.getWatchPointLines();
		const watchpoints = this.createWatchPoints(watchPointLines);
		this.setWPMEMArray(watchpoints);

		// ASSERTIONs
		// Set assertion breakpoints
		const assertionLines = Labels.getAssertionLines();
		const assertionsArray = this.createAssertions(assertionLines);
		this.setASSERTIONArray(assertionsArray);

		// LOGPOINTs
		const logPointLines = Labels.getLogPointLines();
		const logPointsMap = this.createLogPoints(logPointLines);
		this.setLOGPOINTArray(logPointsMap);

		// Re-enable
		if (prevWpmemEnabled)
			await this.enableWPMEM(true);
		if (prevAssertionBreakpointsEnabled)
			await this.enableAssertionBreakpoints(true);
		for (const group of prevEnabledLpGroups)
			await this.enableLogpointGroup(group, true);
	}


	/**
	 * Do initialization.
	 * E.g. create a socket or allocate memory.
	 * This is called when the Remote is started by the debugger. I.e. at the start
	 * of a debugging session.
	 * When ready do a this.emit('initialized') or this.emit('error', exception);
	 * Take care to implement the emits otherwise the system will hang on a start.
	 * Please override.
	 */
	public async doInitialization(): Promise<void> {
		//
	}


	/**
	 * Loads the sna or nex file.
	 * Do not override.
	 */
	public async load(): Promise<void> {
		// Load sna or nex file
		const loadPath = Settings.launch.load;
		if (loadPath) {
			await this.loadBin(loadPath);
		}

		// Load registers
		//await this.getRegistersFromEmulator();
	}


	/**
	 * Loads the obj files.
	 * Do not override.
	 * Note: This is a separate function (not combined with 'load').
	 * The reason is that labels should be available to make use of labels for the 'start' property (launch.json).
	 * 'load' in the zesarux case leads to a change of the memory model.
	 * The memory module is required to read the list files.
	 * I.e. 'load' is required to be done before reading list files.
	 * But for loadObjs we need the labels to be present.
	 */
	public async loadObjs(): Promise<void> {
		// Load obj file(s)
		for (const loadObj of Settings.launch.loadObjs) {
			if (loadObj.path) {
				// Convert start address
				const start = Labels.getNumberFromString64k(loadObj.start);
				if (isNaN(start))
					throw Error('Cannot evaluate: "loadObjs[].start:" ' + loadObj.start + '.');
				await this.loadObj(loadObj.path, start);
			}
		}

		// Load registers
		//await this.getRegistersFromEmulator();
	}


	/**
	 * Loads sna or nex file. (or any other file type supported by remote.)
	 * @param path The (absolute) path to the file.
	 */
	protected async loadBin(path: string): Promise<void> {
		// Override
		throw Error('Loading files is not supported.');
	}


	/**
	 * Loads a obj file.
	 * @param path The (absolute) path to the obj file.
	 * @param address The address where the obj file starts.
	 */
	protected async loadObj(path: string, address: number): Promise<void> {
		// Override
		throw Error('Loading object files is not supported.');
	}


	/**
	 * Retrieves the exec address from the Settings (if available) and sets PC to it.
	 * Do not override.
	 */
	public async setLaunchExecAddress(): Promise<void> {
		if (Settings.launch.execAddress) {
			const execAddress = Labels.getNumberFromString64k(Settings.launch.execAddress);
			if (isNaN(execAddress))
				throw Error("Cannot evaluate 'execAddress' (" + Settings.launch.execAddress + ").");
			// Set PC
			await this.setRegisterValue("PC", execAddress);
		}
	}


	/**
	 * Creates an array of watch points from the text lines.
	 * @param watchPointLines An array with address and line (text) pairs.
	 * @return An array with watch points (GenericWatchpoints).
	 */
	protected createWatchPoints(watchPointLines: Array<{address: number, line: string}>): Array<GenericWatchpoint> {
		// convert labels in watchpoints.
		const watchpoints = new Array<GenericWatchpoint>();

		let i = -1;
		for (let entry of watchPointLines) {
			i = i + 1;
			// WPMEM:
			// Syntax:
			// WPMEM [addr [, length [, access]]]
			// with:
			//	addr = address (or label) to observe (optional). Defaults to current (long) address.
			//	length = the count of bytes to observe (optional). Default = 1.
			//	access = Read/write access. Possible values: r, w or rw. Defaults to rw.
			// e.g. WPMEM LBL_TEXT, 1, w
			// or
			// WPMEM ,1,w, MWV&B8h/0

			try {
				// Now check more thoroughly: group1=address, group3=length, group5=access, group7=condition
				//const match = /^WPMEM(?=[,\s]|$)\s*([^\s,]*)?(\s*,\s*([^\s,]*)(\s*,\s*([^\s,]*)(\s*,\s*([^,]*))?)?)?/.exec(entry.line)
				// All lines start with WPMEM, remove it
				const line = entry.line.substring(5);
				const subParts = line.split(',').map(s => s.trim());
				// Get arguments
				let addressString = subParts[0];
				let lengthString = subParts[1];
				let access = subParts[2];
				let cond = subParts[3];	// This is supported only with "fast-breakpoints" not with the unmodified ZEsarUX. Also the new (7.1) faster memory breakpoints do not support conditions.
				// defaults
				let entryAddress: number | undefined = entry.address;
				if (addressString && addressString.length > 0)
					entryAddress = Utility.evalExpression(addressString, false); // don't evaluate registers
				if (isNaN(entryAddress))
					continue;	// could happen if the WPMEM is in an area that is conditionally not compiled, i.e. label does not exist.
				let length = 1;
				if (lengthString && lengthString.length > 0) {
					length = Utility.evalExpression(lengthString, false); // don't evaluate registers
				}
				/*
				else {
					if (!addressString||addressString.length==0) {
						// If both, address and length are not defined it is checked
						// if there exists bytes in the list file (i.e.
						// numbers after the address field).
						// If not the "WPMEM" is assumed to be inside a
						// macro and omitted.
						const match=/^[0-9a-f]+\s[0-9a-f]+/i.exec(entry.line);
						if (!match)
							continue;
					}
				}
				*/
				if (access && access.length > 0) {
					access = access.trim();
					access = access.toLowerCase();
					if (access != 'r' && access != 'w' && access != 'rw') {
						const errText = "Wrong access mode in watch point. Allowed are only 'r', 'w' or 'rw' but found '" + access + "' in line: '" + entry.line + "'";
						console.log(errText);
						continue;
					}
				}
				else
					access = 'rw';
				// Set watchpoint. (long or 64k address)
				watchpoints.push({longOr64kAddress: entryAddress, size: length, access: access, condition: cond || ''});
			}
			catch (e) {
				throw Error("Problem with WPMEM. Could not evaluate: '" + entry.line + "': " + e.message + "");
			}
		}

		return watchpoints;
	}


	/**
	 * Creates an array of assertions from the text lines.
	 * @param assertionLines An array with address and line (text) pairs.
	 * @return An array with assertions (GenericWatchpoints).
	 */
	protected createAssertions(assertionLines: Array<{address: number, line: string}>): Array<GenericBreakpoint> {
		const assertionMap = new Map<number, GenericBreakpoint>();
		// Convert ASSERTIONS to watchpoints
		for (let entry of assertionLines) {
			// ASSERTION:
			// Syntax:
			// ASSERTION var comparison expr [&&|| expr]
			// with:
			//  var: a variable, i.e. a register like A or HL
			//  comparison: one of '<', '>', '==', '!=', '<=', '=>'.
			//	expr: a mathematical expression that resolves into a constant
			// Examples:
			// - ASSERTION A < 5
			// - ASSERTION HL <= LBL_END+2
			// - ASSERTION B > (MAX_COUNT+1)/2
			// - ASSERTION false
			// - ASSERTION

			// ASSERTIONs are breakpoints with "inverted" condition.
			// Now check more thoroughly: group1=var, group2=comparison, group3=expression
			try {
				const matchAssertion = /^ASSERTION(.*)/.exec(entry.line);
				if (!matchAssertion)
					continue;

				// Get part of the string after the "ASSERTION"
				const part = matchAssertion[1].trim();

				// Check if no condition was set = ASSERTION false = Always break
				let conds = '';
				if (part.length > 0) {
					// Some condition is set
					const regex = /\s*([^;]*)/i;
					let match = regex.exec(part);
					if (!match)	// At least one match should be found
						throw Error("Expecting 'ASSERTION expr'.");
					conds = match[1];
				}

				// Negate the expression
				conds = Utility.getConditionFromAssertion(conds);

				// Check if ASSERTION for that address already exists.
				if (conds.length > 0) {
					let bp = assertionMap.get(entry.address);
					if (bp) {
						// Already exists: just add condition.
						bp.condition = '(' + bp.condition + ') || (' + conds + ')';
					}
					else {
						// Breakpoint for address does not yet exist. Create a new one.
						const assertionBp = {longAddress: entry.address, condition: conds, log: undefined};
						assertionMap.set(entry.address, assertionBp);
					}
				}
			}
			catch (e) {
				console.log("Problem with ASSERTION. Could not evaluate: '" + entry.line + "': " + e.message + "");
			}
		}

		// Convert map to array.
		const assertionsArray = Array.from(assertionMap.values());

		return assertionsArray;
	}


	/**
	 * Creates an array of log points from the text lines.
	 * @param logPointLines An array with address and line (text) pairs.
	 * @return An array with log points (GenericWatchpoints) for each group.
	 */
	protected createLogPoints(logPointLines: Array<{address: number, line: string}>): Map<string, Array<GenericBreakpoint>> {
		// convert labels in watchpoints.
		const logpoints = new Map<string, Array<GenericBreakpoint>>();
		for (let entry of logPointLines) {
			// LOGPOINT:
			// Syntax:
			// LOGPOINT [group] text ${(var):signed} text ${reg:hex} text ${w@(reg)} text ¢{b@(reg):unsigned}
			// e.g. LOGPOINT [SPRITES] Status=${A}, Counter=${(sprite.counter):unsigned}

			// Now check more thoroughly i.e. for comma
			const match = /^LOGPOINT\b(\s*\[\s*(\w*)\s*\])?\s*(.*)/gm.exec(entry.line);
			if (match) {
				// get arguments
				const group = match[2] || "DEFAULT";
				const logMsg = '[' + group + '] ' + match[3];
				// Create group if not existent
				let array = logpoints.get(group);
				if (!array) {
					array = new Array<GenericBreakpoint>();
					logpoints.set(group, array);
				}
				// Convert labels
				try {
					const log = this.evalLogMessage(logMsg);
					// set watchpoint
					array.push({longAddress: entry.address, condition: '', log: log});
				}
				catch (e) {
					// Show error
					console.log("Problem with LOGPOINT. Could not evaluate: '" + entry.line + "': " + e.message + "");
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
	public evalLogMessage(logMsg: string | undefined): string | undefined {
		if (!logMsg)
			return undefined

		// Search all "${...}""
		const result = logMsg.replace(/\${\s*(.*?)\s*}/g, (match, inner) => {
			// Check syntax
			const matchInner = /(([bw]@)?\s*\(\s*(.*?)\s*\)|(\w*)\s*)\s*(:\s*(unsigned|signed|hex|bits|flags))?\s*/i.exec(inner); // NOSONAR
			if (!matchInner)
				throw Error("Log message format error: '" + match + "' in '" + logMsg + "'");
			const end = (matchInner[6]) ? ':' + matchInner[6] : '';
			let addr = matchInner[3] || '';
			if (addr.length) {
				const access = matchInner[2] || '';
				// Check if it is a register
				if (Z80RegistersClass.isRegister(addr)) {
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
						throw Error("Log message format error: " + e.message + " in '" + logMsg + "'");
					}
				}
			}
			else {
				// Should be a register (Note: this is not 100% fool proof since there are more registers defined than allowed in logs)
				const reg = matchInner[4];
				if (!Z80RegistersClass.isRegister(reg))
					throw Error("Log message format error: Unsupported register '" + reg + "' in '" + logMsg + "'");
				return "${" + reg + end + "}";
			}
		});

		//console.log('evalLog(point)Message: ' + result);
		Log.log('evalLog(point)Message: ' + result);
		return result;
	}


	/**
	 * Reads the list file and also retrieves all occurrences of
	 * WPMEM, ASSERTION and LOGPOINT.
	 * Also sets WPMEM, ASSERTION and LOGPOINT break/watchpoints.
	 * May throw an error.
	 * @param configuration Contains the list files for the different assemblers
	 */
	public readListFiles(configuration: any) {
		// Read files
		Labels.readListFiles(configuration, this.memoryModel);

		// Calculate top of stack
		this.topOfStack = Labels.getNumberFromString64k(Settings.launch.topOfStack);
		if (isNaN(this.topOfStack))
			throw Error("Cannot evaluate 'topOfStack' (" + Settings.launch.topOfStack + ").");
		// "Correct" the value if 0
		if (this.topOfStack == 0)
			this.topOfStack = this.memoryModel.defaultTopOfStack; // @zx81
	}


	/**
	 * Stops a remote.
	 * This will e.g. disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * Very much like 'terminate' but does not send the 'terminated' event.
	 */
	public async disconnect(): Promise<void> {
		this.removeAllListeners('error');
		// please override.
	}


	/**
	 * Terminates the remote.
	 * This should disconnect the socket and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator
	 * or when an error occurs.
	 * Emits the "this.emit('terminated')".
	 * No need to override.
	 * @param message If defined the message is shown to the user as error.
	 */
	public async terminate(message?: string): Promise<void> {
		//console.log('Remote.terminate(' + message +')');
		await this.disconnect();
		this.emit('terminated', message);
	}


	/**
	 * If cache is empty retrieves the registers from
	 * the Remote.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		Utility.assert(false);
	}


	/**
	 * Returns the PC value.
	 */
	public getPC(): number {
		return Z80Registers.getRegValueByName("PC");
	}


	/**
	 * Returns the PC as long address, i.e. with bank info.
	 * @returns PC + (bank_nr+1)<<16
	 */
	public getPCLong(): number {
		const pcLong = Z80Registers.getPCLong();
		return pcLong;
	}


	/**
	 * Returns a specific register value.
	 * Note: The registers should already be present (cached).
	 * I.e. there is no communication with the remote emulator involved.
	 * @param register The register to return, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * Returns NaN if the register name does not exist or if register cannot
	 * be obtained from remote.
	 */
	public getRegisterValue(register: string): number {
		const value = Z80Registers.getRegValueByName(register);
		return value;
	}


	/**
	 * Returns all registers with the given value.
	 * Is used to find registers that match a certain address. (Hovering)
	 * @param value The value to find.
	 * @returns An array of strings with register names that match. If no matching register is found returns an empty array.
	 */
	public getRegistersEqualTo(value: number): Array<string> {
		let resRegs: Array<string> = [];
		if (Z80Registers.valid()) {
			const regs = ["HL", "DE", "IX", "IY", "SP", "BC", "HL'", "DE'", "BC'"];
			resRegs = regs.filter(reg => value == Z80Registers.getRegValueByName(reg));
		}
		return resRegs;
	}


	/**
	 * Returns the formatted register value.
	 * @param reg The name of the register, e.g. "A" or "BC"
	 * @returns The formatted string.
	 */
	public getVarFormattedReg(reg: string): string {
		return Z80Registers.getVarFormattedReg(reg);
	}


	/**
	 * Sets the value for a specific register.
	 * Reads the value from the emulator and returns it in the promise.
	 * Note: if in reverse debug mode the function should do nothing and the promise should return the previous value.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 */
	public async setRegisterValue(register: string, value: number) {
		Utility.assert(false);	// override this
	}


	/**
	 * Sets the slot to a specific bank.
	 * Used by the unit tests.
	 * @param slot The slot to set.
	 * @param bank The bank for the slot.
	 */
	public async setSlot(slotIndex: number, bank: number): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Checks the stack entry type for the given value.
	 * If the type is CALL, RST (or interrupt) an object with the label name, the called and
	 * the caller address is returned.
	 * Otherwise an undefined object is returned.
	 * Uses the 64k address in stackEntryValue and builds a
	 * long address together with the slot.
	 * That is used to obtain the label.
	 * @param stackEntryValue E.g. "3B89"
	 * @returns {name, callerAddr}
	 * if there was a CALL or RST
	 * - name: The label name or the hex string of the called address
	 * - callerAddr: The long caller address of the subroutine.
	 */
	protected async getStackEntryType(stackEntryValue: string): Promise<{name: string, callerAddr: number} | undefined> {
		// Get the 3 bytes before address.
		const addr = parseInt(stackEntryValue, 16);
		const data = await this.readMemoryDump((addr - 3) & 0xFFFF, 3);
		let calledAddr;
		let callerAddr;
		// Check for Call
		const opc3 = data[0];	// get first of the 3 bytes
		if (opc3 == 0xCD	// CALL nn
			|| (opc3 & 0b11000111) == 0b11000100) 	// CALL cc,nn
		{
			// It was a CALL, get address.
			calledAddr = (data[2] << 8) + data[1];
			callerAddr = addr - 3;
		}
		else {
			/*
			I removed the check for RST:
			An RST will happen relatively seldom. But here a RST would be found with
			a probability of 1/32. I.e. every 32th value would be wrong.
			Therefore I better skip the detection.

			// Check if one of the 2 last bytes was a RST.
			// Note: Not only the last byte is checked but also the byte before. This is
			// a small "hack" to allow correct return addresses even for esxdos.
			let opc12=(data[1]<<8)+data[2];	// convert both opcodes at once

			let k=1;
			while (opc12!=0) {
				if ((opc12&0b11000111)==0b11000111)
					break;
				// Next
				opc12>>>=8;
				k++;
			}
			if (opc12!=0) {
				// It was a RST, get p
				calledAddr=opc12&0b00111000;
				callerAddr=addr-k;
			}
			*/
		}

		// Nothing found?
		if (calledAddr == undefined) {
			return undefined;
		}

		// Convert to long address
		callerAddr = Z80Registers.createLongAddress(callerAddr);
		calledAddr = Z80Registers.createLongAddress(calledAddr);

		// Found: get label
		let labelCalledAddrArr = Labels.getLabelsForLongAddress(calledAddr);
		if (labelCalledAddrArr.length == 0) {
			// check if maybe the disassembly has defined something
			if (Disassembly) {	// Is undefined in case of Unit tests
				const label = Disassembly.getLabelForAddr64k(calledAddr & 0xFFFF);
				if (label)
					labelCalledAddrArr.push(label);
			}
		}
		const labelCalledAddr = (labelCalledAddrArr.length > 0) ? labelCalledAddrArr[0] : Utility.getHexString(calledAddr & 0xFFFF, 4) + 'h';

		// Return
		return {name: labelCalledAddr, callerAddr};
	}


	/**
	* Returns the stack as an array.
	* Oldest element is at index 0.
	* 64k addresses.
	* @returns The stack, i.e. the word values from topOfStack to SP.
	* But no more than about 100 elements.
	* The values are returned as hex string, an additional info might follow.
	* This is e.g. used for the ZEsarUX extended stack info.
	*/
	public async getStackFromEmulator(): Promise<Array<string>> {
		//await this.getRegisters();
		const sp = Z80Registers.getSP();
		// calculate the depth of the call stack
		const tos = this.topOfStack;
		let depth = tos - sp; // 2 bytes per word
		if (depth > 2 * RemoteBase.MAX_STACK_ITEMS)
			depth = 2 * RemoteBase.MAX_STACK_ITEMS;

		// Check if callstack need to be called
		const zStack: Array<string> = [];
		if (depth > 0) {
			// Get stack
			const data = await this.readMemoryDump(sp, depth);

			// Create stack
			for (let i = depth - 2; i >= 0; i -= 2) {
				const value = (data[i + 1] << 8) + data[i];
				zStack.push(Utility.getHexString(value, 4));
			}
		}
		return zStack;
	}


	/**
	 * Retrieves the stack from the emulator and filters all CALL addresses.
	 * The callStackFrame.addr is a long address whereas the values on the callStackFrame.stack are 64k.
	 */
	public async getCallStackFromEmulator(): Promise<void> {
		const callStack = new RefList<CallStackFrame>();
		// Get normal stack values
		const stack = await this.getStackFromEmulator();	// Returns 64k addresses as hex string.
		// Start with main
		const sp = Z80Registers.getRegValue(Z80_REG.SP);
		const len = stack.length;
		const top = sp + 2 * len;
		let lastCallStackFrame = new CallStackFrame(0, top - 2, this.getMainName(top));
		callStack.addObject(lastCallStackFrame);

		// Check for each value if it maybe is a CALL or RST
		let prevValueString;
		let type;
		for (let i = 0; i < len; i++) {
			const valueString = stack[i];
			if (valueString != prevValueString) {
				// Optimization: Memory is only retrieved if the value changed.
				// E.g. if a lot of 0x0000 have to be retrieved this actual memory is
				// fetched only once.
				type = await this.getStackEntryType(valueString);	// Long address
				prevValueString = valueString;
			}
			if (type) {
				// Set caller address
				lastCallStackFrame.addr = type.callerAddr;
				// CALL, RST or interrupt
				const frameSP = top - 2 - 2 * (i + 1);
				lastCallStackFrame = new CallStackFrame(0, frameSP, type.name);
				callStack.addObject(lastCallStackFrame);
			}
			else {
				// Something else, e.g. pushed value
				lastCallStackFrame.stack.push(parseInt(valueString, 16));
			}
		}

		// Set PC
		const pc = this.getPCLong();
		lastCallStackFrame.addr = pc;

		// Return
		this.listFrames = callStack;
	}


	/**
	  * Returns the extended stack as array.
	  * Oldest element is at index 0.
	  * The function returns the call addresses as
	  * long addresses.
	  * @returns The stack, i.e. the word values from SP to topOfStack.
	  * But no more than about 100 elements.
	  */
	public async getCallStackCache(): Promise<RefList<CallStackFrame>> {
		return this.listFrames;
	}


	/**
	 * Returns the name of the interrupt.
	 */
	public getInterruptName() {
		return "__INTERRUPT__";
	}


	/**
	 * Returns the name of the main function.
	 * @param sp The current SP value. 64k address.
	 * @returns E.g. "__MAIN__" or "__MAIN-2__" if main is not at topOfStack.
	 */
	public getMainName(sp: number) {
		let part = "";
		if (this.topOfStack) {
			const diff = this.topOfStack - sp;
			if (diff != 0) {
				if (diff > 0)
					part = "+";
				part += diff.toString();
			}
		}
		return "__MAIN" + part + "__";
	}


	/**
	 * @param ref The reference number to the frame.
	 * @returns The associated frame or undefined.
	 */
	public getFrame(ref: number): CallStackFrame | undefined {
		const frame = this.listFrames.getObject(ref);
		return frame;
	}


	/**
	 * 'continue' debugger program execution.
	 * @returns A Promise with a string.
	 * Is called when it's stopped e.g. when a breakpoint is hit.
	 * reason contains the stop reason as string.
	 */
	public async continue(): Promise<string> {
		Utility.assert(false);	// override this
		return '';
	}


	/**
	 * 'pause' the debugger.
	 */
	public async pause(): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * The Promise resolves when it's stopped e.g. when a breakpoint is hit.
	 * @returns A string with the break reason. (Never undefined)
	 */
	public async reverseContinue(): Promise<string> {
		Utility.assert(false);	// override this
		return "";
	}


	/**
	 * 'step over' an instruction in the debugger.
	 * @returns A Promise with a string with the break reason.
	 * Or 'undefined' if no reason
	 */
	public async stepOver(): Promise<string | undefined> {
		Utility.assert(false);	// override this
		return undefined;
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @returns A Promise with a string with the break reason.
	 * Or 'undefined' if no reason
	 */
	public async stepInto(): Promise<string | undefined> {
		Utility.assert(false);	// override this
		return undefined;
	}


	/**
	 * 'step out' of current subroutine.
	 * @returns A Promise with a string containing the break reason.
	 * 'breakReasonString' a possibly text with the break reason.
	 */
	public async stepOut(): Promise<string | undefined> {
		Utility.assert(false);	// override this
		return undefined;
	}


	/**
	 * Sets the watchpoint array.
	 * @param watchPoints A list of addresses to put a guard on.
	 */
	public setWPMEMArray(watchPoints: Array<GenericWatchpoint>) {
		this.wpmemWatchpoints = [...watchPoints];
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * Promise is called when method finishes.
	 * @param enable true=enable, false=disable.
	 */
	public async enableWPMEM(enable: boolean): Promise<void> {
		for (let wp of this.wpmemWatchpoints) {
			if (enable)
				await this.setWatchpoint(wp);
			else
				await this.removeWatchpoint(wp);
		}
		this.wpmemEnabled = enable;
	}


	/**
	 * Sets one watchpoint in the remote.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * Promises is execute when last watchpoint has been set.
	 * @param wp The watchpoint to set. Will set 'bpId' in the 'watchPoint'.
	 */
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Removes one watchpoint from the remote.
	 * Promises is execute when last watchpoint has been set.
	 * @param wp The watchpoint to renove. Will set 'bpId' in the 'watchPoint' to undefined.
	 */
	public async removeWatchpoint(wp: GenericWatchpoint): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Returns the WPMEM watchpoints.
	 */
	public getAllWpmemWatchpoints(): Array<GenericWatchpoint> {
		return this.wpmemWatchpoints;
	}


	/**
	 * Sets the ASSERTIONs array.
	 * @param assertionBreakpoints A list of addresses to put a guard on.
	 */
	public setASSERTIONArray(assertionBreakpoints: Array<GenericBreakpoint>) {
		this.assertionBreakpoints = [...assertionBreakpoints];
	}


	/**
	 * Enables/disables all assertion breakpoints set from the sources.
	 * Promise is called when ready.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertionBreakpoints(enable: boolean): Promise<void> {
		Utility.assert(false);	// override this
	}

	/**
	 * Returns the ASSERTION breakpoints.
	 */
	public getAllAssertionBreakpoints(): Array<GenericBreakpoint> {
		return this.assertionBreakpoints;
	}


	/**
	 * Sets the LOGPOINTs array.
	 * @param logpoints A list of addresses with messages to put a logpoint on.
	 */
	public setLOGPOINTArray(logpoints: Map<string, Array<GenericBreakpoint>>) {
		this.logpoints = logpoints;
		this.logpointsEnabled = new Map<string, boolean>();
		// All groups:
		for (const [group] of this.logpoints) {
			this.logpointsEnabled.set(group, false);
		}
	}



	/**
	 * Set all log points.
	 * Called at startup and once by enableLogPoints (to turn a group on or off).
	 * Promise is called after the last logpoint is set.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 * @param enable Enable or disable the logpoints.
	 * @returns A promise that is called after the last watchpoint is set.
	 */
	public async enableLogpoints(logpoints: Array<GenericBreakpoint>, enable: boolean): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * Throws an exception if the group is unknown.
	 * Promise is called all logpoints are set.
	 * Override and assertion if logpoints are not supported.
	 * @param group The group to enable/disable. If undefined: all groups. E.g. "UNITTEST".
	 * @param enable true=enable, false=disable.
	 */
	public async enableLogpointGroup(group: string | undefined, enable: boolean): Promise<void> {
		let lPoints;

		// Check if one group or all
		if (group) {
			// 1 group:
			const array = this.logpoints.get(group);
			if (!array)
				throw Error("Group '" + group + "' unknown.");
			lPoints = new Map<string, GenericBreakpoint[]>([[group, array]]);
		}
		else {
			// All groups:
			lPoints = this.logpoints;
		}

		// Loop over all selected groups
		for (const [grp, arr] of lPoints) {
			await this.enableLogpoints(arr, enable);
			// Set group state
			this.logpointsEnabled.set(grp, enable);
		}
	}


	/**
	 * @returns Returns a list of all enabled logpoints from all groups.
	 */
	protected getEnabledLogpoints(): Array<GenericBreakpoint> {
		const result = new Array<GenericBreakpoint>();
		// Loop over all selected groups
		for (const [grp, arr] of this.logpoints) {
			// Set group state
			const enabled = this.logpointsEnabled.get(grp);
			// Add
			if (enabled)
				result.push(...arr);
		}
		return result;
	}


	/**
	 * @param group the group name for the logpoints
	 * @returns Returns a list of logpoints for a certain group.
	 */
	public getLogpointsForGroup(group: string): Array<GenericBreakpoint> {
		const lps = this.logpoints.get(group) ?? [];
		return lps;
	}


	/**
	 * Sets breakpoint in the Remote.
	 * Sets the breakpoint ID (bpId) in bp.
	 * This method is called also each time a breakpoint is manually set via the
	 * vscode UI.
	 * If set from UI the breakpoint may contain a condition and also a log.
	 * After creation the breakpoint is added to the 'breakpoints' array.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public async setBreakpoint(bp: RemoteBreakpoint): Promise<number> {
		Utility.assert(false);	// override this
		// return
		return 0;
	}


	/**
	 * Clears one breakpoint.
	 * Breakpoint is removed at the Remote and removed from the 'breakpoints' array.
	 * Also used by unit tests.
	 */
	public async removeBreakpoint(bp: RemoteBreakpoint): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Set all breakpoints for a file.
	 * Determines which breakpoints already exist, which are new and which need to be removed.
	 * Calls setBreakpoint and removeBreakpoint which communicate with the emulator.
	 * If system is running, first break, then set the breakpoint(s).
	 * But, because the run-handler is not known here, the 'run' is not continued afterwards.
	 * @param path The file (which contains the breakpoints).
	 * @param givenBps The breakpoints in the file.
	 * @param tmpDisasmFileHandler(bp) If a line cannot be determined then this handler
	 * is called to check if the breakpoint was set in the temporary disassembler file. Returns
	 * an EmulatorBreakpoint.
	 * @returns A Promise with all breakpoints.
	 */
	public async setBreakpoints(path: string, givenBps: Array<RemoteBreakpoint>): Promise<Array<RemoteBreakpoint>> {

		try {
			// get all old breakpoints for the path
			const oldBps = this.breakpoints.filter(bp => bp.filePath == path);

			// Create new breakpoints
			const currentBps = new Array<RemoteBreakpoint>();
			givenBps.forEach(bp => {
				let ebp: RemoteBreakpoint|undefined;
				let error;
				// Get PC value of that line
				let longAddr = this.getAddrForFileAndLine(path, bp.lineNr);
				// Check if valid line
				if (longAddr >= 0) {
					// Now search last line with that pc
					const file = this.getFileAndLineForAddress(longAddr);
					// Check if right file
					if (path.valueOf() == file.fileName.valueOf()) {
						// create breakpoint object
						ebp = {bpId: 0, filePath: file.fileName, lineNr: file.lineNr, longAddress: longAddr, condition: bp.condition, log: bp.log};
					}
					else {
						error = "You cannot set a breakpoint here because the address (" + Utility.getHexString(longAddr & 0xFFFF, 4) + "h) is bound to a different file. Please try to set the breakpoint in: " + file.fileName;
					}
				}
				else {
					// Additional info
					error = "Address not found for " + path;
				}

				// add to array
				if (!ebp) {
					// Breakpoint position invalid
					ebp = {bpId: 0, filePath: path, lineNr: bp.lineNr, longAddress: -1, condition: '', log: undefined, error};
				}
				currentBps.push(ebp);
			});

			// Now check which breakpoints are new or removed (this includes 'changed').
			const newBps = currentBps.filter(bp => bp.longAddress >= 0 && oldBps.filter(obp => (obp.condition == bp.condition) && (obp.log == bp.log) && (obp.longAddress == bp.longAddress)).length == 0);
			const removedBps = oldBps.filter(bp => bp.longAddress >= 0 && currentBps.filter(obp => (obp.condition == bp.condition) && (obp.log == bp.log) && (obp.longAddress == bp.longAddress)).length == 0);

			// Catch communication problems
			try {
				// remove old breakpoints
				for (const bp of removedBps) {
					// from zesarux
					await this.removeBreakpoint(bp);
				}

				// Add new breakpoints and find free breakpoint ids
				for (const bp of newBps) {
					// set breakpoint
					await this.setBreakpoint(bp);
				}
			}
			catch {
				// Error resolution is maybe a little to simple but most probably all commands did fail.
				return oldBps;
			}

			// get all breakpoints for the path
			//const resultingBps = this.breakpoints.filter(bp => bp.filePath == path);

			// Return
			return currentBps;
		}
		catch (e) { // NOSONAR.  Catch is here just for debugging.
			throw e;
		}
	}


	/**
	 * Returns the remote breakpoints (PC breakpoint) array.
	 */
	public getBreakpointsArray(): Array<RemoteBreakpoint> {
		return this.breakpoints;
	}


	/** Enables to break on an interrupt.
	 * Only supported by zsim.
	 * @param enable true=enable,break on interrupt, other disable.
	 * @returns false
	 */
	public async enableBreakOnInterrupt(enable: boolean): Promise<boolean> {
		// Overwrite if supported.
		return false;
	}


	/**
	 * Returns file name and line number associated with a certain memory address.
	 * Takes also the disassembled file into account.
	 * Used e.g.for the call stack.
	 * @param address The memory address to search for.
	 * @returns The associated filename and line number (and for sjasmplus the modulePrefix and the lastLabel).
	 */
	public getFileAndLineForAddress(address: number): SourceFileEntry {
		// Now search last line with that pc
		let file = Labels.getFileAndLineForAddress(address);
		if (!file.fileName) {
			// Search also the disassembled file
			const lineNr = Disassembly.getLineForAddress(address);
			if (lineNr != undefined) {
				file.fileName = DisassemblyClass.getAbsFilePath();
				file.lineNr = lineNr;
			}
		}
		return file;
	}


	/**
	 * Returns the memory address associated with a certain file and line number.
	 * Takes also the disassembled file into account.
	 * @param fileName The path to the file. Can be an absolute path.
	 * @param lineNr The line number inside the file.
	 * @returns The associated long address. -1 if file or line does not exist.
	 */
	public getAddrForFileAndLine(fileName: string, lineNr: number): number {
		let addr = Labels.getAddrForFileAndLine(fileName, lineNr);
		if (addr < 0) {
			// Check disassembly
			const absFilePath = DisassemblyClass.getAbsFilePath();
			if (fileName == absFilePath) {
				// Get address from line number
				addr = Disassembly.getAddressForLine(lineNr);
			}
		}
		return addr;
	}


	/**
	 * Sends a command to the emulator.
	 * Override if supported.
	 * @param cmd E.g. 'get-registers'.
	 * @returns A Promise in remote (emulator) dependend format.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		return "Error: not supported.";
	}


	/**
	 * Reads a memory dump and converts it to a number array.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @param handler(data, addr) The handler that receives the data. 'addr' gets the value of 'address'.
	 */
	public async readMemoryDump(addr64k: number, size: number): Promise<Uint8Array> {
		Utility.assert(false);	// override this
		return new Uint8Array();
	}


	/**
	 * Writes a memory dump.
	 * @param address The 64k memory start address.
	 * @param dataArray The data to write.
	 */
	public async writeMemoryDump(address: number, dataArray: Uint8Array): Promise<void> {
		Utility.assert(false);	// override this
	}


	/**
	 * Gets one memory value from the remote.
	 * The write is followed by a read and the read value is returned
	 * by the Promise.
	 * @param address The address to read.
	 * @returns A Promise with the value.
	 */
	public async readMemory(address: number): Promise<number> {
		// Read
		const realValue = await this.readMemoryDump(address, 1);
		return realValue[0];
	}


	/**
	 * Writes one memory value to the remote.
	 * The write is followed by a read and the read value is returned
	 * by the Promise.
	 * @param address The address to change.
	 * @param value The new (byte) value.
	 * @returns A Promise with the real value.
	 */
	public async writeMemory(address: number, value: number): Promise<number> {
		// Write
		const data = new Uint8Array([value]);
		await this.writeMemoryDump(address, data);
		// Read
		const realValue = await this.readMemory(address);
		return realValue;
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an array of MemoryBanks.
	 * @returns A Promise with an array with the available memory pages. Contains start and end address
	 * and a name.
	 */
	public getMemoryBanks(): MemoryBank[] {
		// Get the slots
		const slots = this.getSlots();
		// Convert
		const pages = this.memoryModel.getMemoryBanks(slots);
		// Return
		return pages;
	}



	/**
	 * Reads the slots/banks association.
	 * @returns A slot array containing the referenced banks.
	 */
	public getSlots(): number[] {
		return Z80Registers.getSlots();
	}


	/**
	 * Resets the T-States counter. Used before stepping to measure the
	 * time.
	 */
	public async resetTstates(): Promise<void> {
		//
	}


	/**
	 * Returns the number of T-States (since last reset).
	 * @returns The number of T-States or 0 if not supported.
	 */
	public async getTstates(): Promise<number> {
		return 0;
	}


	/**
	 * Returns the current CPU frequency
	 * @returns The CPU frequency in Hz (e.g. 3500000 for 3.5MHz) or 0 if not supported.
	 */
	public async getCpuFrequency(): Promise<number> {
		return 0;
	}


	/**
	 * This method is called by the DebugSessionClass before a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 * It can be overridden e.g. to clear/initialize some stuff
	 * e.g. coverage.
	 */
	public startProcessing() {
		//
	}


	/**
	 * This method is called by the DebugSessionClass after a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 * It can be overridden e.g. to do something at the end of a step.
	 * E.g. emit coverage.
	 */
	public stopProcessing() {
		//
	}


	// ZX Next related ---------------------------------

	/**
	 * Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @returns A promise with the value of the register.
	 */
	public async getTbblueRegister(registerNr: number): Promise<number> {
		return 0;
	}


	/**
	 * Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @returns A Promise that returns a 256 byte Array<number> with the palette values.
	 */
	public async getTbblueSpritesPalette(paletteNr: number): Promise<Array<number>> {
		return [];
	}


	/**
	 * Retrieves the sprites clipping window from the emulator.
	 * @returns A Promise that returns the clipping dimensions and the control byte(xl, xr, yt, yb, control).
	 */
	public async getTbblueSpritesClippingWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		return {xl: 0, xr: 0, yt: 0, yb: 0, control: 0};
	}


	/**
	 * Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @returns A Promise with an array of sprite data.
	 */
	public async getTbblueSprites(slot: number, count: number): Promise<Array<Uint8Array>> {
		return [];
	}

	/**
	 * Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @preturns A Promise with an array of sprite pattern data.
	 */
	public async getTbblueSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		return [];
	}


	/**
	 * This is a hack:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * So this function waits as long as there is still traffic to the emulator.
	 * @param timeout Timeout in ms. For this time traffic has to be quiet.
	 * @returns A Promise called after being quiet for the given timeout.
	 */
	public async waitForBeingQuietFor(timeout: number): Promise<void> {
		// This is a hack for ZEsarUX. Not required for the others.
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM, registers etc.
	 * Override.
	 * @param filePath The file path to store to.
	 * @returns State data.
	 */
	public async stateSave(filePath: string): Promise<void> {
		//
	}


	/**
	 * Called from "-state restore" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * Override.
	 * @param filePath The file path to retore from.
	 */
	public async stateRestore(filePath: string): Promise<void> {
		//
	}


	/**
	 * Calculates the step-over/into breakpoint(s) for an instruction.
	 * I.e. it normally calculates the address after the current instruction (pc).
	 * DeZog will set a breakpoint there and execute a 'continue' to simulate
	 * a 'step'.
	 * But for branching or conditional branching instructions this is different.
	 * DeZog will then use up to 2 breakpoints to catch up after the instruction is executed.
	 * The method is async, i.e. it fetches the required registers and memory on it's own.
	 * Note: The method uses normal 64k addresses, no long addresses.
	 * This is because long addresses are not required and there is some arithmetic
	 * done to the addresses (e.g. +3) that is not available on long addresses.
	 * @param stepOver true if breakpoint address should be calculate for a step-over.
	 * In this case the branching is ignored for CALL and RST.
	 * @returns A Promise with the opcode and 2 breakpoint
	 * addresses.
	 * The first always points directly after the address or for unconditional jumps/calls
	 * it points to the jump address.
	 * The 2nd of these bp addresses can be undefined.
	 * Note: the breakpoints returned here are always 64k addresses,
	 * i.e. no long addresses.
	 */
	protected async calcStepBp(stepOver: boolean): Promise<[Opcode, number, number?]> {
		// Make sure the registers are there
		//await this.getRegisters();
		const pc = this.getPC();
		// Get opcodes
		const opcodes = await this.readMemoryDump(pc, 4);

		// Get opcode length and calculate "normal" breakpoint address
		const buffer = new BaseMemory(pc, opcodes);
		const opcode = Opcode.getOpcodeAt(buffer, pc);

		const ocFlags = opcode.flags;
		let bpAddr1 = pc + opcode.length;
		let bpAddr2;

		// Check for any skips (for RST)
		const slots = this.getSlots();
		let skip;
		let totalSkip = 0;
		const skipAddresses = Labels.getLongSkipAddresses();
		while (true) {
			const longAddr = Z80Registers.createLongAddress(bpAddr1, slots);
			skip = skipAddresses.get(longAddr);
			if (!skip)
				break;
			bpAddr1 = (bpAddr1 + skip) & 0xFFFF;
			totalSkip += skip;
		}

		// Special handling for RST 08 (esxdos) as stepInto may not work
		// if the emulator simulates this.
		if (opcode.code == 0xCF) {
			// Note: The opcode length for RST 08 is adjusted by the disassembler.
			// But with the implementation below, we don't require this.
			if (stepOver) {
				// Use old behavior only if user has not adjusted the offset
				if (!totalSkip) {
					// For stepOver nothing is required normally.
					// However, as we have a spare breakpoint (bpAddr2),
					// we can set it to the next PC. So that even if
					// no further action would be taken, a stepOver would stop.
					bpAddr1 = pc + 1;
					bpAddr2 = bpAddr1 + 1;
				}
			}
			else {
				// If stepInto we need a breakpoint at the jump address 8 (RST 08) but also the bpAddr1 if call is simulated.
				bpAddr2 = 0x0008;
				// If the call is simulated (e.g. cspect) than it uses esxdos.
				// I.e. put the other BP at pc+2.
				// If it is not simulated the bpAddr2 is always hit.
				bpAddr1 = pc + 2;
			}
		}
		// Check for RET
		else if (ocFlags & OpcodeFlag.RET) {
			const sp = this.getRegisterValue("SP");
			// Get return address
			const retArr = await this.readMemoryDump(sp, 2);
			const retAddr = retArr[0] + (retArr[1] << 8);
			// If unconditional only one breakpoint is required
			if (ocFlags & OpcodeFlag.CONDITIONAL)
				bpAddr2 = retAddr;
			else
				bpAddr1 = retAddr;
		}
		// Check for stepOver and CALL/RST
		else if (stepOver && (ocFlags & OpcodeFlag.CALL)) {
			// If call/rst and step over we don't need to check the additional
			// branch address.
			// We set the 2nd bp, too, just in case the return address is
			// manipulated. So we would at least catch a manipulation of 1
			bpAddr2 = bpAddr1 + 1;
		}
		// Check for branches (JP, JR, CALL, RST, DJNZ)
		else if (ocFlags & OpcodeFlag.BRANCH_ADDRESS) {
			if (ocFlags & OpcodeFlag.CONDITIONAL) {
				// No step over or no CALL/RST
				bpAddr2 = opcode.value;
			}
			else {
				// All others:
				bpAddr1 = opcode.value;
			}
		}
		else if (ocFlags & OpcodeFlag.STOP) {
			// In this category there are also the special branches
			// like:
			// JP(HL), JP(IX), JP(IY)
			if (opcodes[0] == 0xE9) {
				// JP (HL)
				bpAddr1 = this.getRegisterValue("HL");
			}
			else if (opcodes[0] == 0xDD && opcodes[1] == 0xE9) {
				// JP (IX)
				bpAddr1 = this.getRegisterValue("IX");
			}
			else if (opcodes[0] == 0xFD && opcodes[1] == 0xE9) {
				// JP (IY)
				bpAddr1 = this.getRegisterValue("IY");
			}
		}
		else {
			// Other special instructions
			if (opcodes[0] == 0xED) {
				if (opcodes[1] == 0xB0 || opcodes[1] == 0xB8
					|| opcodes[1] == 0xB1 || opcodes[1] == 0xB9
					|| opcodes[1] == 0xB2 || opcodes[1] == 0xBA
					|| opcodes[1] == 0xB3 || opcodes[1] == 0xBB) {
					// LDIR/LDDR/CPIR/CPDR/INIR/INDR/OTIR/OTDR
					if (!stepOver)
						bpAddr2 = pc;
				}
			}
			else if (opcodes[0] == 0x76) {
				// HALT
				if (!stepOver)
					bpAddr2 = pc;
			}
		}

		// Make sure that breakpoints wrap around
		bpAddr1 &= 0xFFFF;
		if (bpAddr2)
			bpAddr2 &= 0xFFFF;

		// Return either 1 or 2 breakpoints
		return [opcode, bpAddr1, bpAddr2];
	}


	/** The Remote can return here the code coverage addresses that
	 * are safe to be known as code address.
	 * This is an additional information for the disassembler.
	 * The addresses are not in a specific order.
	 * Only zsim implements this at the moment.
	 * @returns An array with long addresses.
	 */
	public async getTraceBack(): Promise<number[]> {
		// Override
		return [];
	}
}


export let Remote: RemoteBase;
