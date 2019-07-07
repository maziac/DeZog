import * as assert from 'assert';
//import * as vscode from 'vscode';
import * as fs from 'fs';
import { RotationFile } from './rotationfile';


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

	/// The rotation file handle.
	protected file: RotationFile;

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
		this.file = new RotationFile(filepath);
	}


	/**
	 * Resets the file offset to the end of the file.
	 */
	public init() {
		// This will lead to opening the file.
		//this.fileSize = 0;
		//this.fileOffset = this.fileSize;
		this.stepBackCounter = 0;
	}



	/**
	 * @returns The registers of the current line.
	 */
	public getRegisters(): string {
		// Get current line
		const line = this.file.getLine();
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
		const line = this.file.getLine();
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
		const line = this.file.getLine(4);
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
	 * @param addrsArray Array with set of addresses. Correspondents to 'counts'.
	 * The Sets are filled.
	 */
	public getPrevAddresses(counts: Array<number>, addrsArray: Array<Set<number>>) {
		const len = counts.length;
		assert(len == addrsArray.length)

		// Open a parallel file
		// and load as much as is required to get the addresses.
		let l = -1;
		let count;
		const file = new RotationFile(this.filepath, 10000);

		// Skip possible zero counts
		do {
			l ++;
			if(l >= len)
				return;	// End
			count = counts[l];
		} while(count == 0);
		let addrs = addrsArray[l];

		while(file.prevLine()) { // Previous line
			// Get current line
			const line = this.file.getLine(4);
			// Convert address
			const addr = parseInt(line, 16);
			// Add to set
			addrs.add(addr);
			// Reduce count
			count --;
			if(count == 0) {
				// Proceed to next array
				do {
					l ++;
					if(l >= len)
						return;	// End
					count = counts[l];
				} while(count == 0);
				// Read new values
				addrs = addrsArray[l];
			}
		}
	}

}

