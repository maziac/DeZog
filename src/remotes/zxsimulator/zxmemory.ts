import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import {ImageConvert} from '../../imageconvert';
import {Utility} from '../../misc/utility';
import {MemBuffer} from '../../misc/membuffer';
import {start} from 'repl';


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

	// Holds the memory banks. Views to the 'AllBanksRam'.
	protected banks: Array<Uint8Array>;

	// The memory banks in one big block.
	protected AllBanksRam: ArrayBuffer;

	// Holds the slot assignments to the banks.
	// Note: I use 254 for ROM 0-0x1FFF and 255 for ROM 0x2000-0x3FFF.
	// The ZXNext defines both at 255.
	protected slots: number[]=[254, 255, 10, 11, 4, 5, 0, 1];

	// The 64k memory that hte Z80 addresses.
	protected z80Memory: Uint8Array;

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
		// Create RAM
		this.AllBanksRam=new ArrayBuffer(ZxMemory.NUMBER_OF_BANKS*ZxMemory.MEMORY_BANK_SIZE);
		this.z80Memory=new Uint8Array(0x10000);
		// Create memory banks
		this.banks=new Array<Uint8Array>(ZxMemory.NUMBER_OF_BANKS);
		for (let b=0; b<ZxMemory.NUMBER_OF_BANKS; b++) {
			const bank=new Uint8Array(this.AllBanksRam, b*ZxMemory.MEMORY_BANK_SIZE, ZxMemory.MEMORY_BANK_SIZE);
			this.banks[b]=bank;
		}
		// Create visual memory
		this.visualMemory=new Array<number>(1<<(16-this.VISUAL_MEM_SIZE_SHIFT));
		this.clearVisualMemory();
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
		// Copy Z80 memory to banks before serialization
		this.copyZ80MemToBanks();

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
		assert(buffer.length==this.AllBanksRam.byteLength);
		const dst=new Uint8Array(this.AllBanksRam);
		dst.set(buffer);

		// Copy from banks to Z80 memory
		this.copyBanksToZ80Mem();

		// Clear visual memory
		this.clearVisualMemory();
	}


	// Read 1 byte.
	// This is used by the Z80 CPU.
	public read8(addr: number): number {
		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_READ;
		// Read
		const value=this.z80Memory[addr];
		return value;
	}

	// Write 1 byte.
	// This is used by the Z80 CPU.
	public write8(addr: number, val: number) {
		// Visual memory
		this.visualMemory[addr>>>this.VISUAL_MEM_SIZE_SHIFT]=this.VISUAL_MEM_COL_WRITE;
		// Write
		this.z80Memory[addr]=val;
	}


	// Reads one byte.
	// This is **not** used by the Z80 CPU.
	public getMemory8(addr: number): number {
		const value=this.z80Memory[addr];
		return value;
	}

	// Reads 2 bytes.
	// This is **not** used by the Z80 CPU.
	public getMemory16(addr: number): number {
		const mem=this.z80Memory;
		let value=mem[addr++];
		value|=mem[addr&0xFFFF]<<8;
		return value;
	}

	// Reads 4 bytes.
	// This is **not** used by the Z80 CPU.
	public getMemory32(addr: number): number {
		const mem=this.z80Memory;
		let value=mem[addr++];
		value|=mem[(addr++)&0xFFFF]<<8;
		value|=mem[(addr++)&0xFFFF]<<16;
		value|=mem[addr&0xFFFF]<<24;
		return value;
	}

	// Read s one byte.
	// This is **not** used by the Z80 CPU.
	public setMemory16(addr: number, val: number) {
		const mem=this.z80Memory;
		mem[addr++]=val&0xFF;
		mem[addr&0xFFFF]=val>>>8;
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
	public getBankForAddr(addr: number): [number, Uint8Array] {
		const slot=(addr>>>13)&0x07;
		const bankAddr=addr&0x1FFF;
		const bank=this.slots[slot];
		const bankMem=this.banks[bank];
		assert(bankMem);
		return [bankAddr, bankMem];
	}

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
		let endAddr=startAddress+size;
		if (endAddr<=0x10000) {
			// No overflow
			const mem=new Uint8Array(this.z80Memory.buffer, startAddress, size);
			return mem;
		}

		// Overflow. Create new block out of 2 parts.
		const mem=new Uint8Array(size);
		// First block
		const firstSize=0x10000-startAddress;
		const firstBlock=new Uint8Array(this.z80Memory.buffer, startAddress, firstSize);
		mem.set(firstBlock);
		// Second block
		const secondSize=size-firstSize;
		const secondBlock=new Uint8Array(this.z80Memory.buffer, 0, secondSize);
		mem.set(secondBlock, firstSize);
		// Return
		return mem;
	}


	/**
	 * Writes a block of bytes.
	 * @param startAddress Start address.
	 * @param totalBlock The block to write.
	 */
	public writeBlock(startAddress: number, totalBlock: Buffer|Uint8Array) {
		const size=totalBlock.length;
		let endAddr=startAddress+size;
		if (endAddr<=0x10000) {
			// No overflow
			this.z80Memory.set(totalBlock);
		}
		else {
			// Overflow. Copy in 2 parts.
			// First block
			const firstSize=0x10000-startAddress;
			const firstBlock=new Uint8Array(totalBlock, 0, firstSize);
			this.z80Memory.set(firstBlock, startAddress);
			// Second block
			const secondSize=size-firstSize;
			const secondBlock=new Uint8Array(totalBlock, firstSize, secondSize);
			this.z80Memory.set(secondBlock);
		}
	}


	/**
	 * Writes a complete memory bank.
	 * @param bank The bank number.
	 * @param block The block to write.
	 */
	public writeBank(bank: number, block: Buffer|Uint8Array) {
		assert(block.length==ZxMemory.MEMORY_BANK_SIZE);
		if (!(block instanceof Uint8Array))
			block=new Uint8Array(block);
		const memBank=this.banks[bank];
		memBank.set(block);
	}


	/**
	 * Copies the memory banks into the Z80 memory.
	 * Called e.g. after deserialization or after loading.
	 */
	public copyBanksToZ80Mem() {
		let offset=0;
		let slotIndex=0;
		while (offset<0x10000) {
			const bank=this.slots[slotIndex];
			const memBank=this.banks[bank];
			this.z80Memory.set(memBank, offset);
			// Next
			offset+=ZxMemory.MEMORY_BANK_SIZE;
			slotIndex++;
		}
	}


	/**
	 * Copies the Z80 memory into the banks.
	 * Called e.g. before serialization or before saving.
	 */
	public copyZ80MemToBanks() {
		let offset=0;
		let slotIndex=0;
		while (offset<0x10000) {
			const bank=this.slots[slotIndex];
			const memBank=this.banks[bank];
			const z80SlotMem=new Uint8Array(this.z80Memory.buffer, offset, ZxMemory.MEMORY_BANK_SIZE);
			memBank.set(z80SlotMem);
			// Next
			offset+=ZxMemory.MEMORY_BANK_SIZE;
			slotIndex++;
		}
	}


	/**
	 * Loads the 48K Spectrum roms in bank 0xFE and 0xFF
	 */
	public loadRom() {
		// Load rom
		let filepath=Utility.getExtensionPath();
		filepath=path.join(filepath, 'data/48.rom');
		const data=fs.readFileSync(filepath);
		// Split over 2 banks
		this.writeBank(254, data.slice(0, ZxMemory.MEMORY_BANK_SIZE));
		this.writeBank(255, data.slice(ZxMemory.MEMORY_BANK_SIZE));
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
		const screenMem=new Uint8Array(this.z80Memory.buffer, 0x4000);
		const colorStart=ZxMemory.SCREEN_HEIGHT*ZxMemory.SCREEN_WIDTH/8;
		// Create pixels memory
		const pixels=new Array<number>(ZxMemory.SCREEN_HEIGHT*ZxMemory.SCREEN_WIDTH);
		let pixelIndex=0;
		let inIndex=0;
		let colorIndex=0;
		// One line after the other
		for (let y=0; y<ZxMemory.SCREEN_HEIGHT; y++) {
			// Calculate offset in ZX Spectrum screen
			inIndex=((y&0b111)<<8)|((y&0b1100_0000)<<5)|((y&0b11_1000)<<2);
			colorIndex=(y&0b1111_1000)<<2;	// y/8*32;
			for (let x=0; x<ZxMemory.SCREEN_WIDTH/8; x++) {
				const byteValue=screenMem[inIndex];
				// Get color
				let color=screenMem[colorStart+colorIndex];
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

