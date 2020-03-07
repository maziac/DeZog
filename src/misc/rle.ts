
/**
 * Implements run length encoding and decoding.
 * Algorithm:
 * It starts with the length of the decoded data.
 * After that the data itself follows.
 * All byte values are used without special meaning except
 * 0xFF.
 * A 0xFF is encoded as 0xFF followed by a 0xFF.
 * If 0xFF is followed by something else it is a 4 byte length.
 * The 4 bytes are big endian encoded and are followed by the value 0-0xFF.
 * So a sequence of same bytes makes sense to be encoded only if it is
 * bigger than 6 bytes.
 */
export class Rle {

	/**
	 * Encodes a buffer with run-length-encoding.
	 * @param data The data to encode.
	 * @returns The encoded data.
	 */
	public static encode(data: Uint8Array): Uint8Array {
		// Get length
		const length=data.length;
		// Prepare new data
		const dstBuffer=new Uint8Array(length);	// At first assume maximum length.
		const dst=new DataView(dstBuffer);
		// Reset pointer
		let writeIndex=0;
		let readIndex=0;
		let prevReadIndex;
		let prevValue=-1;	// Does not exist
		let value;
		// Find same data
		while (readIndex<length) {
			prevReadIndex=readIndex;
			while (readIndex<length) {
				value=data[readIndex];
				if (value==prevValue)
					break;
				readIndex++;
			}
			let rleLength=readIndex-prevReadIndex;
			if (rleLength>6) {
				// run length encoding
				dst.setUint8(writeIndex++, 0xFF);
				// Length, big endian
				dst.setUint8(writeIndex++, rleLength>>24);
				dst.setUint8(writeIndex++, (rleLength>>16)&0xFF);
				dst.setUint8(writeIndex++, (rleLength>>8)&0xFF);
				dst.setUint8(writeIndex++, rleLength&0xFF);
				// Value
				dst.setUint8(writeIndex++, prevValue);
			}
			else {
				// Save values as they are.
				// Take care of special value
				if (prevValue==0xFF)
					rleLength*=2;	// Save double 0xFF
				while (rleLength>0) {
					dst.setUint8(writeIndex++, prevValue);
					// Next
					rleLength--;
				}
			}

			// Next
			prevValue=value;
		}

		// Create new buffer view with correct length
		const encodedLength=writeIndex;
		const encodedBuffer=new Uint8Array(dstBuffer, 0, encodedLength);
		return encodedBuffer;
	}



	/* Decodes a buffer with run-length-encoding.
	 * @param data The encoded data.
	 * @returns The decoded data.
	 */
	public static decode(data: Uint8Array): Uint8Array {
		// Safety check
		if (data.length<4)
			return new Uint8Array();
		// Get length
		const length=(new Uint32Array(data))[0];
		// Allocate array
		const dst=new Uint8Array(length);
		// Reset pointer
		let writeIndex=0;
		let readIndex=0;
		let value;
		// Find same data
		while (readIndex<length) {
			// Find next 0xFF
			while (readIndex<length) {
				value=data[readIndex++];
				if (value==0xFF)
					break;
				// Copy
				dst[writeIndex++]=value;
			}
			// Check for end
			if (readIndex>=length)
				break;
			// 0xFF found, check next byte
			value=data[readIndex++];
			if (value==0xFF) {
				// It was 0xFF
				dst[writeIndex++]=0xFF
			}
			else {
				// Decode RLE, read length (big endian)
				let rleLength=data[readIndex++];
				rleLength=(rleLength<<8)+data[readIndex++];
				rleLength=(rleLength<<8)+data[readIndex++];
				rleLength=(rleLength<<8)+data[readIndex++];
				// Read value
				value=data[readIndex++];
				// Fill with value
				dst.fill(value, writeIndex, writeIndex+rleLength);
			}
		}

		return dst;
	}

}
