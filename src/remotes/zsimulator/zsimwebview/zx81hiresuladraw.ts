import {UlaDraw} from "./uladraw";

/** Draws a ZX81 (HiRes) screen of size 256*192.
 */
export class Zx81HiResUlaDraw extends UlaDraw {
	// The virtual size including the HSYNC, i.e. 207 clock cycles.
	protected SCREEN_TOTAL_WIDTH = 414;

	// The screen x to width to show.
	protected firstX: number;
	protected width: number;

	// If debug mode is on: Shows grey background if nothing is drawn.
	protected debug: boolean;


	/** Constructor.
	 * Creates an imgData of the full size of theoretical pixels (414).
	 * So there are invisible borders left and right because the
	 * something could have been written to the border area.
	 * For top/bottom this cannot happen, so the imgData has no
	 * spare area here.
	 * @param htmlCanvas The html canvas to draw to.
	 * @param ulaOptions The ULA options.
	 */
	constructor(htmlCanvas: HTMLCanvasElement, ulaOptions: any) {
		super(htmlCanvas);
		this.debug = ulaOptions.debug;

		const area = ulaOptions.screenArea;
		this.firstX = area.firstX;
		this.width = area.lastX - area.firstX + 1;
		const height = area.lastY - area.firstY + 1;
		// Change html canvas and context width and height
		htmlCanvas.width = this.width;
		htmlCanvas.height = height;
		// Create image data
		this.imgData = this.screenImgContext.createImageData(this.SCREEN_TOTAL_WIDTH, height);
		// Get pixels memory (Get a 32bit view of the buffer)
		this.pixels = new Uint32Array(this.imgData.data.buffer);
	}


	/** Draws a ZX81 ULA screen into the given canvas.
	 * @param ulaData {ulaScreen, colorData, borderColor} class.
	 */
	public drawUlaScreen(ulaData: any) {
		const ulaScreen = ulaData.data;
		// Safety check
		if (!ulaScreen)
			return;

		const colorData = ulaData.colorData;
		const backgroundColor = this.getRgbColor(ulaData.borderColor);

		let pixelIndex = 0;

		// Default is transparent
		let rgb = 65536 * backgroundColor.b + backgroundColor.g * 256 + backgroundColor.r;
		rgb += this.debug ? 0x80000000 : 0xFF000000;	// semi transparent for debug mode
		this.pixels.fill(rgb);

		// Whole screen is converted by evaluating blocks that are equal to the color attributes.
		let index = 0;
		let colorIndex = 0;
		let xAdd = 0;
		let fgRed = 0, fgGreen = 0, fgBlue = 0;
		let bgRed = 0xFF, bgGreen = 0xFF, bgBlue = 0xFF;

		let lineCounter = 0;
		while (index < ulaScreen.length) {
			// Get length of line
			const len = ulaScreen[index++];
			// Loop over line
			for (let x = len; x > 0; x--) {
				const xTstates = ulaScreen[index++];
				xAdd = xTstates * 2;
				pixelIndex = (lineCounter * this.SCREEN_TOTAL_WIDTH + xAdd);
				// Get color
				if (colorData) {
					const color = colorData[colorIndex++];
					// fg color
					let cIndex = (color & 0x0F) * 3;
					fgRed = this.zxPalette[cIndex];
					fgGreen = this.zxPalette[cIndex + 1];
					fgBlue = this.zxPalette[cIndex + 2];
					// bg color
					cIndex = (color >>> 4) * 3;
					bgRed = this.zxPalette[cIndex];
					bgGreen = this.zxPalette[cIndex + 1];
					bgBlue = this.zxPalette[cIndex + 2];
				}
				// Get screen data
				const byteValue = ulaScreen[index++];
				// Loop over bits
				let mask = 128;
				while (mask >= 1) {	// 8x
					if (byteValue & mask) {
						// Foreground color
						this.pixels[pixelIndex++] = 0xFF000000 + 65536 * fgBlue + fgGreen * 256 + fgRed;
					}
					else {
						// Background color
						this.pixels[pixelIndex++] = 0xFF000000 + 65536 * bgBlue + bgGreen * 256 + bgRed;
					}
					// Next pixel
					mask /= 2;
				}
			}
			// Next line
			lineCounter++;
		}

		// Show HSYNC
		this.drawVertLine(this.pixels, 192, 0xFF, 0, 0);
		// Show left and right border
		this.drawVertLine(this.pixels, 32, 0, 0xFF, 0);
		this.drawVertLine(this.pixels, 192 - 32, 0, 0xFF, 0);

		// Write image
		this.screenImgContext.putImageData(this.imgData, 0, 0, this.firstX, 0, this.width, this.imgData.height);
	}


	/** Draws a vertical line. */
	protected drawVertLine(pixels: Uint32Array, tstates: number, r: number, g: number, b: number) {
		const screenHeight = this.imgData.height;
		for (let y = 0; y < screenHeight; y++) {
			let pixelIndex = (y * this.SCREEN_TOTAL_WIDTH + tstates * 2);
			pixels[pixelIndex++] = 0xFF000000 + 65536 * b + g * 256 + r;
		}
	}
}

