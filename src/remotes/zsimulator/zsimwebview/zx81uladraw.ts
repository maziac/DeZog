/** Represents the ZX81 simulated screen.
 */
export class Zx81UlaDraw {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	// The chroma81 palette. (Same as Spectrum)
	protected static chroma81Palette = [
		// Bright 0: r,g,b
		0x00, 0x00, 0x00,	// Black:	0
		0x00, 0x00, 0xD7,	// Blue:	1
		0xD7, 0x00, 0x00,	// Red:		2
		0xD7, 0x00, 0xD7,	// Magenta:	3

		0x00, 0xD7, 0x00,	// Green:	4
		0x00, 0xD7, 0xD7,	// Cyan:	5
		0xD7, 0xD7, 0x00,	// Yellow:	6
		0xD7, 0xD7, 0xD7,	// White:	7

		// Bright 1: r,g,b
		0x00, 0x00, 0x00,	// Black:	8
		0x00, 0x00, 0xFF,	// Blue:	9
		0xFF, 0x00, 0x00,	// Red:		10
		0xFF, 0x00, 0xFF,	// Magenta:	11

		0x00, 0xFF, 0x00,	// Green:	12
		0x00, 0xFF, 0xFF,	// Cyan:	13
		0xFF, 0xFF, 0x00,	// Yellow:	14
		0xFF, 0xFF, 0xFF,	// White:	15
	];

	/** Draws a ZX Spectrum ULA screen into the given canvas.
	 * @param ctx The canvas 2d context to draw to.
	 * @param imgData A reusable array to create the pixel data in.
	 * @param dfile The DFILE data. If undefined, FAST mode is active.
	 * @param charset The charset data.
	 * @param chroma The color data: { mode: number, data: Uint8Array }.
	 * @param debug true if debug mode is on. Shows grey background if
	 * dfile is not elapsed.
	 */
	public static drawUlaScreen(ctx: CanvasRenderingContext2D, imgData: ImageData, dfile: Uint8Array, charset: Uint8Array, chroma: {mode: number, data: Uint8Array}, debug: boolean) {
		const chromaMode = chroma?.mode;
		const pixels = imgData.data;
		let dfileIndex = dfile[0] === 0x76 ? 1 : 0;

		if(debug)
			pixels.fill(128);	// gray background
		else
			pixels.fill(0xFF);	// white background

		// Safety check
		if (!dfile)
			return;

		const width = Zx81UlaDraw.SCREEN_WIDTH / 8;
		const height = Zx81UlaDraw.SCREEN_HEIGHT / 8;
		let x = 0;
		let y = 0;

		let fgRed = 0, fgGreen = 0, fgBlue = 0;
		let bgRed = 0xFF, bgGreen = 0xFF, bgBlue = 0xFF;

		while(y < height) {
			const char = dfile[dfileIndex];
			if(x >= width || char === 0x76) {
				x = 0;
				y++;
				dfileIndex++;
				continue;
			};

			const inverted = (char & 0x80) !== 0;
			let charIndex = (char & 0x7f) * 8;
			let pixelIndex = (y * Zx81UlaDraw.SCREEN_WIDTH + x) * 8 * 4;

			// Color: Chroma mode 1?
			if (chromaMode === 1) {
				// Mode 1: Attribute file (similar to ZX Spectrum)
				const color = chroma.data[dfileIndex];
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
			// 8 lines per character
			for(let charY = 0; charY < 8; ++charY) {
				let byte = charset[charIndex];
				if (inverted) byte = byte ^ 0xFF;
				// Color: Chroma mode 0?
				if (chromaMode === 0) {
					// Chroma mode 0: Character code
					const color = chroma.data[charIndex * 8 + charY];
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
				// 8 pixels par line
				for(let charX = 0; charX < 8; ++charX) {
					if (byte & 0x80) {
						// Foreground color
						pixels[pixelIndex++] = fgRed;
						pixels[pixelIndex++] = fgGreen;
						pixels[pixelIndex++] = fgBlue;
						pixels[pixelIndex++] = 0xFF;
					}
					else {
						// Background color
						pixels[pixelIndex++] = bgRed;
						pixels[pixelIndex++] = bgGreen;
						pixels[pixelIndex++] = bgBlue;
						pixels[pixelIndex++] = 0xFF;
					}
					byte = (byte & 0x7F) << 1;
				}
				// Next line
				pixelIndex += (Zx81UlaDraw.SCREEN_WIDTH - 8) * 4;
				charIndex++;
			}

			x++;
			dfileIndex++;
		}

		ctx.putImageData(imgData, 0, 0);
    }
}

