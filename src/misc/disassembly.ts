import {BaseMemory} from "../disassembler/basememory";
import {Opcode} from "../disassembler/opcode";
import {Format} from "../disassembler/format";


/**
 * This class allows to disassemble data in a very simple way.
 * I.e. beginning with the starting address the opcodes are decoded.
 * Makes use of the Disassembler class.
 */
export class Disassembly {

	/**
	 * Disassembles a given data array.
	 * @param addr The start address of the data.
	 * @param data The data to disassemble. All data here is interpreted as code.
	 * @param count Optional. The number of lines to decode.
	 * @returns An array of address/instruction pairs with the disassembly.
	 */
	public static get(addr: number, data: Uint8Array, count?: number): Array<{address: number, instruction: string}> {
		if (count==undefined || count >data.length/4)
			count=data.length/4;	// 4 is the max size of an opcode

		// Copy buffer
		const size=4*count;
		const buffer=new BaseMemory(addr, size);
		for (let i=0; i<size; i++) {
			const value=data[i];
			buffer.setValueAtIndex(i, value);
		}

		// disassemble all lines
		let address=addr;
		const list=new Array<{address: number, instruction: string}>();
		for (let i=0; i<count; i++) {
			// Get opcode
			const opcode=Opcode.getOpcodeAt(buffer, address);
			// disassemble
			const opCodeDescription=opcode.disassemble();
			const instruction=Format.formatDisassembly(undefined /*buffer*/, false, 0, 0 /*12*/, 0 /*5*/, 0 /*8*/, address, opcode.length, opCodeDescription.mnemonic);
			// Add to list
			list.push({address, instruction})
			// Next address
			address+=opcode.length;
		}

		// Pass data
		return list;
	}

}
