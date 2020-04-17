import { readFileSync } from 'fs';
import { BaseMemory, MAX_MEM_SIZE } from './basememory';



/// Classification of memory addresses.
export enum MemAttribute {
	/// Unassigned memory
	UNUSED = 0,
	/// Unknown area (code or data)
	ASSIGNED = 0x01,
	/// Code area
	CODE = 0x02,
	/// First byte of an opcode
	CODE_FIRST = 0x04,
	/// It is a stop code, e.g. a 'RET' or an unconditional 'JP nn'.
	/// All bytes of an opcode will get this attribute.
	//CODE_STOP = 0x08,
	/// Data area
	DATA = 0x10
}

/**
 * Class to hold and access the memory.
 */
export class Memory extends BaseMemory {

	/// An attribute field for the memory.
	protected memoryAttr = new Array<MemAttribute>(MAX_MEM_SIZE);


	/**
	 * Constructor: Initializes memory.
	 */
 	constructor () {
		super(0, MAX_MEM_SIZE);
		// Init memory
		for(let i=0; i<MAX_MEM_SIZE; i++) {
			this.memory[i] = 0;
			this.memoryAttr[i] = MemAttribute.UNUSED;
		}
	}


	/**
	 * Define the memory area to disassemble.
	 * @param origin The start address of the memory area.
	 * @param memory The memory area.
	 */
	public setMemory(origin:number, memory: Uint8Array) {
		const size = memory.length;
		for(let i=0; i<size; i++) {
			const addr = (origin+i) & (MAX_MEM_SIZE-1);
			this.memory[addr] = memory[i];
			this.memoryAttr[addr] |= MemAttribute.ASSIGNED;
		}
	}


	/**
	 * Reads a memory area as binary from a file.
	 * @param origin The start address of the memory area.
	 * @param path The file path to a binary file.
	 */
	public readBinFile(origin: number, path: string) {
		let bin = readFileSync(path);
		this.setMemory(origin, bin);
	}


	/**
	 * Return memory attribute.
	 * @param address At address
	 * @returns The memory attribute.
	 */
	public getAttributeAt(address: number): MemAttribute {
		const attr = this.memoryAttr[address++];
		return attr;
	}


	/**
	 * Adds (ORs) a memory attribute for an address range.
	 * @param address The memory address
	 * @param length The size of the memory area to change.
	 * @param attr The attribute to set (e.g. CODE or DATA)
	 */
	public addAttributeAt(address: number, length: number, attr: MemAttribute) {
		for(let i=0; i<length; i++)
			this.memoryAttr[address++] |= attr;
	}

	/**
	 * Sets a memory attribute for an address range.
	 * @param address The memory address
	 * @param length The size of the memory area to change.
	 * @param attr The attribute to set (e.g. CODE or DATA)
	 */
	public setAttributesAt(address: number, length: number, attr: MemAttribute) {
		for(let i=0; i<length; i++)
			this.memoryAttr[address++] = attr;
	}


	/**
	 * Sets all attributes in the given address range to ASSIGNED if they
	 * are not UNUSED. I.e. all attributes like CODE or DATA are removed
	 * but UNUSED areas are kept UNUSED.
	 * @param address The memory address
	 * @param length The size of the memory area to change.
	 * @param attr The attribute to set (e.g. CODE or DATA)
	 */
	public clrAssignedAttributesAt(address: number, length: number) {
		for(let i=0; i<length; i++) {
			if(this.memoryAttr[address] != MemAttribute.UNUSED)
				this.memoryAttr[address] = MemAttribute.ASSIGNED;
			address	++;
		}
	}
}

