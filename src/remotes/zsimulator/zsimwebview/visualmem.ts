/**
 * Represents the ZX 48K ULA screen. (0x4000-0x5AFF)
 * I.e. it takes a bank and converts it to a gif image.
 */
export class VisualMem {

	// The palette used.
	protected static palette = [
		0x80, 0x80, 0x80, 0x00,	// Gray (background)/Transparent
		0xC0, 0xC0, 0x00, 0xFF,	// Yellow: Read access
		0xC0, 0x00, 0x00, 0xFF,	// Red: Write access
		0x00, 0x00, 0xC0, 0xFF,	// Blue: Prog access
	];

	// HTML element used for the visual memory.
	protected static visualMemCanvas: HTMLCanvasElement;


	/** Pass the HTML element used for the visual memory.
	 * @param canvas The canvas to draw to.
	 */
	public static initCanvas(canvas: HTMLCanvasElement) {
		this.visualMemCanvas = canvas;
	}


	/**
	 * Draws the visual memory into the canvas.
	 * @param visualMem The memory to display.
	 */
	public static drawVisualMemory(visualMem: Uint8Array) {
		// Get canvas drawing context
		const ctx = this.visualMemCanvas.getContext("2d")!;
		const len = visualMem.length;
		const imgData = ctx.createImageData(len, 1);
		const pixels = imgData.data;

		let pixelIndex = 0;
		for (let i = 0; i < len; i++) {
			const value = visualMem[i];
			let colorIndex = 4 * value;
			pixels[pixelIndex++] = this.palette[colorIndex++];	// red
			pixels[pixelIndex++] = this.palette[colorIndex++];	// green
			pixels[pixelIndex++] = this.palette[colorIndex++];	// blue
			pixels[pixelIndex++] = this.palette[colorIndex];	// alpha
		}

		// Write image
		this.visualMemCanvas.width = len;
		this.visualMemCanvas.height = 1;
		ctx.putImageData(imgData, 0, 0);
	}
}

