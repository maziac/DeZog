

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
export class MemBuffer {

	/// The underlying array buffer.
	public buffer: ArrayBuffer;

	/// The offset into the buffer for writing.
	protected writeOffset=0;

	/// The offset into the buffer for writing.
	protected readOffset=0;

	/// A dataview on the buffer.
	protected dataView: DataView;

	/**
	 * Static method to construct a MemBuffer.
	 * The idea is to create 2 buffers.
	 * The first without a length is not really a buffer, each write will not
	 * write but only increase the offset.
	 * This buffer is used to calculate the size required.
	 * Afterwards a new buffer should be created with the calculated length as parameter (or more).
	 * Then all writes are done a second time but this time the
	 * values are really written into the buffer.
	 * @param length Either the length of the buffer or undefined to
	 * calculate the length.
	 * @returns A new MemBuffer.
	 */
	constructor(length?: number) {
		if (length) {
			this.buffer=new ArrayBuffer(length);
			this.dataView=new DataView(this.buffer);
		}
	}

	/**
	 * Static method to construct a MemBuffer.
	 * Used for reading from a Membuffer.
	 * @param data The buffer to use. (Normally a Uint8Array)
	 * @returns A new MemBuffer.
	 */
	static from(data: ArrayBuffer): MemBuffer {
		// Create new buffer
		const memBuffer=new MemBuffer();
		// And change the used buffer
		memBuffer.buffer=data;
		memBuffer.dataView=new DataView(memBuffer.buffer);
		return memBuffer;
	}


	/**
	 * Returns the current size.
	 */
	public getSize() {
		return this.writeOffset;
	}


	/**
	 * Writes a value to the next position (offset).
	 */
	public write8(value: number) {
		this.dataView?.setUint8(this.writeOffset, value);
		this.writeOffset++;
	}

	/**
	 * Writes a value to the next position (offset).
	 */
	public write16(value: number) {
		this.dataView?.setUint16(this.writeOffset, value);
		this.writeOffset+=2;
	}

	/**
	 * Writes a value to the next position (offset).
	 */
	public write32(value: number) {
		this.dataView?.setUint32(this.writeOffset, value);
		this.writeOffset+=4;
	}

	/**
	 * Writes an array to the next position (offset).
	 */
	public writeArrayBuffer(buffer: ArrayBuffer) {
		const length=buffer.byteLength;
		// Write length
		this.write32(length);
		if (this.dataView) {
			const src=new Uint8Array(buffer);
			const dst=new Uint8Array(this.buffer);
			// Write buffer
			dst.set(src, this.writeOffset);
		}
		this.writeOffset+=length;
	}


	/**
	 * Returns an array of the required length.
	 */
	public getUint8Array(): Uint8Array {
		const view=new Uint8Array(this.buffer, 0, this.writeOffset);  // this.buffer.byteOffset is 0
		return view;
	}


	/**
	 * Reads a value from the next position (offset).
	 */
	public read8(): number {
		const value=this.dataView.getUint8(this.readOffset);
		this.readOffset++;
		return value;
	}

	/**
	 * Reads a value from the next position (offset).
	 */
	public read16(): number {
		const value=this.dataView.getUint16(this.readOffset);
		this.readOffset+=2;
		return value;
	}

	/**
	 * Reads a value from the next position (offset).
	 */
	public read32(): number {
		const value=this.dataView.getUint32(this.readOffset);
		this.readOffset+=4;
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
		const end=this.readOffset+length;
		const buffer=wholeBuffer.subarray(this.readOffset, end);
		this.readOffset=end;
		return buffer;
	}

}
