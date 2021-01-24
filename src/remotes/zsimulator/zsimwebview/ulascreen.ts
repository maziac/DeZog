
/**
 * Represents the ZX 48K ULA screen. (0x4000-0x5AFF)
 * I.e. it takes a bank and converts it to a gif image.
 */
class UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

	// The ZX palette.
	protected static zxPalette = [
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


	/**
	 * Draws a ZX Spectrum ULA screen into the given canvas.
	 * @param canvas The canvas to draw to.
	 * @param ulaScreen The ULA screen data. Pixels + color attributes.
	 * @param time An optional time in ms which is used for the flashing of the color attributes.
	 * The flash frequency is 1.6Hz.
	 */
	public static drawUlaScreen(ctx: CanvasRenderingContext2D, imgData: ImageData, ulaScreen: Uint8Array, time = 0) {
		// Get canvas drawing context
//		const ctx = canvas.getContext("2d")!;
//		const imgData = ctx.createImageData(UlaScreen.SCREEN_WIDTH, UlaScreen.SCREEN_HEIGHT);

		// Check time. Calculate remainder.
		const interval = 625;	// 625 ms
		const remainder = time % interval;
		const flash = (remainder >= interval / 2) ? 0x80 : 0; // 0x80 if colors should be exchanged

		// Find memory to display
		const colorStart = UlaScreen.SCREEN_HEIGHT * UlaScreen.SCREEN_WIDTH / 8;

		// Get pixels memory
		//const pixels = new Arra
		const pixels = imgData.data;
		let pixelIndex = 0;
		let inIndex = 0;
		let colorIndex = 0;


		// Whole screen is converted by evaluating blocks that are equal to the color attributes.
		const width8 = UlaScreen.SCREEN_WIDTH / 8;
		const height = UlaScreen.SCREEN_HEIGHT;
		colorIndex = colorStart;
		for (let y = 0; y < height; y += 8) {
			// Calculate offset in ZX Spectrum screen
			inIndex = ((y & 0b1100_0000) * 32) + ((y & 0b11_1000) * 4);
			// Iterate all 32 bytes from left to right
			for (let x = 0; x < width8; x++) {
				// Get color
				let color = ulaScreen[colorIndex];
				const cIndexBase = (color & 0x40) / 8;	// Brightness (/8 = >>>3 but faster)
				pixelIndex = (y * 256 + x * 8) * 4;
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
						pixels[pixelIndex++] = this.zxPalette[cIndex++];	// red
						pixels[pixelIndex++] = this.zxPalette[cIndex++];	// green
						pixels[pixelIndex++] = this.zxPalette[cIndex];		// blue
						pixels[pixelIndex++] = 255;							// alpha

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

		// Write image
		ctx.putImageData(imgData, 0, 0);
	}
}

