/** Represents the ZX81 simulated screen.
 */
export class Zx81UlaDraw {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;


	/** Draws a ZX Spectrum ULA screen into the given canvas.
	 * @param ctx The canvas 2d context to draw to.
	 * @param imgData A reusable array to create the pixel data in.
	 * @param dfile The DFILE data. If undefined, FAST mode is active.
	 * @param charset The charset data.
	 */
	public static drawUlaScreen(ctx: CanvasRenderingContext2D, imgData: ImageData, dfile: Uint8Array, charset: Uint8Array) {
		const pixels = imgData.data;
		let dfileIndex = dfile[0] === 0x76 ? 1 : 0;

		pixels.fill(128);	// gray

		//pixels.fill(0xFF);	// TODO: which one to use: gray or white

		const width = Zx81UlaDraw.SCREEN_WIDTH / 8;
		const height = Zx81UlaDraw.SCREEN_HEIGHT / 8;
		let x = 0;
		let y = 0;

		while(y < height) {
			const char = dfile[dfileIndex++];
			if(x >= width || char === 0x76) {
				x = 0;
				y++;
				continue;
			};

			const inverted = (char & 0x80) !== 0;
			let charIndex = (char & 0x7f) * 8;
			let pixelIndex = (y * Zx81UlaDraw.SCREEN_WIDTH + x) * 8 * 4;

			// 8 lines per character
			for(let charY = 0; charY < 8; ++charY) {
				let byte = charset[charIndex++];
				if (inverted) byte = byte ^ 0xFF;
				// 8 pixels par line
				for(let charX = 0; charX < 8; ++charX) {
					const bit = (byte & 0x80) === 0 ? 0xFF : 0x00;
					pixels[pixelIndex++] = bit;
					pixels[pixelIndex++] = bit;
					pixels[pixelIndex++] = bit;
					pixels[pixelIndex++] = 0xFF;
					byte = (byte & 0x7F) << 1;
				}
				// Next line
				pixelIndex += (Zx81UlaDraw.SCREEN_WIDTH - 8) * 4;
			}

			x++;
		}

		ctx.putImageData(imgData, 0, 0);
    }
}

