import * as gw from "gif-writer";


/**
 * Class which converts a pixel buffer into a gif image.
 */
export class ImageConvert implements gw.IOutputStream {
	buffer: number[]=[];
	writeByte(b: number): void {
		this.buffer.push(b);
	}
	writeBytes(bb: number[]): void {
		Array.prototype.push.apply(this.buffer, bb);
	}

	/**
	 * Creates an image from the given pattern.
	 * Static function.
	 * @param width The width of the gif.
	 * @param height The height of the gif.
	 * @param pixels Number array with the pixel values (indexes into the palette).
	 * Size=width*height.
	 * @param palette Normally 3*256 bytes, colors: r, g, b. But should at least contain all required indices.
	 * @param transparentIndex The index used for transparency. Might be undefined
	 * @returns A buffer with the gif image.
	 */
	public static createGifFromArray(width: number, height: number, pixels: Array<number>, palette: Array<number>, transparentIndex?: number): number[] {
		// Convert to color with offset
		let indexedImage=new gw.IndexedColorImage(
			{width, height},
			// Indexed colors
			pixels,
			// Palette
			palette);
		// Create image
		const gifImage=new ImageConvert();
		const gifWriter=new gw.GifWriter(gifImage);
		gifWriter.writeHeader();
		gifWriter.writeLogicalScreenInfo({
			width: indexedImage.width,
			height: indexedImage.height,
		});
		gifWriter.writeTableBasedImageWithGraphicControl(indexedImage, {transparentColorIndex: transparentIndex});
		gifWriter.writeTrailer();
		// The image is now in gifImage.buffer
		return gifImage.buffer;
	}
}

