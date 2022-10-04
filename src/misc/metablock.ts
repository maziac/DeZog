import {Utility} from "./utility";

/// One address range (block) the user wants to show.
interface MemBlock {
	/// The address to start show dump values. (Note: the data is already shown
	/// earlier at a mod 16 boundary.)
	address: number;

	/// The size of the memory dump.
	size: number;
}


/// One meta block. That is a block that encapsulates AddressRanges.
/// The meta block always starts at mod 16.
/// Usually it includes only one AddressRange but it can be more if the address
/// ranges are very near to each other. They can even overlap.
export class MetaBlock {
	/// The address to start show dump values.
	/// This starts at a mod 16 boundary.
	public address: number;

	/// The size of the complete memory dump.
	public size: number;

	/// The included memory blocks.
	public memBlocks: Array<MemBlock>;

	/// The (current) memory data.
	/// The data is stored as one continuous Uint8Array.
	public data: Uint8Array | undefined;
	/// The previous memory data (used to check which values have changed).
	/// Undefined if not used.
	public prevData: Uint8Array | undefined;

	/// Title shown as table caption, can be omitted.
	public title: string | undefined;

	/// Constructor.
	constructor(address: number, size: number, memBlocks: Array<MemBlock>, title: string | undefined = undefined) {
		this.address = address;
		this.size = size;
		this.memBlocks = memBlocks;
		// For the first time no data or prevData is available
		this.data = undefined;
		this.prevData = undefined;
		this.title = title;
	}


	/** Copies the MetaBlock object (structure and contents) to a new MetaBlock object.
	 * Deep copy.
	 * @returns a new MetaBlock object.
	 */
	public clone(): MetaBlock {
		// Copy memblocks
		const memBlocks = new Array<MemBlock>();
		for (const mb of this.memBlocks)
			memBlocks.push({...mb});
		const clone = new MetaBlock(this.address, this.size, memBlocks, this.title);

		// Copy data
		if(this.data)
			clone.data = new Uint8Array(this.data);

		return clone;
	}


	/**
	 * Searches all memory blocks of a meta block.
	 * If address is in range of one memory block it returns true.
	 * Is used to show the cells in the memory dump view in bold.
	 * @param address The address to check.
	 * @returns true if in range of any block.
	 */
	public isInRange(address: number): boolean {
		// Search all wrapped memory blocks.
		for (let memBlock of this.memBlocks) {
			if (address >= memBlock.address && address < memBlock.address + memBlock.size)
				return true;
		}
		// nothing found
		return false;
	}


	/** Returns all changed data (compared to prevData).
	 * Works on all data. I.e. also the data that is not in the memBlocks
	 * (i.e. not shown in bold).
	 * @returns An array of address/value triples with the changed
	 * [address, value].
	 */
	public getChangedValues() {
		if (!this.data)
			return [];	// No data yet
		const addr = this.address;
		const addrValues: any = [];
		if (this.prevData) {
			// Compare current with previous data
			const len: number = this.data.length;
			Utility.assert(len == this.prevData.length);
			for (let i = 0; i < len; i++) {
				if (this.data[i] != this.prevData[i]) {
					addrValues.push([
						addr + i,			// Address
						this.data[i]
					]);
				}
			}
		}
		else {
			// No previous data yet, i.e. everything changed.
			this.data.forEach((val, index) => {
				addrValues.push([addr + index, val]);
			});
		}
		return addrValues;
	}
}
