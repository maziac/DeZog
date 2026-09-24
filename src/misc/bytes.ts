/**
 * Reading/writing numbers and strings from/to byte buffers.
 * Has no dependencies to other DeZog modules.
 */
export class Bytes {

	/**
	 * Returns a value shrinked to a boundary.
	 * Used to calculate address boundaries.
	 * E.g. the boundary of 19 to a 16 boundary is 16.
	 * @param value The value to bound.
	 * @param boundary The boundary, usually 16.
	 * @returns The bounded value.
	 */
	public static getBoundary(value: number, boundary: number): number {
		// Boundary check
		if (value < 0)	// Always return 0 for negative values
			return 0;
		const boundValue = value - (value % boundary);
		return boundValue;
	}


	/**
	 * Convert a bytes from memory into a number.
	 * Little or big endian.
	 * @param memory The memory array.
	 * @param index The start index for conversion.
	 * @param count (Optional, defaults to 1) The number of bytes to convert.
	 * @param little_endian (optional) set to false for big endian.
	 * @returns a number
	 */
	public static getUintFromMemory(memory: Uint8Array, index: number, count = 1, littleEndian = true): number {
		let memVal = 0;
		if (littleEndian) {
			// Little endian
			for (let i = index + count - 1; i >= index; i--)
				memVal = 256 * memVal + memory[i];
		}
		else {
			// Big endian
			const end = index + count;
			for (let i = index; i < end; i++)
				memVal = 256 * memVal + memory[i];
		}
		return memVal;
	}


	/**
	 * Converts a number into a series of bytes for the memory.
	 * Little or big endian.
	 * @param memVal The value to convert.
	 * @param memory The memory target array.
	 * @param index The start index for conversion.
	 * @param count (Optional, defaults to 1) The number of bytes to convert.
	 * @param little_endian (optional) set to false for big endian.
	 * @returns a number
	 */
	public static setUintToMemory(memVal: number, memory: Uint8Array, index: number, count = 1, littleEndian = true) {
		// Change neg to pos
		if (memVal < 0)
			memVal += 2 ** (8 * count);	// Note: '<<' would overflow for count >= 4

		const end = index + count;
		// Note: bit wise operators would work on 32 bits only.
		if (littleEndian) {
			// Little endian
			for (let i = index; i < end; i++) {
				memory[i] = memVal % 256;
				memVal = Math.trunc(memVal / 256);
			}
		}
		else {
			// Big endian
			for (let i = end - 1; i >= index; i--) {
				memory[i] = memVal % 0x100;
				memVal = Math.trunc(memVal / 0x100);
			}
		}
	}


	/** Helper method to set a WORD from two successing indices in the
	 * given buffer. (Little endian)
	 * @param buffer The buffer to use.
	 * @param index The index into the buffer.
	 * @param value buffer[index] = value&0xFF; buffer[index+1] = value>>>8;
	 */
	public static setWord(buffer: Buffer, index: number, value: number) {
		buffer[index] = value & 0xFF;
		buffer[index + 1] = value >>> 8;
	}


	/** Helper method to return a WORD from two succeeding indices in the
	 * given buffer. (Little endian)
	 * @param buffer The buffer to use.
	 * @param index The index into the buffer.
	 * @return buffer[index] + (buffer[index+1]<<8)
	 */
	public static getWord(buffer: Buffer, index: number): number {
		const value = buffer[index] + (buffer[index + 1] * 256);
		return value;
	}


	/**
	 * Returns a string (0-terminated) from the buffer.
	 * @param data The buffer.
	 * @param startIndex String conversion starts here (and ends at the next found 0.
	 */
	public static getStringFromBuffer(data: Buffer, startIndex: number): string {
		// Get string
		let result = '';
		const len = data.length;
		for (let i = startIndex; i < len; i++) {
			const char = data[i];
			if (char == 0)
				break;
			result += String.fromCharCode(char);
		}
		return result;
	}


	/**
	 * Creates a string from data bytes.
	 * @param data The data buffer.
	 * @param start The start index inside the buffer.
	 * @param count The max. number of data items to show.
	 */
	public static getStringFromData(data: Buffer, start = 0, count = -1): string {
		if (count == -1)
			count = data.length;
		if (start + count > data.length)
			count = data.length - start;
		if (count <= 0)
			return "---";

		let result = "";
		let printCount = count;
		if (printCount > 60)
			printCount = 60;
		for (let i = 0; i < printCount; i++)
			result += data[i + start].toString() + " ";
		if (printCount != count) {
			result += "... ";
			result += data[start + count - 1].toString();
		}
		return result;
	}


	/**
	 * Returns a Buffer from a string. The buffer is 0-terminated.
	 * @param text A String. If 'undefined' a Buffer with just a 0 is returned.
	 * @returns A Buffer (0-terminated)
	 */
	public static getBufferFromString(text: string | undefined): Buffer {
		if (text == undefined)
			text = '';
		const zeroText = text + String.fromCharCode(0);
		const buf = Buffer.from(zeroText, 'ascii');
		return buf;
	}
}
