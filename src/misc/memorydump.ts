import {MetaBlock} from './metablock';
import {Utility} from './utility';


/// The boundary at which the memory dumps should be shown.
const MEM_DUMP_BOUNDARY = 16;


/** The struct that is returned on a search.
 */
export interface FoundAddresses {
	// The length of the search string. I.e. the length to highlight for
	// every addresses in addresses.
	length: number,
	// The found start addresses.
	addresses: number[]
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
	 * @param size The size of the memory block in bytes.
	 * @param title An optional title for the memory block (shown as table header).
	 */
	public addBlock(startAddress: number, size: number, title: string | undefined = undefined) {
		// Create memory block
		const memBlock = {address: startAddress, size: size, data: []};
		let bigBlock;
		// Check for size > 0xFFFF
		if (size <= 0xFFFF - 2 * (2 * MEM_DUMP_BOUNDARY - 1)) {
			// Create one meta block for the memory block
			const boundAddr = Utility.getBoundary(memBlock.address - MEM_DUMP_BOUNDARY, MEM_DUMP_BOUNDARY);
			const boundSize = Utility.getBoundary(memBlock.address + memBlock.size - 1, MEM_DUMP_BOUNDARY) + 2 * MEM_DUMP_BOUNDARY - boundAddr;
			bigBlock = new MetaBlock(boundAddr, boundSize, [memBlock], title);
		}
		else {
			const boundAddr = Utility.getBoundary(memBlock.address, MEM_DUMP_BOUNDARY);
			const boundEnd = Utility.getBoundary(memBlock.address + memBlock.size - 1, MEM_DUMP_BOUNDARY) + MEM_DUMP_BOUNDARY;
			let boundSize = boundEnd - boundAddr + 1;
			if (boundSize > 0xFFFF) {
				boundSize = Math.trunc(0xFFFF / MEM_DUMP_BOUNDARY) * MEM_DUMP_BOUNDARY;
				memBlock.size = boundAddr + boundSize - startAddress;
			}
			bigBlock = new MetaBlock(boundAddr, boundSize, [memBlock], title);
		}
		this.metaBlocks.push(bigBlock);
	}


