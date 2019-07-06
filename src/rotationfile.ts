//import * as assert from 'assert';
import * as fs from 'fs';




/**
 * This class handles rotation files.
 * The ZEsarUX cputransaction-log is written as rotated file.
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


	/**
	 * Creates the object.
	 * @param filepath The file to use.
	 */
	constructor(filepath: string) {
		this.filepath = filepath;
		this.fileRotation = 0;
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
	 * @param overlap An additional overlap data size. This is used to make sure that in the returned
	 * data there is at least an address included (takes up 4 characters).
	 */
	public readReverseData(chunkSize: number, overlap: number): Uint8Array {
		// Make sure that file is open
		if(!this.file)
			this.openRotatedFile();

		// Check if next file need to be opened.
		if(this.fileOffset == 0) {
			// Already at the start of the file, we need to open the previous one.
			this.fileRotation ++;
			this.openRotatedFile();
		}


		//const chunkSize = 100; //TODO change to 10000;	// 10kB chunks

		// Determine reading size
		const remainingSizeInFile = this.fileOffset;
		const readSize = (remainingSizeInFile < chunkSize) ? remainingSizeInFile : chunkSize;
		let readSizeOverlap = readSize + overlap;
		// Correct buffer size to not be bigger than the file itself
		const tooManyBytes = this.fileOffset - readSize + readSizeOverlap - this.fileSize;
		if(tooManyBytes > 0)
			readSizeOverlap -= tooManyBytes;
		// Alloc bytes
		const buffer = new Uint8Array(readSizeOverlap);

		// Read data
		this.fileOffset -= readSize;
		fs.readSync(this.file, buffer, 0, readSizeOverlap, this.fileOffset);

		// Return
		return buffer;
	}

}

