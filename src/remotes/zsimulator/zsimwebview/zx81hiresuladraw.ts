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
	 */
	public static drawUlaScreen(ctx: CanvasRenderingContext2D, imgData: ImageData, ulaScreen: Uint8Array) {
		// Get pixels memory
		const pixels = imgData.data;
		let pixelIndex = 0;
		pixels.fill(128);	// gray

		// Whole screen is converted by evaluating blocks that are equal to the color attributes.
		const width8 = Zx81HiResUlaDraw.SCREEN_WIDTH / 8;
		const white = 255;
		const black = 0;
		let index = 0;
		let len = width8;
		while (index < ulaScreen.length) {
			// Skip rest of line (make white), len from previous line
			const remainingLen = (width8 - len) * 8;
			pixels.fill(white, pixelIndex, pixelIndex + remainingLen * 4);	// white and alpha are the same values (255), so I can use fill
			pixelIndex += remainingLen * 4;
			// Get length of line
			len = ulaScreen[index++];
			// Loop over line
			for (let x = len; x > 0; x--) {
				const byteValue = ulaScreen[index++];
				// Loop over bits
				let mask = 128;
				while (mask >= 1) {	// 8x
					const value = (byteValue & mask) ? black : white;
					pixels[pixelIndex++] = value;	// red
					pixels[pixelIndex++] = value;	// green
					pixels[pixelIndex++] = value;	// blue
					pixels[pixelIndex++] = 255;	// alpha
					// Next pixel
					mask /= 2;
				}
			}
		}

		// Write image
		ctx.putImageData(imgData, 0, 0);
	}
}

