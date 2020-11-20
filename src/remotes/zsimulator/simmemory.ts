import {ImageConvert} from '../../misc/imageconvert';
import {MemBuffer} from '../../misc/membuffer';
import {Utility} from '../../misc/utility';




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
export class SimulatedMemory {
	// The memory in one big block.
	// If banking is used in a derived class this array will extend 64k.
	protected memoryData: Uint8Array;

	// Holds the slot assignments to the banks.
	protected slots: number[];

	// For each bank this array tells if it is ROM.
	protected romBanks: boolean[];

	// The used bank size.
	protected bankSize: number;

	// The number of bits to shift to get the slot from the address
	protected shiftCount: number;

	// Visual memory: shows the access as an image.
	// The image is just 1 pixel high.
	protected visualMemory: Array<number>;

	// The size of the visual memory.
	protected VISUAL_MEM_SIZE_SHIFT=8;

	// Colors:
	protected VISUAL_MEM_COL_READ=1;
	protected VISUAL_MEM_COL_WRITE=2;
	protected VISUAL_MEM_COL_PROG=3;



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
	 * @param slotCount Number of slots.
	 * @param bankCount Number of banks.
	 */
	constructor(slotCount: number, bankCount: number) {
		Utility.assert(bankCount>=slotCount);
		// Create visual memory
		this.visualMemory=new Array<number>(1<<(16-this.VISUAL_MEM_SIZE_SHIFT));
		this.clearVisualMemory();
		// The "real" memory
		this.bankSize=0x10000/slotCount;
		// Create RAM
		this.memoryData=new Uint8Array(bankCount*this.bankSize);
		// No ROM at start
		this.romBanks=new Array<boolean>(bankCount);	// All initialized to false.
		this.romBanks.fill(false);

		// Calculate number of bits to shift to get the slot index from the address.
		let sc=slotCount;
		let bits=0;
		while (sc>1) {
			bits++;
			sc/=2;
		}
		this.shiftCount=16-bits;
		// Associate banks with slots
		this.slots=new Array<number>(slotCount);
		for (let i=0; i<slotCount; i++)
			this.slots[i]=i;

		// Breakpoints
		this.clearHit();
		// Create watchpoint area
		this.watchPointMemory=Array.from({length: 0x10000}, () => ({read: 0, write: 0}));
	}


	/**
	 * Clears the whole memory (all banks) with 0s.
	 * So far only used by unit tests.
	 */
	public clear() {
		this.memoryData.fill(0);
	}


	/**
	 * Returns the memory used in all banks.
	 * @returns this.memoryData
	 */
	public getMemoryData(): Uint8Array {
		return this.memoryData;
	}


	/**
	 * At start all banks are RAM, even 0xFE and 0xFF.
	 * Use this method to switch a bank to ROM.
	 * I.e. any write8() will do nothing.
	 * Is used e.g. if "loadZxRom" is used.
	 * @param bank The bank number, e.g. 0xFE.
	 * @param enableRom true to turn bank into ROM, false to turn it into RAM.
	 */
	/*
	public setRomBank(bank: number, enableRom: boolean) {
		this.romBanks[bank]=enableRom;
	}
	*/

	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer=new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size=memBuffer.getSize();
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

		// Get RAM
		memBuffer.writeArrayBuffer(this.memoryData);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Store slot/bank association
		const slotLength=memBuffer.read8();
		this.slots=[];
		for (let i=0; i<slotLength; i++)
			this.slots.push(memBuffer.read8());

		// Create memory banks
		const buffer=memBuffer.readArrayBuffer();
		Utility.assert(buffer.length==this.memoryData.byteLength);
		this.memoryData.set(buffer);

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
		const readAdd=access.includes('r')? 1:0;
		const writeAdd=access.includes('w')? 1:0;
		// Set area
		for (let i=0; i<size; i++) {
			const wp=this.watchPointMemory[address&0xFFFF];
			wp.read+=readAdd;
			wp.write+=writeAdd;
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
		const readAdd=access.includes('r')? 1:0;
		const writeAdd=access.includes('w')? 1:0;
		// remove area
		for (let i=0; i<size; i++) {
			const wp=this.watchPointMemory[address&0xFFFF];
			if (wp.read>0)
				wp.read-=readAdd;
			if(wp.write>0)
				wp.write-=writeAdd;
			address++;
		}
	}


	/**
	 * Clears the hit flag and the arrays.
	 */
	public clearHit() {
		this.hitAddress=-1;
		this.hitAccess='';
	}


	// Read 1 byte.
	// This is used by the Z80 CPU.
	public read8(addr: number): number {
		// Check for watchpoint access
		const wp=this.watchPointMemory[addr];
		if (wp) {
			// Check access
			if ((this.hitAddress<0)&&wp.read>0) {
				// Read access
				this.hitAddress=addr;
				this.hitAccess='r';
			}
		}

		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_READ;
		// Read
		const slotIndex=addr>>>this.shiftCount;
		const bankNr=this.slots[slotIndex];
		const ramAddr=bankNr*this.bankSize+(addr&(this.bankSize-1));	// Convert to flat address
		const value=this.memoryData[ramAddr];
		return value;
	}

