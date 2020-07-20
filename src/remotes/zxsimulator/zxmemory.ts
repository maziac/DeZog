import {ImageConvert} from '../../misc/imageconvert';
import {MemBuffer} from '../../misc/membuffer';
import {Utility} from '../../misc/utility';



/**
 * Represents the memory, banking and slots of a ZX Spectrum
 * and ZX Next.
 *
 * For performance reasons the memory is arranged as 64k continuous block.
 * Apart from this another memory exists with 256 Banks of 8k.
 * The banking is realized as mem copies between these 2 memories.
 */
export class ZxMemory {
	// The bank size.
	public static MEMORY_BANK_SIZE=0x2000;

	// The number of banks.
	public static NUMBER_OF_BANKS=256;	// To include also the "ROMs". 224 banks in reality

	// Screen height
	public static SCREEN_HEIGHT=192;

	// Screen width
	public static SCREEN_WIDTH=256;

	// The memory banks in one big block.
	protected AllBanksRam: Uint8Array;

	// Holds the slot assignments to the banks.
	// Note: I use 254 for ROM 0-0x1FFF and 255 for ROM 0x2000-0x3FFF.
	// The ZXNext defines both at 255.
	protected slots: number[]=[254, 255, 10, 11, 4, 5, 0, 1];

	// The bank used to display the ULA screen.
	// This is normally bank 5 but could be changed to bank7 in ZX128.
	protected ulaScreenBank: number;

	// Visual memory: shows the access as an image.
	// The image is just 1 pixel high.
	protected visualMemory: Array<number>;

	// The size of the visual memory.
	protected VISUAL_MEM_SIZE_SHIFT=8;

	// Colors:
	protected VISUAL_MEM_COL_READ=1;
	protected VISUAL_MEM_COL_WRITE=2;
	protected VISUAL_MEM_COL_PROG=3;


	/// Constructor.
	constructor() {
		this.ulaScreenBank=5*2;
		// Create RAM
		this.AllBanksRam=new Uint8Array(ZxMemory.NUMBER_OF_BANKS*ZxMemory.MEMORY_BANK_SIZE);
		// Create visual memory
		this.visualMemory=new Array<number>(1<<(16-this.VISUAL_MEM_SIZE_SHIFT));
		this.clearVisualMemory();
	}


	/**
	 * Clears the whole memory (all banks) with 0s.
	 */
	public clear() {
		this.AllBanksRam.fill(0);
	}


	/**
	 * Sets the bank to use for the screen display.
	 * @param bankIndex The bank to use. Note that this is an 8k bank, not 16k.
	 */
	public setUlaScreenBank(bankIndex: number) {
		this.ulaScreenBank=bankIndex;
	}


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
		memBuffer.writeArrayBuffer(this.AllBanksRam);
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
		Utility.assert(buffer.length==this.AllBanksRam.byteLength);
		this.AllBanksRam.set(buffer);

