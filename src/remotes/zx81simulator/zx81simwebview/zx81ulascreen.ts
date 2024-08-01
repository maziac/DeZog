/**
 * Represents the ZX81 simulated screen.
 */
export class ZX81UlaScreen {
	// Screen height
	public static SCREEN_HEIGHT = 192;

	// Screen width
	public static SCREEN_WIDTH = 256;

    	/**
	 * Draws a ZX Spectrum ULA screen into the given canvas.
	 * @param ctx The canvas 2d context to draw to.
	 * @param imgData A reusable array to create the pixel data in.
	 * @param ulaScreen The ULA screen data. Pixels + color attributes.
	 * @param time An optional time in ms which is used for the flashing of the color attributes.
	 * The flash frequency is 1/640ms.
	 */
	public static drawUlaScreen(ctx: CanvasRenderingContext2D, imgData: ImageData, ulaScreen: Uint8Array, time = 0) {
        // TODO
    }
}