	// Write 1 byte.
	// This is used by the Z80 CPU.
	public write8(addr: number, val: number) {
		// Check for watchpoint access
		const wp=this.watchPointMemory[addr];
		if (wp) {
			// Check access
			if ((this.hitAddress<0)&&wp.write>0) {
				// Write access
				this.hitAddress=addr;
				this.hitAccess='w';
			}
		}

		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_WRITE;

		// Convert to bank
		const slotIndex=addr>>>this.shiftCount;
		const bankNr=this.slots[slotIndex];

		// Don't write if ROM
		if (this.romBanks[bankNr])
			return;

		// Convert to flat address
		const ramAddr=bankNr*this.bankSize+(addr&(this.bankSize-1));
		// Write
		this.memoryData[ramAddr]=val;
	}


	// Reads one byte.
	// This is **not** used by the Z80 CPU.
	public getMemory8(addr: number): number {
		const slotIndex=addr>>>this.shiftCount;
		const bankNr=this.slots[slotIndex];
		const ramAddr=bankNr*this.bankSize+(addr&(this.bankSize-1));	// Convert to flat address
		const value=this.memoryData[ramAddr];
		return value;
	}

	// Reads 2 bytes.
	// This is **not** used by the Z80 CPU.
	public getMemory16(addr: number): number {
		// First byte
		let address=addr&(this.bankSize-1);
		let slotIndex=addr>>>this.shiftCount;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*this.bankSize+address;	// Convert to flat address
		const mem=this.memoryData;
		let value=mem[ramAddr];
		// Second byte
		address++;
		if (address<this.bankSize) {
			// No overflow, same bank, normal case
			ramAddr++;
		}
		else {
			// Overflow
			slotIndex=((addr+1)&0xFFFF)>>>this.shiftCount;
			bankNr=this.slots[slotIndex];
			ramAddr=bankNr*this.bankSize;	// Convert to flat address
		}
		value+=mem[ramAddr]<<8;
		return value;
	}

	// Reads 4 bytes.
	// This is **not** used by the Z80 CPU.
	public getMemory32(addr: number): number {
		// First byte
		let address=addr&(this.bankSize-1);
		let slotIndex=addr>>>this.shiftCount;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*this.bankSize+address;	// Convert to flat address
		const mem=this.memoryData;
		let value=mem[ramAddr];
		// Second byte
		if (address<=this.bankSize-3) {  // E.g. 0x2000-3
			// No overflow, same bank, normal case
			value+=mem[++ramAddr]<<8;
			value+=mem[++ramAddr]<<16;
			value+=mem[++ramAddr]*256*65536;	// Otherwise the result might be negative
		}
		else {
			// Overflow, do each part one-by-one
			let mult=256;
			for (let i=3; i>0; i--) {
				addr++;
				address=addr&(this.bankSize-1);
				slotIndex=(addr&0xFFFF)>>>this.shiftCount;
				bankNr=this.slots[slotIndex];
				ramAddr=bankNr*this.bankSize+address;	// Convert to flat address
				value+=mem[ramAddr]*mult;
				// Next
				mult*=256;
			}
		}
		return value;
	}


	// Sets one byte.
	// This is **not** used by the Z80 CPU.
	public setMemory8(addr: number, val: number) {
		// First byte
		let address=addr&(this.bankSize-1);
		let slotIndex=addr>>>this.shiftCount;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*this.bankSize+address;	// Convert to flat address
		const mem=this.memoryData;
		mem[ramAddr]=val&0xFF;
	}


	// Sets one word.
	// This is **not** used by the Z80 CPU.
	public setMemory16(addr: number, val: number) {
		// First byte
		let address=addr&(this.bankSize-1);
		let slotIndex=addr>>>this.shiftCount;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*this.bankSize+address;	// Convert to flat address
		const mem=this.memoryData;
		mem[ramAddr]=val&0xFF;
		// Second byte
		address++;
		if (address<0x2000) {
			// No overflow, same bank, normal case
			ramAddr++;
		}
		else {
			// Overflow
			slotIndex=((addr+1)&0xFFFF)>>>this.shiftCount;
			bankNr=this.slots[slotIndex];
			ramAddr=bankNr*this.bankSize;	// Convert to flat address
		}
		mem[ramAddr]=val>>>8;
	}

	/**
	 * Write to memoryData direcly.
	 * Is e.g. used during SNA / NEX file loading.
	 * @param offset Offset into the memData. I.e. can be bigger than 0x10000.
	 * @param data The data to write.
	 */
	public writeMemoryData(offset: number, data: Uint8Array) {
		// Check size
		let size=data.length;
		if (offset+size>this.memoryData.length)
			size=this.memoryData.length-offset;
		if (size<=0)
			return;	// Nothing to write
		// Copy
		const data2=data.slice(0, size);
		this.memoryData.set(data2, offset);
	}


