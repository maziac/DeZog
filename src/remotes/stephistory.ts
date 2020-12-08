import {Z80Registers} from '../remotes/z80registers';
import {HistoryInstructionInfo} from './decodehistinfo';
import {BaseMemory} from '../disassembler/basememory';
import {Opcode} from '../disassembler/opcode';
import {EventEmitter} from 'events';
import {CallStackFrame} from '../callstackframe';
import {RefList} from '../misc/refList';
import {Remote} from './remotefactory';
import {Utility} from '../misc/utility';
import {Settings} from '../settings';


/**
 * This class takes care of the step history.
 * This is a lite version of the cpu history.
 *
 * The step history contains only the instructions that one has stepped through
 * during debugging.
 * E.g. if you step over a CALL the step history includes only the instruction CALL.
 * The true cpu history, in contrast, would include all instructions from the subroutine
 * that was called.
 *
 * The step history has the advantage that it is available for all Remotes.
 * Even if the remote itself does not support reverse debugging.
 * But, of course, it is less powerful.
 *
 * For the step history some stepping commands do not make sense or work
 * differently as in the true cpu history:
 * - Step over/step into: There is no differentiation. Both simply step to the next instruction.
 * - StepOut: Does not make sense. Does not exist.
 * - StepBack: Simply steps back to the next instruction.
 * - Reverse continue: Steps back until a breakpoint is hit (only breakpoint
 *   that happen to be at the steps) or until the start of the history.
 * - Continue: Steps forward until a breakpoint is hit (only breakpoint
 *   that happen to be at the steps) or until the end of the history.
 *
 * This class also holds the arrays for the 'revDbgHistory' decoration.
 * And it handles continue, stepOver, stepInto, stepOut, continueReverse
 * and stepBack while in step-back (reverse debugging mode) mode.
 */
export class StepHistoryClass extends EventEmitter {

	// Contains the cpu instruction (register) history.
	// Starts with the youngest.
	// At index 0 the current registers are cached.
	protected history: Array<HistoryInstructionInfo>;

	// The current history index.
	protected historyIndex: number;

	// A copy of the Z80Registers cache when the step-back started.
	protected presentRegistersCache: any;

	// The maximum size of the history array.
	protected maxSize: number;

	/// The addresses of the reverse history in the right order.
	/// Used to show these lines decorated (gray) while stepping backwards.
	protected revDbgHistory: Array<number>;

	/// Only used in the StepHistory to store the call stack.
	protected liteCallStackHistory: Array<RefList<CallStackFrame>>;

	/// User pressed break (pause). Will interrupt e.g. continueReverse.
	protected running: boolean;

	// Mirror of the settings historySpotCount.
	protected spotCount: number;

	// Mirror of the settings spotShowRegisters.
	protected spotShowRegisters: boolean;


	// Prepare to get current registers.
	protected wantedChangedRegs=["A", "F", "BC", "DE", "HL", "IX", "IY", "SP"];


	// Constructor
	constructor() {
		super();
	}


	/**
	 * Init.
	 */
	public init() {
		this.maxSize=Settings.launch.history.reverseDebugInstructionCount;
		this.history=new Array<HistoryInstructionInfo>();
		this.historyIndex=-1;
		this.revDbgHistory=new Array<number>();
		this.liteCallStackHistory=new Array<RefList<CallStackFrame>>(); this.spotCount=Settings.launch.history.spotCount;
		this.spotShowRegisters=Settings.launch.history.spotShowRegisters;
	}


	/**
	 * Sets/gets the decoder to use.
	 * The decoder of the instruction lines. Is the register encoder
     * for StepHistory and an enhanced decoder for CpuHistory.
	 */
	private _decoder: HistoryInstructionInfo;
	public get decoder(): HistoryInstructionInfo {return this._decoder};
	public set decoder(value: HistoryInstructionInfo) {this._decoder=value;};


	/**
	 * Clears the history cache. Is called on each "normal (forward)" step.
	 */
	public clear() {
	}


