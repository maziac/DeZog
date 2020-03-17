import * as assert from 'assert';
import {Z80RegistersClass, Z80Registers} from '../remotes/z80registers';
import {StepHistoryClass} from './stephistory';
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
	 */
	public init() {
		super.init();
	}


	/**
	 * Clears the stack used for reverse debugging.
	 * Called when leaving the reverse debug mode.
	 */
	public clearCache() {
		super.clearCache();
		this.reverseDbgStack=undefined as any;
	}


	/**
	 * Only used in StepHistory.
	 */
	// TODO: die beiden pushes können wahrscheinlich weg. Werden sowieso nicht aufgerufen.
	//public pushCallStack(callstack: RefList<CallStackFrame>) {
	//}


	/**
	 * Only used in StepHistory.
	 */
	//public async pushHistoryInfo(): Promise<void> {
	//}


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
	 * Returns the call stack.
	 */
	public getCallStack(): RefList<CallStackFrame> {
		return this.reverseDbgStack;
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
			this.reverseDbgStack=await Remote.getCallStack();
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


	/**
	 * Handles the current instruction and the next one and distinguishes what to
	 * do on the virtual reverse debug stack.
	 * Note: This function wouldn'T have to be async (Promise) but
	 * it doesn't hurt and maybe I decide in future to communicate
	 * with ZEsarUX for some reason.
	 *
	 * Algorithm:
	 * 1. If (executed) CALL/RST
	 * 1.a 		expectedSP = SP-2
	 * 1.b		Put called address to callstack and set PC in frame
	 * 2. else If PUSH
	 * 2.a		expectedSP = SP-2
	 * 2.b		Add pushed value to frame stack
	 * 3. else If POP/RET
	 * 3.a		expectedSP = SP+2
	 * 3. else
	 * 3.a		expectedSP = calcDirectSpChanges
	 * 4. If nextSP != expectedSP   // Check for interrupt
	 * 4.a		Put nextPC on callstack
	 * 5. If SP > previous SP
	 * 5.a		Remove from frame stack and call stack
	 * @param currentLine The current line of the cpu history.
	 * @param nextLine The next line of the cpu history.
	 */
	protected handleReverseDebugStackForward(currentLine: string, nextLine: string) {
		assert(currentLine);
		assert(nextLine);

		// Get some values
		let sp=Z80Registers.decoder.parseSP(currentLine);
		let expectedSP: number|undefined=sp;
		let expectedPC;
		const opcodes=CpuHistory.decoder.getOpcodes(currentLine);
		const flags=Z80Registers.decoder.parseAF(currentLine);
		const nextSP=Z80Registers.decoder.parseSP(nextLine);

		// Check if there is at least one frame
		let frame=this.reverseDbgStack.last();
		if (!frame) {
			// Create new stack entry if none exists
			// (could happen in errorneous situations if there are more RETs then CALLs)
			frame=new CallStackFrame(0, sp, Remote.getMainName(sp));
			this.reverseDbgStack.push(frame);
		}

		// Check for CALL (CALL cc)
		if (CpuHistory.isCallAndExecuted(opcodes, flags)) {
			sp-=2;	// CALL pushes to the stack
			expectedSP=sp;
			// Now find label for this address
			const callAddr=(opcodes>>>8)&0xFFFF;
			const labelCallAddrArr=Labels.getLabelsForNumber(callAddr);
			const labelCallAddr=(labelCallAddrArr.length>0)? labelCallAddrArr[0]:Utility.getHexString(callAddr, 4)+'h';
			const name=labelCallAddr;
			frame=new CallStackFrame(0, nextSP-2, name);	// pc is set later anyway
			this.reverseDbgStack.push(frame);
		}
		// Check for RST
		else if (CpuHistory.isRst(opcodes)) {
			sp-=2;	// RST pushes to the stack
			expectedSP=sp;
			// Now find label for this address
			const callAddr=CpuHistory.getRstAddress(opcodes);
			const labelCallAddrArr=Labels.getLabelsForNumber(callAddr);
			const labelCallAddr=(labelCallAddrArr.length>0)? labelCallAddrArr[0]:Utility.getHexString(callAddr, 4)+'h';
			const name=labelCallAddr;
			frame=new CallStackFrame(0, nextSP-2, name);	// pc is set later anyway
			this.reverseDbgStack.push(frame);
		}
		else {
			// Check for PUSH
			const pushedValue=CpuHistory.getPushedValue(opcodes, currentLine);
			if (pushedValue!=undefined) {	// Is undefined if not a PUSH
				// Push to frame stack
				frame.stack.unshift(pushedValue);
				sp-=2;	// PUSH pushes to the stack
				expectedSP=sp;
			}
			// Check for POP
			else if (CpuHistory.isPop(opcodes)
				||CpuHistory.isRetAndExecuted(opcodes, flags)) {
				expectedSP+=2;	// Pop from the stack
			}
			// Otherwise calculate the expected SP
			else {
				expectedSP=CpuHistory.calcDirectSpChanges(opcodes, sp, currentLine);
				if (expectedSP==undefined) {
					// This means: Opcode was LD SP,(nnnn).
					// So use PC instead to check.
					const pc=Z80Registers.decoder.parsePC(currentLine);
					expectedPC=pc+4;	// 4 = size of instruction
				}
			}
		}

		// Check for interrupt. Either use SP or use PC to check.
		let interruptFound=false;
		const nextPC=Z80Registers.decoder.parsePC(nextLine);
		if (expectedSP!=undefined) {
			// Use SP for checking
			if (nextSP==expectedSP-2)
				interruptFound=true;
		}
		else {
			// Use PC for checking
			assert(expectedPC);
			if (nextPC!=expectedPC)
				interruptFound=true;
		}

		// Check if SP has increased (POP/RET)
		let usedSP=expectedSP;
		if (!usedSP)
			usedSP=Z80Registers.decoder.parseSP(nextLine);
		let count=usedSP-sp;
		if (count>0) {
			while (count>1&&this.reverseDbgStack.length>0) {
				// First remove the data stack
				while (count>1&&frame.stack.length>0) {
					// Pop from stack
					frame.stack.pop();
					count-=2;
				}
				// Now remove callstack
				if (count>1) {
					this.reverseDbgStack.pop();
					count-=2;
					// get next frame if countRemove still > 0
					frame=this.reverseDbgStack.last();
				}
			}
		}
		else {
			// Decreased. Put something on the stack
			while (count<-1) {
				// Push something unknown to the stack
				frame.stack.push(undefined);
				count+=2;
			}
		}

		// Interrupt
		if (interruptFound) {
			// Put nextPC on callstack
			const name=Remote.getInterruptName();
			frame=new CallStackFrame(0, nextSP, name);	// pc is set later anyway
			this.reverseDbgStack.push(frame);
		}

		// Adjust PC within frame
		frame.addr=nextPC;
	}


	/**
	 * Steps over an instruction.
	 * Simply returns the next address line.
	 * @returns instruction=undefined
	 * breakReason=A possibly break reason (e.g. 'Reached start of instruction history') or undefined.
	 */
	public stepOver(): {instruction: string, breakReason: string|undefined} {
		/*
				let breakReason;
				try {
					const currentLine=this.revDbgNext();
					if (!currentLine)
						throw 'Break: Reached start of instruction history.';
				}
				catch (e) {
					breakReason=e;
				}

				// Call handler
				return {instruction: undefined as any, breakReason};
		*/

		// Get current line
		let currentLine=Z80Registers.getCache();
		assert(currentLine);
		let nextLine;

		// Check for CALL/RST. If not do a normal step-into.
		// If YES stop if pc reaches the next instruction.
		const opcodes=CpuHistory.decoder.getOpcodes(currentLine);
		const opcode0=opcodes&0xFF;
		let pc=Z80Registers.decoder.parsePC(currentLine);
		let nextPC0;
		let nextPC1;
		if (CpuHistory.isCallOpcode(opcode0)) {
			nextPC0=pc+3;
			nextPC1=nextPC0;
		}
		else if (CpuHistory.isRstOpcode(opcode0)) {
			nextPC0=pc+1;
			nextPC1=nextPC0+1;	// If return address is adjusted
		}

		let breakReason;
		try {
			// Find next line with same SP
			while (true) {
				// Get next line
				nextLine=this.revDbgNext();
				if (!nextLine) {
					breakReason='Break: Reached start of instruction history.'
					break;	// At end of reverse debugging. Simply get the real call stack.
				}

				// Handle reverse stack
				this.handleReverseDebugStackForward(currentLine, nextLine);

				// Check if next instruction is required
				if (nextPC0==undefined)
					break;	// A simple step-into

				// Get PC
				pc=Z80Registers.decoder.parsePC(nextLine);
				// Check for "breakpoint"
				if (pc==nextPC0||pc==nextPC1)
					break;

				// Check for "real" breakpoint
				Z80Registers.setCache(nextLine);
				const condition=(CpuHistory as any).checkPcBreakpoints();
				if (condition!=undefined) {
					breakReason=condition;
					break;	// BP hit and condition met.
				}

				// Next
				currentLine=nextLine as string;
			}
		}
		catch (e) {
			breakReason=e;
		}

		// Decoration
		(CpuHistory as any).emitRevDbgHistory();

		// Call handler
		const instruction='  '+Utility.getHexString(pc, 4)+' '+CpuHistory.getInstruction(currentLine);

		// Get real registers if we reacheed the end.
		if (!nextLine) {
			// Make sure that reverse debug stack is cleared
			this.clearCache();
			// Clear
			Z80Registers.clearCache();
		}

		// Return
		return {instruction, breakReason};
	}


	/**
	 * Steps into an instruction.
	 * Works like the StepOver in StepHistory.
	 * @returns instruction=undefined
	 * breakReason='Not supported in lite reverse debugging.'.
	 */
	// TODO: Change so that LDDR etc work.
	public stepInto(): {instruction: string, breakReason: string|undefined} {
		return super.stepOver();
	}


	/**
	 * Steps out of an instruction.
	 * Is not implemented for StepHistory, only for CpuHistory.
	 * @returns breakReason='Not supported in lite reverse debugging.'.
	 */
	public stepOut(): string|undefined {
		return 'StepOut not supported in lite reverse debugging.';
	}

}


// Contains the history singleton.
export var StepHistory: StepHistoryClass;

// Contains the same object as StepHistory but allows type-safe access.
export var CpuHistory: CpuHistoryClass;
