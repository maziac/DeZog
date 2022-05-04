import {MemBuffer, Serializeable} from '../../misc/membuffer';
import {BankType, MemoryModel} from '../Paging/memorymodel';



/**
 * Watchpoint class used by 'watchPointMemory'.
 */
interface SimWatchpoint {
	// read/write are counters. They are reference counts and count how many
	// read/write access points have been set. If 0 then no watchpoint is set.
	read: number;
	write: number;
}



/**
 * Represents the simulated memory.
 * It is a base class to allow memory paging etc.
 * The simulated memory always works with slots although they might not be visible
 * to the outside.
 * I.e. the ZX48K is built of 4 slots per 16K. 1rst is ROM the other 3 are RAM.
 * To the outside is does not show any of these slots.
 * But for configuration (what is ROM/RAM) it is required.
 */
export class SimulatedMemory implements Serializeable {
	// The memory separated in banks.
	protected memoryBanks: Uint8Array[];

	// The memory model used for this memory.
	protected memoryModel: MemoryModel;

	// Points to this.memoryModel.slotAddress64kAssociation
	protected slotAddress64kAssociation;

	// Derived from this.memoryModel.slotAddress64kAssociation.
	// Holds only the start address of the slot.
	protected slotRangesStart: number[];

	// Holds only the
	protected slotRangesSize: number[];

	// Holds the slot assignments to the banks.
	protected slots: number[];

	// For each bank this array tells if it is ROM or read-only (e.g. not populated).
	// For each bank this array tells if it is writable or not.
	// RAM is writable.
	// ROM and unpopulated areas (see ZX16K) are  not writable.
	protected bankTypes: BankType[];

	// The number of bits to shift to get the slot from the address
	protected shiftCount: number;

	// Visual memory: shows the access as an image.
	// The image is just 1 pixel high.
	protected visualMemory: Array<number>;

	// The size of the visual memory.
	protected VISUAL_MEM_SIZE_SHIFT = 8;

	// Colors:
	protected VISUAL_MEM_COL_READ = 1;
	protected VISUAL_MEM_COL_WRITE = 2;
	protected VISUAL_MEM_COL_PROG = 3;


	// Flag that is set if a watchpoint was hot.
	// Has to be reset manually before the next turn.
	public watchpointHit: boolean;

	// If watchpointHit was set the address where the hit occurred.
	// -1 if no hit.
	public hitAddress: number;

	// The kind of access, 'r'ead or 'w'rite.
	public hitAccess: string;

	// An array of 0-0xFFFF entries, one for each address.
	// If an address has no watchpoint it is undefined.
	// If it has it points to a SimWatchpoint.
	// Note: as watchpoints are areas, several addresses might share the same SimWatchpoint.
	protected watchPointMemory: Array<SimWatchpoint>;


	/**
	 * Constructor.
	 * Configures the slot and bank count.
	 * @param memModel The memory model to use. Includes all slots definition and banks.
	 */
	constructor(memModel: MemoryModel) {
		// Store
		this.memoryModel = memModel;
		this.slotAddress64kAssociation = memModel.slotAddress64kAssociation;
		this.slotRangesStart = memModel.slotRanges.map(slotRange => slotRange.start);
		this.slotRangesSize = memModel.slotRanges.map(slotRange => slotRange.end + 1 - slotRange.start);

		// Create visual memory
		this.visualMemory = new Array<number>(1 << (16 - this.VISUAL_MEM_SIZE_SHIFT));	// E.g. 256
		this.clearVisualMemory();

		// Memory is organized in banks.
		const bankCount = memModel.banks.length;
		this.memoryBanks = new Array<Uint8Array>(bankCount);
		this.bankTypes = new Array<BankType>(bankCount);
		// Allocate
		for (let i = 0; i < bankCount; i++) {
			const bank = memModel.banks[i];
			if (bank) {
				this.memoryBanks[i] = new Uint8Array(bank.size);
				this.bankTypes[i] = bank.bankType;
			}
		}

		// Associate banks with slots
		this.slots = [...memModel.initialSlots];	// Copy

		// Breakpoints
		this.clearHit();
		// Create watchpoint area
		this.watchPointMemory = Array.from({length: 0x10000}, () => ({read: 0, write: 0}));
	}


