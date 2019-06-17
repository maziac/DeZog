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

	/// The file handle.
	protected file: number;

	/// The file offset of the current line.
	protected fileOffset: number;

	/// The size of the file.
	protected fileSize: number;

	/// Counter of the line numbers that are already stepped back.
	/// O if no step back.
	protected stepBackCounter: number;


	/**
	 * Creates the object.
	 * @param filepath The file to use.
	 */
	constructor(filepath: string) {
		this.filepath = filepath;
		this.stepBackCounter = 0;
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
		// Check if already at the beginning
		if(this.fileOffset == 0)
			return;

		// One more line
		this.stepBackCounter ++;
		//vscode.debug.activeDebugConsole.appendLine('stepBackCounter = ' + this.stepBackCounter);

		// Reads in a few bytes from the end and searches for '\n'
		const chunkSize = 100;
		const buffer = new Uint8Array(chunkSize);
		let offset = this.fileOffset-1;  // Skip first '\n'
		while(offset > 0) {
			// Read chunk
			offset -= chunkSize;
			if(offset < 0)
				offset = 0;
			fs.readSync(this.file, buffer, 0, chunkSize, offset);
			// Find '\n'
			const s = String.fromCharCode.apply(null, buffer);
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
		// Check if already at the end
		if(this.fileOffset >= this.fileSize)
			return;

		// One line less
		this.stepBackCounter --;
		//vscode.debug.activeDebugConsole.appendLine('stepBackCounter = ' + this.stepBackCounter);

		// Reads in a few bytes and searches for next '\n'
		const chunkSize = 100;
		const buffer = new Uint8Array(chunkSize);
		let offset = this.fileOffset;
		while(offset < this.fileSize) {
			// Read chunk
			fs.readSync(this.file, buffer, 0, chunkSize, offset);
			// Find '\n'
			const s = String.fromCharCode.apply(null, buffer);
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
	public getLine() { // TODO: should be protected
		// Reads in a few bytes from the end and searches for '\n'
		let total = '';
		const chunkSize = 100;
		const buffer = new Uint8Array(chunkSize);
		let offset = this.fileOffset;
		while(offset < this.fileSize) {
			// Read chunk
			fs.readSync(this.file, buffer, 0, chunkSize, offset);
			// Find '\n'
			const s = String.fromCharCode.apply(null, buffer);
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
		//vscode.debug.activeDebugConsole.appendLine('transaction(' + this.stepBackCounter + ', ' + this.fileOffset + ', ' + this.fileSize + ') = ' + total);
		return total;
	}


	/**
	 * @returns The address of the current line. Uses the first 4 digits simply.
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
	public getAddress(): number {
		// Get current line
		const line = this.getLine();
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

}

