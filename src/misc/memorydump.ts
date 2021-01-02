import { Utility } from './utility';


/// The boundary at which the memory dumps should be shown.
const MEM_DUMP_BOUNDARY = 16;


/// One address range (block) the user wants to show.
export interface MemBlock {
	/// The address to start show dump values. (Note: the data is already shown
	/// earlier at a mod 16 boundary.)
	address:	number;

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
	public address:	number;

	/// The size of the complete memory dump.
	public size: number;

	/// The included memory blocks.
	public memBlocks: Array<MemBlock>;

	/// The (current) memory data.
	/// The data is stored as one continuous hex string.
	public data: Uint8Array|undefined;
	/// The previous memory data (used to check which values have changed).
	/// Undefined if not used.
	public prevData: Uint8Array|undefined;

	/// Title shown as table caption, can be omitted.
	public title: string|undefined;

	/// Constructor.
	constructor(address: number, size: number, memBlocks: Array<MemBlock>, title: string|undefined = undefined) {
		this.address = address;
		this.size = size;
		this.memBlocks=memBlocks;
		// For the first time no data or prevData is available
		this.data=undefined;
		this.prevData=undefined;
		this.title = title;
	}


	/**
	 * Searches all memory blocks of a meta block.
	 * If address is in range of one memory block it returns true.
	 * Is used to show the cells in the memory dump view in bold.
	 * Is public for testing puposes only.
	 * @param address The address to check.
	 * @returns true if in range of any block.
	 */
	public isInRange(address: number): boolean {
		// Seach all wrapped memory blocks.
		for(let memBlock of this.memBlocks) {
			if(address >= memBlock.address && address < memBlock.address+memBlock.size)
				return true;
		}
		// nothing found
		return false;
	}
}


/**
 * A memory dump object.
 * An array of meta blocks.
 */
export class MemoryDump {

	public metaBlocks = Array<MetaBlock>();	///< An array with all meta blocks which contain the mem dumps.


	/**
	 * Remove all memory blocks.
	 */
	public clearBlocks() {
		this.metaBlocks.length = 0;
	}


	/**
	 * Adds a new memory block to display.
	 * Memory blocks are ordered, i.e. the 'memDumps' array is ordered from
	 * low to high (the start addresses).
	 * @param startAddress The address of the memory block.
	 * @param size The size of the memory block.
	 * @param title An optional title for the memory block (shown as table header).
	 */
	public addBlock(startAddress: number, size: number, title: string|undefined=undefined) {
		// Create memory block
		const memBlock={address: startAddress, size: size, data: []};
		let bigBlock;
		// Check for size > 0xFFFF
		if (size<=0xFFFF-2*(2*MEM_DUMP_BOUNDARY-1)) {
			// Create one meta block for the memory block
			const boundAddr=Utility.getBoundary(memBlock.address-MEM_DUMP_BOUNDARY, MEM_DUMP_BOUNDARY);
			const boundSize=Utility.getBoundary(memBlock.address+memBlock.size-1, MEM_DUMP_BOUNDARY)+2*MEM_DUMP_BOUNDARY-boundAddr;
			bigBlock=new MetaBlock(boundAddr, boundSize, [memBlock], title);
		}
		else {
			const boundAddr=Utility.getBoundary(memBlock.address, MEM_DUMP_BOUNDARY);
			const boundEnd=Utility.getBoundary(memBlock.address+memBlock.size-1, MEM_DUMP_BOUNDARY)+MEM_DUMP_BOUNDARY;
			let boundSize=boundEnd-boundAddr+1;
			if (boundSize>0xFFFF) {
				boundSize=Math.trunc(0xFFFF/MEM_DUMP_BOUNDARY)*MEM_DUMP_BOUNDARY;
				memBlock.size=boundAddr+boundSize-startAddress;
			}
			bigBlock=new MetaBlock(boundAddr, boundSize, [memBlock], title);
		}
		this.metaBlocks.push(bigBlock);
	}


