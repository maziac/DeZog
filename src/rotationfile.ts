import * as assert from 'assert';
import * as fs from 'fs';


/**
 * Helper class to work with the data from the rotation files.
 */
// TODO: brauch ich nicht.
export class ByteArray extends Uint8Array {
	/// The length without the overlap.
	public chunkLength: number;

	// Constructor
	constructor(size: number, overlap = 0) {
		super(size);
		this.chunkLength = size-overlap;
	}
}


/**
 * This class handles rotation files.
 * The ZEsarUX cpu-transaction-log is written as rotated file.
 * I.e. the file with 'fname.log' is written until a certain size is reached.
 * Then the name of the file is changed to 'fname.log.1'. Any file with a name
 * 'fname.log.1' is renamed to 'fname.log.2 and so on.
 * These are theso called rotations. The last file is removed.
 * E.g. if there are 3 rotations there would be files with the names:
 * fname.log
 * fname.log.1
 * fname.log.2
 * fname.log.3
 *
 * This class allows to work with rotation file as if it were one file.
 * The name handling and reading of data is handled more or less transparently.
 *
 * For the special purpose for reverse debugging and coverage it is important to read
 * the files reversely. So this class focuses on reading data reversely.
 *
 */
export class RotationFile {
	/// The file path to use.
	protected filepath: string;

	/// The file handle (of current rotated file).
	protected file: number;

	/// The file offset of the current line.
	protected fileOffset: number;

	/// The size of the file.
	protected fileSize: number;

	/// The file rotation currently in use.
	protected fileRotation: number;

	/// The data array containing the cache.
	protected cacheBuffer: Uint8Array|undefined;

	/// The normal size of the cache.
	protected cacheChunkSize: number;

	/// The pointer into the cache.
	protected cacheOffset: number;

	/// Code of the newline character.
	protected nlCode: number;


	/**
	 * Creates the object.
	 * @param filepath The file to use.
	 * @param The nominal cache size to use.
	 */
	constructor(filepath: string, cacheSize = 4000) {
		this.filepath = filepath;
		this.fileRotation = 0;
		this.cacheBuffer = undefined;
		this.cacheChunkSize = cacheSize;
		this.nlCode = '\n'.charCodeAt(0);
	}


	/**
	 * Resets the file offset to the end of the file.
	 */
	public init() {
		this.fileRotation = 0;
		this.openRotatedFile();
	}


	/**
	 * Opens a file. Closes the previous file.
	 * Used to open the different roatated files.
	 * this.file is set to the file pointer.
	 * If file does not exist then this.file is unavailable.
	 */
	protected openRotatedFile() {
		// Close old file
		if(this.file)
			fs.closeSync(this.file);
		this.file = 0;
		this.fileSize = 0;

		// Create suffix
		let filepath = this.filepath;
		if(this.fileRotation > 0)
			filepath += '.' + this.fileRotation.toString();

		// Open file
		try {
			this.file = fs.openSync(filepath, 'r');	// Maybe that file does not exist
			// Set file offset to the end of the file.
			const fstats = fs.statSync(filepath);
			this.fileSize = fstats.size;
		}
		catch(e) {}

		this.fileOffset = this.fileSize;
	}


	/**
	 * Reads data from the rotation files in reverse.
	 * Automatically changes the rotated file if the current file is at its beginning.
	 * The returned data sizes might be smaller than the requested one if in the current
	 * rotated file there is not enough data. I.e. a returned data array is never constructed
	 * out of data of 2 files.
	 * @param chunkSize The requested data size.
	 * @param overlap An additional overlap data size.
	 */
	protected readCacheReverse(overlap = 0) {
		// Make sure that file is open
		if(!this.file)
			this.openRotatedFile();

		// Check if next file need to be opened.
		if(this.fileOffset == 0 && this.file) {
			// Already at the start of the file, we need to open the previous one.
			this.fileRotation ++;
			this.openRotatedFile();
		}

		// Check if at the end.
		if(!this.file) {
			this.cacheBuffer = undefined;
			this.cacheOffset = 0;
			return;
		}

		// Determine reading size.
		const remainingSizeInFile = this.fileOffset;
		let readSize = this.cacheChunkSize;
		if(readSize >= remainingSizeInFile) {
			readSize = remainingSizeInFile;
		}

		// Alloc bytes
		this.cacheBuffer = new ByteArray(readSize+overlap);
		this.cacheOffset = readSize;

		// Read data
		this.fileOffset -= readSize;
		fs.readSync(this.file, this.cacheBuffer, 0, readSize+overlap, this.fileOffset);
	}


