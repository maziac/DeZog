import * as assert from 'assert';
import {Z80RegistersClass, Z80Registers} from '../remotes/z80registers';
import {StepHistoryClass as StepHistoryClass} from './stephistory';
import {HistoryInstructionInfo} from './decodehistinfo';
import {RefList} from '../reflist';
import {CallStackFrame} from '../callstackframe';
import {Remote} from './remotefactory';
import {Labels} from '../labels';
import {Utility} from '../misc/utility';

/**
 * This class takes care of the ZEsarUX cpu history.
 * Each history instruction can be retrieved from ZEsarUx.
 * The format of each line is:
 * PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c
 * which is very much the same as the line retrieved during each forward step. To compare, forward-step:
 * PC=003a SP=ff42 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=07  F=-Z-H3P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0  TSTATES: 46
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
export class CpuHistoryClass extends StepHistoryClass{

	/// The virtual stack used during reverse debugging.
	protected reverseDbgStack: RefList<CallStackFrame>;


	/**
	 * Sets the static CpuHistory singleton.
	 */
	public static setCpuHistory(cpuHistory: CpuHistoryClass|StepHistoryClass) {
		StepHistory=cpuHistory;
		CpuHistory=undefined as any;
		if (cpuHistory instanceof CpuHistoryClass)
			CpuHistory=cpuHistory;
	}

	/**
	 * Init.
	 * @param size The max size of the history.
	 */
	public init(maxSize: number) {
		super.init(maxSize);
	}



	/**
	 * Only used in StepHistory.
	 */
	public pushCallStack(callstack: RefList<CallStackFrame>) {
	}


	/**
	 * Only used in StepHistory.
	 */
	public async pushHistoryInfo(): Promise<void> {
	}


	/**
	 * Retrieves the instruction from Remote's cpu history.
	 * Is async.
	 * @param index The index to retrieve. Starts at 0.
	 * @returns A string with the registers.
	 */
	protected async getRemoteHistoryIndex(index: number): Promise<HistoryInstructionInfo|undefined> {
		// Override this
		assert(false);
	}


	/**
	 * Retrieves the registers at the previous instruction from the Remote's cpu history.
	 * Is async.
	 * @returns A string with the registers or undefined if at the end of the history.
	 */
	public async getPrevRegistersAsync(): Promise<HistoryInstructionInfo|undefined> {
		let currentLine= await super.getPrevRegistersAsync();
		if(!currentLine)
		{
			const index = this.historyIndex + 1;
			currentLine = await this.getRemoteHistoryIndex(index);
			if(currentLine) {
				this.historyIndex = index;
				this.history.push(currentLine);
			}
		}
		return currentLine;
	}


	/**
	 * Tests if the opcode is a RET instruction and if it is
	 * conditional it tests if the condition was true.
	 * @param opcodes E.g. 0xe52a785c
	 * @param flags The flags.
	 * @returns false=if not RET (or RETI or RETN) or condition of RET cc is not met.
	 */
	public isRetAndExecuted(opcodes: number, flags: number): boolean {
		// Check for RET
		const opcode0=opcodes&0xFF;
		if(0xC9 == opcode0)
			return true;

		// Check for RETI or RETN
		if(0xED == opcode0) {
			const opcode1=(opcodes>>>8)&0xFF;
			if(0x4D == opcode1 || 0x45 == opcode1)
				return true;
		}

		// Now check for RET cc
		const mask = 0b11000111;
		if((opcode0 & mask) == 0b11000000) {
			// RET cc, get cc
			const cc = (opcode0 & ~mask) >>> 3;
			// Check condition
			const condMet = Z80RegistersClass.isCcMetByFlag(cc, flags);
			return condMet;
		}

		// No RET or condition not met
		return false;
	}


	/**
	 * Tests if the opcode is a CALL instruction and if it is
	 * conditional it tests if the condition was true.
	 * @param opcodes E.g. 0xe52a785c
	 * @param flags The flags.
	 * @returns false=if not CALL or condition of CALL cc is not met.
	 */
	public isCallAndExecuted(opcodes: number, flags: number): boolean {
		// Check for CALL
		const opcode0=opcodes&0xFF;
		if(0xCD == opcode0)
			return true;

		// Now check for CALL cc
		const mask = 0b11000111;
		if((opcode0 & mask) == 0b11000100) {
			// RET cc, get cc
			const cc = (opcode0 & ~mask) >>> 3;
			// Check condition
			const condMet = Z80RegistersClass.isCcMetByFlag(cc, flags);
			return condMet;
		}

		// No CALL or condition not met
		return false;
	}



	/**
	 * Tests if the line includes a RST instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns true=if RST
	 */
	public isRst(opcodes: number): boolean {
		// Check for RST
		const opcode0=opcodes&0xFF;
		return this.isRstOpcode(opcode0);
	}

	/**
	 * Returns the RST address. Note: It is not checked if the opcode is
	 * really a RST instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns E.g. 0x48.
	 */
	public getRstAddress(opcodes: number): number {
		const opcode0=opcodes&0xFF;
		const mask = ~0b11000111;
		const address = (opcode0 & mask);
		return address;
	}


	/**
	 * Tests if the opcode is a PUSH instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns true=if PUSH
	 */
	/*
	public isPush(opcodes: number): boolean {
		// Check for PUSH
		const opcode0 = opcodes&0xFF;

		// PUSH qq
		const mask = 0b11001111;
		if((opcode0 & mask) == 0x11000101)
			return true;

		// PUSH IX or IY
		if(opcode0 == 0xDD || opcode0 == 0xFD) {
			const opcode1=(opcodes>>>8)&0xFF;;
			if(opcode1 == 0xE5)
				return true;
		}

		// PUSH nnnn, ZXNext
		if(opcode0 == 0xED) {
			const opcode1=(opcodes>>>8)&0xFF;;
			if(opcode1 == 0x8A)
				return true;
		}

		// No PUSH
		return false;
	}
	*/

	/**
	 * Tests if the opcode is a POP instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns true=if POP
	 */
	public isPop(opcodes: number): boolean {
		// Check for POP
		const opcode0=opcodes&0xFF;;

		// POP qq
		const mask = 0b11001111;
		if((opcode0 & mask) == 0b11000001)
			return true;

		// POP IX or IY
		if(opcode0 == 0xDD || opcode0 == 0xFD) {
			const opcode1=(opcodes>>>8)&0xFF;;
			if(opcode1 == 0xE1)
				return true;
		}

		// No POP
		return false;
	}


	/**
	 * Returns the pushed value.
	 * @param opcodes E.g. 0xc5 (PUSH BC), BC being 0x1234
	 * @param line One line of history.
	 * @returns 0x1234
	 */
	public getPushedValue(opcodes: number, line: HistoryInstructionInfo): number {
		// Check for PUSH
		const opcode0=opcodes&0xFF;

		let value;
		switch(opcode0) {
			case 0xC5:	// PUSH BC
				value = Z80Registers.decoder.parseBC(line);
				break;
			case 0xD5:	// PUSH DE
				value = Z80Registers.decoder.parseDE(line);
				break;
			case 0xE5:	// PUSH HL
				value = Z80Registers.decoder.parseHL(line);
				break;
			case 0xF5:	// PUSH AF
				value = Z80Registers.decoder.parseAF(line);
				break;

			case 0xDD:
			case 0xFD:
				{
					const opcode1=(opcodes>>>8)&0xFF;;
					if(opcode1 == 0xE5) {
						if(opcode0 == 0xDD)
							value = Z80Registers.decoder.parseIX(line);	// PUSH IX
						else
							value = Z80Registers.decoder.parseIY(line);	// PUSH IY
					}
				}
				break;

			case 0xED:
				{
					const opcode1=(opcodes>>>8)&0xFF;
					if (opcode1==0x8A) {
						// PUSH nn, big endian
						value=(opcodes>>>8)&0xFF00;
						value|=(opcodes>>>24)&0xFF;
					}
				}
				break;
		}

		return value;
	}


	/**
	 * Returns the previous SP value. Check all direct changes (e.g. inc sp) to SP.
	 * Does not check CALL/RET/RST/PUSH and POP.
	 * For LD SP,(nnnn) undefinedis returned otherwise a real number.
	 * @param opcodes E.g. 0xe52a785c
	 * @param sp The SP value.
	 * @param line One line of history.
	 * @return The previous SP value or undefined if unknown.
	 */
	public calcDirectSpChanges(opcodes: number, sp: number, line: string): number|undefined {
		let expectedSp: number|undefined=sp;
		const opcode0=opcodes&0xFF;

		switch(opcode0) {
			case 0x31:	// LD SP,nnnn
				expectedSp=(opcodes>>>8)&0xFFFF;
				break;

			case 0x33:	// INC SP
				expectedSp ++;
				break;

			case 0x3B:	// DEC SP
				expectedSp --;
				break;

			case 0xF9:	// LD SP,HL
				// Get HL
				const hl = Z80Registers.decoder.parseHL(line);
				expectedSp = hl;
				break;

			case 0xED:
				{
					const opcode1=(opcodes>>>8)&0xFF;
					if(opcode1 == 0x7B) {
						// LD SP,(nnnn)
						expectedSp = undefined;
					}
				}
				break;

			case 0xDD:
				{
					const opcode1=(opcodes>>>8)&0xFF;
					if(opcode1 == 0xF9) {
						// LD SP,IX
						const ix = Z80Registers.decoder.parseIX(line);
						expectedSp = ix;
					}
				}
				break;

			case 0xFD:
				{
					const opcode1=(opcodes>>>8)&0xFF;
					if(opcode1 == 0xF9) {
						// LD SP,IY
						const iy = Z80Registers.decoder.parseIY(line);
						expectedSp = iy;
					}
				}
				break;
		}

		return expectedSp;
	}


	/**
	 * Tests if the opcode byte is from a CALL.
	 * @param opcode0 The first byte of an instruction.
	 * @returns true if "CALL" or "CALL cc". Does not matter if call was executed or not.
	 */
	public isCallOpcode(opcode0: number): boolean {
		// Check for CALL
		if (0xCD==opcode0)
			return true;

		// Now check for CALL cc
		const mask=0b11000111;
		if ((opcode0&mask)==0b11000100)
			return true;

		// No CALL
		return false;
	}


	/**
	 * Tests if the opcode byte is from a RST.
	 * @param opcode0 The first byte of an instruction.
	 * @returns true if "RST".
	 */
	public isRstOpcode(opcode0: number): boolean {
		const mask=0b11000111;
		if ((opcode0&mask)==0b11000111)
			return true;

		// No RST
		return false;
	}


	/**
	 * Returns the pointer to the virtual reverse debug stack.
	 * If it does not exist yet it will be created and prefilled with the current
	 * (memory) stack values.
	 */
	protected async prepareReverseDbgStack(): Promise<void> {
		if (!CpuHistory.isInStepBackMode()) {
			// Prefill array with current stack
			this.reverseDbgStack=await this.getCallStack();
		}
	}


	/**
	 * Handles the current instruction and the previous one and distinguishes what to
	 * do on the virtual reverse debug stack.
	 *
	 * Algorithm:
	 * 1. If (executed) RET
	 * 1.a 		Get caller address
	 * 1.b		If CALL then use it other "__INTERRUPT__"
	 * 1.c		Add to callstack and set PC in frame
	 * 1.d		return
	 * 2. set PC in current frame
	 * 3. If POP
	 * 3.a		Add (SP) to the frame stack
	 * 4. If SP > previous SP
	 * 4.a		Remove from frame stack and call stack
	 *
	 * @param currentLine The current line of the cpu history.
	 * @param prevLine The previous line of the cpu history. (The one that
	 * comes before currentLine). This can also be the cached register values for
	 * the first line.
	 */
	protected async handleReverseDebugStackBack(currentLine: string, prevLine: string): Promise<void> {
		assert(currentLine);

		// Get some values
		let sp=Z80Registers.decoder.parseSP(currentLine);
		const opcodes=CpuHistory.decoder.getOpcodes(currentLine);
		const flags=Z80Registers.decoder.parseAF(currentLine);

		// Check if there is at least one frame
		let frame=this.reverseDbgStack.last();
		if (!frame) {
			// Create new stack entry if none exists
			// (could happen in errorneous situations if there are more RETs then CALLs)
			frame=new CallStackFrame(0, sp, Remote.getMainName(sp));
			this.reverseDbgStack.push(frame);
		}

		// Check for RET (RET cc and RETI/N)
		if ((CpuHistory as CpuHistoryClass).isRetAndExecuted(opcodes, flags)) {
			// Get return address
			const retAddr=CpuHistory.decoder.getSPContent(currentLine);
			// Get memory at return address
			const data=await Remote.readMemoryDump((retAddr-3)&0xFFFF, 3);
			// Check for CALL and RST
			const firstByte=data[0];
			let callAddr;
			if (CpuHistory.isCallOpcode(firstByte)) {
				// Is a CALL or CALL cc, get called address
				// Get low byte
				const lowByte=data[1];
				// Get high byte
				const highByte=data[2];
				// Calculate address
				callAddr=(highByte<<8)+lowByte;
			}
			else if (CpuHistory.isRstOpcode(firstByte)) {
				// Is a Rst, get p
				callAddr=firstByte&0b00111000;
			}
			// If no calledAddr then we don't know.
			// Possibly it is an interrupt, but it could be also an errorneous situation, e.g. too many RETs
			let labelCallAddr;
			if (callAddr==undefined) {
				// Unknown
				labelCallAddr="__UNKNOWN__";
			}
			else {
				// Now find label for this address
				const labelCallAddrArr=Labels.getLabelsForNumber(callAddr);
				labelCallAddr=(labelCallAddrArr.length>0)? labelCallAddrArr[0]:Utility.getHexString(callAddr, 4)+'h';
			}

			// Check if there also was an interrupt in previous line
			const expectedPrevSP=sp+2;
			const prevSP=Z80Registers.decoder.parseSP(prevLine);
			if (expectedPrevSP!=prevSP) {
				// We came from an interrupt. Remove interrupt address from call stack.
				this.reverseDbgStack.pop();
			}

			// And push to stack
			const pc=Z80Registers.decoder.parsePC(currentLine);
			const frame=new CallStackFrame(pc, sp, labelCallAddr);
			this.reverseDbgStack.push(frame);

			// End
			return;
		}

		// Check if the frame stack needs to be changed, if it's pop.
		let pushedValue;
		if (CpuHistory.isPop(opcodes)) {
			// Remember to push to stack
			pushedValue=CpuHistory.decoder.getSPContent(currentLine);
			// Correct stack (this strange behavior is done to cope with an interrupt)
			sp+=2;
		}

		// Check if SP has decreased (CALL/PUSH/Interrupt) or increased
		const spPrev=Z80Registers.decoder.parseSP(prevLine);
		let count=sp-spPrev;
		if (count>0) {
			// Decreased (CALL/PUSH/Interrupt)
			while (count>1&&this.reverseDbgStack.length>0) {
				// First remove the data stack
				while (count>1&&frame.stack.length>0) {
					// Pop from stack
					frame.stack.pop();
					count-=2;
				}
				// Now remove callstack
				if (count>1) {
					// Stop if last item on stack
					if (this.reverseDbgStack.length<=1)
						break;
					this.reverseDbgStack.pop();
					count-=2;
					// get next frame if countRemove still > 0
					frame=this.reverseDbgStack.last();
				}
			}
		}
		else {
			// Increased. Put something on the stack
			while (count<-1) {
				// Push something unknown to the stack
				frame.stack.push(undefined);
				count+=2;
			}
		}

		// Adjust PC within frame
		const pc=Z80Registers.decoder.parsePC(currentLine)
		assert(frame);
		frame.addr=pc;

		// Add a possibly pushed value
		if (pushedValue!=undefined)
			frame.stack.push(pushedValue);
	}


	/**
	  * 'step backwards' the program execution in the debugger.
	  * @returns {instruction, breakReason} Promise.
	  * instruction: e.g. "081C NOP"
	  * breakReason: If not undefined it holds the break reason message.
	  */
	public async stepBack(): Promise<{instruction: string, breakReason: string|undefined}> {
		// Make sure the call stack exists
		await this.prepareReverseDbgStack();
		let breakReason;
		let instruction='';
		try {
			// Remember previous line
			let prevLine=Z80Registers.getCache();
			assert(prevLine);
			const currentLine=await CpuHistory.revDbgPrev();
			if (currentLine) {
				// Stack handling:
				await this.handleReverseDebugStackBack(currentLine, prevLine);
				// Get instruction
				const pc=Z80Registers.getPC();
				instruction='  '+Utility.getHexString(pc, 4)+' '+CpuHistory.getInstruction(currentLine);
			}
			else
				breakReason='Break: Reached end of instruction history.';
		}
		catch (e) {
			breakReason=e;
		}

		// Decoration
		CpuHistory.emitRevDbgHistory();

		// Call handler
		return {instruction, breakReason};
	}

}


// Refers to the same object but allows easier access.
export var StepHistory: StepHistoryClass;
export var CpuHistory: CpuHistoryClass;
