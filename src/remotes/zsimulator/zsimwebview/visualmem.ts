/** Represents the visaul memory (64k range).
 * I.e. it takes the memory 0x0000-0xFFFF and converts it to an image.
 */
export class VisualMem {

	// The palette used.
	protected static palette = [
		0x00, 0x00, 0x00, 0x00,	// Black (background)/Transparent
		0xC0, 0xC0, 0x00, 0xFF,	// Yellow: Read access
		0xC0, 0x00, 0x00, 0xFF,	// Red: Write access
		0x00, 0x00, 0xC0, 0xFF,	// Blue: Prog access
	];

	// HTML element used for the visual memory.
	protected static visualMemCanvas: HTMLCanvasElement;

	// HTML elements used for the custom visual memory blocks.
	protected static visualMemBlockCanvases: HTMLCanvasElement[] | undefined;


	/** Pass the HTML element used for the visual memory.
	 * @param canvas The canvas to draw to.
	 */
	public static initCanvas(canvas: HTMLCanvasElement, blockCanvases: NodeListOf<HTMLCanvasElement>) {
		this.visualMemCanvas = canvas;
		this.visualMemBlockCanvases = blockCanvases ? Array.from(blockCanvases) : undefined;
	}


	/** Draws the visual memory into the canvas.
	 * @param visualMem The memory to display.
	 */
	public static drawVisualMemory(visualMem: Uint8Array) {
		if (!this.visualMemCanvas)
			return;

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

		// Set canvas dimensions and write image
		this.visualMemCanvas.width = len;
		this.visualMemCanvas.height = 1;
		ctx.putImageData(imgData, 0, 0);
	}

	/** Draws the custom visual memory blocks into the canvases.
	 * @param visualMemBlocks An array of memory blocks to display.
	 */
	public static drawVisualMemBlocks(visualMemBlocks: Uint8Array[]) {
		if (!this.visualMemBlockCanvases)
			return;

		// Loop all canvases
		const countBlocks = visualMemBlocks.length;
		for (let k = 0; k < countBlocks; k++) {
			const canvas = this.visualMemBlockCanvases[k];
			const visualMem = visualMemBlocks[k];
			// Get canvas drawing context
			const ctx = canvas.getContext("2d")!;
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

			// Set canvas dimensions and write image
			canvas.width = len;
			canvas.height = 1;
			ctx.putImageData(imgData, 0, 0);
		}
	}
}