	// Write 1 byte.
	public setVisualProg(addr: number) {
		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_PROG;
	}


	/**
	 * Returns the bank memory and the address into it.
	 * @param addr The ZX spectrum memory address.
	 * @returns [number, Uint8Array] The address (0-0x1FFF) and the memory bank array.
	 */
	/*
	public getBankForAddr(addr: number): [number, Uint8Array] {
		const slot=(addr>>>13)&0x07;
		const bankAddr=addr&0x1FFF;
		const bank=this.slots[slot];
		const bankMem=this.banks[bank];
		Utility.assert(bankMem);
		return [bankAddr, bankMem];
	}
	*/

	/**
	 * Associates a slot with a bank number.
	 */
	public setSlot(slot: number, bank: number) {
		this.slots[slot]=bank;
	}

	/**
	 * Returns the slots array.
	 */
	public getSlots(): number[]|undefined {
		//return this.slots;
		return undefined;
	}

	/**
	 * Reads a block of bytes.
	 * @param startAddress Start address.
	 * @param size The size of the block.
	 */
	public readBlock(startAddress: number, size: number): Uint8Array {
		const totalBlock=new Uint8Array(size);
		let offset=0;
		// The block may span several banks.
		let addr=startAddress;
		const mem=this.memoryData;
		while (size>0) {
			// Get memory bank
			const slot=(addr&0xFFFF)>>>this.shiftCount;
			const bankAddr=addr&(this.bankSize-1);
			const bank=this.slots[slot];
			let ramAddr=bank*this.bankSize+bankAddr;
			// Get block within one bank
			let blockEnd=bankAddr+size;
			if (blockEnd>this.bankSize)
				blockEnd=this.bankSize;
			const partBlockSize=blockEnd-bankAddr;
			// Copy partial block
			const partBlock=mem.subarray(ramAddr, ramAddr+partBlockSize);
			// Add to total block
			totalBlock.set(partBlock, offset);
			// Next
			offset+=partBlockSize;
			size-=partBlockSize;
			addr+=partBlockSize;
		}
		return totalBlock;

	}


	/**
	 * Writes a block of bytes.
	 * @param startAddress Start address.
	 * @param totalBlock The block to write.
	 */
	public writeBlock(startAddress: number, totalBlock: Buffer|Uint8Array) {
		if (!(totalBlock instanceof Uint8Array))
			totalBlock=new Uint8Array(totalBlock);
		let offset=0;
		// The block may span several banks.
		let addr=startAddress;
		let size=totalBlock.length;
		const mem=this.memoryData;
		while (size>0) {
			// Get memory bank
			const slot=(addr&0xFFFF)>>>this.shiftCount;
			const bankAddr=addr&(this.bankSize-1);
			const bank=this.slots[slot];
			let ramAddr=bank*this.bankSize+bankAddr;
			// Get block within one bank
			let blockEnd=bankAddr+size;
			if (blockEnd>this.bankSize)
				blockEnd=this.bankSize;
			const partBlockSize=blockEnd-bankAddr;
			// Copy partial block
			const partBlock=totalBlock.subarray(offset, offset+partBlockSize);
			// Copy to memory bank
			mem.set(partBlock, ramAddr);
			// Next
			offset+=partBlockSize;
			size-=partBlockSize;
			addr+=partBlockSize;
		}
		return totalBlock;
	}


	/**
	 * Writes a complete memory bank.
	 * @param bank The bank number.
	 * @param block The block to write.
	 */
	public writeBank(bank: number, block: Buffer|Uint8Array) {
		if (block.length!=this.bankSize)
			throw Error("writeBank: Block length "+block.length+" not allowed. Expected "+this.bankSize+".");
		let ramAddr=bank*this.bankSize;
		this.memoryData.set(block, ramAddr);
	}


	/**
	 * Clears the visual buffer.
	 */
	public clearVisualMemory() {
		this.visualMemory.fill(0);
	}


	/**
	 * Converts the visual memory into a gif.
	 * @returns The visual memory as a gif buffer.
	 */
	public getVisualMemoryImage(): number[] {
		// Get ZX palette
		const palette=[
			0x80, 0x80, 0x80,	// Gray (background)/Transparent
			0xC0, 0xC0, 0x00,	// Yellow: Read access
			0xC0, 0x00, 0x00,	// Red: Write access
			0x00, 0x00, 0xC0,	// Blue: Prog access
		];
		// Convert to gif
		const size=this.visualMemory.length;
		const gifBuffer=ImageConvert.createGifFromArray(size, 1, this.visualMemory, palette, 0 /*transparent index*/);
		// Return
		return gifBuffer;
	}

}

