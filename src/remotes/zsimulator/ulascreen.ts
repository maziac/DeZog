import {Utility} from '../../misc/utility';
import {SimulatedMemory} from './simmemory';


/**
 * Represents the ZX 48K ULA screen. (0x4000-0x5AFF)
 * I.e. it takes a bank and converts it to a gif image.
 */
export class UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	// Pointer to the memory class.
	protected memory: SimulatedMemory;

	// The address used to display the ULA screen.
	// This is normally bank 5 but could be changed to bank7 in ZX128.
	// I.e. normally 0x4000, but could be 7*16=0x1C000 for ZX128.
	protected ulaScreenAddress: number;


	// The ZX palette.
	protected zxPalette = [
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
	 * @param time An optional time in ms which is used for the flashing of the color attributes.
	 * The flash frequency is 1.6Hz.
	 * @returns The screen as an imageData buffer.
	 */
	public getUlaScreen(time = 0): ImageData {
		// Create pixels from the screen memory
		const pixels = this.createPixels(time);
		// TODO: move createpixels + getulacreen in one function
		// Return
		return pixels;
	}


	/**
	 * Converts the screen pixels, the bits in the bytes, into pixels
	 * with a color index.
	 * Uses time to distinguish when to switch
	 * paper and ink for flashing.
	 * The blink frequency is 1.6Hz -> 62.5ms
	 * @param time in ms.
	 * @returns The screen as an imageData buffer.
	 */
	protected createPixels(time = 0): ImageData {
		// Check time. Calculate remainder.
		const interval = 625;	// 625 ms
		const remainder = time % interval;
		const flash = (remainder >= interval/2) ? 0x80 : 0; // 0x80 if colors should be exchanged

		// Find memory to display
		const screenMem=this.memory.getMemoryData();
		const screenBaseAddr=this.ulaScreenAddress;
		const colorStart=screenBaseAddr+UlaScreen.SCREEN_HEIGHT*UlaScreen.SCREEN_WIDTH/8;

		// Create pixels memory
		//const pixels = new Array<number>(UlaScreen.SCREEN_HEIGHT * UlaScreen.SCREEN_WIDTH);
		const imgData: ImageData = {
			width: UlaScreen.SCREEN_WIDTH,
			height: UlaScreen.SCREEN_HEIGHT,
			data: new Uint8ClampedArray(UlaScreen.SCREEN_WIDTH * UlaScreen.SCREEN_HEIGHT * 4)
		};
		const pixels = imgData.data;
		let pixelIndex=0;
		let inIndex=0;
		let colorIndex=0;


		if (false) {
			// One line after the other
			const width8 = UlaScreen.SCREEN_WIDTH / 8;
			for (let y = 0; y < UlaScreen.SCREEN_HEIGHT; y++) {
				// Calculate offset in ZX Spectrum screen
				inIndex = screenBaseAddr + (((y & 0b111) * 256) | ((y & 0b1100_0000) * 32) | ((y & 0b11_1000) * 4));
				colorIndex = colorStart + (y & 0b1111_1000) * 4;	// y/8*32;
				for (let x = 0; x < width8; x++) {
					let byteValue = screenMem[inIndex];
					// Get color
					let color = screenMem[colorIndex];
					let mask = 0x80;
					if (color & flash) {
						// Toggle back- and foreground
						byteValue ^= 0xFF;
					}
					while (mask) {	// 8x
						let value = byteValue & mask;
						// Check if pixel is set
						let cIndex = (color & 0x40) / 8;	// Brightness (/8 = >>>3 but faster)
						if (value) {
							// Set: foreground
							cIndex += color & 0x07;
						}
						else {
							// Unset: background
							cIndex += (color >>> 3) & 0x07;
						}

						// TODO: Remove check
						Utility.assert(pixelIndex < pixels.length);

						// Save colors from index
						cIndex *= 3;	// rgb = 3 bytes
						pixels[pixelIndex++] = this.zxPalette[cIndex++];	// red
						pixels[pixelIndex++] = this.zxPalette[cIndex++];	// green
						pixels[pixelIndex++] = this.zxPalette[cIndex];	// blue
						pixels[pixelIndex++] = 255;	// alpha

						// Next pixel
						mask >>>= 1;
					}
					// Next byte
					inIndex++;
					colorIndex++;
				}
			}
		}
		else {

			// Whole screen is converted by evaluating blocks that are equal to the color attributes.
			const width8 = UlaScreen.SCREEN_WIDTH / 8;
			const height = UlaScreen.SCREEN_HEIGHT;
			colorIndex = colorStart;
			for (let y = 0; y < height; y += 8) {
				// Calculate offset in ZX Spectrum screen
				inIndex = screenBaseAddr + ((y & 0b1100_0000) * 32) + ((y & 0b11_1000) * 4);
				// Iterate all 32 bytes from left to right
				for (let x = 0; x < width8; x++) {
					// Get color
					let color = screenMem[colorIndex];
					const cIndexBase = (color & 0x40) / 8;	// Brightness (/8 = >>>3 but faster)
					pixelIndex = (y * 256 + x * 8) * 4;
					// Iterate a block of 8 bytes downwards
					for (let y2 = 0; y2 < 8; y2++) {
						let byteValue = screenMem[inIndex + y2 * 256];
						if (color & flash) {
							// Toggle back- and foreground
							byteValue ^= 255;
						}
						let mask = 128;
						while(mask >= 1) {	// 8x
							let value = byteValue & mask;
							// Check if pixel is set
							let cIndex = cIndexBase;
							if (value) {
								// Set: foreground
								cIndex += color & 7;
							}
							else {
								// Unset: background
								cIndex += (color / 8) & 7;
							}

							//Utility.assert(pixelIndex < pixels.length);

							// Save colors from index
							cIndex *= 3;	// rgb = 3 bytes
							pixels[pixelIndex++] = this.zxPalette[cIndex++];	// red
							pixels[pixelIndex++] = this.zxPalette[cIndex++];	// green
							pixels[pixelIndex++] = this.zxPalette[cIndex];	// blue
							pixels[pixelIndex++] = 255;	// alpha

							// Next pixel
							mask /= 2;
						}
						// Next
						pixelIndex += 992;	// (256-8) * 4;
					}
					// Next byte
					inIndex++;
					colorIndex++;
				}
			}
		}

		return imgData;
	}


	/**
	 * Returns the palette depending on time.
	 * @returns the ZX Spectrum palette.
	 */
	protected getZxPalette(): number[] {
		return this.zxPalette;
	}
}

