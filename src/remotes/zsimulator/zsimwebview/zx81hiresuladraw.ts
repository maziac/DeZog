import {Zx81UlaDraw} from "./zx81uladraw";	// For the palette

/** Draws a ZX81 (HiRes) screen of size 256*192.
 */
export class Zx81HiResUlaDraw {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	/** Draws a ZX81 ULA screen into the given canvas.
	 * @param ctx The canvas 2d context to draw to.
	 * @param imgData A reusable array to create the pixel data in.
	 * @param ulaScreen The ULA screen data. B/W pixels.
	 * @param colorData The correspondent color data.
	 * @param debug true if debug mode is on. Shows grey background if
	 * dfile is not elapsed.
	 */
	public static drawUlaScreen(ctx: CanvasRenderingContext2D, imgData: ImageData, ulaScreen: Uint8Array, colorData: Uint8Array, debug: boolean) {
		// Get pixels memory
		const pixels = imgData.data;
		let pixelIndex = 0;

		if (debug)
			pixels.fill(128);	// gray background
		else
			pixels.fill(0xFF);	// white background

		// Safety check
		if (!ulaScreen)
			return;

		// Whole screen is converted by evaluating blocks that are equal to the color attributes.
		const width8 = Zx81HiResUlaDraw.SCREEN_WIDTH / 8;
		const white = 255;
		let index = 0;
		let len = width8;
		let fgRed = 0, fgGreen = 0, fgBlue = 0;
		let bgRed = 0xFF, bgGreen = 0xFF, bgBlue = 0xFF;

		while (index < ulaScreen.length) {
			// Skip rest of line (make white), len from previous line
			const remainingLen = (width8 - len) * 8;
			if(!debug)
				pixels.fill(white, pixelIndex, pixelIndex + remainingLen * 4);	// white and alpha are the same values (255), so I can use fill
			pixelIndex += remainingLen * 4;
			// Get length of line
			len = ulaScreen[index++];
			// Loop over line
			for (let x = len; x > 0; x--) {
				// Get color
				if (colorData) {
					const color = colorData[index];
					// fg color
					let colorIndex = (color & 0x0F) * 3;
					fgRed = Zx81UlaDraw.chroma81Palette[colorIndex];
					fgGreen = Zx81UlaDraw.chroma81Palette[colorIndex + 1];
					fgBlue = Zx81UlaDraw.chroma81Palette[colorIndex + 2];
					// bg color
					colorIndex = (color >>> 4) * 3;
					bgRed = Zx81UlaDraw.chroma81Palette[colorIndex];
					bgGreen = Zx81UlaDraw.chroma81Palette[colorIndex + 1];
					bgBlue = Zx81UlaDraw.chroma81Palette[colorIndex + 2];
				}
				// Get screen data
				const byteValue = ulaScreen[index++];
				// Loop over bits
				let mask = 128;
				while (mask >= 1) {	// 8x
					if (byteValue & mask) {
						// Foreground color
						pixels[pixelIndex++] = fgRed;
						pixels[pixelIndex++] = fgGreen;
						pixels[pixelIndex++] = fgBlue;
						pixels[pixelIndex++] = 0xFF;	// alpha
					}
					else {
						// Background color
						pixels[pixelIndex++] = bgRed;
						pixels[pixelIndex++] = bgGreen;
						pixels[pixelIndex++] = bgBlue;
						pixels[pixelIndex++] = 0xFF;	// alpha
					}
					// Next pixel
					mask /= 2;
				}
			}
		}

		// Write image
		ctx.putImageData(imgData, 0, 0);
	}
}

