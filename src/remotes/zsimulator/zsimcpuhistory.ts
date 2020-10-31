import {CpuHistoryClass} from '../cpuhistory';
import {HistoryInstructionInfo} from '../decodehistinfo';
import {Settings} from '../../settings';
import {Z80Registers} from '../z80registers';
import {Utility} from '../../misc/utility';


/**
 * This class takes care of the internal simulator history.
 * Pleae note that for performance reasons (push is faster than unshift)
 * the history array has been turned around:
 * The oldest item is at 0, the youngest at historyIndex.
 * Please also note that the array is used as a ringbuffer once the
 * maximum size has reached (because of performance).
 * Variables:
 * - historyIndex: Read index (in ring buffer). Current position in history.
 * - historyWriteIndex: Write index (in ring buffer). Last written position.
 *
 * If history-buffer <= maxSize:
 * |-----|------------| . . . . . . . . . . . . |
 * 0     h.Index      h.writeIndex=h.length-1   maxSize
 *
 * if history-buffer > maxSize:
 * |-----|------------|-------------------------|
 * 0     h.Index      h.writeIndex    h.length=maxSize
 */
export class ZSimCpuHistory extends CpuHistoryClass {

	// The write index.
	protected historyWriteIndex: number;


	// Constructor
	constructor() {
		super();
	}


	/**
	 * Init.
	 */
	public init() {
		super.init();
		this.historyWriteIndex=-1;
	}


	/**
	 * The internal simulator (because it's internal) has a special way to store the history.
	 */
	public clear() {
		(async () => {
			this.historyIndex=-1;
			this.revDbgHistory.length=0;
			this.reverseDbgStack=undefined as any;
		})();
	}


	/**
	 * Retrieves the registers at the previous instruction from the Remote's cpu history.
	 * Is async.
	 * @returns Data with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo|undefined> {
		let index=this.historyIndex;
		if (index<0) {
			// First step
			index=this.historyWriteIndex;
		}
		else {
			index--;
			if (index<0)
				index=this.history.length-1;
			if (index==this.historyWriteIndex)
				return undefined;
		}
		this.historyIndex=index;
		const regs=this.history[index];
		return regs;
	}


	/**
	 * Retrieves the registers at the next instruction.
	 * @returns Data with the registers or undefined if at the start of the history.
	 */
	public getNextRegisters(): HistoryInstructionInfo|undefined {
		let index=this.historyIndex;
		if (index==this.historyWriteIndex) {
			this.historyIndex=-1;
			return undefined;
		}
		index++;
		if (index>=this.history.length)
			index=0;
		this.historyIndex=index;
		const regs=this.history[index];
		return regs;
	}


	/**
	 * Pushes one history into the array.
	 * @param line One line of history.
	 * @param exchange true if the element should be exchanged rather than added.
	 * Note: If you use exchange=true you cannot call 'pushCallStack' afterwards.
	 */
	public pushHistoryInfo(line: HistoryInstructionInfo, exchange=false) {
		//Utility.assert(line);
		if (exchange&&this.history.length>0) {
			// Exchange
			this.history[this.historyWriteIndex]=line;
		}
		else {
			// Otherwise add, first check if max size is reached
			if (this.history.length>=this.maxSize) {
				let index=this.historyWriteIndex;
				index++;
				// Check for overflow
				if (index>=this.maxSize)
					index=0;
				this.historyWriteIndex=index;
				this.history[index]=line;
			}
			else {
				// Not yet reached, so grow the array
				this.history.push(line);
				this.historyWriteIndex++;
			}
		}
	}


	/**
	 * Returns the address of the i-th element before the current
	 * historyIndex.
	 * 0 = historyIndex.
	 * @param i The i-th element.
	 * @returns The address or undefined if no previous address exists.
	 */
	public getPreviousAddress(i: number): number|undefined {
		const len=this.history.length;
		if (len==0)
			return undefined;
		let k=this.historyIndex-i;
		while (k<0)
			k+=len;
		if (k==this.historyWriteIndex)
			return undefined;
		const line=this.history[k];
		const addr=this.getAddress(line);
		return addr;
	}


