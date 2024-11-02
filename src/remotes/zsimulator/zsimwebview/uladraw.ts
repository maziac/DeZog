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

	// 	The vertical and horizontal lines to draw.
	protected lines: {x1: number, y1: number, x2: number, y2: number, color: string}[];

	// The ZX palette. Each index is a 32bit value: r,g,b,a (from low byte to high byte)
	protected zxPalette = new Uint32Array(new Uint8Array([
		// Bright 0: r,g,b,a
		0x00, 0x00, 0x00, 0xFF,	// Black:	0
		0x00, 0x00, 0xD7, 0xFF,	// Blue:	1
		0xD7, 0x00, 0x00, 0xFF,	// Red:		2
		0xD7, 0x00, 0xD7, 0xFF,	// Magenta:	3

		0x00, 0xD7, 0x00, 0xFF,	// Green:	4
		0x00, 0xD7, 0xD7, 0xFF,	// Cyan:	5
		0xD7, 0xD7, 0x00, 0xFF,	// Yellow:	6
		0xD7, 0xD7, 0xD7, 0xFF,	// White:	7

		// Bright 1: r,g,b,a
		0x00, 0x00, 0x00, 0xFF,	// Black:	8
		0x00, 0x00, 0xFF, 0xFF,	// Blue:	9
		0xFF, 0x00, 0x00, 0xFF,	// Red:		10
		0xFF, 0x00, 0xFF, 0xFF,	// Magenta:	11

		0x00, 0xFF, 0x00, 0xFF,	// Green:	12
		0x00, 0xFF, 0xFF, 0xFF,	// Cyan:	13
		0xFF, 0xFF, 0x00, 0xFF,	// Yellow:	14
		0xFF, 0xFF, 0xFF, 0xFF,	// White:	15
	]).buffer);

	/** Constructor.
	 * Store the canvas context and the debug option.
	 * Especially the `pixels` buffer view needs to be established
	 * by the derived classes.
	 * You also need to set the height and width of the canvas.
	 * @param htmlCanvas The html canvas to draw to.
	 * @param ulaOptions The ULA options.
	 */
	constructor(htmlCanvas: HTMLCanvasElement, ulaOptions: any) {
		// Store
		this.screenImgContext = htmlCanvas.getContext('2d')!;
		// Lines
		this.lines = [...ulaOptions.lines];
	}


	/** Adjusts the coordinates of the lines by the given offset. */
	protected adjustLines(x1: number, y1: number) {
		const width = this.imgData.width;
		const height = this.imgData.height;
		const x2 = width - 1;
		const y2 = height - 1;
		for (let line of this.lines) {
			line.x1 -= x1;
			if (line.x1 < 0)
				line.x1 = 0;
			line.x2 -= x1;
			if (line.x2 > x2)
				line.x2 = x2;
			line.y1 -= y1;
			if (line.y1 < 0)
				line.y1 = 0;
			line.y2 -= y1;
			if (line.y2 > y2)
				line.y2 = y2;
			// Adjust for the half pixel, for sharper lines
			line.x1 = Math.round(line.x1) + 0.5;
			line.y1 = Math.round(line.y1) + 0.5;
			line.x2 = Math.round(line.x2) + 0.5;
			line.y2 = Math.round(line.y2) + 0.5;
		}
	}


	/** Draws all lines. */
	protected drawAllLines() {
		for (let line of this.lines) {
			this.screenImgContext.beginPath();
			this.screenImgContext.strokeStyle = line.color;
			this.screenImgContext.moveTo(line.x1, line.y1);
			this.screenImgContext.lineTo(line.x2, line.y2);
			this.screenImgContext.stroke();
		}
	}


	/** Draws an ULA screen into the given canvas.
	 * @param _ulaData The actual contents depends on the derived class.
	 */
	public drawUlaScreen(_ulaData: any) {
		throw new Error("Please override this.");
	}


	/** Returns the color as 32 bit rgba value for a ZX color.
	 * @param zxColor [0;15]. 0-7 = black-white, 8-15 = bright: black - white
	 * @returns E.g. 0xFF800040
	 */
	public getRgbColor(zxColor: number): number {
		const rgba = this.zxPalette[zxColor];
		return rgba;
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

