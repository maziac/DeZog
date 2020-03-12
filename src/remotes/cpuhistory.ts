import * as assert from 'assert';
import {Opcode} from '../../src/disassembler/opcode';
import {BaseMemory} from '../../src/disassembler/basememory';
import {Z80Registers} from '../../src/remotes/z80registers';
import {StepHistory, HistoryInstructionInfo} from './stephistory';

/**
 * This class takes care of the ZEsarUX cpu history.
 * Each history instruction can be retrieved from ZEsarUx.
 * The format of each line is:
 * PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c
 * which is very much the same as the line retrieved during each forward step. To compare, forward-step:
 * PC=003a SP=ff42 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=07  F=-Z-H3P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0  TSTATES: 46
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
export class CpuHistory extends StepHistory{

	/**
	 * Creates the object.
	 */
	constructor(regs: Z80Registers) {
		super(regs);
	}


	/**
	 * Init.
	 * @param size The max size of the history.
	 */
	public init(maxSize: number) {
		super.init(maxSize);
	}


	/**
	 * Retrieves the instruction from Remote's cpu history.
	 * Is async.
	 * @param index The index to retrieve. Starts at 0.
	 * @returns A string with the registers.
	 */
	protected async getRegistersPromise(index: number): Promise<HistoryInstructionInfo|undefined> {
		// Override this
		assert(false);
	}


	/**
	 * Retrieves the registers at the previous instruction from the Remote's cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo|undefined> {
		let currentLine= await super.getPrevRegistersAsync();
		if(!currentLine)
		{
			const index = this.historyIndex + 1;
			currentLine = await this.getRegistersPromise(index);
			if(currentLine) {
				this.historyIndex = index;
				this.history.push(currentLine);
			}
		}
		return currentLine;
	}


	/**
	 * Retrieves the opcodes from the HistoryInstructionInfo.
	 * @param line One line of history.
	 * @returns 4 bytes (the opcodes) in one number. little endian,
	 * i.e. the opcode at PC is at the lowest 8 bits.
	 */
	public getOpcodes(line: HistoryInstructionInfo): number {
		// Override this
		assert(false);
		return 0;
	}


	/**
	 * Disassembles an instruction from the given opcode string.
	 * @param line One line of history.
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	public getInstruction(line: HistoryInstructionInfo): string {
		// Prepare bytes to memory
		let opcodes = this.getOpcodes(line);
		const pc = this.z80Registers.parsePC(line);
		const buffer = new BaseMemory(pc, 4);
		for(let i=0; i<4; i++) {
			const opc=opcodes&0xFF;
			buffer.setValueAtIndex(i, opc);
			opcodes>>=8;
		}
		// Get opcode
		const opcode = Opcode.getOpcodeAt(buffer, pc);
		// Disassemble
		const opCodeDescription = opcode.disassemble();
		const instr = opCodeDescription.mnemonic;
		return instr;
	}



	/**
	 * Retrieves the 2 bytes from stack in the HistoryInstructionInfo.
	 * I.e. the potential return address.
	 * @param line One line of history.
	 * @returns The (sp), e.g. 0xA2BF
	 */
	public getSPContent(line: HistoryInstructionInfo): number {
		// Override this
		assert(false);
		return 0;
	}


	/**
	 * Tests if the opcode is a RET instruction and if it is
	 * conditional it tests if the condition was true.
	 * @param opcodes E.g. 0xe52a785c
	 * @param flags The flags.
	 * @returns false=if not RET (or RETI or RETN) or condition of RET cc is not met.
	 */
	public isRetAndExecuted(opcodes: number, flags: number): boolean {
		// Check for RET
		const opcode0=opcodes&0xFF;
		if(0xC9 == opcode0)
			return true;

		// Check for RETI or RETN
		if(0xED == opcode0) {
			const opcode1=(opcodes>>8)&0xFF;;
			if(0x4D == opcode1 || 0x45 == opcode1)
				return true;
		}

		// Now check for RET cc
		const mask = 0b11000111;
		if((opcode0 & mask) == 0b11000000) {
			// RET cc, get cc
			const cc = (opcode0 & ~mask) >> 3;
			// Check condition
			const condMet = Z80Registers.isCcMetByFlag(cc, flags);
			return condMet;
		}

		// No RET or condition not met
		return false;
	}


	/**
	 * Tests if the opcode is a CALL instruction and if it is
	 * conditional it tests if the condition was true.
	 * @param opcodes E.g. 0xe52a785c
	 * @param flags The flags.
	 * @returns false=if not CALL or condition of CALL cc is not met.
	 */
	public isCallAndExecuted(opcodes: number, flags: number): boolean {
		// Check for CALL
		const opcode0=opcodes&0xFF;
		if(0xCD == opcode0)
			return true;

		// Now check for CALL cc
		const mask = 0b11000111;
		if((opcode0 & mask) == 0b11000100) {
			// RET cc, get cc
			const cc = (opcode0 & ~mask) >> 3;
			// Check condition
			const condMet = Z80Registers.isCcMetByFlag(cc, flags);
			return condMet;
		}

		// No CALL or condition not met
		return false;
	}



	/**
	 * Tests if the line includes a RST instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns true=if RST
	 */
	public isRst(opcodes: number): boolean {
		// Check for RST
		const opcode0=opcodes&0xFF;
		return this.isRstOpcode(opcode0);
	}

	/**
	 * Returns the RST address. Note: It is not checked if the opcode is
	 * really a RST instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns E.g. 0x48.
	 */
	public getRstAddress(opcodes: number): number {
		const opcode0=opcodes&0xFF;
		const mask = ~0b11000111;
		const address = (opcode0 & mask);
		return address;
	}


	/**
	 * Tests if the opcode is a PUSH instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns true=if PUSH
	 */
	/*
	public isPush(opcodes: number): boolean {
		// Check for PUSH
		const opcode0 = opcodes&0xFF;

		// PUSH qq
		const mask = 0b11001111;
		if((opcode0 & mask) == 0x11000101)
			return true;

		// PUSH IX or IY
		if(opcode0 == 0xDD || opcode0 == 0xFD) {
			const opcode1=(opcodes>>8)&0xFF;;
			if(opcode1 == 0xE5)
				return true;
		}

		// PUSH nnnn, ZXNext
		if(opcode0 == 0xED) {
			const opcode1=(opcodes>>8)&0xFF;;
			if(opcode1 == 0x8A)
				return true;
		}

		// No PUSH
		return false;
	}
	*/

	/**
	 * Tests if the opcode is a POP instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns true=if POP
	 */
	public isPop(opcodes: number): boolean {
		// Check for POP
		const opcode0=opcodes&0xFF;;

		// POP qq
		const mask = 0b11001111;
		if((opcode0 & mask) == 0b11000001)
			return true;

		// POP IX or IY
		if(opcode0 == 0xDD || opcode0 == 0xFD) {
			const opcode1=(opcodes>>8)&0xFF;;
			if(opcode1 == 0xE1)
				return true;
		}

		// No POP
		return false;
	}


	/**
	 * Returns the pushed value.
	 * @param opcodes E.g. 0xc5 (PUSH BC), BC being 0x1234
	 * @param line One line of history.
	 * @returns 0x1234
	 */
	public getPushedValue(opcodes: number, line: HistoryInstructionInfo): number {
		// Check for PUSH
		const opcode0=opcodes&0xFF;

		let value;
		switch(opcode0) {
			case 0xC5:	// PUSH BC
				value = this.z80Registers.parseBC(line);
				break;
			case 0xD5:	// PUSH DE
				value = this.z80Registers.parseDE(line);
				break;
			case 0xE5:	// PUSH HL
				value = this.z80Registers.parseHL(line);
				break;
			case 0xF5:	// PUSH AF
				value = this.z80Registers.parseAF(line);
				break;

			case 0xDD:
			case 0xFD:
				{
					const opcode1=(opcodes>>8)&0xFF;;
					if(opcode1 == 0xE5) {
						if(opcode0 == 0xDD)
							value = this.z80Registers.parseIX(line);	// PUSH IX
						else
							value = this.z80Registers.parseIY(line);	// PUSH IY
					}
				}
				break;

			case 0xED:
				{
					const opcode1=(opcodes>>8)&0xFF;
					if (opcode1==0x8A) {
						// PUSH nn, big endian
						value=(opcodes>>8)&0xFF00;
						value|=(opcodes>>24)&0xFF;
					}
				}
				break;
		}

		return value;
	}


	/**
	 * Returns the previous SP value. Check all direct changes (e.g. inc sp) to SP.
	 * Does not check CALL/RET/RST/PUSH and POP.
	 * For LD SP,(nnnn) undefinedis returned otherwise a real number.
	 * @param opcodes E.g. 0xe52a785c
	 * @param sp The SP value.
	 * @param line One line of history.
	 * @return The previous SP value or undefined if unknown.
	 */
	public calcDirectSpChanges(opcodes: number, sp: number, line: string): number|undefined {
		let expectedSp: number|undefined=sp;
		const opcode0=opcodes&0xFF;

		switch(opcode0) {
			case 0x31:	// LD SP,nnnn
				expectedSp=(opcodes>>8)&0xFFFF;
				break;

			case 0x33:	// INC SP
				expectedSp ++;
				break;

			case 0x3B:	// DEC SP
				expectedSp --;
				break;

			case 0xF9:	// LD SP,HL
				// Get HL
				const hl = this.z80Registers.parseHL(line);
				expectedSp = hl;
				break;

			case 0xED:
				{
					const opcode1=(opcodes>>8)&0xFF;
					if(opcode1 == 0x7B) {
						// LD SP,(nnnn)
						expectedSp = undefined;
					}
				}
				break;

			case 0xDD:
				{
					const opcode1=(opcodes>>8)&0xFF;
					if(opcode1 == 0xF9) {
						// LD SP,IX
						const ix = this.z80Registers.parseIX(line);
						expectedSp = ix;
					}
				}
				break;

			case 0xFD:
				{
					const opcode1=(opcodes>>8)&0xFF;
					if(opcode1 == 0xF9) {
						// LD SP,IY
						const iy = this.z80Registers.parseIY(line);
						expectedSp = iy;
					}
				}
				break;
		}

		return expectedSp;
	}


	/**
	 * Tests if the opcode byte is from a CALL.
	 * @param opcode0 The first byte of an instruction.
	 * @returns true if "CALL" or "CALL cc". Does not matter if call was executed or not.
	 */
	public isCallOpcode(opcode0: number): boolean {
		// Check for CALL
		if (0xCD==opcode0)
			return true;

		// Now check for CALL cc
		const mask=0b11000111;
		if ((opcode0&mask)==0b11000100)
			return true;

		// No CALL
		return false;
	}


	/**
	 * Tests if the opcode byte is from a RST.
	 * @param opcode0 The first byte of an instruction.
	 * @returns true if "RST".
	 */
	public isRstOpcode(opcode0: number): boolean {
		const mask=0b11000111;
		if ((opcode0&mask)==0b11000111)
			return true;

		// No RST
		return false;
	}
}