	/**
	 * Adds a new memory block to display.
	 * Memory blocks are ordered, i.e. the 'memDumps' array is ordered from
	 * low to high (the start addresses).
	 * @param startAddress The address of the memory block.
	 * @param size The size of the memory block in bytes.
	 * @param title An optional title for the memory block (shown as table header).
	 */
	public addBlockWithoutBoundary(startAddress: number, size: number, title: string | undefined = undefined) {
		// Create memory block
		if (size > 0x10000)
			size = 0x10000;
		const memBlock = {address: startAddress, size: size, data: []};
		let bigBlock;
		// Create one meta block for the memory block
		bigBlock = new MetaBlock(startAddress, size, [memBlock], title);
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
	public changeBlock(blockIndex: number, startAddress: number, size: number, title: string | undefined = undefined) {
		Utility.assert(blockIndex < this.metaBlocks.length);

		const memBlock = {address: startAddress, size: size, data: []};
		let bigBlock;
		let boundAddr;
		let boundSize;
		// Check for size > 0xFFFF
		if (size <= 0xFFFF - 2 * (2 * MEM_DUMP_BOUNDARY - 1)) {
			// Create one meta block for the memory block
			boundAddr = Utility.getBoundary(memBlock.address - MEM_DUMP_BOUNDARY, MEM_DUMP_BOUNDARY);
			boundSize = Utility.getBoundary(memBlock.address + memBlock.size - 1, MEM_DUMP_BOUNDARY) + 2 * MEM_DUMP_BOUNDARY - boundAddr;
		}
		else {
			boundAddr = Utility.getBoundary(memBlock.address, MEM_DUMP_BOUNDARY);
			const boundEnd = Utility.getBoundary(memBlock.address + memBlock.size - 1, MEM_DUMP_BOUNDARY) + MEM_DUMP_BOUNDARY;
			//let boundSize = boundEnd - boundAddr + 1;
			boundSize = boundEnd - boundAddr + 1;	// The previous assignment was probably wrong.
			if (boundSize > 0xFFFF) {
				boundSize = Math.trunc(0xFFFF / MEM_DUMP_BOUNDARY) * MEM_DUMP_BOUNDARY;
				memBlock.size = boundAddr + boundSize - startAddress;
			}
		}

		// Compare sizes
		const metaBlock = this.metaBlocks[blockIndex];
		if (metaBlock.address == boundAddr
			&& metaBlock.size == boundSize) {
			// Range is the same, change only memblock
			metaBlock.memBlocks = [memBlock];
			return;
		}

		// Otherwise create new block
		bigBlock = new MetaBlock(boundAddr, boundSize, [memBlock], title);

		// And exchange with current one
		this.metaBlocks[blockIndex] = bigBlock;
	}


	/**
	 * Returns the value of an address.
	 * Searches all meta blocks and returns the value of the first matching one.
	 * @param address The address to look up.
	 * @return The value at address or NaN if nothing could be found.
	 */
	public getValueFor(address: number): number {
		for (let mb of this.metaBlocks) {
			const index = address - mb.address;
			const data = mb.data;
			if (data && index >= 0 && index < data.length) {
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
			const index = address - mb.address;
			if (mb.data && index >= 0 && index < mb.data.length) {
				const data = mb.prevData;
				if (!data)
					return NaN;
				return data[index];
			}
		}
		// Nothing found
		return NaN;
	}


	/**
	 * Returns the word value of an address.
	 * Searches all meta blocks and returns the value of the first matching one.
	 * @param address The address to look up.
	 * @param littleEndian or big endian.
	 * @return The value at address or NaN if nothing could be found.
	 */
	public getWordValueFor(address: number, littleEndian: boolean): number {
		for (let mb of this.metaBlocks) {
			const index = address - mb.address;
			const data = mb.data;
			if (data && index >= 0 && index < data.length) {
				if (index + 1 >= data.length)
					return NaN;
				return Utility.getUintFromMemory(data, index, 2, littleEndian)
			}
		}
		// Nothing found
		return NaN;
	}


	/**
	 * Returns the previous word value of an address.
	 * Searches all meta blocks and returns the value of the first matching one.
	 * @param address The address to look up.
	 * @param littleEndian or big endian.
	 * @return The value at address or NaN if nothing could be found or no prev values are used.
	 */
	public getPrevWordValueFor(address: number, littleEndian: boolean): number {
		for (let mb of this.metaBlocks) {
			const index = address - mb.address;
			if (mb.data && index >= 0 && index < mb.data.length) {
				const data = mb.prevData;
				if (!data)
					return NaN;
				if (index + 1 >= data.length)
					return NaN;
				return Utility.getUintFromMemory(data, index, 2, littleEndian)
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
		for (let mb of this.metaBlocks) {
			const index = address - mb.address;
			const data = mb.data;
			if (data && index >= 0 && index < data.length)
				data[index] = value;
		}
	}


	/**
	 * Sets the word value for all matching addresses in the metablocks.
	 * @param address The address which value should be changed.
	 * @param value The new value.
	 * @param littleEndian or big endian.
	 */
	public setWordValueFor(address: number, value: number, littleEndian: boolean) {
		for (let mb of this.metaBlocks) {
			const index = address - mb.address;
			const data = mb.data;
			if (data && index >= 0 && index + 1 < data.length) {
				if (littleEndian) {
					data[index] = value & 0xFF;
					data[index + 1] = value >> 8;
				}
				else {
					// Big endian
					data[index + 1] = value & 0xFF;
					data[index] = value >> 8;
				}
			}
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
		if (biggerBlocks.length >= 2) {
			let prevBigBlock = biggerBlocks[biggerBlocks.length - 1];
			for (let i = biggerBlocks.length - 2; i >= 0; i--) {
				// get current block
				const curBigBlock = biggerBlocks[i];
				// compare address ranges (Note: the block's addresses are already ordered)
				const prevAddr = prevBigBlock.address;
				if (prevAddr <= curBigBlock.address + curBigBlock.size + 1 + MEM_DUMP_BOUNDARY) {
					// There is max one line between the blocks, merge:
					// Check which end address is bigger.
					const prevEndAddr = prevAddr + prevBigBlock.size;
					if (prevEndAddr > curBigBlock.address + curBigBlock.size) {
						// Increase end address
						curBigBlock.size = prevEndAddr - curBigBlock.address;
					}
					// Add block to metablock
					curBigBlock.memBlocks.push(...prevBigBlock.memBlocks);
					// Remove previous metablock
					biggerBlocks.splice(i + 1, 1);
				}
				// next
				prevBigBlock = curBigBlock;
			}
		}

		// Store
		this.metaBlocks = biggerBlocks;
	}


	/** Parses the search input string given by the user.
	 * @param input Examples:
	 * - '129'
	 * - '80h $4F 0x7e 65'
	 * - '"texta" 80h "textb"'
	 * Note: a " in a string is to be escaped: \"
	 * @throws If there is a parsing error. Or the numbers are bigger
	 * than 255.
	 */
	protected parseSearchInput(input: string): number[] {
		const result: number[] = [];
		// Find all matches
		const regex = /^(?:"(.*(?<!\\))"|([0-9a-f]+h)|(0x[0-9a-f]+)|(\$[0-9a-f]+)|(\d+))/i;
		let text = input;
		while (true) {
			text = text.trim();
			if (!text)
				break;
			// Find number or string
			const match = regex.exec(text);
			if (!match)
				throw Error('String is wrong formatted.');
			// Check which format was found: string, hex, decimal
			if (match[1] != undefined) {
				// Exchange any inner escaped '\"'
				const s = match[1].replace(/\"/g, '"');
				// Convert to numbers
				const len = s.length;
				for (let i = 0; i < len; i++) {
					const val = s.charCodeAt(i);
					if (val > 255)
						throw Error('No unicode supported.');
					result.push(val);
				}
			}
			else {
				// Number
				let val;
				if (match[5]) {
					// E.g. 165, decimal
					val = parseInt(match[5]);
				}
				else {
					// Hex
					let s: string;
					if (match[2]) {
						// E.g. 80h
						s = match[2];
					}
					else if (match[3]) {
						// E.g. 0xAF
						s = match[3].substring(2);
					}
					else if (match[4]) {
						// E.g. $AF
						s = match[4].substring(1);
					}
					else {
						// Should not happen
						Utility.assert(false);
						break;	// Will not be reached, to calm SONAR
					}
					// Hex convert
					val = parseInt(s, 16);
				}
				if (val > 255)
					throw Error('Value too big.');
				result.push(val);
			}

			// Next
			text = text.substring(match[0].length);	// Skip parsed text
			// Replace any following ','
			text = text.replace(',', '');	// Only the next occurence
		}

		// Return
		return result;
	}


	/** Searches the memory.
	 * Sends the found locations to the webview.
	 * @param searchInput The search input string as typed into the search box.
	 * @param caseSensitive true if the search should be case sensitive.
	 * @param zeroTerminated true if there should be a 0 after the searched string.
	 * @param diff true if the difference of the given values should be
	 * compared. Requires at least 2 values.
	 */
	// TODO: unit test
	public search(searchInput: string, caseSensitive: boolean, zeroTerminated: boolean, diff: boolean): FoundAddresses {
		const foundAddresses = new Set<number>();
		let searchText = searchInput;
		const length = searchText.length;
		if (length > 0) {
			if (!caseSensitive)
				searchText = searchText.toLowerCase();

			const dec = new TextDecoder('ascii');
			for (let mb of this.metaBlocks) {
				//	const index = address - mb.address;
				let data = dec.decode(mb.data);
				if (!caseSensitive)
					data = data.toLowerCase();
				// Search
				let k = 0;
				while ((k = data.indexOf(searchText, k)) >= 0) {
					// Found
					foundAddresses.add(mb.address + k);
					k++;
				}
			}
		}

		// Create array from set
		const addresses = Array.from(foundAddresses);

		return {length, addresses};
	}
}
