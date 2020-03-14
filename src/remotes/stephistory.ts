import * as assert from 'assert';
import {Z80RegistersClass, Z80Registers} from '../remotes/z80registers';
import {HistoryInstructionInfo} from './decodehistinfo';
import {BaseMemory} from '../disassembler/basememory';
import {Opcode} from '../disassembler/opcode';
//import {Remote} from './remotefactory';
//import {Utility} from '../misc/utility';



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
export class StepHistory {

	// Contains the cpu instruction (register) history.
	// Starts with the youngest.
	// At index 0 the current registers are cached.
	protected history: Array<HistoryInstructionInfo>;

	// The current history index.
	protected historyIndex=-1;

	// Holds a pointer to the registers
	protected z80Registers: Z80RegistersClass; // TODO: Remove

	/// The addresses of the revision history in the right order.
	/// Used to show this lines decorated (gray) while stepping backwards.
	protected revDbgHistory=new Array<number>();

	/// The decoder of the instruction lines. Is the register encoder
	/// for Stephistory and an enhanced decoder for CpuHistory.
	public decoder: HistoryInstructionInfo;

	/**
	 * Creates the object.
	 */
	constructor() {
		this.history=Array<HistoryInstructionInfo>();
	}


	/**
	 * Init.
	 * @param size The max size of the history.
	 */
	public init(maxSize: number) {
	}


	/**
	 * Sets the decoder to use.
	 */
	// TODO: Kann ich auch löschen und direkt drauf zugreifen, oder eine getDecoder Funktion implementieren.
	public setDecoder(decoder: HistoryInstructionInfo) {
		this.decoder=decoder;
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
	 * @returns Returns the next line in the cpu history.
	 * If at start it returns ''.
	 */
	protected revDbgNext(): HistoryInstructionInfo|undefined {
		// Get line
		let line=this.getNextRegisters() as HistoryInstructionInfo;
		this.z80Registers.setCache(line);
		// Remove one address from history
		this.revDbgHistory.pop();
		return line;
	}


	/**
	 * Steps over an instruction.
	 * Simply returns the next address line.
	 */
	public async stepOver(): Promise<void> {
		// Get current line
		let currentLine=Z80Registers.getCache();
		assert(currentLine);

		/*
		TODO: Ich muss getInstruction und getOpcodes hierhin verschieben.

		// Get next line
		const nextLine=this.revDbgNext();
		let breakReason;
		if (!nextLine) {
			breakReason='Break: Reached start of instruction history.'
			break;	// At end of reverse debugging. Simply get the real call stack.
		}

		// Decoration
		this.emitRevDbgHistory();

		// Call handler
		const pc=z80Registers.getPC();
		const instruction='  '+Utility.getHexString(pc, 4)+' '+this.getInstruction(currentLine);
		resolve({instruction, tStates: undefined, cpuFreq: undefined, breakReason});

		// Return if next line is available, i.e. as long as we did not reach the start.
		// Otherwise get the callstack from ZEsarUX.
		if (!nextLine) {
			// Get the registers etc. from ZEsarUX
			this.z80Registers.clearCache();
			this.getRegisters();
		}
		*/
	}
}