	/**
	 * Retrieves the registers at the previous step history.
	 * Is async.
	 * @returns The registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo | undefined> {
		const index = this.historyIndex + 1;
		//console.log("len=" + this.history.length + ", index=" + index);
		Utility.assert(index >= 0);
		if (index>=this.history.length)
			return undefined;
		this.historyIndex=index;
		const regs=this.history[index];
		return regs;
	}


	/**
	 * Retrieves the registers at the next instruction from ZEsarUX cpu history.
	 * @returns A string with the registers or undefined if at the start of the history.
	 */
	public getNextRegisters(): HistoryInstructionInfo|undefined {
		let currentLine;
		// Get previous item
		Utility.assert(this.historyIndex >= 0);
		this.historyIndex --;
		if(this.historyIndex >= 0)
			currentLine = this.history[this.historyIndex];
		return currentLine;
	}


	/**
	 * Returns the call stack at the historyIndex.
	 */
	public getCallStack(): RefList<CallStackFrame> {
		Utility.assert(this.historyIndex>=0);
		return this.liteCallStackHistory[this.historyIndex];
	}


	/**
	 * Pushes one history into the array.
	 * @param line One line of history.
	 */
	public pushHistoryInfo(line: HistoryInstructionInfo) {
		Utility.assert(line);
		// Otherwise add
		this.history.unshift(line);
		if (this.history.length>this.maxSize)
			this.history.pop();
	}


	/**
	 * Pushes a callstack to the array.
	 * If it is called it is called after 'pushHistoryInfo' to check the length correctly.
	 */
	public pushCallStack(callstack: RefList<CallStackFrame>) {
		Utility.assert(callstack);
		this.liteCallStackHistory.unshift(callstack);
		if (this.liteCallStackHistory.length>this.maxSize)
			this.liteCallStackHistory.pop();
		Utility.assert(this.liteCallStackHistory.length==this.history.length);
	}


	/**
	 * @param line One line of history.
	 * @returns The address of the current line.
	 * Or in other words the PC contents.
	 */
	public getAddress(line: HistoryInstructionInfo): number {
		const addr=Z80Registers.decoder.parsePC(line);
		return addr;
	}


	/**
	 * @returns Returns true if in step back mode.
	 */
	public isInStepBackMode() {
		return (this.historyIndex >= 0);
	}


	/**
	 * Disassembles an instruction from the given opcode string.
	 * @param line One line of history.
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	public getInstruction(line: HistoryInstructionInfo): string {
		// Prepare bytes to memory
		let opcodes=this.decoder.getOpcodes(line);
		const pc=Z80Registers.decoder.parsePC(line);
		const buffer=new BaseMemory(pc, 4);
		for (let i=0; i<4; i++) {
			const opc=opcodes&0xFF;
			buffer.setValueAtIndex(i, opc);
			opcodes>>>=8;
		}
		// Get opcode
		const opcode=Opcode.getOpcodeAt(buffer, pc);
		// Disassemble
		const opCodeDescription=opcode.disassemble();
		const instr=opCodeDescription.mnemonic;
		return instr;
	}


	/**
	 * Emits 'revDbgHistory' to signal that the files should be decorated.
	 */
	protected emitRevDbgHistory() {
		// Change debug history array into set.
		const addrSet=new Set(this.revDbgHistory)
		this.emit('revDbgHistory', addrSet);
	}


	/**
	 * Returns the address of the i-th element before the current
	 * historyIndex.
	 * 0 = historyIndex.
	 * @param i The i-th element.
	 */
	public getPreviousAddress(i: number) {
		let k=this.historyIndex+i;
		if (k>=this.history.length)
			return undefined;
		const line=this.history[k];
		const addr=this.getAddress(line);
		return addr;
	}


