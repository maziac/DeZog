import * as assert from 'assert';
import { zSocket } from './zesaruxSocket';
import { Opcode } from './disassembler/opcode';
import { BaseMemory } from './disassembler/basememory';
import { Z80Registers } from './z80Registers';



/**
 * This class takes care of the ZEsarUX cpu history.
 * Each history instruction can be retrieved from ZEsarUx.
 * The format of each line is:
 * PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c
 * which is very much the same as the line retrieved during each forward step. To compare, forward-step:
 * PC=003a SP=ff42 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=07  F=-Z-H3P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0  TSTATES: 46
 * 003A LD HL,(5C78)
 *
 * These are the ZEsarUX cpu history zrcp commands:
 * cpu-history ...:
 * clear                 Clear the cpu history
 * enabled yes|no        Enable or disable the cpu history
 * get index             Get registers at position
 * get-max-size          Return maximum allowed elements in history
 * get-pc start end      Return PC register from position start to end
 * get-size              Return total elements in history
 * is-enabled            Tells if the cpu history is enabled or not
 * is-started            Tells if the cpu history is started or not
 * started yes|no        Start recording cpu history. Requires it to be enabled first
 * set-max-size number   Sets maximum allowed elements in history
 */
export class ZesaruxCpuHistory {

	// Contains the cpu instruction (register) history.
	// Starts with the youngest.
	// At index 0 the current registers are cached.
	protected history: Array<string>;

	// The first time the index is searched. Afterwards the stored one is used.
	protected pcIndex = -1;

	/**
	 * Creates the object.
	 */
	constructor() {
		this.history = Array<string>();
	}


	/**
	 * Init.
	 * @param size The max size of the history.
	 */
	public init(maxSize: number) {
		if(maxSize > 0) {
			zSocket.send('cpu-history enabled yes');
			zSocket.send('cpu-history set-max-size ' + maxSize);
			zSocket.send('cpu-history clear');
			zSocket.send('cpu-history started yes');
		}
		else {
			zSocket.send('cpu-history enabled no');
		}
	}


	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * May throw an exception if wrong data is received.
	 * @returns A string with the instruction and registers.
	 */
	// REMOVE:
	public async getLineXXX(): Promise<string|undefined> {
		try {
			let currentLine;
			// Check if it is the first retrieved line

			return currentLine;
		}
		catch(e) {
			throw Error("Error retrieving the cpu history from ZEsarUX.");
		}
	}


	/**
	 * Retrieves the registers at the previous instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegisters(): Promise<string|undefined> {
		const currentLine = await this.getRegistersPromise(this.history.length);
		if(currentLine)
			this.history.push(currentLine);
		return currentLine;
	}


	/**
	 * Retrieves the registers at the next instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the start of the history.
	 */
	public getNextRegisters(): string|undefined {
		// Remove last one
		this.history.pop();
		// Get previous item
		const len = this.history.length;
		let currentLine;
		if(len > 0)
			currentLine = this.history[len-1];
		return currentLine;
	}


	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * @param index The index to retrieve. Starts at 0.
	 * @returns A string with the registers.
	 */
	protected getRegistersPromise(index: number): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			assert(index >= 0);
			zSocket.send('cpu-history get ' + index, data => {
				if(data.substr(0,5).toLowerCase() == 'error')
					resolve(undefined);
				else
					resolve(data);
			}, true);
		});
	}


	/**
	 * Input a line which was retrieved by 'cpu-history get N' and return the opcodes string.
	 * @param line E.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c"
	 * @return E.g. "e52a785c"
	 */
	public getOpcodes(line: string): string {
		if(this.pcIndex < 0) {
			this.pcIndex = line.indexOf('(PC)=');
			assert(this.pcIndex >= 0);
			this.pcIndex += 5;
		}
		const opcodes = line.substr(this.pcIndex, 8);
		return opcodes;
	}


	/**
	 * Disassembles an instruction from the given opcode string.
	 * Uses 'PC=xxxx' and '(PC)=yyyyyyyy' from the input string.
	 * @param opcodes E.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c"
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	public getInstruction(line: string): string {
		// Prepare bytes to memory
		const opcodes = this.getOpcodes(line);
		const pc = Z80Registers.parsePC(line);
		const buffer = new BaseMemory(pc, 4);
		for(let i=0; i<4; i++) {
			const opc = parseInt(opcodes.substr(i*2, 2), 16);
			buffer.setValueAtIndex(i, opc);
		}
		// Get opcode
		const opcode = Opcode.getOpcodeAt(buffer, pc);
		// Disassemble
		const opCodeDescription = opcode.disassemble();
		const instr = opCodeDescription.mnemonic;
		return instr;
	}


	/**
	 * @param line If given the instruction is taken from the line, otherwise
	 * 'getLine()' is called.
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	// TODO: REMOVE
	public getInstructionOld(line: string): string {
	// E.g. "8000 LD A,1E PC=8000 SP=ff2b BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=01  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
		// Extract the instruction
		const k = line.indexOf('PC=');
		assert(k >= 0);
		const instr = line.substr(5, k-5-1);
		return instr;
	}


	/**
	 * @returns The address of the current line. Uses the first 4 digits simply.
	 */
	public getAddress(line: string): number {
		line = line.substr(3,4);
		// Convert address
		const addr = parseInt(line, 16);
		return addr;
	}


	/**
	 * @returns Returns true if in step back mode.
	 */
	public isInStepBackMode() {
		return (this.history.length > 0);
	}

}

