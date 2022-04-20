import {BaseMemory} from "../disassembler/basememory";
import {Opcode, } from "../disassembler/opcode";
import {Format} from "../disassembler/format";
import {Disassembler} from "../disassembler/disasm";



/**
 * A very simple brute force disassembler.
 * For use in the VARIABLES section.
 */
export class SimpleDisassembly extends Disassembler {

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
		const prevLabelHandler = (Opcode as any).convertToLabelHandler;
		Opcode.setConvertToLabelHandler(undefined as any);	// Without labels
		let address = addr;
		const list = new Array<{address: number, instruction: string}>();
		for (let i = 0; i < count; i++) {
			// Get opcode
			const opcode = Opcode.getOpcodeAt(buffer, address);
			// disassemble
			const opCodeDescription = opcode.disassemble();
			const instruction = Format.formatDisassembly(undefined /*buffer*/, false, 0, 0 /*12*/, 0 /*5*/, 0 /*8*/, address, opcode.length, opCodeDescription.mnemonic);
			// Add to list
			list.push({address, instruction})
			// Next address
			address = (address + opcode.length) & 0xFFFF;
		}
		Opcode.setConvertToLabelHandler(prevLabelHandler);

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
	 * @param count Optional. The number of lines to decode.
	 * @returns An array of address/instruction pairs with the disassembly.
	 */
	public static getDasmMemory(addr: number, data: Uint8Array): Array<{address: number, instruction: string}> {
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
		const prevLabelHandler = (Opcode as any).convertToLabelHandler;
		Opcode.setConvertToLabelHandler(undefined as any);	// Without labels
		const end = addr + size;
		const list = new Array<{address: number, instruction: string}>();
		while (addr < end) {
			const address = addr & 0xFFFF;
			// Get opcode
			const opcode = Opcode.getOpcodeAt(buffer, address);
			// disassemble
			const opCodeDescription = opcode.disassemble();
			const instruction = Format.formatDisassembly(undefined /*buffer*/, false, 0, 0 /*12*/, 0 /*5*/, 0 /*8*/, address, opcode.length, opCodeDescription.mnemonic);
			// Add to list
			list.push({address, instruction})
			// Next address
			addr += opcode.length;
		}
		Opcode.setConvertToLabelHandler(prevLabelHandler);

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
}
