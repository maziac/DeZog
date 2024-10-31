import {Zx81BaseUlaDraw} from "./zx81baseuladraw";

/** Represents the ZX81 simulated screen.
 */
export class Zx81UlaDraw extends Zx81BaseUlaDraw {
	// First index where the drawing starts.
	protected pixelsStartIndex: number;


	/** Constructor.
	 * Creates an imgData of the size given by screenArea.
	 * If screenArea is to small, the size is enlarged to show
	 * at least the standard screen area.
	 * @param htmlCanvas The html canvas to draw to.
	 * @param ulaOptions The ULA options.
	 */
	constructor(htmlCanvas: HTMLCanvasElement, ulaOptions: any) {
		super(htmlCanvas, ulaOptions);

		const area = {...ulaOptions.screenArea};
		if (area.firstX > this.ZX81_STD_SCREEN_MIN_X)
			area.firstX = this.ZX81_STD_SCREEN_MIN_X;
		if (area.lastX < this.ZX81_STD_SCREEN_MAX_X)
			area.lastX = this.ZX81_STD_SCREEN_MAX_X;
		if (area.firstY > this.ZX81_STD_SCREEN_MIN_Y)
			area.firstY = this.ZX81_STD_SCREEN_MIN_Y;
		if (area.lastY < this.ZX81_STD_SCREEN_MAX_Y)
			area.lastY = this.ZX81_STD_SCREEN_MAX_Y;
		const width = area.lastX - area.firstX + 1;
		const height = area.lastY - area.firstY + 1;

		// Change html canvas and context width and height
		htmlCanvas.width = width;
		htmlCanvas.height = height;

		// Create image data
		this.imgData = this.screenImgContext.createImageData(width, height);
		// Get pixels memory (Get a 32bit view of the buffer)
		this.pixels = new Uint32Array(this.imgData.data.buffer);

		// Calculate first index into the pixels data
		// (the left, top corner to start drawing)
		this.pixelsStartIndex = (this.ZX81_STD_SCREEN_MIN_Y - area.firstY) * width + this.ZX81_STD_SCREEN_MIN_X - area.firstX;

		// Adjust the lines
		this.adjustLines(area.firstX, area.firstY);
	}


	/** Draws a ZX81 ULA screen into the given canvas.
	 * @param ulaData {dfile, chroma, borderColor} class.
	 */
	public drawUlaScreen(ulaData: any) {
		const dfile = ulaData.dfile;
		// Safety check
		if (!dfile)
			return;

		const chroma = ulaData.chroma;
		const chromaMode = chroma?.mode;
		let dfileIndex = 0;

		// Background color
		const bgCol = this.getRgbColor(ulaData.borderColor);
		let rgb = 65536 * bgCol.b + bgCol.g * 256 + bgCol.r;
		rgb += this.debug ? 0x80000000 : 0xFF000000;	// semi transparent for debug mode
		this.pixels.fill(rgb);

		const pixelsWidth = this.imgData.width;
		const width8 = this.SCREEN_WIDTH / 8;
		const height8 = this.SCREEN_HEIGHT / 8;
		let x = 0;
		let y = 0;

		let fgRed = 0, fgGreen = 0, fgBlue = 0;
		let bgRed = 0xFF, bgGreen = 0xFF, bgBlue = 0xFF;
		const charset = ulaData.charset;

		while(y < height8) {
			const char = dfile[dfileIndex];
			if(x >= width8 || char === 0x76) {
				x = 0;
				y++;
				dfileIndex++;
				continue;
			};

			const inverted = (char & 0x80) !== 0;
			let charIndex = (char & 0x7f) * 8;
			let pixelIndex = this.pixelsStartIndex + (y * pixelsWidth + x) * 8;

			// Color: Chroma mode 1?
			if (chromaMode === 1) {
				// Mode 1: Attribute file (similar to ZX Spectrum)
				const color = chroma.data[dfileIndex];
				// fg color
				let colorIndex = (color & 0x0F) * 3;
				fgRed = this.zxPalette[colorIndex];
				fgGreen = this.zxPalette[colorIndex + 1];
				fgBlue = this.zxPalette[colorIndex + 2];
				// bg color
				colorIndex = (color >>> 4) * 3;
				bgRed = this.zxPalette[colorIndex];
				bgGreen = this.zxPalette[colorIndex + 1];
				bgBlue = this.zxPalette[colorIndex + 2];
			}
			// 8 lines per character
			for(let charY = 0; charY < 8; ++charY) {
				let byte = charset[charIndex];
				if (inverted) byte = byte ^ 0xFF;
				// Color: Chroma mode 0?
				if (chromaMode === 0) {
					// Chroma mode 0: Character code
					const color = chroma.data[charIndex + (inverted? 512 : 0)];
					// fg color
					let colorIndex = (color & 0x0F) * 3;
					fgRed = this.zxPalette[colorIndex];
					fgGreen = this.zxPalette[colorIndex + 1];
					fgBlue = this.zxPalette[colorIndex + 2];
					// bg color
					colorIndex = (color >>> 4) * 3;
					bgRed = this.zxPalette[colorIndex];
					bgGreen = this.zxPalette[colorIndex + 1];
					bgBlue = this.zxPalette[colorIndex + 2];
				}
				// 8 pixels par line
				for(let charX = 0; charX < 8; ++charX) {
					if (byte & 0x80) {
						// Foreground color
						this.pixels[pixelIndex++] = 0xFF000000 + 65536 * fgBlue + fgGreen * 256 + fgRed;
					}
					else {
						// Background color
						this.pixels[pixelIndex++] = 0xFF000000 + 65536 * bgBlue + bgGreen * 256 + bgRed;
					}
					byte = (byte & 0x7F) * 2;
				}
				// Next line
				pixelIndex += pixelsWidth - 8;
				charIndex++;
			}

			x++;
			dfileIndex++;
		}

		// Write image
		this.screenImgContext.putImageData(this.imgData, 0, 0);
		// Draw lines
		this.drawAllLines();
    }
}

