

/**
 * The intention for this buffer is to use it for serialization.
 * Use it either for writing or for reading. Mixed write/read access
 * is not intended.
 * At construction time the internal offset is set to 0 and
 * increased on every write (or read).
 * (It is never reset.)
 *
 * When creating for writing use 'createBuffer' with an approximate length that is
 * bigger than the required length.
 * Then, when everything is written, use 'getUint8Array()' to retrieve
 * an array with the correct required length.
 *
 * For reading use 'from()' with an already existing Uint8Array.
 */
export class MemBuffer extends DataView {

	protected offset=0;

	/**
	 * Static method to construct a MemBuffer.
	 * @param approxLength Should be bigger or equal to the real used length.
	 * @returns A new MemBuffer.
	 */
	static createBuffer(approxLength: number): MemBuffer {
		const arrBuffer=new ArrayBuffer(approxLength);
		return new MemBuffer(arrBuffer);
	}

	/**
	 * Static method to construct a MemBuffer.
	 * @param approxLength Should be bigger or equal to the real used length.
	 * @returns A new MemBuffer.
	 */
	static from(bytes: Uint8Array): MemBuffer {
		return new MemBuffer(bytes.buffer);
	}

	/**
	 * Writes a value to the next position (offset).
	 */
	public write8(value: number) {
		this.setUint8(this.offset, value);
		this.offset++;
	}

	/**
	 * Writes a value to the next position (offset).
	 */
	public write16(value: number) {
		this.setUint16(this.offset, value);
		this.offset+=2;
	}

	/**
	 * Writes a value to the next position (offset).
	 */
	public write32(value: number) {
		this.setUint32(this.offset, value);
		this.offset+=4;
	}

	/**
	 * Writes an array to the next position (offset).
	 */
	public writeArrayBuffer(buffer: ArrayBuffer) {
		const src=new Uint8Array(buffer);
		const dst=new Uint8Array(this.buffer);
		// Write length
		const length=buffer.byteLength;
		this.write32(length);
		// Write buffer
		dst.set(src, this.offset);
		this.offset+=length;
	}


	/**
	 * Returns an array of the required length.
	 */
	public getUint8Array(): Uint8Array {
		const view=new Uint8Array(this.buffer, 0, this.offset);
		return view;
	}


	/**
	 * Reads a value from the next position (offset).
	 */
	public read8(): number {
		const value=this.getUint8(this.offset);
		this.offset++;
		return value;
	}

	/**
	 * Reads a value from the next position (offset).
	 */
	public read16(): number {
		const value=this.getUint16(this.offset);
		this.offset+=2;
		return value;
	}

	/**
	 * Reads a value from the next position (offset).
	 */
	public read32(): number {
		const value=this.getUint32(this.offset);
		this.offset+=4;
		return value;
	}

	/**
	 * Writes an array from the next position (offset).
	 */
	public readArrayBuffer(): Uint8Array {
		const wholeBuffer=new Uint8Array(this.buffer);
		// Read length
		const length=this.read32();
		// Read buffer
		const end=this.offset+length;
		const buffer=wholeBuffer.subarray(this.offset, end);
		this.offset=end;
		return buffer;
	}

}
