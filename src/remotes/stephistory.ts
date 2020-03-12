import * as assert from 'assert';
import {Z80Registers} from '../../src/remotes/z80registers';


/// For StepHistory this is the register data only.
/// For full cpu history the memory content at PC (the instruction)
/// and the content at SP (the potential return address)
/// will be added.
export type HistoryInstructionInfo=any;


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
 */
export class StepHistory {

	// Contains the cpu instruction (register) history.
	// Starts with the youngest.
	// At index 0 the current registers are cached.
	protected history: Array<HistoryInstructionInfo>;

	// The current history index.
	protected historyIndex=-1;

	// Holds a pointer to the registers
	protected z80Registers: Z80Registers;

	/**
	 * Creates the object.
	 */
	constructor(regs: Z80Registers) {
		this.history=Array<HistoryInstructionInfo>();
		this.z80Registers = regs;
	}


	/**
	 * Init.
	 * @param size The max size of the history.
	 */
	public init(maxSize: number) {
	}


	/**
	 * Clears the history cache. Is called on each "normal" step.
	 */
	public clearCache() {
		this.history.length = 0;
		this.historyIndex = -1;
	}


	/**
	 * Returns the history index.
	 * -1 if history is not in use.
	 */
	public getHistoryIndex() {
		return this.historyIndex;
	}


	/**
	 * Retrieves the registers at the previous step history.
	 * Is async.
	 * @returns The registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo|undefined> {
		const index=this.historyIndex+1;
		//console.log("len=" + this.history.length + ", index=" + index);
		assert(index>=0);
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
		assert(this.historyIndex >= 0);
		this.historyIndex --;
		if(this.historyIndex >= 0)
			currentLine = this.history[this.historyIndex];
		return currentLine;
	}


	/**
	 * @param line One line of history.
	 * @returns The address of the current line.
	 * Or in other words the PC contents.
	 */
	public getAddress(line: HistoryInstructionInfo): number {
		const addr=this.z80Registers.parsePC(line);
		return addr;
	}


	/**
	 * @returns Returns true if in step back mode.
	 */
	public isInStepBackMode() {
		return (this.historyIndex >= 0);
	}
}

