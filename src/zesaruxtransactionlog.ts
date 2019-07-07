import * as assert from 'assert';
//import * as vscode from 'vscode';
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
 * 2019/06/16 14:19:34.098127 00000 8193 CALL 8000 PC=8193 SP=ff2d BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
 *
 * I will not use date time and tstates which reduces it to:
 * 8005 PUSH HL PC=8005 SP=ff2b BC=8000 AF=1e54 HL=8080 DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=03  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0

 *
 * This class adds functions to easily work with the file.
 * E.g. to
 * - move the file pointer to previous/next line
 * - read the content of a line (the PC and registers, instruction)
 */
export class ZesaruxTransactionLog {

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
	protected cacheBuffer: Uint8Array;

	/// The normal size of the cache.
	protected cacheChunkSize: number;

	/// The size of the cache without overlap.
	protected cacheSize: number;

	/// The pointer into the cache.
	protected cacheOffset: number;

	/// Code of the newline character.
	protected nlCode: number;

	/// Counter of the line numbers that are already stepped back.
	/// O if no step back.
	protected stepBackCounter: number;


	/**
	 * Creates the object.
	 * @param filepath The file to use.
	 * @param The nominal cache size to use.
	 */
	constructor(filepath: string, cacheSize = 4000) {
		this.filepath = filepath;
		this.cacheChunkSize = cacheSize;
		this.nlCode = '\n'.charCodeAt(0);
		this.init();
	}