	/**
	 * Creates a string with changed registers (names+value).
	 * @param line The history line in question.
	 * @param regsMap A map of register names ("A", "F", "HL" etc.) with their
	 * current values, i.e. the value after the history 'line'.
	 * I.e. the value that will be printed if not equal to previous
	 * value.
	 * This function will also override the value with the value of history line.
	 */
	protected getChangedRegistersString(line: string, regsMap: Map<string, number>): string {
		let regText='';
		for (const [regName, prevValue] of regsMap) {
			const regValue=Z80Registers.decoder.getRegValueByName(regName, line);
			// Check if changed
			if (regValue!=prevValue) {
				let regName2='';
				let regValueString='';
				// Check for flags
				const size=regName.length;
				if (size==1) {
					regName2=regName;
					if (regName=='F') {
						// Convert register
						regValueString=Utility.getFlagsString(regValue);
					}
					else {
						// One byte register
						regValueString=Utility.getHexString(regValue, 2)+'h';
					}
				}
				else {
					// Distinguishes one and two byte registers
					// Normal reg
					// Check which part of the (double) register has changed
					if (regName.startsWith('I') || regName=='SP' || regName=='PC') {
						// Double register
						regName2 = regName;
						regValueString = Utility.getHexString(regValue, 4);
					}
					else {
						// Check both parts
						const valueXored = regValue ^ prevValue;
						// First part
						if (valueXored & 0xFF00) {
							regName2 += regName[0];
							regValueString += Utility.getHexString(regValue >>> 8, 2);
						}
						// Second part
						if (valueXored & 0xFF) {
							regName2 += regName[1];
							regValueString += Utility.getHexString(regValue & 0xFF, 2);
						}
					}

					// Only 2 byte registers/ Double register
					//regName2=regName;
					//regValueString=Utility.getHexString(regValue, 4);
					regValueString+='h';
				}

				// Construct text
				if (regText)
					regText+=' ';
				regText+=regName2+'='+regValueString;
				// Store previous value
				regsMap.set(regName, regValue);
			}
		}
		// Return
		return regText;
	}


	/**
	 * Calculates the indices into the history array.
	 * For simple history arrays this is equal to the index range.
	 * For zsim this is more complex.
	 * Note: The current register values in Z80Registers need to be uptodate, i.e. Remote.getRegisters has to be
	 * called somewhere before.
	 * @param indices The correctly ordered indices into this.history.
	 * @returns addresses and registers to pass to the decorations.
	 */
	protected calcSpotHistoryAddressesAndRegisters(indices: Array<number>): {addresses: Array<number>, registers: Array<string>} {
		// Changed registers
		let registers;
		let regsMap;
		if (this.spotShowRegisters) {
			// Prepare arrays
			registers=new Array<string>();
			regsMap=new Map<string, number>();
		}

		// Now go through all indices
		// Note: The decoration shows the (changed) register value, **prior** to the instruction in that line.
		const addresses=new Array<number>();
		for (let i=indices.length-1; i>=0; i--) {
			const index=indices[i];
			const line=this.history[index];
			// Get address
			const pc=Z80Registers.decoder.parsePCLong(line);
			//addresses.push(pc);
			addresses.unshift(pc);
			// Compare registers
			if (registers) {
				if (i==indices.length-1) {
					// Not for the first line
					//registers.unshift('');
					// Preset register values
					this.wantedChangedRegs.forEach(regName => {
						const value=Z80Registers.decoder.getRegValueByName(regName, line);
						regsMap.set(regName, value);
					});
				}
				else {
					// But for all others
					const regText=this.getChangedRegistersString(line, regsMap);
					registers.unshift(regText);
				}
			}
		}
		// Now for the current line
		let currentRegs;
		if (this.isInStepBackMode())
			currentRegs = this.presentRegistersCache;	// Use stored one
		else
			currentRegs = Z80Registers.getCache();	// Or the current one, if nothing stored
		const regText = this.getChangedRegistersString(currentRegs, regsMap);
		registers.unshift(regText);

		// Return
		return {addresses, registers};
	}