	/**
	 * Clears the whole memory (all banks) with 0s.
	 * So far only used by unit tests.
	 */
	public clear() {
		for(const bank of this.memoryBanks)
			bank.fill(0);
	}


	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer = new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size = memBuffer.getSize();
		return size;
	}


	/**
	 * Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Get slot/bank mapping
		memBuffer.write8(this.slots.length);
		for (const bank of this.slots)
			memBuffer.write8(bank);

		// Store banks
		for(const bank of this.memoryBanks)
			memBuffer.writeArrayBuffer(bank);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Store slot/bank association
		const slotLength = memBuffer.read8();
		this.slots = [];
		for (let i = 0; i < slotLength; i++)
			this.slots.push(memBuffer.read8());

		// Create memory banks
		for (const bank of this.memoryBanks) {
			const buffer = memBuffer.readArrayBuffer();
			if (buffer.length != bank.byteLength)
				throw Error("Can't read data. Loaded format is different.");
			bank.set(buffer);
		}

		// Clear visual memory
		this.clearVisualMemory();
	}


	/**
	 * Adds a watchpoint address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public setWatchpoint(address: number, size: number, access: string) {
		const readAdd = access.includes('r') ? 1 : 0;
		const writeAdd = access.includes('w') ? 1 : 0;
		// Set area
		for (let i = 0; i < size; i++) {
			const wp = this.watchPointMemory[address & 0xFFFF];
			wp.read += readAdd;
			wp.write += writeAdd;
			address++;
		}
	}


	/**
	 * Removes a watchpoint address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public removeWatchpoint(address: number, size: number, access: string) {
		const readAdd = access.includes('r') ? 1 : 0;
		const writeAdd = access.includes('w') ? 1 : 0;
		// remove area
		for (let i = 0; i < size; i++) {
			const wp = this.watchPointMemory[address & 0xFFFF];
			if (wp.read > 0)
				wp.read -= readAdd;
			if (wp.write > 0)
				wp.write -= writeAdd;
			address++;
		}
	}


	/**
	 * Clears the hit flag and the arrays.
	 */
	public clearHit() {
		this.hitAddress = -1;
		this.hitAccess = '';
	}


	// Read 1 byte.
	// This is used by the Z80 CPU.
	public read8(addr64k: number): number {
		// Check for watchpoint access
		const wp = this.watchPointMemory[addr64k];
		if (wp) {
			// Check access
			if ((this.hitAddress < 0) && wp.read > 0) {
				// Read access
				this.hitAddress = addr64k;
				this.hitAccess = 'r';
			}
		}

		// Visual memory
		this.visualMemory[addr64k >>> this.VISUAL_MEM_SIZE_SHIFT] = this.VISUAL_MEM_COL_READ;

		// Read
		const slotIndex = this.slotAddress64kAssociation[addr64k];
		const bankNr = this.slots[slotIndex];
		const rangeStart = this.slotRangesStart[slotIndex];
		const offs = addr64k - rangeStart;
		const value = this.memoryBanks[bankNr][offs];


/*
		// Read
		const slotIndex = addr >>> this.shiftCount;
		const bankNr = this.slots[slotIndex];
		const ramAddr = bankNr * this.bankSize + (addr & (this.bankSize - 1));	// Convert to flat address
		const value = this.memoryData[ramAddr];
*/
		return value;
	}

	// Write 1 byte.
	// This is used by the Z80 CPU.
	public write8(addr64k: number, val: number) {
		// Check for watchpoint access
		const wp = this.watchPointMemory[addr64k];
		if (wp) {
			// Check access
			if ((this.hitAddress < 0) && wp.write > 0) {
				// Write access
				this.hitAddress = addr64k;
				this.hitAccess = 'w';
			}
		}

		// Visual memory
		this.visualMemory[addr64k >>> this.VISUAL_MEM_SIZE_SHIFT] = this.VISUAL_MEM_COL_WRITE;


		// Read
		const slotIndex = this.slotAddress64kAssociation[addr64k];
		const bankNr = this.slots[slotIndex];

		// Don't write if non-writable, e.g. ROM or UNUSED
		if (this.bankTypes[bankNr] == BankType.RAM) {
			const rangeStart = this.slotRangesStart[slotIndex];
			const offs = addr64k - rangeStart;
			// Write
			this.memoryBanks[bankNr][offs] = val;
		}

		/*
		// Convert to bank
		const slotIndex = addr64k >>> this.shiftCount;
		const bankNr = this.slots[slotIndex];

		// Don't write if non-writable, e.g. ROM or UNUSED
		if (this.bankTypes[bankNr] == BankType.RAM) {
			// Convert to flat address
			const ramAddr = bankNr * this.bankSize + (addr64k & (this.bankSize - 1));
			// Write
			this.memoryData[ramAddr] = val;
		}
	*/
	}


	/**
	 * @param bankNr The bank number.
	 * @returns the Uint8Array of a bank.
	 */
	public getBankMemory(bankNr: number) {
		return this.memoryBanks[bankNr];
	}


	// Reads a value from the memory. Value can span over several bytes.
	// This is **not** used by the Z80 CPU.
	// Used to read the WORD at SP or to read a 4 byte opcode.
	// @param addr64k The 64k start address
	// @param size The length of the value in bytes.
	// @returns The value (little endian)
	public getMemoryValue(addr64k: number, size: number): number {
		let value = 0;

		for (let i = size; i > 0; i--) {
			// Read
			const slotIndex = this.slotAddress64kAssociation[addr64k];
			const bankNr = this.slots[slotIndex];
			const rangeStart = this.slotRangesStart[slotIndex];
			const offs = addr64k - rangeStart;
			const val8 = this.memoryBanks[bankNr][offs];
			// Store
			value = (value << 8) + val8;
			// Next
			addr64k = (addr64k + 1) & 0xFFFF;
		}

		return value;
	}


	// Reads 2 bytes.
	// This is **not** used by the Z80 CPU.
	// Used to read the WORD at SP.
	public getMemory16(addr64k: number): number {
		return this.getMemoryValue(addr64k, 2);
	}

	// Reads 4 bytes.
	// This is **not** used by the Z80 CPU.
	// Used to read an opcode which is max. 4 bytes.
	public getMemory32(addr64k: number): number {
		return this.getMemoryValue(addr64k, 2);
	}


	/**
	 * Write to memoryData directly into a bank.
	 * Is e.g. used during SNA / NEX file loading.
	 * @param bankNr The bank to write.
	 * @param data The data to write.
	 * @param offset Offset into the data buffer.
	 */
	public writeMemoryData(bankNr: number, data: Uint8Array, offset = 0) {
		const bank = this.memoryBanks[bankNr];
		// Check size
		let size = bank.length;
		if (data.length - offset < bank.length)
			size = data.length - offset;
		// Write
		bank.set(data.slice(offset, offset + size));
	}


	// Write 1 byte.
	public setVisualProg(addr: number) {
		// Visual memory
		this.visualMemory[addr >>> this.VISUAL_MEM_SIZE_SHIFT] = this.VISUAL_MEM_COL_PROG;
	}


	/**
	 * Associates a slot with a bank number.
	 */
	public setSlot(slot: number, bank: number) {
		this.slots[slot] = bank;
	}


	/**
	 * Returns the slots array, or undefined if not paged.
	 */
	public getSlots(): number[] | undefined {
		return this.slots;
	}


	/**
	 * Reads a block of bytes.
	 * @param startAddr64k The 64k start address
	 * @param size The length of the data in bytes.
	 * @returns The data as Uint8Array (a new array is returned.)
	 */
	public readBlock(startAddr64k: number, size: number): Uint8Array {
		const data = new Uint8Array(size);
		let dataOffset = 0;

		while (size > 0) {
			// Get start address and bank
			const slotIndex = this.slotAddress64kAssociation[startAddr64k];
			const bankNr = this.slots[slotIndex];
			const rangeStart = this.slotRangesStart[slotIndex];
			const offs = startAddr64k - rangeStart;
			const bank = this.memoryBanks[bankNr];
			const rangeSize = this.slotRangesSize[slotIndex];
			// Copy
			let sizeOffs = rangeSize - offs;
			if (sizeOffs > size)
				sizeOffs = size;
			data.set(bank.slice(offs, offs + sizeOffs), dataOffset);
			// Next
			dataOffset += sizeOffs;
			size -= sizeOffs;
			startAddr64k = (startAddr64k + sizeOffs) & 0xFFFF;
		}

		return data;
	}


	/**
	 * Writes a block of bytes.
	 * @param startAddress The 64k start address.
	 * @param data The block to write.
	 */
	public writeBlock(startAddr64k: number, data: Buffer | Uint8Array) {
		if (!(data instanceof Uint8Array))
			data = new Uint8Array(data);
		// The block may span several banks.
		let dataOffset = 0;
		let size = data.byteLength;

		while (size > 0) {
			// Get start address and bank
			const slotIndex = this.slotAddress64kAssociation[startAddr64k];
			const bankNr = this.slots[slotIndex];
			const rangeStart = this.slotRangesStart[slotIndex];
			const offs = startAddr64k - rangeStart;
			const bank = this.memoryBanks[bankNr];
			const rangeSize = this.slotRangesSize[slotIndex];
			// Copy
			let sizeOffs = rangeSize - offs;
			if (sizeOffs > size)
				sizeOffs = size;
			bank.set(data.slice(dataOffset, dataOffset + sizeOffs), offs);
			// Next
			dataOffset += sizeOffs;
			size -= sizeOffs;
			startAddr64k = (startAddr64k + sizeOffs) & 0xFFFF;
		}
	}


	/**
	 * Writes a complete memory bank.
	 * @param bankNr The bank number.
	 * @param block The block to write.
	 */
	public writeBank(bankNr: number, block: Buffer | Uint8Array) {
		const bank = this.memoryBanks[bankNr];
		if (block.length != bank.byteLength)
			throw Error("writeBank: Block length " + block.length + " not allowed. Expected " + bank.byteLength + ".");
		bank.set(block);
	}


	/**
	 * Clears the visual buffer.
	 */
	public clearVisualMemory() {
		this.visualMemory.fill(0);
	}


	/**
	 * @returns The visual memory as a buffer.
	 */
	public getVisualMemory(): number[] {
		return this.visualMemory;
	}

}

