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

	/// The pointer to the past executed instructions.
	// 0 = current instruction
	// 1 = previous instruction and so on
	protected revHistoryInstructionIndex;

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
		this.revHistoryInstructionIndex = -1;
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
	 * Moves the pointer to the previous instruction.
	 * @returns false if there is no previous instruction.
	 */
	public async prevInstruction(): Promise<void> {
		return new Promise<void>(resolve => {
			// Check if it is the first retrieved line
			if(this.revHistoryInstructionIndex == 0) {
				// Get size of history
				zSocket.send('cpu-history get-size', async data => {
					this.size = parseInt(data);
					if(this.revHistoryInstructionIndex < this.size)
						this.revHistoryInstructionIndex ++;
					resolve();
				});
			}
			else {
				if(this.revHistoryInstructionIndex < this.size)
					this.revHistoryInstructionIndex ++;
				resolve();
			}
		});
	}


	/**
	 * Moves the pointer to the next instruction.
	 * @returns false if there is no next line.
	 */
	public nextInstruction(): boolean {
		// Safety check
		if(this.revHistoryInstructionIndex == 0)
			return false;

		this.revHistoryInstructionIndex --;
		return true;
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
			if(this.revHistoryInstructionIndex > 0
				&& this.revHistoryInstructionIndex <= this.size) {
					 currentLine = undefined;
			}
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
		this.revHistoryInstructionIndex ++;
		const currentLine = await this.getRegistersPromise();
		if(!currentLine)
			this.revHistoryInstructionIndex --;
		return currentLine;
	}


	/**
	 * Retrieves the registers at the next instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the start of the history.
	 */
	public async getNextRegisters(): Promise<string|undefined> {
		let currentLine;
		// Check if it is the first retrieved line
		if(this.revHistoryInstructionIndex >= 0) {
			this.revHistoryInstructionIndex --;
			currentLine = await this.getRegistersPromise();
			assert(currentLine);
		}
		return currentLine;
	}


	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the end of the history.
	 */
	protected getRegistersPromise(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			assert(this.revHistoryInstructionIndex >= 0);
			/*
			zSocket.send('cpu-history get-size', data => {
				const size = parseInt(data);
				const index = size - 1 - this.revHistoryInstructionIndex;
				*/
				const index = this.revHistoryInstructionIndex;
				zSocket.send('cpu-history get ' + index, data => {
					if(data.substr(0,5).toLowerCase() == 'error')
						resolve(undefined);
					else
						resolve(data);
				}, true);
//			 });
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
		return (this.revHistoryInstructionIndex >= 0);
	}


	/**
	 * @returns true if at the very end of the file(s).
	 */
	public isAtEnd() {
		return (this.revHistoryInstructionIndex >= this.size);
	}

}

