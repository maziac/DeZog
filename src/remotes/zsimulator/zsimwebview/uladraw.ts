/** Base class for ZX81 and Spectrum ULA draw.
 */
export class UlaDraw {
	// Screen height
	public SCREEN_HEIGHT = 192;

	// Screen width
	public SCREEN_WIDTH = 256;

	// The associated canvas object.
	protected screenImgContext: CanvasRenderingContext2D;

	// ImageData object: here the screen gets drawn.
	protected imgData: ImageData;

	// A 32bit view of the imgData buffer
	protected pixels: Uint32Array;

	// The ZX palette.
	protected zxPalette = [
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

	/** Constructor.
	 * Store the canvas context and the debug option.
	 * Especially the `pixels` buffer view needs to be established
	 * by the derived classes.
	 * You also need to set the height and width of the canvas.
	 * @param htmlCanvas The html canvas to draw to.
	 */
	constructor(htmlCanvas: HTMLCanvasElement) {
		// Store
		this.screenImgContext = htmlCanvas.getContext('2d')!;
	}


	/** Draws an ULA screen into the given canvas.
	 * @param _ulaData The actual contents depends on the derived class.
	 */
	public drawUlaScreen(_ulaData: any) {
		throw new Error("Please override this.");
	}


	/** Returns the color as rgb value for a ZX color.
	 * @param zxColor [0;15]. 0-7 = black-white, 8-15 = bright: black - white
	 * @returns {r: number, g: number, b: number}
	 */
	public getRgbColor(zxColor: number): {r: number, g: number, b: number} {
		let i = 3 * zxColor;
		return {r: this.zxPalette[i++], g: this.zxPalette[i++], b: this.zxPalette[i]};
	}


	/** Convert an rgb value to a html string.
	 * @param rgb The rgb value.
	 * @returns E.g. "#D70000" for RED
	 */
	public getHtmlColorString(rgb: {r: number, g: number, b: number}): string {
		let htmlColor = '#';
		htmlColor += rgb.r.toString(16).padStart(2, '0');
		htmlColor += rgb.g.toString(16).padStart(2, '0');
		htmlColor += rgb.b.toString(16).padStart(2, '0');
		return htmlColor;
	}
}