	/**
	 * Emits 'historySpot' to signal that the files should be decorated.
	 * It can happen that this method has to retrieve data from the
	 * remote.
	 */
	protected emitHistorySpot() {
		// Check if history spot is enabled
		let count=Settings.launch.history.spotCount;
		if (count<=0)
			return;

		const decoder=Z80Registers.decoder;
		// Otherwise calculate addresses
		const addresses=new Array<number>();
		const registers=new Array<string>();

		// Prepare to get current registers
		const wantedRegs=["A", "F", "BC", "DE", "HL"];
		const regsMap=new Map<string, number>();
		wantedRegs.forEach(regName => {
			const value=Z80Registers.getRegValueByName(regName);
			regsMap.set(regName, value);
		});

		// Before historyIndex
		const len=this.history.length;
		Utility.assert(len>0);
		let startIndex=this.historyIndex;	// historyIndex could be -1
		if (startIndex<0)
			startIndex=this.historyWriteIndex;
		let index=startIndex;

		// Loop through history
		for (let i=0; i<=count; i++) {
			const line=this.history[index];
			const pc=decoder.parsePCLong(line);
			addresses.push(pc);

			// Compare registers
			const regText=this.getChangedRegistersString(line, regsMap);
			registers.push(regText);

			// Next
			index--;
			if (index<0)
				index=len-1;
			if (index==this.historyWriteIndex)
				break;
		}

		// After historyIndex
		index=startIndex;
		for (let i=0; i<count; i++) {
			if (index==this.historyWriteIndex)
				break;
			index++;
			if (index>=len)
				index=0;
			const line=this.history[index];
			const pc=Z80Registers.decoder.parsePCLong(line);
			addresses.unshift(pc);

			// Compare registers
			const regText=this.getChangedRegistersString(line, regsMap);
			registers.push(regText);
		}
		let convertedStartIndex=index;

		// Emit code coverage event
		convertedStartIndex=this.historyWriteIndex-convertedStartIndex;
		if (convertedStartIndex<0)
			convertedStartIndex+=len;
		this.emit('historySpot', convertedStartIndex, addresses, registers);
	}


	/**
	 * Creates a string with changed registers (names+value).
	 * @param line The history line in question.
	 * @param regsMap A map of register names ("A", "F", "HL" etc.) with their
	 * current values, i.e. the value after the history 'line'.
	 * I.e. the value that will be printed if not equal to previous
	 * value.
	 * This function will also override the value with the value of history line.
	 */
	protected getChangedRegistersString(line: string, regsMap: Map<string, number>): string {
		let regText='';
		for (const [regName, regValue] of regsMap) {
			const prevValue=Z80Registers.decoder.getRegValueByName(regName, line);
			// Check if changed
			if (regValue!=prevValue) {
				let regName2='';
				let regValueString='';
				// Check for flags
				const size=regName.length;
				if (size==1) {
					regName2=regName;
					if (regName=='F') {
						// Convert register
						regValueString=Utility.getFlagsString(regValue);
					}
					else {
						// One byte register
						regValueString=Utility.getHexString(regValue, 2);
					}
				}
				else {
					/* Distinguishes one and two byte registers
					// Normal reg
						// Check which part of the (double) register has changed
						if (regName.startsWith('I')) {
							// Double register
							regValueString=Utility.getHexString(regValue, 4)+'h';
						}
						else {
							// Check both parts
							const valueXored=regValue^prevValue;
							// First part
							if (valueXored&0xFF00) {
								regName2+=regName[0];
								regValueString+=Utility.getHexString(regValue>>>8, 2);
							}
							// Second part
							if (valueXored&0xFF) {
								regName2+=regName[1];
								regValueString+=Utility.getHexString(regValue%0xFF, 2);
							}
						}
					*/

					// Only 2 byte registers/ Double register
					regName2=regName;
					regValueString=Utility.getHexString(regValue, 4);
				}

				// Construct text
				if (regText)
					regText+=',';
				regText+=regName2+'='+regValueString+'h';
				// Store previous value
				regsMap.set(regName, prevValue);
			}
		}
		// Return
		return regText;
	}
}

