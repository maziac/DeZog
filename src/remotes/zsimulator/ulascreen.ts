import {ImageConvert} from '../../misc/imageconvert';
import {SimulatedMemory} from './simmemory';


/**
 * Represents the ZX 48K ULA screen. (0x4000-0x5AFF)
 * I.e. it takes a bank and converts it to a gif image.
 */
export class UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT=192;

	// Screen width
	public static SCREEN_WIDTH=256;

	// Pointer to the memory class.
	protected memory: SimulatedMemory;

	// The address used to display the ULA screen.
	// This is normally bank 5 but could be changed to bank7 in ZX128.
	// I.e. normally 0x4000, but could be 7*16=0x1C000 for ZX128.
	protected ulaScreenAddress: number;


	/// Constructor.
	constructor(memory: SimulatedMemory) {
		this.memory=memory;
		this.ulaScreenAddress=0x4000;
	}


	/**
	 * Sets the bank to use for the screen display.
	 * @param screenAddress i.e. the offset inside 'memoryData'. Can be > 0xFFFF.
	 */
	public setUlaScreenAddress(screenAddress: number) {
		this.ulaScreenAddress=screenAddress;
	}


	/**
	 * Converts a ZX Spectrum ULA screen into a gif image.
	 * @returns The screen as a gif buffer.
	 */
	public getUlaScreen(): number[] {
		// Create pixels from the screen memory
		const pixels=this.createPixels();
		// Get ZX palette
		const zxPalette=UlaScreen.getZxPalette();
		// Convert to gif
		const gifBuffer=ImageConvert.createGifFromArray(UlaScreen.SCREEN_WIDTH, UlaScreen.SCREEN_HEIGHT, pixels, zxPalette);
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
		const screenMem=this.memory.getMemoryData();
		const screenBaseAddr=this.ulaScreenAddress;
		const colorStart=screenBaseAddr+UlaScreen.SCREEN_HEIGHT*UlaScreen.SCREEN_WIDTH/8;

		// Create pixels memory
		const pixels=new Array<number>(UlaScreen.SCREEN_HEIGHT*UlaScreen.SCREEN_WIDTH);
		let pixelIndex=0;
		let inIndex=0;
		let colorIndex=0;

		// One line after the other
		for (let y=0; y<UlaScreen.SCREEN_HEIGHT; y++) {
			// Calculate offset in ZX Spectrum screen
			inIndex=screenBaseAddr+(((y&0b111)<<8)|((y&0b1100_0000)<<5)|((y&0b11_1000)<<2));
			colorIndex=colorStart+((y&0b1111_1000)<<2);	// y/8*32;
			for (let x=0; x<UlaScreen.SCREEN_WIDTH/8; x++) {
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