	/**
	 * Emits 'historySpot' to signal that the files should be decorated.
	 * It can happen that this method has to retrieve data from the
	 * remote.
	 */
	protected emitHistorySpot() {
		// Check if history spot is enabled
		const count=this.spotCount;
		if (count<=0)
			return;

		// Otherwise calculate indices into the history

		// Get start index
		let index=this.historyIndex+1;
		let startIndex=index-count;
		if (startIndex<0)
			startIndex=0;

		let end=index+count;
		if (end>this.history.length)
			end=this.history.length;
		// Loop through history
		const indices=new Array<number>();
		let i;
		for (i=startIndex; i<end; i++) {
			indices.push(i);
		}

		// Changed registers and addresses
		const {addresses, registers}=this.calcSpotHistoryAddressesAndRegisters(indices);

		// Emit code coverage event
		this.emit('historySpot', startIndex, addresses, registers);
	}


	/**
	 * Emits 'revDbgHistory' and 'historySpot' if configured.
	 */
	public emitHistory() {
		this.emitRevDbgHistory();
		this.emitHistorySpot();
	}


	/**
	 * Returns the breakpoint at the given address.
	 * Note: Checks only breakpoints with a set 'address'.
	 * @returns A string with the reason. undefined if no breakpoint hit.
	 */
	protected checkPcBreakpoints(): string|undefined {
		Utility.assert(Z80Registers.getCache());
		let condition;

		// We use the callstack to get the PC long address.
		// The Z80Register contains only the 64k address but the callstack
		// contains the PC as well. If long addresses are used the callstack
		// PC is coded as long address.
		//const pc=Z80Registers.getPC();  This was used earlier.
		const callStack=this.getCallStack();
		const len=callStack.length;
		Utility.assert(len>0);
		const pc=callStack[len-1].addr;

		const breakpoints=Remote.getBreakpointsArray();
		for (const bp of breakpoints) {
			if (bp.address==pc) {
				// Check for condition
				if (!bp.condition) {
					condition="";
					break;
				}

				// Evaluate condition
				try {
					const result=Utility.evalExpression(bp.condition, true);
					if (result!=0) {
						condition=bp.condition;
						break;
					}
				}
				catch (e) {
					// A problem during evaluation happened,
					// e.g. a memory location has been tested which is not possible
					// during reverse debugging.
					condition="Could not evaluate: "+bp.condition;
					break;
				}
			}
		}

		// Text
		let reason;
		if (condition!=undefined) {
			const breakAddress=pc;
			const addrString=Utility.getHexString(breakAddress&0xFFFF, 4);
			let bankString="";
			const bank=breakAddress>>>16;
			if (bank!=0)
				bankString=" (bank="+(bank-1).toString()+")";
			reason="Breakpoint hit @"+addrString+"h"+bankString;
			//reason='Breakpoint hit at PC='+Utility.getHexString(pc&0xFFFF, 4)+'h';
			if (condition!="")
				reason+=', '+condition;
		}
		return reason;
	}


	/**
	 * @returns Returns the previous line in the cpu history.
	 * If at end it returns undefined.
	 */
	public async revDbgPrev(): Promise<HistoryInstructionInfo|undefined> {
		if (!this.isInStepBackMode()) {
			// Store current registers
			this.presentRegistersCache = Z80Registers.getCache();
		}
		const line = await this.getPrevRegistersAsync();
		if (line) {
			// Add to register cache
			Z80Registers.setCache(line);
			// Add to history for decoration
			const addr=Z80Registers.getPCLong();
			this.revDbgHistory.push(addr);
		}
		return line;
	}


	/**
	 * @returns Returns the next line in the cpu history.
	 * If at start it returns undefined.
	 * Note: Doesn't need to be async. I.e. doesn't need to communicate with the external remote.
	 */
	public revDbgNext(): HistoryInstructionInfo|undefined {
		// Get line
		let line = this.getNextRegisters() as string;
		if (line)
			Z80Registers.setCache(line);
		else {
			// At the start set Z80 registers back with their real value.
			Z80Registers.setCache(this.presentRegistersCache);
		}
		// Remove one address from history
		this.revDbgHistory.pop();
		return line;
	}


