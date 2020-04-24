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
 * The true cpu history, in contrast, would include all instruction from the subroutine
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

	// The maximum size of the history array.
	protected maxSize: number;

	/// The addresses of the reverse history in the right order.
	/// Used to show these lines decorated (gray) while stepping backwards.
	protected revDbgHistory: Array<number>;

	/// Only used in the StepHistory to store the call stack.
	protected liteCallStackHistory: Array<RefList<CallStackFrame>>;

	/// User pressed break (pause). Will interrupt e.g. continueReverse.
	protected running: boolean;


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
		this.liteCallStackHistory=new Array<RefList<CallStackFrame>>();
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
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo|undefined> {
		const index=this.historyIndex+1;
		//console.log("len=" + this.history.length + ", index=" + index);
		Utility.assert(index>=0);
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
	 * @param exchange true if the element should be exchanged rather than added.
	 */
	public pushHistoryInfo(line: HistoryInstructionInfo, exchange = false) {
		Utility.assert(line);
		if (exchange&&this.history.length>0) {
			// Exchange
			this.history[0]=line;
		}
		else {
			// Otherwise add
			this.history.unshift(line);
			if (this.history.length>this.maxSize)
				this.history.pop();
		}
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
	 * Emits 'historySpot' to signal that the files should be decorated.
	 * It can happen that this method has to retrieve data from the
	 * remote.
	 */
	protected emitHistorySpot() {
		// Check if history spot is enabled
		const count=Settings.launch.history.spotCount;
		if (count<=0)
			return;

		// Otherwise calculate addresses

		// Get start index
		let index=this.historyIndex+1;
		let startIndex=index-count;
		if (startIndex<0)
			startIndex=0;

		const addresses=new Array<number>();
		let end=index+count;
		if (end>this.history.length)
			end=this.history.length;
		for (let i=startIndex; i<end; i++) {
			const line=this.history[i];
			const pc=this.decoder.parsePC(line);
			addresses.push(pc);
		}

		// Emit code coverage event
		this.emit('historySpot', startIndex, addresses);
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
		const pc=Z80Registers.getPC();
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
			reason='Breakpoint hit at PC='+Utility.getHexString(pc, 4)+'h';
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
		const line=await this.getPrevRegistersAsync();
		if (line) {
			// Add to register cache
			Z80Registers.setCache(line);
			// Add to history for decoration
			const addr=Z80Registers.getPC();
			this.revDbgHistory.push(addr);
		}
		return line;
	}


	/**
	 * @returns Returns the next line in the cpu history.
	 * If at start it returns ''.
	 * Note: Doesn't need to be async. I.e. doesn't need to communicate with the external remote.
	 */
	public revDbgNext(): HistoryInstructionInfo|undefined {
		// Get line
		let line=this.getNextRegisters() as string;
		Z80Registers.setCache(line);
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
	public continue(): string|undefined {
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
			breakReasonString='Error occurred: '+e;
		}

		// Return if next line is available, i.e. as long as we did not reach the start.
		if (!nextLine) {
			// Get the registers etc. from ZEsarUX
			Z80Registers.clearCache();
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
			breakReasonString='Error occurred: '+e;
		}

		return breakReasonString;
	}


	/**
	 * Steps over an instruction.
	 * Simply returns the next address line.
	 * @returns instruction=undefined
	 * breakReasonString=A possibly break reason (e.g. 'Reached start of instruction history') or undefined.
	 */
	public stepOver(): {instruction: string, breakReasonString: string|undefined} {
		let breakReasonString;
		try {
			const currentLine=this.revDbgNext();
			if (!currentLine)
				throw 'Break: Reached start of instruction history.';
		}
		catch (e) {
			breakReasonString=e;
		}

		// Call handler
		return {instruction: undefined as any, breakReasonString};
	}


	/**
	 * Steps into an instruction.
	 * Is not implemented for StepHistory, only for CpuHistory.
	 * @returns instruction=undefined
	 * breakReasonString='Not supported in lite reverse debugging.'.
	 */
	public stepInto(): {instruction: string, breakReasonString: string|undefined} {
		return {
			instruction: undefined as any,
			breakReasonString: 'Step-into not supported in lite reverse debugging.'
		};
	}


	/**
	 * Steps out of an instruction.
	 * Is not implemented for StepHistory, only for CpuHistory.
	 * @returns breakReason='Not supported in lite reverse debugging.'.
	 */
	public stepOut(): string|undefined {
		return 'Step-out not supported in lite reverse debugging.';
	}


	/**
	  * 'step backwards' the program execution in the debugger.
	  * @returns {instruction, breakReason} Promise.
	  * instruction: e.g. "081C NOP"
	  * breakReasonString: If not undefined it holds the break reason message.
	  */
	public async stepBack(): Promise<{instruction: string, breakReasonString: string|undefined}> {
		let breakReasonString;
		try {
			const currentLine=await this.revDbgPrev();
			if (!currentLine)
				throw Error('Break: Reached end of instruction history.');
			}
		catch (e) {
			breakReasonString=e;
		}

		// Call handler
		return {instruction: undefined as any, breakReasonString};
	}


	/**
	 * User pressed break (pause).
	 * Interrupts a running 'continue', 'continueReverse', 'stepOver' or 'stepOut'.
	 */
	public pause() {
		this.running=false;
	}
}

