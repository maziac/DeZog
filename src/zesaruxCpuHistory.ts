import * as assert from 'assert';
import { zSocket } from './zesaruxSocket';



/**
 * This class takes care of the ZEsarUX cpu history.
 * Each history instruction can be retireved form ZEsarUx.
 * The format of each line is:
 * 8193 CALL 8000 PC=8193 SP=ff2d BC=8000 AF=0054 HL=2d2b DE=5cdc IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=3f R=00  F=-Z-H-P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
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
	protected MAX_SIZE = 5;

	/// The pointer to the past executed instructions.
	// 0 = current instruction
	// 1 = previous instruction and so on
	protected revHistoryInstructionIndex;

	// The real maximum size.
	protected maxSize = 0;

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
		this.revHistoryInstructionIndex = 0;
		this.maxSize = this.MAX_SIZE;
		zSocket.send('cpu-history enabled yes '+this.MAX_SIZE, () => {
			zSocket.send('cpu-history set-max-size '+this.MAX_SIZE, () => {
				zSocket.send('cpu-history clear '+this.MAX_SIZE, () => {
					zSocket.send('cpu-history get-size', data => {
				this.maxSize = parseInt(data);
					});
				});
			});
		});
	}


	/**
	 * Moves the pointer to the previous instruction.
	 * @returns false if there is no previous instruction.
	 */
	public prevInstruction(): boolean {
		// Safety check
		if(this.isAtEnd())
			return false;

		this.revHistoryInstructionIndex ++;
		return true;
	}


	/**
	 * Moves the pointer to the next instruction.
	 * @returns false if there is no next line.
	 */
	public nextInstruction(): boolean {
		// Safety check
		if(this.isAtStart())
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
	public getLine(): string {
		let currentLine;
		this.getLinePromise()
		.then(line => {
			currentLine = line;
		})
		.catch(() => {
			throw Error("Error retrieving the cpu history from ZEsarUX.");
		});
		return currentLine;
	}

	/**
	 * Retrieves the instruction from ZEsarUX cpu history.
	 * Is async.
	 * @returns A string with the instruction and registers.
	 */
	protected async getLinePromise(): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			 zSocket('get-cpu-history ' + this.revHistoryInstructionIndex, data => {
				if(data.startsWith("Error"))
					reject();
				else
					resolve(data);
			 });
		});
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
			line = this.getLine() as string;
			assert(line);
		}
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
		return (this.revHistoryInstructionIndex <= 0);
	}


	/**
	 * @returns true if at the very end of the file(s).
	 */
	protected isAtEnd() {
	//return (this.fileRotation >= 0) && (!this.file);
		return (this.revHistoryInstructionIndex >= this.maxSize);
	}

}