	/**
	 * Continues instruction execution.
	 * I.e. steps over all history infos until either a breakpoint is hit
	 * or the start of the instruction is encountered.
	 * @returns breakReason=A possibly break reason (e.g. 'Reached start of instruction history') or undefined.
	 */
	public async continue(): Promise<string|undefined> {
		this.running=true;
		// Continue in reverse debugging
		// Will run until after the first of the instruction history
		// or until a breakpoint condition is true.

		let nextLine;
		let breakReasonString;
		try {
			// Get current line
			let currentLine: string=Z80Registers.getCache();
			Utility.assert(currentLine);

			// Loop over all lines, reverse
			while (this.running) {
				// Handle stack
				nextLine=this.revDbgNext();
				if (!nextLine)
					break;

				// Check for breakpoint
				Z80Registers.setCache(nextLine);
				const condition=this.checkPcBreakpoints();
				if (condition!=undefined) {
					breakReasonString=condition;
					break;	// BP hit and condition met.
				}

				// Next
				currentLine=nextLine;
			}
		}
		catch (e) {
			breakReasonString='Error occurred: '+e.message;
		}

		// Return if next line is available, i.e. as long as we did not reach the start.
		if (!nextLine) {
			// Get the registers etc. from the Remote
			await Remote.getRegistersFromEmulator();
			breakReasonString='Break: Reached start of instruction history.';
		}

		return breakReasonString;
	}


	/**
	 * 'reverse continue' debugger program execution.
	 * The Promise resolves when it's stopped e.g. when a breakpoint is hit.
	 * @returns A string with the break reason. (Never undefined)
	 */
	public async reverseContinue(): Promise<string> {
		this.running=true;
		let currentLine;
		let breakReasonString;
		try {
			// Loop over all lines, reverse
			while (this.running) {
				// Get line
				currentLine=await this.revDbgPrev();
				if (!currentLine) {
					breakReasonString='Break: Reached end of instruction history.';
					break;
				}

				// Check for breakpoint
				Z80Registers.setCache(currentLine);
				const condition=this.checkPcBreakpoints();
				if (condition!=undefined) {
					breakReasonString=condition;
					break;	// BP hit and condition met.
				}
			}
		}
		catch (e) {
			breakReasonString='Error occurred: '+e.message;
		}

		return breakReasonString;
	}


	/**
	 * Should return the current instruction.
	 * For the Lite StepHistory always returns undefined.
	 * @returns undefined.
	 */
	public getCurrentInstruction(): string|undefined {
		return undefined;
	}


	/**
	 * Steps over an instruction.
	 * @returns A possibly break reason (e.g. 'Reached start of instruction history') or undefined if no break.
	 */
	public async stepOver(): Promise<string|undefined> {
		let breakReasonString;
		try {
			const currentLine=this.revDbgNext();
			if (!currentLine)
				throw Error('Break: Reached start of instruction history.');
		}
		catch (e) {
			breakReasonString=e.message;
		}

		// Call handler
		return breakReasonString;
	}


	/**
	 * Steps into an instruction.
	 * Is not implemented for StepHistory, only for CpuHistory.
	 * @returns The break reason/error: 'Step-into not supported in lite reverse debugging.'
	 */
	public async stepInto(): Promise<string|undefined> {
		return 'Step-into not supported in lite reverse debugging.';
	}


	/**
	 * Steps out of an instruction.
	 * Is not implemented for StepHistory, only for CpuHistory.
	 * @returns breakReason='Not supported in lite reverse debugging.'.
	 */
	public async stepOut(): Promise<string | undefined> {
		return 'Step-out not supported in lite reverse debugging.';
	}


	/**
	  * 'step backwards' the program execution in the debugger.
	  * @returns A Promise with a string with the break reason. Or undefined, if no break reason.
	  */
	public async stepBack(): Promise<string|undefined> {
		let breakReasonString;
		try {
			const currentLine=await this.revDbgPrev();
			if (!currentLine)
				throw Error('Break: Reached end of instruction history.');
		}
		catch (e) {
			breakReasonString=e.message;
		}

		// Call handler
		return breakReasonString;
	}


	/**
	 * User pressed break (pause).
	 * Interrupts a running 'continue', 'continueReverse', 'stepOver' or 'stepOut'.
	 */
	public pause() {
		this.running=false;
	}
}

