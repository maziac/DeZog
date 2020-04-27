import {BaseMemory} from "../disassembler/basememory";
import {Opcode, Opcodes} from "../disassembler/opcode";
import {Format} from "../disassembler/format";
import {Disassembler} from "../disassembler/disasm";
import {Utility} from './utility';
import {Settings} from '../settings';



/// The filename used for the temporary disassembly. ('./.tmp/disasm.list')
const TmpDasmFileName='disasm.asm';



/**
 * This class capsulates a few disassembling functions.
 */
export class DisassemblyClass extends Disassembler {

	/**
	 * Disassembles a given data array in a very simple way.
	 * I.e. beginning with the starting address the opcodes are decoded.
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


	/**
	 * Creates the singleton.
	 */
	public static createDisassemblyInstance() {
		Disassembly=new DisassemblyClass();
		// Configure disassembler.
		Disassembly.funcAssignLabels=(addr: number) => {
			return 'L'+Utility.getHexString(addr, 4);
		};
		// Restore 'rst 8' opcode
		Opcodes[0xCF]=new Opcode(0xCF, "RST %s");
		// Setup configuration.
		if (Settings.launch.disassemblerArgs.esxdosRst) {
			// Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
		}
	}




	/**
	 * Returns the file path of the temporary disassembly file.
	 * @returns The relative file path, e.g. ".tmp/disasm.asm".
	 */
	public static getAbsFilePath(): string {
		const relPath=Utility.getRelTmpFilePath(TmpDasmFileName);
		const absPath=Utility.getAbsFilePath(relPath);
		return absPath;
	}


	// Map with the address to line number relationship and vice versa.
	protected addrLineMap=new Map<number, number>();
	protected lineAddrArray=new Array<number|undefined>();

	/**
	 * Initializes the memory with the data at the given addresses.
	 * Additionally puts the addresses in the address queue.
	 */
	public initWithCodeAdresses(addresses: number[], mem: Array<{address: number, data: Uint8Array}>) {
		// Init
		this.initLabels();
		this.addrLineMap=new Map<number, number>();
		this.lineAddrArray=new Array<number|undefined>();
		// Write new memory
		this.memory.clrAssignedAttributesAt(0x0000, 0x10000);	// Clear all memory
		for (const block of mem)
			this.setMemory(block.address, block.data);
		this.setAddressQueue(addresses);
	}


	/**
	 * Disassembles the memory.
	 * Additionally keeps the address/line locations.
	 */
	public disassemble() {
		// No comments
		this.disableCommentsInDisassembly=true;
		// Disassemble
		super.disassemble();
		// Get address/line relationship.
		let lineNr=0;
		this.addrLineMap.clear();
		this.lineAddrArray.length=0;
		for (const line of this.disassembledLines) {
			const address=parseInt(line, 16);
			if (!isNaN(address)) {
				this.addrLineMap.set(address, lineNr);
				while (this.lineAddrArray.length<=lineNr)
					this.lineAddrArray.push(address);
			}
			lineNr++;
		}
	}


	/**
	 * Returns the line number for a given address.
	 * @param address The address.
	 * @returns The corresponding line number (beginning at 0) or undefined if no such line exists.
	 */
	public getLineForAddress(address: number): number|undefined {
		return this.addrLineMap.get(address);
	}


	/**
	 * Returns the line number for a given address.
	 * @param addresses An array with addresses.
	 * @returns An array with corresponding lines.
	 */
	public getLinesForAddresses(addresses: Set<number>): number[] {
		const lines=new Array<number>();
		const map=this.addrLineMap;
		// Check whichever has lower number of elements
		if (addresses.size>map.size) {
			// Loop over map
			map.forEach((value, key) => {
				if (addresses.has(key))
					lines.push(value);
			});
		}
		else {
			// Loop over addresses
			for (const address of addresses) {
				const line=map.get(address);
				if (line)
					lines.push(line);
			}
		}
		return lines;
	}


	/**
	 * Returns the address for a given line number.
	 * @param lineNr The line number starting at 0.
	 * @returns The address or -1 if none exists for the line.
	 */
	public getAddressForLine(lineNr: number): number|undefined {
		if (lineNr>=this.lineAddrArray.length)
			return -1;
		return this.lineAddrArray[lineNr];
	}



}


export let Disassembly;
