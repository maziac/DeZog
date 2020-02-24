import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import {ImageConvert} from '../../imageconvert';
import {Utility} from '../../utility';


/**
 * Represents the memory, banking and slots of a ZX Spectrum
 * and ZX Next.
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

	// Holds the memory banks.
	protected banks: Array<Uint8Array>;

	// Holds the slot assignments to the banks.
	// Note: I use 254 for ROM 0-0x1FFF and 255 for ROM 0x2000-0x3FFF.
	// The ZXNext defines both at 255.
	protected slots: number[]=[254, 255, 10, 11, 4, 5, 0, 1];

	/// Constructor.
	constructor() {
		// Create memory banks
		this.banks=new Array<Uint8Array>(ZxMemory.NUMBER_OF_BANKS);
		for (let b=0; b<ZxMemory.NUMBER_OF_BANKS; b++) {
			const bank=new Uint8Array(ZxMemory.MEMORY_BANK_SIZE);
			this.banks[b]=bank;
			// Fill RAM randomly
			for (let i=0; i<ZxMemory.MEMORY_BANK_SIZE; i++)
				bank[i]=0;//Math.random()*256;
		}
	}

	// Read 1 byte.
	public read8(addr: number): number {
		const [bankAddr, bankMem]=this.getBankForAddr(addr);
		const value=bankMem[bankAddr];
		return value;
	}

	// Write 1 byte.
	public write8(addr: number, val: number) {
		const [bankAddr, bankMem]=this.getBankForAddr(addr);
		bankMem[bankAddr]=val;
	}

	/**
	 * Returns the bank memory and the address into it.
	 * @param addr The ZX spectrum memory address.
	 * @returns [number, Uint8Array] The address (0-0x1FFF) and the memory bank array.
	 */
	protected getBankForAddr(addr: number): [number, Uint8Array] {
		const slot=(addr>>13)&0x07;
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
	 * Reads a block of bytes.
	 * @param startAddress Start address.
	 * @param size The size of the block.
	 */
	public readBlock(startAddress: number, size: number): Uint8Array {
		const totalBlock=new Uint8Array(size);
		let offset=0;
		// The block may span several banks.
		let addr=startAddress;
		while (size>0) {
			// Get memory bank
			const [bankAddr, bankMem]=this.getBankForAddr(addr);
			// Get block within one bank
			let blockEnd=bankAddr+size;
			if (blockEnd>ZxMemory.MEMORY_BANK_SIZE)
				blockEnd=ZxMemory.MEMORY_BANK_SIZE;
			const partBlockSize=blockEnd-bankAddr;
			// Copy partial block
			const partBlock=bankMem.subarray(bankAddr, blockEnd);
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
		while (size>0) {
			// Get memory bank
			const [bankAddr, bankMem]=this.getBankForAddr(addr);
			// Get block within one bank
			let blockEnd=bankAddr+size;
			if (blockEnd>ZxMemory.MEMORY_BANK_SIZE)
				blockEnd=ZxMemory.MEMORY_BANK_SIZE;
			const partBlockSize=blockEnd-bankAddr;
			// Copy partial block
			const partBlock=totalBlock.subarray(offset, offset+partBlockSize);
			// Copy to memory bank
			bankMem.set(partBlock, bankAddr);
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
		assert(block.length==ZxMemory.MEMORY_BANK_SIZE);
		if (!(block instanceof Uint8Array))
			block=new Uint8Array(block);
		const memBank=this.banks[bank];
		memBank.set(block);
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
	 * Converts a ZX Spectrum ULA screen into a gif image.
	 * @returns The screen as a gif buffer.
	 */
	public getUlaScreen(): number[] {
		// Get sceen memory
		const [, screenMem]=this.getBankForAddr(0x4000);
		// Create pixels from the screen memory
		const pixels=this.createPixels(screenMem);
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
	protected createPixels(screenMem: Uint8Array): Array<number> {
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
					let cIndex=(color&0x40)>>3;	// Brightness
					if (value) {
						// Set: foreround
						cIndex|=color&0x07;
					}
					else {
						// Unset: background
						cIndex|=(color>>3)&0x07;
					}

					// Save color index
					pixels[pixelIndex]=cIndex;

					// Next pixel
					mask>>=1;
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

