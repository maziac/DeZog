import {UlaDraw} from "./uladraw";

/** Represents the ZX 48K ULA screen. (0x4000-0x5AFF)
 * I.e. it takes a bank and converts it to a gif image.
 */
export class SpectrumUlaDraw extends UlaDraw {
	// First index where the drawing starts.
	protected pixelsStartIndex: number;


	/** Constructor.
	 * Creates an imgData of the size given by screenArea.
	 * If screenArea is to small, the size is enlarged to show
	 * at least the standard screen area.
	 * @param htmlCanvas The html canvas to draw to.
	 * @param ulaOptions The ULA options.
	 */
	constructor(htmlCanvas: HTMLCanvasElement, borderWidth: number) {
		super(htmlCanvas);

		// Change html canvas and context width and height
		const width = this.SCREEN_WIDTH + 2 * borderWidth;
		const height = this.SCREEN_HEIGHT + 2 * borderWidth;
		htmlCanvas.width = width;
		htmlCanvas.height = height;
		// Create image data
		this.imgData = this.screenImgContext.createImageData(width, height);
		// Get pixels memory (Get a 32bit view of the buffer)
		this.pixels = new Uint32Array(this.imgData.data.buffer);

		// Calculate first index into the pixels data
		// (the left, top corner to start drawing)
		this.pixelsStartIndex = borderWidth * width + borderWidth;
	}


	/** Draws a ZX Spectrum ULA screen into the given canvas.
	 * @param ulaData {ulaScreen, time, borderColor} class.
	 * - ulaScreen The ULA screen data. Pixels + color attributes.
	 * - time [s] An optional time in ms which is used for the
	 * flashing of the color attributes.
	 * The flash frequency is 1/640ms.
	 * - borderColor According zx spectrum palette.
	 */
	public drawUlaScreen(ulaData: any) {
		const ulaScreen = ulaData.ulaScreen;
		const time = ulaData.time;

		// Border (background) color
		const bgCol = this.getRgbColor(ulaData.borderColor);
		const rgb = 0xFF000000 + 65536 * bgCol.b + bgCol.g * 256 + bgCol.r;
		this.pixels.fill(rgb);

		// Check time. Calculate remainder.
		const interval = 640 / 1000.0;	// 640 ms
		const remainder = time % interval;
		const flash = (remainder >= interval / 2) ? 0x80 : 0; // 0x80 if colors should be exchanged

		// Find memory to display
		const width8 = this.SCREEN_WIDTH / 8;
		const height = this.SCREEN_HEIGHT;
		const colorStart = width8 * height;	// Start of color attributes

		// Initialize
		let pixelIndex = 0;
		let inIndex = 0;
		let colorIndex = 0;
		const pixelsWidth = this.imgData.width;

		// Whole screen is converted by evaluating blocks that are equal to the color attributes.
		colorIndex = colorStart;
		for (let y = 0; y < height; y += 8) {
			// Calculate offset in ZX Spectrum screen
			inIndex = ((y & 0b1100_0000) * 32) + ((y & 0b11_1000) * 4);
			// Iterate all 32 bytes from left to right
			for (let x = 0; x < width8; x++) {
				// Get color
				let color = ulaScreen[colorIndex];
				const cIndexBase = (color & 0x40) / 8;	// Brightness (/8 = >>>3 but faster)
				pixelIndex = this.pixelsStartIndex + (y * pixelsWidth + x * 8);
				// Iterate a block of 8 bytes downwards
				for (let y2 = 0; y2 < 8; y2++) {
					let byteValue = ulaScreen[inIndex + y2 * 256];
					if (color & flash) {
						// Toggle back- and foreground
						byteValue ^= 255;
					}
					let mask = 128;
					while (mask >= 1) {	// 8x
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

						// Save colors from index
						cIndex *= 3;	// rgb = 3 bytes
						const red = this.zxPalette[colorIndex];
						const green = this.zxPalette[colorIndex + 1];
						const blue = this.zxPalette[colorIndex + 2];
						this.pixels[pixelIndex++] = 0xFF000000 + 65536 * blue + green * 256 + red;

						// Next pixel
						mask /= 2;
					}
					// Next
					pixelIndex += pixelsWidth - 8;
				}
				// Next byte
				inIndex++;
				colorIndex++;
			}
		}

		// Write image
		this.screenImgContext.putImageData(this.imgData, 0, 0);
	}
}
