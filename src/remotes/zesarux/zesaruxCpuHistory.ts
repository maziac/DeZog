import * as assert from 'assert';
import { zSocket /*, ZesaruxSocket*/ } from './zesaruxsocket';
import { Opcode } from '../../disassembler/opcode';
import { BaseMemory } from '../../disassembler/basememory';
import { Z80Registers } from '../z80registers';
//import { Emulator } from './emulatorfactory';
import { ZesaruxRegisters } from './zesaruxregisters';


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

	// The current history index.
	protected historyIndex = -1;

	// The first time the index is searched. Afterwards the stored one is used.
	protected pcIndex = -1;

	// The first time the index is searched. Afterwards the stored one is used.
	protected spIndex = -1;

	// Holds a pointer to the zesarux registers
	protected zesaruxRegisters: ZesaruxRegisters;

	/**
	 * Creates the object.
	 */
	constructor(regs: ZesaruxRegisters) {
		this.history = Array<string>();
		this.zesaruxRegisters = regs;
	}


	/**
	 * Init.
	 * @param size The max size of the history.
	 */
	public init(maxSize: number) {
		if(maxSize > 0) {
			zSocket.send('cpu-history enabled yes', () => {}, true);
			zSocket.send('cpu-history set-max-size ' + maxSize);
			zSocket.send('cpu-history clear');
			zSocket.send('cpu-history started yes');
		}
		else {
			zSocket.send('cpu-history enabled no', () => {}, true);
		}
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
	 * Increases this.historyIndex and returns the registers at that index.
	 * @returns Returns the registers or undefined.
	 */
	protected getPrevRegisters(): string|undefined {
		const index = this.historyIndex + 1;
		//console.log("len=" + this.history.length + ", index=" + index);
		assert(index >= 0);
		if(index >= this.history.length)
			return undefined;
		this.historyIndex = index;
		const regs = this.history[index];
		return regs;
	}


	/**
	 * Retrieves the registers at the previous instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<string|undefined> {
		let currentLine = this.getPrevRegisters();
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
	 * Retrieves the registers at the next instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the start of the history.
	 */
	public getNextRegisters(): string|undefined {
		let currentLine;
		// Get previous item
		assert(this.historyIndex >= 0);
		this.historyIndex --;
		if(this.historyIndex >= 0)
			currentLine = this.history[this.historyIndex];
		return currentLine;
	}


	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * @param index The index to retrieve. Starts at 0.
	 * @returns A string with the registers.
	 */
	protected async getRegistersPromise(index: number): Promise<string> {
		return new Promise<string>(resolve => {
			assert(index >= 0);
			zSocket.send('cpu-history get ' + index, data => {
				if(data.substr(0,5).toLowerCase() == 'error')
					resolve(undefined);
				else
					resolve(data);
			});
		});
	}


	/**
	 * Input a line which was retrieved by 'cpu-history get N' and return the opcodes string.
	 * @param line E.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c"
	 * @return E.g. "E52A785C"
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
	 * @param opcodes E.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c (SP)=a2bf"
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	public getInstruction(line: string): string {
		// Prepare bytes to memory
		const opcodes = this.getOpcodes(line);
		const pc = this.zesaruxRegisters.parsePC(line);
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
	 * Reads the SP content from a given opcode string.
	 * Uses '(SP)=xxxx'  from the input string.
	 * @param line E.g. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c (SP)=a2bf"
	 * @returns The (sp), e.g. 0xA2BF
	 */
	public getSPContent(line: string): number {
		if(this.spIndex < 0) {
			this.spIndex = line.indexOf('(SP)=');
			assert(this.spIndex >= 0);
			this.spIndex += 5;
		}
		const spString = line.substr(this.spIndex, 4);
		const sp = parseInt(spString,16);
		return sp;
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
		return (this.historyIndex >= 0);
	}


	/**
	 * Tests if the opcode is a RET instruction and if it is
	 * conditional it tests if the condition was true.
	 * @param opcodes E.g. "e52a785c"
	 * @param flags The flags.
	 * @returns false=if not RET (or RETI or RETN) or condition of RET cc is not met.
	 */
	public isRetAndExecuted(opcodes: string, flags: number): boolean {
		// Check for RET
		const opcode0 = parseInt(opcodes.substr(0,2), 16);
		if(0xC9 == opcode0)
			return true;

		// Check for RETI or RETN
		if(0xED == opcode0) {
			const opcode1 = parseInt(opcodes.substr(2,2), 16);
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
	 * @param opcodes E.g. "e52a785c"
	 * @param flags The flags.
	 * @returns false=if not CALL or condition of CALL cc is not met.
	 */
	public isCallAndExecuted(opcodes: string, flags: number): boolean {
		// Check for CALL
		const opcode0 = parseInt(opcodes.substr(0,2),16);
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
	 * @param opcodes E.g. "e52a785c"
	 * @returns true=if RST
	 */
	public isRst(opcodes: string): boolean {
		// Check for RST
		const opcode0 = parseInt(opcodes.substr(0,2),16);
		return this.isRstOpcode(opcode0);
	}


	/**
	 * Returns the RST address. Note: It is not checked if the opcode is
	 * really a RST instruction.
	 * @param opcodes A strign of opcodes. Length: at least 2 characters (1 byte)
	 * @returns E.g. 0x48.
	 */
	public getRstAddress(opcodes: string): number {
		const opcode0 = parseInt(opcodes.substr(0,2),16);
		const mask = ~0b11000111;
		const address = (opcode0 & mask);
		return address;
	}


	/**
	 * Tests if the opcode is a PUSH instruction.
	 * @param opcodes E.g. "e52a785c"
	 * @returns true=if PUSH
	 */
	public isPush(opcodes: string): boolean {
		// Check for PUSH
		const opcode0 = parseInt(opcodes.substr(0,2),16);

		// PUSH qq
		const mask = 0b11001111;
		if((opcode0 & mask) == 0x11000101)
			return true;

		// PUSH IX or IY
		if(opcode0 == 0xDD || opcode0 == 0xFD) {
			const opcode1 = parseInt(opcodes.substr(2,2),16);
			if(opcode1 == 0xE5)
				return true;
		}

		// PUSH nnnn, ZXNext
		if(opcode0 == 0xED) {
			const opcode1 = parseInt(opcodes.substr(2,2),16);
			if(opcode1 == 0x8A)
				return true;
		}

		// No PUSH
		return false;
	}


	/**
	 * Tests if the opcode is a POP instruction.
	 * @param opcodes E.g. "e52a785c"
	 * @returns true=if POP
	 */
	public isPop(opcodes: string): boolean {
		// Check for POP
		const opcode0 = parseInt(opcodes.substr(0,2),16);

		// POP qq
		const mask = 0b11001111;
		if((opcode0 & mask) == 0b11000001)
			return true;

		// POP IX or IY
		if(opcode0 == 0xDD || opcode0 == 0xFD) {
			const opcode1 = parseInt(opcodes.substr(2,2),16);
			if(opcode1 == 0xE1)
				return true;
		}

		// No POP
		return false;
	}


	/**
	 * Returns the pushed value.
	 * @param opcodes E.g. "c5" (PUSH BC), BC being 0x1234
	 * @param line Instruction line, eg. "HL=AB56 BC=1234 DE=..."
	 * @returns 0x1234
	 */
	public getPushedValue(opcodes: string, line: string): number {
		// Check for PUSH
		const opcode0 = parseInt(opcodes.substr(0,2),16);

		let value;
		switch(opcode0) {
			case 0xC5:	// PUSH BC
				value = this.zesaruxRegisters.parseBC(line);
				break;
			case 0xD5:	// PUSH DE
				value = this.zesaruxRegisters.parseDE(line);
				break;
			case 0xE5:	// PUSH HL
				value = this.zesaruxRegisters.parseHL(line);
				break;
			case 0xF5:	// PUSH AF
				value = this.zesaruxRegisters.parseAF(line);
				break;

			case 0xDD:
			case 0xFD:
				{
					const opcode1 = parseInt(opcodes.substr(2,2),16);
					if(opcode1 == 0xE5) {
						if(opcode0 == 0xDD)
							value = this.zesaruxRegisters.parseIX(line);	// PUSH IX
						else
							value = this.zesaruxRegisters.parseIY(line);	// PUSH IY
					}
				}
				break;

			case 0xED:
				{
					const opcode1 = parseInt(opcodes.substr(2,2),16);
					if(opcode1 == 0x8A) {
						const addrStr = opcodes.substr(4);
						value = parseInt(addrStr,16);	// BIG endian
					}
				}
				break;
		}

		return value;
	}


	/**
	 * Parses a string with a hex address. The address is little endian format.
	 * @param littleEndianAddress E.g. "CAD9"
	 * @returns E.g. 0xD9CA
	 */
	public parse16Address(littleEndianAddress: string): number {
		const lowByte = parseInt(littleEndianAddress.substr(0,2),16);
		const highByte = parseInt(littleEndianAddress.substr(2,2),16);
		const addr = lowByte + (highByte<<8);
		return addr;
	}

	/**
	 * Returns the previous SP value. Check all direct changes (e.g. inc sp) to SP.
	 * Does not check CALL/RET/RST/PUSH and POP.
	 * For LD SP,(nnnn) undefinedis returned otherwise a real number.
	 * @param opcodes E.g. "e52a785c"
	 * @param sp The SP value.
	 * @param line The complete history line, eg. "PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c (SP)=a2bf".
	 * @return The previous SP value or undefined if unknown.
	 */
	public calcDirectSpChanges(opcodes: string, sp: number, line: string): number|undefined {
		let expectedSp: number|undefined = sp;
		const opcode0 = parseInt(opcodes.substr(0,2),16);

		switch(opcode0) {
			case 0x31:	// LD SP,nnnn
				const addr = opcodes.substr(2,4);
				expectedSp = this.parse16Address(addr);
				break;

			case 0x33:	// INC SP
				expectedSp ++;
				break;

			case 0x3B:	// DEC SP
				expectedSp --;
				break;

			case 0xF9:	// LD SP,HL
				// Get HL
				const hl = this.zesaruxRegisters.parseHL(line);
				expectedSp = hl;
				break;

			case 0xED:
				{
					const opcode1 = parseInt(opcodes.substr(2,2),16);
					if(opcode1 == 0x7B) {
						// LD SP,(nnnn)
						expectedSp = undefined;
					}
				}
				break;

			case 0xDD:
				{
					const opcode1 = parseInt(opcodes.substr(2,2),16);
					if(opcode1 == 0xF9) {
						// LD SP,IX
						const ix = this.zesaruxRegisters.parseIX(line);
						expectedSp = ix;
					}
				}
				break;

			case 0xFD:
				{
					const opcode1 = parseInt(opcodes.substr(2,2),16);
					if(opcode1 == 0xF9) {
						// LD SP,IY
						const iy = this.zesaruxRegisters.parseIY(line);
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
	 * @returns true if "CALL" or "CALL cc". Does nto matter if call was executed or not.
	 */
	public isCallOpcode(opcode0: number): boolean {
		// Check for CALL
		if(0xCD == opcode0)
			return true;

		// Now check for CALL cc
		const mask = 0b11000111;
		if((opcode0 & mask) == 0b11000100)
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
		const mask = 0b11000111;
		if((opcode0 & mask) == 0b11000111)
			return true;

		// No RST
		return false;
	}

}

