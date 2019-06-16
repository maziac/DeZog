
import * as fs from 'fs';


/**
 * This class takes care of the ZEsarUX cpu transaction log.
 * The file records all executed instructions. If told to it can record
 * - the address
 * - the instruction
 * - the tstates
 * - the registers
 *
 * The transaction log may become very big, e.g. a few GB of textual data.
 * The format of each line is:
 * XXXX TODO.
 *
 * This class adds functions to easily work with the file.
 * E.g. to
 * - move the file pointer to previous/next line
 * - read the content of a line (the PC and registers, instruction)
 */
export class ZesaruxTransactionLog {

	/// The file path to use.
	protected filepath: string;

	/// The file handle.
	protected file: number;

	/// The file offset of the current line.
	protected fileOffset: number;

	/// The size of the file.
	protected fileSize: number;

	/**
	 * Creates the object.
	 * @param filepath The file to use.
	 */
	constructor(filepath: string) {
		this.filepath = filepath;
	}


	/**
	 * Resets the file offset to the end of the file.
	 */
	public init() {
		// TODO: error handling if file could not be opened.
		this.file = fs.openSync(this.filepath, 'r');
		// Set file offset to the end of the file.
		const fstats = fs.statSync(this.filepath);
		this.fileSize = fstats.size;
		this.fileOffset = this.fileSize;
	}


	/**
	 * Sets the file offset to the previous line.
	 */
	public prevLine() {
		// Reads in a few bytes from the end and searches for '\n'
		const chunkSize = 100;
		const buffer = new Uint8Array(chunkSize);
		let offset = this.fileOffset-1;  // Skip first '\n'
		while(offset > 0) {
			// Read chunk
			offset -= chunkSize;
			if(offset < 0)
				offset = 0;
			fs.readSync(this.file, buffer, offset, chunkSize, 1);
			// Find '\n'
			const s = buffer.toString();
			let k = s.lastIndexOf('\n');
			if(k >= 0) {
				// Found, use next position
				this.fileOffset = offset + k + 1;
				return;
			}
		}

		// Beginnning of file reached
		this.fileOffset = 0;
	}


	/**
	 * Sets the file offset to the next line.
	 */
	public nextLine() {
		// Reads in a few bytes and searches for next '\n'
		const chunkSize = 100;
		const buffer = new Uint8Array(chunkSize);
		let offset = this.fileOffset;
		while(offset < this.fileSize) {
			// Read chunk
			fs.readSync(this.file, buffer, offset, chunkSize, 1);
			// Find '\n'
			const s = buffer.toString();
			let k = s.indexOf('\n');
			if(k >= 0) {
				// Found, use next position
				this.fileOffset = offset + k + 1;
				return;
			}
			// Next chunk
			offset += chunkSize;
		}

		// Beginnning of file reached
		this.fileOffset = this.fileSize;
	}


	/**
	 * Reads the line at the current offset.
	 */
	protected readLine() {
		// Reads in a few bytes from the end and searches for '\n'
		let total = '';
		const chunkSize = 100;
		const buffer = new Uint8Array(chunkSize);
		let offset = this.fileOffset;
		while(offset < this.fileSize) {
			// Read chunk
			fs.readSync(this.file, buffer, offset, chunkSize, 1);
			// Find '\n'
			const s = buffer.toString();
			let k = s.indexOf('\n');
			if(k >= 0) {
				// Found
				total += s.substr(0, k);
				break;
			}
			// Next chunk
			offset += chunkSize;
			total += s;
		}

		// Return
		return total;
	}

}

