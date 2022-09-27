
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
	/// The data is stored as one continuous hex string.
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
		for (let memBlock of this.memBlocks) {
			if (address >= memBlock.address && address < memBlock.address + memBlock.size)
				return true;
		}
		// nothing found
		return false;
	}
}
