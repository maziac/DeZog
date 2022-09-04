import {BaseMemory} from "../disassembler/basememory";
import {Opcode, } from "../disassembler/opcode";
import {Format} from "../disassembler/format";
import {Utility} from "../misc/utility";



/**
 * A very simple brute force disassembler.
 * For use in the VARIABLES section.
 * Complete static class.
 */
export class SimpleDisassembly  {

	/**
	 * Disassembles a given data array in a very simple way.
	 * I.e. beginning with the starting address the opcodes are decoded.
	 * Decodes a fixed number of lines.
	 * @param addr The start address of the data.
	 * @param data The data to disassemble. All data here is interpreted as code.
	 * @param count The number of lines to decode.
	 * @returns An array of address/instruction pairs with the disassembly.
	 */
	public static getLines(addr: number, data: Uint8Array, count: number): Array<{address: number, instruction: string}> {
		if (count == undefined || count > data.length / 4)
			count = data.length / 4;	// 4 is the max size of an opcode

		// Copy buffer
		const size = 4 * count;
		const buffer = new BaseMemory(addr, size);
		for (let i = 0; i < size; i++) {
			const value = data[i];
			buffer.setValueAtIndex(i, value);
		}

		// Disassemble all lines
		let address = addr;
		const list = new Array<{address: number, instruction: string}>();
		for (let i = 0; i < count; i++) {
			// Get opcode
			const opcode = Opcode.getOpcodeAt(buffer, address);
			// disassemble
			opcode.disassembleOpcode(addr64k => undefined as any);
			const instruction = Format.formatDisassembly(undefined /*buffer*/, false, 0, 0 /*12*/, 0 /*5*/, 0 /*8*/, address, opcode.length, opcode.disassembledText, undefined);
			// Add to list
			list.push({address, instruction})
			// Next address
			address = (address + opcode.length) & 0xFFFF;
		}

		// Pass data
		return list;
	}


	/**
	 * Disassembles a given data array in a very simple way.
	 * I.e. beginning with the starting address the opcodes are decoded.
	 * Decodes a fixed area. The number of lines may vary.
	 * Because it is not known beforehand how the last byte will be disassembled
	 * it is required that 3 more bytes are present in the 'data' array.
	 * @param addr The start address of the data.
	 * @param data The data to disassemble. All data here is interpreted as code.
	 * @returns An array of address/instruction pairs with the disassembly.
	 */
	public static getDasmMemory(addr: number, data: Uint8Array): Array<{address: number, size: number, instruction: string}> {
		// Safety check
		const size = data.length - 3;
		if (size <= 0)
			return [];
		// Copy buffer
		const buffer = new BaseMemory(addr, data.length);
		for (let i = 0; i < data.length; i++) {
			const value = data[i];
			buffer.setValueAtIndex(i, value);
		}

		// Disassemble all lines
		const end = addr + size;
		const list = new Array<{address: number, size: number, instruction: string}>();
		while (addr < end) {
			const address = addr & 0xFFFF;
			// Get opcode
			const opcode = Opcode.getOpcodeAt(buffer, address);
			// disassemble
			opcode.disassembleOpcode(addr64k => undefined as any);
			const instruction = Format.formatDisassembly(undefined /*buffer*/, false, 0, 0 /*12*/, 0 /*5*/, 0 /*8*/, address, opcode.length, opcode.disassembledText, undefined);
			// Add to list
			list.push({address, size: opcode.length, instruction})
			// Next address
			addr += opcode.length;
		}
		// Pass data
		return list;
	}


	/**
	 * Returns the instruction (disassembly) at given address. Just one line.
	 * @param addr The start address of the data.
	 * @param data The data to disassemble. Must be at least 4 bytes.
	 * @returns A string, e.g. "LD A,(HL)".
	 */
	public static getInstruction(addr: number, data: Uint8Array): string {
		const disArray = this.getLines(addr, data, 1);
		return disArray[0].instruction;
	}


	/**
	 * Get the disassembly of a memory area.
	 * Output is e.g. 'C000  3E 05 LD A,5'
	 * @param addr The start address of the data.
	 * @param data The data to disassemble. All data here is interpreted as code.
	 */
	public static getInstructionDisassembly(addr: number, data: Uint8Array): string {
		let text = '';
		const instructionOffset = 16;
		const dasmArray = SimpleDisassembly.getDasmMemory(addr, data);
		for (const addrInstr of dasmArray) {
			text += Utility.getHexString(addrInstr.address, 4);
			// The bytes representing the opcode
			let bytes = '';
			const offset = addrInstr.address - addr;
			for (let i = 0; i < addrInstr.size; i++) {
				bytes += ' ' + Utility.getHexString(data[offset + i], 2);
			}
			bytes += '  ';
			bytes = bytes.padEnd(instructionOffset, ' ');
			// Add instruction
			text += bytes + addrInstr.instruction.trimEnd() + '\n';
		}
		return text;
	}


	/**
	 * Get the disassembly as data block.
	 * Output is e.g. 'C000  56 78 FA'
	 * @param addr The start address of the data.
	 * @param data The data to disassemble. All data here is interpreted as code.
	 * @param plusAscii true to add the data as comment in ascii.
	 * @param blockLength How many data values are written per line.
	 */
	public static getDataDisassembly(addr: number, data: Uint8Array, plusAscii = false, blockLength = 16): string {
		let text = '';
		let precNewLine = '';
		let ascii = '';
		const len = data.length;
		for (let i = 0; i < len; i++) {
			// Print address
			if (i % blockLength == 0) {
				// Add to previous
				if (ascii) {
					text += " ; '" + ascii + "'";
					ascii = '';
				}
				// Add address
				text += precNewLine + Utility.getHexString((addr+i)&0xFFFF, 4);
			}
			// Print value
			const value = data[i];
			text += ' ' + Utility.getHexString(value, 2);
			// Ascii?
			if (plusAscii)
				ascii += String.fromCharCode(value);
			// Next
			precNewLine = '\n';
		}
		if (ascii)
			text += " ; '" + ascii + "'";
		text += '\n';
		return text;
	}
}
