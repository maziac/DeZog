import * as assert from 'assert';
import { zSocket } from './zesaruxSocket';



/**
 * This class takes care of the ZEsarUX cpu history.
 * Each history instruction can be retrieved form ZEsarUx.
 * The format of each line is:
 * PC=15e2 SP=ff4e AF=005c BC=174b HL=107f DE=0006 IX=ffff IY=5c3a AF'=0044 BC'=ffff HL'=ffff DE'=5cb9 I=3f R=6a IM1 IFF12
 *
 * These are the ZEsarUX cpu history zrcp commands:
 * cpu-history ...:
 * clear                 Clear the cpu history
 * enabled yes|no        Enable or disable the cpu history
 * get index             Get registers at position
 * get-max-size          Return maximum allowed elements in history
 * get-pc start end      Return PC register from position start to end
 * get-size              Return total elements in history
 * is-enabled            Tells if the cpu history is enabled or not
 * is-started            Tells if the cpu history is started or not
 * started yes|no        Start recording cpu history. Requires it to be enabled first
 * set-max-size number   Sets maximum allowed elements in history
 */
export class ZesaruxCpuHistory {

	/// The maximum count of instructions in history.
	protected MAX_SIZE = 10;

	// Contains the cpu instructon (register) history.
	// Starts with the youngest.
	// At index 0 the current registers are cached.
	protected history: Array<string>;

	// The real size.
	protected size = 0;

	/**
	 * Creates the object.
	 */
	constructor() {
		this.init();
	}


	/**
	 * Init.
	 */
	public init() {
		this.history = Array<string>();
		this.size = 0;
		zSocket.send('cpu-history enabled yes', () => {
			zSocket.send('cpu-history set-max-size '+this.MAX_SIZE, () => {
				zSocket.send('cpu-history clear', () => {
					zSocket.send('cpu-history started yes');
				});
			});
		});
	}


	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * May throw an exception if wrong data is received.
	 * @returns A string with the instruction and registers.
	 */
	// REMOVE:
	public async getLineXXX(): Promise<string|undefined> {
		try {
			let currentLine;
			// Check if it is the first retrieved line

			return currentLine;
		}
		catch(e) {
			throw Error("Error retrieving the cpu history from ZEsarUX.");
		}
	}


	/**
	 * Retrieves the registers at the previous instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegisters(): Promise<string|undefined> {
		const currentLine = await this.getRegistersPromise(this.history.length);
		if(currentLine)
			this.history.push(currentLine);
		return currentLine;
	}


	/**
	 * Retrieves the registers at the next instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the start of the history.
	 */
	public getNextRegisters(): string|undefined {
		// Remove last one
		this.history.pop();
		// Get previous item
		const len = this.history.length;
		let currentLine;
		if(len > 0)
			currentLine = this.history[len-1];
		return currentLine;
	}


	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * @param index The index to retrieve. Starts at 0.
	 * @returns A string with the registers.
	 */
	protected getRegistersPromise(index: number): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			assert(index >= 0);
			zSocket.send('cpu-history get ' + index, data => {
				if(data.substr(0,5).toLowerCase() == 'error')
					resolve(undefined);
				else
					resolve(data);
			}, true);
		});
	}


	/**
	 * @returns The registers of the current line.
	 */
	public getRegisters(line: string): string {
		// E.g. "PC=15e2 SP=ff4e AF=005c BC=174b HL=107f DE=0006 IX=ffff IY=5c3a AF'=0044 BC'=ffff HL'=ffff DE'=5cb9 I=3f R=6a IM1 IFF12"
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
	public getInstruction(line: string): string {
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
	public getAddress(line: string): number {
		line = line.substr(3,4);
		// Convert address
		const addr = parseInt(line, 16);
		return addr;
	}


	/**
	 * @returns Returns true if in step back mode.
	 */
	public isInStepBackMode() {
		return (this.history.length > 0);
	}

}