		// Clear visual memory
		this.clearVisualMemory();
	}


	// Read 1 byte.
	// This is used by the Z80 CPU.
	public read8(addr: number): number {
		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_READ;
		// Read
		const slotIndex=addr>>>13;
		const bankNr=this.slots[slotIndex];
		const ramAddr=bankNr*0x2000+(addr&0x1FFF);	// Convert to flat address
		const value=this.AllBanksRam[ramAddr];
		return value;
	}

	// Write 1 byte.
	// This is used by the Z80 CPU.
	public write8(addr: number, val: number) {
		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_WRITE;
		// Write
		const slotIndex=addr>>>13;
		const bankNr=this.slots[slotIndex];
		const ramAddr=bankNr*0x2000+(addr&0x1FFF);	// Convert to flat address
		// Only write if not ROM
		if (ramAddr<0x1FC000)
			this.AllBanksRam[ramAddr]=val;
	}


	// Reads one byte.
	// This is **not** used by the Z80 CPU.
	public getMemory8(addr: number): number {
		const slotIndex=addr>>>13;
		const bankNr=this.slots[slotIndex];
		const ramAddr=bankNr*0x2000+(addr&0x1FFF);	// Convert to flat address
		const value=this.AllBanksRam[ramAddr];
		return value;
	}

	// Reads 2 bytes.
	// This is **not** used by the Z80 CPU.
	public getMemory16(addr: number): number {
		// First byte
		let address=addr&0x1FFF;
		let slotIndex=addr>>>13;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*0x2000+address;	// Convert to flat address
		const mem=this.AllBanksRam;
		let value=mem[ramAddr];
		// Second byte
		address++;
		if (address<0x2000) {
			// No overflow, same bank, normal case
			ramAddr++;
		}
		else {
			// Overflow
			slotIndex=(slotIndex+1)&0x07;
			bankNr=this.slots[slotIndex];
			ramAddr=bankNr*0x2000;	// Convert to flat address
		}
		value+=mem[ramAddr]<<8;
		return value;
	}

	// Reads 4 bytes.
	// This is **not** used by the Z80 CPU.
	public getMemory32(addr: number): number {
		// First byte
		let address=addr&0x1FFF;
		let slotIndex=addr>>>13;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*0x2000+address;	// Convert to flat address
		const mem=this.AllBanksRam;
		let value=mem[ramAddr];
		// Second byte
		if (address<=0x1FFD) {  // 0x2000-3
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
				address=addr&0x1FFF;
				slotIndex=(addr>>>13)&0x07;
				bankNr=this.slots[slotIndex];
				ramAddr=bankNr*0x2000+address;	// Convert to flat address
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
		let address=addr&0x1FFF;
		let slotIndex=addr>>>13;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*0x2000+address;	// Convert to flat address
		const mem=this.AllBanksRam;
		mem[ramAddr]=val&0xFF;
	}


	// Sets one word.
	// This is **not** used by the Z80 CPU.
	public setMemory16(addr: number, val: number) {
		// First byte
		let address=addr&0x1FFF;
		let slotIndex=addr>>>13;
		let bankNr=this.slots[slotIndex];
		let ramAddr=bankNr*0x2000+address;	// Convert to flat address
		const mem=this.AllBanksRam;
		mem[ramAddr]=val&0xFF;
		// Second byte
		address++;
		if (address<0x2000) {
			// No overflow, same bank, normal case
			ramAddr++;
		}
		else {
			// Overflow
			slotIndex=(slotIndex+1)&0x07;
			bankNr=this.slots[slotIndex];
			ramAddr=bankNr*0x2000;	// Convert to flat address
		}
		mem[ramAddr]=val>>>8;
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
	public getSlots(): number[] {
		return this.slots;
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
		const mem=this.AllBanksRam;
		while (size>0) {
			// Get memory bank
			const slot=(addr>>>13)&0x07;
			const bankAddr=addr&(ZxMemory.MEMORY_BANK_SIZE-1);
			const bank=this.slots[slot];
			let ramAddr=bank*ZxMemory.MEMORY_BANK_SIZE+bankAddr;
			// Get block within one bank
			let blockEnd=bankAddr+size;
			if (blockEnd>ZxMemory.MEMORY_BANK_SIZE)
				blockEnd=ZxMemory.MEMORY_BANK_SIZE;
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
		const mem=this.AllBanksRam;
		while (size>0) {
			// Get memory bank
			const slot=(addr>>>13)&0x07;
			const bankAddr=addr&(ZxMemory.MEMORY_BANK_SIZE-1);
			const bank=this.slots[slot];
			let ramAddr=bank*ZxMemory.MEMORY_BANK_SIZE+bankAddr;
			// Get block within one bank
			let blockEnd=bankAddr+size;
			if (blockEnd>ZxMemory.MEMORY_BANK_SIZE)
				blockEnd=ZxMemory.MEMORY_BANK_SIZE;
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
		Utility.assert(block.length==ZxMemory.MEMORY_BANK_SIZE);
		let ramAddr=bank*ZxMemory.MEMORY_BANK_SIZE;
		this.AllBanksRam.set(block, ramAddr);
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


	/**
	 * Converts a ZX Spectrum ULA screen into a gif image.
	 * @returns The screen as a gif buffer.
	 */
	public getUlaScreen(): number[] {
		// Create pixels from the screen memory
		const pixels=this.createPixels();
		// Get ZX palette
		const zxPalette=ZxMemory.getZxPalette();
		// Convert to gif
		const gifBuffer=ImageConvert.createGifFromArray(ZxMemory.SCREEN_WIDTH, ZxMemory.SCREEN_HEIGHT, pixels, zxPalette);
		// Return
		return gifBuffer;
	}


	/**
	 * Converts the screen pixels, the bits in the bytes, into pixels
	 * with a color index.
	 */
	protected createPixels(): Array<number> {
		//const screenMem=new Uint8Array(this.z80Memory.buffer, this.z80Memory.byteOffset+0x4000);
		// Find memory to display
		const screenMem=this.AllBanksRam;
		const screenBaseAddr=this.ulaScreenBank*ZxMemory.MEMORY_BANK_SIZE;
		const colorStart=screenBaseAddr+ZxMemory.SCREEN_HEIGHT*ZxMemory.SCREEN_WIDTH/8;

		// Create pixels memory
		const pixels=new Array<number>(ZxMemory.SCREEN_HEIGHT*ZxMemory.SCREEN_WIDTH);
		let pixelIndex=0;
		let inIndex=0;
		let colorIndex=0;

		// One line after the other
		for (let y=0; y<ZxMemory.SCREEN_HEIGHT; y++) {
			// Calculate offset in ZX Spectrum screen
			inIndex=screenBaseAddr+(((y&0b111)<<8)|((y&0b1100_0000)<<5)|((y&0b11_1000)<<2));
			colorIndex=colorStart+((y&0b1111_1000)<<2);	// y/8*32;
			for (let x=0; x<ZxMemory.SCREEN_WIDTH/8; x++) {
				const byteValue=screenMem[inIndex];
				// Get color
				let color=screenMem[colorIndex];
				let mask=0x80;
				while (mask) {	// 8x
					const value=byteValue&mask;
					// Check if pixel is set
					let cIndex=(color&0x40)>>>3;	// Brightness
					if (value) {
						// Set: foreround
						cIndex|=color&0x07;
					}
					else {
						// Unset: background
						cIndex|=(color>>>3)&0x07;
					}

					// Save color index
					pixels[pixelIndex]=cIndex;

					// Next pixel
					mask>>>=1;
					pixelIndex++;
				}
				// Next byte
				inIndex++;
				colorIndex++;
			}
		}
		return pixels;
	}


	/// @returns the ZX Spectrum palette.
	protected static getZxPalette(): number[] {
		const palette=[
			// Bright 0
			0x00, 0x00, 0x00,
			0x00, 0x00, 0xD7,
			0xD7, 0x00, 0x00,
			0xD7, 0x00, 0xD7,

			0x00, 0xD7, 0x00,
			0x00, 0xD7, 0xD7,
			0xD7, 0xD7, 0x00,
			0xD7, 0xD7, 0xD7,

			// Bright 1
			0x00, 0x00, 0x00,
			0x00, 0x00, 0xFF,
			0xFF, 0x00, 0x00,
			0xFF, 0x00, 0xFF,

			0x00, 0xFF, 0x00,
			0x00, 0xFF, 0xFF,
			0xFF, 0xFF, 0x00,
			0xFF, 0xFF, 0xFF,
		];
		return palette;
	}
}