	/**
	 * Reads in data.
	 * @param overlap An additional overlap data size (at the beginning).
	 */
	protected readCacheForward(overlap = 0) {
		// Make sure that file is open
		if(!this.file)
			this.openRotatedFile();

		// Check if next file need to be opened.
		if(this.fileOffset >= this.fileSize && this.file) {
			// Already at the end of the file, we need to open the previous one.
			this.fileRotation --;
			this.openRotatedFile();
		}

		// Check if at the end.
		if(!this.file) {
			this.cacheBuffer = undefined;
			this.cacheOffset = 0;
			return;
		}

		// Determine reading size.
		const remainingSizeInFile = this.fileSize - this.fileOffset;
		let readSize = this.cacheChunkSize;
		if(readSize >= remainingSizeInFile) {
			readSize = remainingSizeInFile;
		}

		// Alloc bytes
		this.cacheBuffer = new ByteArray(readSize+overlap);
		this.cacheOffset = overlap;

		// Read data
		fs.readSync(this.file, this.cacheBuffer, 0, readSize+overlap, this.fileOffset-overlap);
		this.fileOffset += readSize;
	}


	/**
	 * Moves the (cache) file pointer to the previous line.
	 * Note: this function assumes that the current offset already points at
	 * a character after a newline. This newline is skipped and the previous one
	 * is searched for.
	 * @returns false if there is no previous line.
	 */
	public prevLine(): boolean {
		let k;
		do {
			// Check if cache exists
			if(!this.cacheBuffer)
				this.readCacheReverse(this.cacheOffset);
			if(!this.cacheBuffer)
				return false;
			// Find '\n'
			k = this.cacheBuffer.lastIndexOf(this.nlCode, this.cacheOffset-1);	// Skip last '\n'
			if(k < 0) {
				// No newline found, get next cache with overlap
				this.cacheBuffer = undefined;
			}
		} while(k < 0);
		return true;
	}


	/**
	 * Moves the (cache) file pointer to the next line.
	 * Note: this function assumes that the current offset already points at
	 * a character after a newline.
	 * @returns false if there is no next line.
	 */
	public nextLine(): boolean {
		let k;
		let overlap = 0;
		do {
			// Check if cache exists
			if(!this.cacheBuffer)
				this.readCacheForward(overlap);
			if(!this.cacheBuffer)
				return false;
			// Find '\n'
			k = this.cacheBuffer.indexOf(this.nlCode, this.cacheOffset);
			if(k < 0) {
				// No newline found, get next cache with overlap
				overlap = this.cacheBuffer.length-this.cacheOffset;
				this.cacheBuffer = undefined;
			}
		} while(k < 0);
		return true;
	}


	/**
	 * Returns the line at the current (cache) offset.
	 * If cache does not exists it return undefined.
	 * @param count If 0 the whole stirng is returned. If not 0 only the count number of
	 * characters are returned.
	 * @returns A string or '' if cache is undefined.
	 */
	public getLine(count = 0): string {
		// cache should exist
		if(!this.cacheBuffer)
			return '';

		// Whole line?
		if(count == 0) {
			// Return data until next newline
			const end = this.cacheBuffer.indexOf(this.nlCode, this.cacheOffset);
			assert(end >= 0);	// Would fail if the cache buffer would not end with a newline
			const buffer = this.cacheBuffer.subarray(this.cacheOffset, end);
			const s = String.fromCharCode.apply(null, buffer);
			return s;
		}

		// Only part of the line
		const buffer = this.cacheBuffer.subarray(this.cacheOffset, this.cacheOffset+count);
		const s = String.fromCharCode.apply(null, buffer);
		return s;
	}


	/**
	 * Adds an offset to the current filepointer.
	 * This works also across rotated files.
	 * @param offset The offset to add. Positive or negative.
	 */
	public addOffset(offset: number) {
		let fileOffset = this.fileOffset + offset;
		assert(fileOffset >= 0);
		assert(fileOffset <= this.fileSize);

		// Check if too big
		while(fileOffset >= this.fileSize) {
			// Correct file pointer
			fileOffset -= this.fileSize;
			// Next rotated file
			this.fileRotation --;
			this.openRotatedFile();
			// Return if file does not exist
			if(!this.file)
				return;
		}

		// Check if too small
		while(fileOffset < 0) {
			// Next rotated file
			this.fileRotation ++;
			this.openRotatedFile();
			// Return if file does not exist
			if(!this.file)
				return;
			// Correct file pointer
			fileOffset += this.fileSize;
		}

		// Use
		this.fileOffset = fileOffset;
	}
}