	/**
	 * A block is changed instead to create a new block.
	 * This preserves the previous data if new range is the same or at least overlaps
	 * with the old range.
	 * @param blockIndex The block to change.
	 * @param startAddress The address of the memory block.
	 * @param size The size of the memory block.
	 */
	public changeBlock(blockIndex: number, startAddress: number, size: number, title: string|undefined=undefined) {
		Utility.assert(blockIndex<this.metaBlocks.length);

		const memBlock={address: startAddress, size: size, data: []};
		let bigBlock;
		let boundAddr;
		let boundSize;
		// Check for size > 0xFFFF
		if (size<=0xFFFF-2*(2*MEM_DUMP_BOUNDARY-1)) {
			// Create one meta block for the memory block
			boundAddr=Utility.getBoundary(memBlock.address-MEM_DUMP_BOUNDARY, MEM_DUMP_BOUNDARY);
			boundSize=Utility.getBoundary(memBlock.address+memBlock.size-1, MEM_DUMP_BOUNDARY)+2*MEM_DUMP_BOUNDARY-boundAddr;
		}
		else {
			boundAddr=Utility.getBoundary(memBlock.address, MEM_DUMP_BOUNDARY);
			const boundEnd=Utility.getBoundary(memBlock.address+memBlock.size-1, MEM_DUMP_BOUNDARY)+MEM_DUMP_BOUNDARY;
			let boundSize=boundEnd-boundAddr+1;
			if (boundSize>0xFFFF) {
				boundSize=Math.trunc(0xFFFF/MEM_DUMP_BOUNDARY)*MEM_DUMP_BOUNDARY;
				memBlock.size=boundAddr+boundSize-startAddress;
			}
		}

		// Compare sizes
		const metaBlock=this.metaBlocks[blockIndex];
		if (metaBlock.address==boundAddr
			&&metaBlock.size==boundSize) {
			// Range is the same, change only memblock
			metaBlock.memBlocks=[memBlock];
			return;
		}

		// Otherwise create new block
		bigBlock=new MetaBlock(boundAddr, boundSize, [memBlock], title);

		// And exchange with current one
		this.metaBlocks[blockIndex]=bigBlock;
	}


	/**
	 * Returns the value of an address.
	 * Searches all meta blocks and returns the value of the first matching one.
	 * @param address The address to look up.
	 * @return The value at address or NaN if nothing could be found.
	 */
	public getValueFor(address: number): number {
		for (let mb of this.metaBlocks) {
			const index=address-mb.address;
			const data=mb.data;
			if (data&&index>=0&&index<data.length) {
				return data[index];
			}
		}
		// Nothing found
		return NaN;
	}


	/**
	 * Returns the previous value of an address.
	 * Searches all meta blocks and returns the value of the first matching one.
	 * @param address The address to look up.
	 * @return The value at address or NaN if nothing could be found or no prev values are used.
	 */
	public getPrevValueFor(address: number): number {
		for (let mb of this.metaBlocks) {
			const index=address-mb.address;
			if (mb.data&&index>=0&&index<mb.data.length) {
				const data=mb.prevData;
				if (!data)
					return NaN;
				return data[index];
			}
		}
		// Nothing found
		return NaN;
	}


	/**
	 * Sets the value for all matching addresses in the metablocks.
	 * @param address The address which value should be changed.
	 * @param value The new value.
	 */
	public setValueFor(address: number, value: number) {
		for(let mb of this.metaBlocks) {
			const index = address - mb.address;
			const data = mb.data;
			if(data && index >= 0 && index < data.length)
				data[index] = value;
		}
	}


	/**
	 * Merges the address ranges if they are near to each other.
ranges.
	 * Note: During merging the title of one of the blocks is lost. But they are anyway not used in this case.
	 */
	public mergeBlocks() {
		// Sort the metablocks according address
		this.metaBlocks.sort((a, b) => a.address - b.address);

		// Now merge blocks
		const biggerBlocks = this.metaBlocks;
		if(biggerBlocks.length >= 2) {
			let prevBigBlock = biggerBlocks[biggerBlocks.length-1];
			for(let i=biggerBlocks.length-2; i>=0; i--) {
				// get current block
				const curBigBlock = biggerBlocks[i];
				// compare address ranges (Note: the block's addresses are already ordered)
				const prevAddr = prevBigBlock.address;
				if(prevAddr <= curBigBlock.address+curBigBlock.size+1+MEM_DUMP_BOUNDARY) {
					// There is max one line between the blocks, merge:
					// Check which end address is bigger.
					const prevEndAddr = prevAddr + prevBigBlock.size;
					if(prevEndAddr > curBigBlock.address+curBigBlock.size) {
						// Increase end address
						curBigBlock.size = prevEndAddr - curBigBlock.address;
					}
					// Add block to metablock
					curBigBlock.memBlocks.push(...prevBigBlock.memBlocks);
					// Remove previous metablock
					biggerBlocks.splice(i+1,1);
				}
				// next
				prevBigBlock = curBigBlock;
			}
		}

		// Store
		this.metaBlocks = biggerBlocks;
	}

}
