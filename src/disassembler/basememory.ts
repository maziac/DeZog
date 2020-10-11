import {Utility} from '../misc/utility';



export const MAX_MEM_SIZE = 0x10000;


export class BaseMemory {
	/// The resulting memory area.
	protected memory: Uint8Array;

	/// The start address.
	protected startAddress: number;

	// The size of the area.
	protected size: number;

	/**
	 * Constructor: Initializes memory.
	 * @param startAddress The start address of the memory area.
	 * @param sizeOrArr The size of the memory area or an Uint8Array.
	 * If array the array is used as is. i.e. it is not copied.
	 */
	constructor(startAddress: number, sizeOrArr: number|Uint8Array) {
		if (typeof sizeOrArr=='number') {
			const size=sizeOrArr as number;
			this.memory=new Uint8Array(size);
		}
		else {
			this.memory=sizeOrArr as Uint8Array;
		}
		this.startAddress=startAddress;
		this.size=this.memory.length;;
	}


	/**
	 * Sets a value at an index.
	 * @param index The index into the memory buffer.
	 * @param value The value for the index.
	 */
	public setValueAtIndex(index: number, value: number) {
		this.memory[index] = value;
	}


	/**
	 * Returns the memory value at address.
	 * @param address The address to retrieve.
	 * @returns It's value.
	 */
	public getValueAt(address: number) {
		address &= (MAX_MEM_SIZE-1);
		let index=address-this.startAddress;
		if (index<0) {
			// wrap around
			//index=MAX_MEM_SIZE+address-this.startAddress;
			index+=MAX_MEM_SIZE;
		}
		Utility.assert(index >= 0, 'getValueAt 1');
		Utility.assert(index < this.size, 'getValueAt 2');
		return this.memory[index];
	}


		/**
	 * Returns the word memory value at address.
	 * @param address The address to retrieve.
	 * @returns It's value.
	 */
	public getWordValueAt(address: number) {
		const word = this.getValueAt(address) + 256*this.getValueAt(address+1);
		return word;
	}


	/**
	 * Returns the word memory value at address in big endian.
	 * @param address The address to retrieve.
	 * @returns It's value.
	 */
	public getBigEndianWordValueAt(address: number) {
		const word = 256*this.getValueAt(address) + this.getValueAt(address+1);
		return word;
	}
}