	/**
	 * Init. Prepares for new rotation files.
	 */
	public init() {
		this.fileRotation = -1;
		this.fileOffset = 0;
		this.stepBackCounter = 0;
		this.cacheBuffer = new Uint8Array(0);
		this.cacheOffset = 0;
		this.cacheSize = 0;
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
		this.fileOffset = 0;
		if(this.fileRotation < 0)
			return;

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
		// Check if next file need to be opened.
		if(this.fileOffset == 0) {
			// Already at the start of the file, we need to open the previous one.
			this.fileRotation ++;
			if(this.file)
				fs.closeSync(this.file);
			this.file = 0;
		}

		// Make sure that file is open
		if(!this.file) {
			this.openRotatedFile();
			this.fileOffset = this.fileSize;
		}

		// Check if at the end.
		if(!this.file) {
			this.cacheBuffer = new Uint8Array(0);
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
		this.cacheBuffer = new Uint8Array(readSize+overlap);
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
		// Check if next file need to be opened.
		let lastBufferLength = this.cacheBuffer.length;
		if(this.fileOffset+lastBufferLength >= this.fileSize) {
			// Already at the end of the file, we need to open the previous one.
			if(this.fileRotation >= 0)
				 this.fileRotation --;
			if(this.file)
				fs.closeSync(this.file);
			this.file = 0;
		}

		// Make sure that file is open
		if(!this.file)
			this.openRotatedFile();

		// Check if at the end.
		if(!this.file) {
			this.cacheBuffer = new Uint8Array(0);
			this.cacheOffset = 0;
			return;
		}

		// Determine reading size.
		lastBufferLength = this.cacheBuffer.length;
		const remainingSizeInFile = this.fileSize - this.fileOffset;
		let readSize = this.cacheChunkSize;
		if(readSize >= remainingSizeInFile) {
			readSize = remainingSizeInFile;
		}

		// Alloc bytes
		this.cacheBuffer = new Uint8Array(readSize+overlap);

		// Read data
		this.fileOffset += lastBufferLength-overlap;
		fs.readSync(this.file, this.cacheBuffer, 0, readSize+overlap, this.fileOffset);

		this.cacheOffset = overlap;
	}


	/**
	 * Moves the (cache) file pointer to the previous line.
	 * Note: this function assumes that the current offset already points at
	 * a character after a newline. This newline is skipped and the previous one
	 * is searched for.
	 * @returns false if there is no previous line.
	 */
	public prevLine(): boolean {
		do {
			// Check if cache exists or if at start of cache
			if(this.cacheBuffer.length == 0 || this.cacheOffset == 0)
				this.readCacheReverse(this.cacheOffset);
			if(this.cacheBuffer.length == 0)
				return false;
			// Find '\n'
			this.cacheOffset = this.cacheBuffer.lastIndexOf(this.nlCode, this.cacheOffset-2);	// Skip last '\n'
			if(this.cacheOffset < 0) {
				// No newline found.
				if(this.fileOffset == 0) {
					// At start of one rotated file, stop here
					this.cacheOffset = -1;
					break;
				}
				// Get next cache with overlap
				this.cacheBuffer = new Uint8Array(0);
			}
		} while(this.cacheOffset < 0);

		this.cacheOffset ++;
		this.stepBackCounter ++;
		return true;
	}


	/**
	 * Moves the (cache) file pointer to the next line.
	 * Note: this function assumes that the current offset already points at
	 * a character after a newline.
	 * @returns false if there is no next line.
	 */
	public nextLine(): boolean {
		let k = this.cacheOffset;
		let overlap = 0;
		do {
			// Check if cache exists or at the end of the cache
			if(this.cacheBuffer.length == 0 || k >= this.cacheBuffer.length) {
				this.readCacheForward(overlap);
				if(this.cacheBuffer.length == 0)
					return false;
				return true;
			}
			// Find '\n'
			const prevOffset = k;
			k = this.cacheBuffer.indexOf(this.nlCode, prevOffset);
			if(k < 0) {
				// No newline found, get next cache with overlap
				overlap = this.cacheBuffer.length-prevOffset;
				this.cacheBuffer = new Uint8Array(0);
			}
		} while(k < 0);

		this.cacheOffset = k+1;

		// Check if it is required to obtain a new cache
		if(this.cacheOffset >= this.cacheBuffer.length)
			this.readCacheForward(0);

		this.stepBackCounter --;
		assert(this.stepBackCounter >= 0);
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
		if(this.cacheBuffer.length == 0)
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
	 * @returns The registers of the current line.
	 */
	public getRegisters(): string {
		// Get current line
		const line = this.getLine();
		// E.g. "8000 LD A,1E PC=8000 SP=ff2b BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=01  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
		// Turn into same format as for 'get-registers'
		const k = line.indexOf('PC=');
		assert(k >= 0);
		const regs = line.substr(k);
		return regs;
	}


	/**
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	public getInstruction(): string {
		// Get current line
		const line = this.getLine();
		// E.g. "8000 LD A,1E PC=8000 SP=ff2b BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=01  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
		// Extract the instruction
		const k = line.indexOf('PC=');
		assert(k >= 0);
		const instr = line.substr(5, k-5-1);
		return instr;
	}


	/**
	 * @returns The address of the current line. Uses the first 4 digits simply.
	 */
	// TODO: Brauch ich die?
	public getAddress(): number {
		// Get current line
		const line = this.getLine(4);
		// Convert address
		const addr = parseInt(line, 16);
		return addr;
	}


	/**
	 * @returns Returns true if in step back mode.
	 */
	public isInStepBackMode() {
		return (this.stepBackCounter != 0);
	}


	/**
	 * Returns the number o addresses from the current position and returns them.
	 * Is used to return 2 sets of addresses:
	 * First the e.g. last 10 used addresses,
	 * second the e.g. 200 previous addresses.
	 * The lines get different colors. So it's easier to distinguish what just happend and what
	 * happened longer ago.
	 * @param counts An array with the number of lines to search for addresses.
	 * @returns Array with set of addresses. Correspondents to 'counts'.
	 * The Sets are filled.
	 */
	public getPrevAddresses(counts: Array<number>): Array<Set<number>> {
		const len = counts.length;
		const addrsArray = new Array<Set<number>>();
		for(let i=0; i<len; i++)
			addrsArray.push(new Set<number>());

		// Skip possible zero counts
		let l = -1;
		let count;
		do {
			l ++;
			if(l >= len)
				return addrsArray;	// End
			count = counts[l];
		} while(count == 0);
		let addrs = addrsArray[l];

		// Open a parallel file
		// and load as much as is required to get the addresses.
		const file = new ZesaruxTransactionLog(this.filepath, 10000);

		while(file.prevLine()) { // Previous line
			// Get current line
			const addr = file.getAddress();
			// Add to set
			addrs.add(addr);
			// Reduce count
			count --;
			if(count == 0) {
				// Proceed to next array
				do {
					l ++;
					if(l >= len)
						return addrsArray;	// End
					count = counts[l];
				} while(count == 0);
				// Read new values
				addrs = addrsArray[l];
			}
		}

		return addrsArray;
	}

}

