import * as assert from 'assert';
import * as fs from 'fs';
import * as glob from 'glob';




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
// TODO: Remove completely

	/// The maximum cache size. If a file with no useful data (no newlines) of this size
	/// is found an exception is thrown.
	protected MAX_CACHE_SIZE = 10000000;		// 10 MB

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

	/// The number of rotated files.
	protected countRotations: number;

	/// The data array containing the cache.
	protected cacheBuffer: Uint8Array;

	/// The normal size of the cache.
	protected cacheChunkSize: number;

	/// The pointer into the cache.
	protected cacheOffset: number;

	/// The amount of buffers at the start of the buffer that are not used.
	protected cacheClip: number;

	/// Code of the newline character.
	protected nlCode: number;

	/// An array with the cache sizes of the caches loaded so far.
	protected cacheSizes: Array<number>;


	/**
	 * Creates the object.
	 * @param filepath The file to use.
	 * @param The nominal cache size to use.
	 */
	constructor(filepath: string, cacheSize = 4000) {
		this.filepath = filepath;
		this.cacheChunkSize = cacheSize;
		const files = this.getRotatedFiles();
		this.countRotations = files.length;
		this.nlCode = '\n'.charCodeAt(0);
		this.file = 0;
		this.init();
	}


	/**
	 * Init. Prepares for new rotation files.
	 */
	public init() {
		this.cacheSizes = [];
		this.fileRotation = -1;
		if(this.file)
			fs.closeSync(this.file);
		this.file = 0;
		this.fileOffset = 0;
		this.clearCache();
	}


	/**
	 * Initializes the cache to undefined.
	 */
	protected clearCache() {
		this.cacheBuffer = undefined as any;
		this.cacheOffset = 0;
		this.cacheClip = 0;
	}


	/**
	 * Deletes all rotated files, e.g. cpu.log.1, cpu.log.2, ...
	 * In fact all cpu.log.*
	 * It does not delete the log file e.g. cpu.log, itself.
	 */
	public deleteRotatedFiles() {
		const files = this.getRotatedFiles();
		for(const file of files) {
			fs.unlinkSync(file);
		}
	}


	/**
	 * @returns A list of all rotated files.
	 */
	protected getRotatedFiles() {
		const filepath = this.filepath + '.*';
		const files = glob.sync(filepath);
		return files;
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
		if(this.fileRotation < 0) {
			this.clearCache();
			return;
		}

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
		catch(e) {
			// Clear cache
			this.clearCache();
		}
	}


	/**
	 * Increases 'fileRotation' and opens the previous rotation file.
	 * Skips any file with file size = 0.
	 */
	protected prevRotatedFile() {
		// Open the next file
		this.fileRotation ++;
		this.openRotatedFile();

		// ZEsarUX writes, then checks the size and if too big it rotates the file.
		// Then a new log file is created which is completely empty.
		// So z80-debug has to deal with empty log files.
		if(this.fileRotation == 0) {
			if(!this.file) {
				// If main log file does not exist
				this.fileRotation = -1;
				return;
			}
			if(this.fileSize == 0) {
				// Main log exists but is empty
				// Check if rotated file exists
				this.fileRotation ++;
				this.openRotatedFile();
				if(!this.file) {
					// Rotated file does not exist, reset
					this.fileRotation = -1;
					return;
				}
			}
		}
	}


	/**
	 * Decreases 'fileRotation' and opens the next rotation file.
	 * Skips any file with file size = 0.
	 */
	protected nextRotatedFile() {
		// ZEsarUX writes, then checks the size and if too big it rotates the file.
		// Then a new log file is created which is completely empty.
		// So z80-debug has to deal with empty log files.
		do {
			this.fileRotation --;
			this.openRotatedFile();
		} while(this.fileSize == 0 && this.file);	// As long a s file with size 0 is loaded.
	}


	/**
	 * Reads data from the rotation files in reverse.
	 * Reads cacheSize of data. If no newline is contained in the data the cacheSize is doubled.
	 * Searches for the first newline and sets byteOffset to the character after the newline.
	 * I.e. it is assured that the cache buffer always starts at the first byte after
	 * a newline and always ends with a newline.
	 * The used cache size is put in the cacheSizes array.
	 */
	protected readCacheReverse() {
		// Push last cache
		if(this.cacheBuffer)
			this.cacheSizes.push(this.cacheBuffer.length-this.cacheClip);

			// Check if already at the end
		if(this.isAtEnd())
			return;

		// Check if we need to read the next file.
		if(this.fileOffset == 0) {
			this.prevRotatedFile();
			this.fileOffset = this.fileSize;
			// If at end then return
			if(!this.file)
				return;
		}

		// Read a new chunk of data
		let cacheSize = this.cacheChunkSize;
		if(cacheSize > this.fileSize)
			cacheSize = this.fileSize;
		let cache;
		let cacheClip;
		let fileOffset;
		while(true) {
			fileOffset = this.fileOffset - cacheSize;
			if(fileOffset < 0) {
				cacheSize += fileOffset;	// Reduce size
				fileOffset = 0;
			}
			// Read data
			assert(cacheSize > 0);
			cache = new Uint8Array(cacheSize);
			fs.readSync(this.file, cache, 0, cacheSize, fileOffset);
			// Check if at the beginning of the file
			if(fileOffset == 0) {
				cacheClip = 0;
				break;
			}
			// Search for a newline
			cacheClip = cache.indexOf(this.nlCode);
			if(cacheClip >= 0 && cacheClip < cacheSize-1) {
				// Found
				cacheClip ++;
				break;
			}
			// Try next size
			cacheSize *= 2;
			// Safety check
			if(cacheSize > this.MAX_CACHE_SIZE)
				throw new Error('cpu-transaction-log file contains no useful data.')
		}

		// Compensate the clipping
		this.cacheBuffer = cache;
		this.cacheClip = cacheClip;
		this.cacheOffset = cacheSize;

		// Store offset
		this.fileOffset = fileOffset+cacheClip;

		// Use new cache size as default for next time
		if(this.cacheChunkSize < cacheSize)
			this.cacheChunkSize = cacheSize;
	}


	/**
	 * Reads in data. The amount of data is taken from the cacheSizes array.
	 * So it is assured that the data always starts after a newline and ends with a newline.
	 */
	protected readCacheForward() {
		// Check if already at the start
		if(this.isAtStart())
			return;

		// If at end then read the buffer
		if(this.cacheBuffer) {
			// Check if we need to read the next file.
			this.fileOffset += this.cacheBuffer.length-this.cacheClip;
			if(this.fileOffset >= this.fileSize) {
				this.nextRotatedFile();
			}
		}
		else {
			assert(this.fileRotation >= 0);
			this.nextRotatedFile();
		}

		// Get cache size
		const cacheSize = this.cacheSizes.pop();
		if(cacheSize == undefined)
			return;

		// Read data
		assert(cacheSize > 0);
		this.cacheBuffer = new Uint8Array(cacheSize);
		fs.readSync(this.file, this.cacheBuffer, 0, cacheSize, this.fileOffset);
		this.cacheOffset = 0;
		this.cacheClip = 0;
	}


	/**
	 * Moves the (cache) file pointer to the previous line.
	 * Note: this function assumes that the current offset already points at
	 * a character after a newline. This newline is skipped and the previous one
	 * is searched for.
	 * @returns false if there is no previous line.
	 */
	public prevLine(): boolean {
		// Safety check
		if(this.isAtEnd())
			return false;

		// Check if we need to load a new cache
		if(this.cacheOffset == this.cacheClip)
			this.readCacheReverse();

		// The cahcebuffer might still be empty if at the very beginning and
		// the log file is empty.
		if(!this.cacheBuffer)
			return false;

		// Find last newline.
		const k = this.cacheBuffer.lastIndexOf(this.nlCode, this.cacheOffset-2);	// Skip last newline
		this.cacheOffset = (k >= this.cacheClip) ? k+1 : this.cacheClip;

		return true;
	}


	/**
	 * Moves the (cache) file pointer to the next line.
	 * Note: this function assumes that the current offset already points at
	 * a character after a newline.
	 * @returns false if there is no next line.
	 */
	public nextLine(): boolean {
		// Safety check
		if(this.isAtStart())
			return false;

		// Read buffer if at the end
		if(!this.cacheBuffer) {
			this.readCacheForward();
			return true;
		}

		// Find next newline.
		const k = this.cacheBuffer.indexOf(this.nlCode, this.cacheOffset);
		assert(k >= 0);
		this.cacheOffset = k+1;

		// Check if we need to load a new cache
		if(this.cacheOffset >= this.cacheBuffer.length)
			this.readCacheForward();

		return true;
	}


	/**
	 * Returns the line at the current (cache) offset.
	 * If cache does not exists it return undefined.
	 * @param count If 0 the whole string is returned. If not 0 only the count number of
	 * characters are returned.
	 * @returns A string or '' if cache is undefined.
	 */
	public getLine(count = 0): string|undefined {
		// Cache should exist
		if(!this.cacheBuffer || this.cacheBuffer.length == 0)
			return undefined;

		let end;
		if(count == 0) {
			// Return data until next newline
			end = this.cacheBuffer.indexOf(this.nlCode, this.cacheOffset);
			assert(end >= 0);	// Would fail if the cache buffer would not end with a newline
		}
		else
			end = this.cacheOffset + count;

		const buffer = this.cacheBuffer.subarray(this.cacheOffset, end);
		const s = String.fromCharCode.apply(null, buffer);

		return s;
	}


	/**
	 * @returns The registers of the current line.
	 */
	public getRegisters(line?: string): string {
		// Get current line
		if(!line) {
			line = this.getLine() as string;
			assert(line);
		}
		// E.g. "8000 LD A,1E PC=8000 SP=ff2b BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=01  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
		// Turn into same format as for 'get-registers'
		const k = line.indexOf('PC=');
		assert(k >= 0);
		const regs = line.substr(k);
		return regs;
	}


	/**
	 * @param line If given the instruction is taken from the line, otherwise
	 * 'getLine()' is called.
	 * @returns The instruction, e.g. "LD A,1E".
	 */
	public getInstruction(line?: string): string {
		// Get current line
		if(!line) {
			line = this.getLine() as string;
			assert(line);
		}
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
	public getAddress(line?: string): number {
		// Get current line
		if(!line) {
			line = this.getLine(4) as string;
			assert(line);
		}
		else
			line = line.substr(0,4);
		// Convert address
		const addr = parseInt(line, 16);
		return addr;
	}


	/**
	 * @returns Returns true if in step back mode.
	 */
	public isInStepBackMode() {
		return !this.isAtStart();
	}


	/**
	 * @returns true if at the very start of the file(s).
	 */
	protected isAtStart() {
		return (this.fileRotation < 0);
	}


	/**
	 * @returns true if at the very end of the file(s).
	 */
	protected isAtEnd() {
	//return (this.fileRotation >= 0) && (!this.file);
		return (this.fileRotation == this.countRotations) && (this.fileOffset == 0) && (this.cacheOffset == 0);	// this.cacheClip should be 0 in this case.
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
		const file = new ZesaruxTransactionLog(this.filepath, 100000);

		while(file.prevLine()) { // Previous line
			// Get current line
			const addr = file.getAddress();

			// Make sure that addr does not exist already in previous set.
			let next = false;
			for(let i=0; i<l; i++) {
				if(addrsArray[i].has(addr)) {
					next = true;
					break;
				}
			}
			if(next)
				continue;

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

