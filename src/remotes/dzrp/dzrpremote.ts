import * as assert from 'assert';
import * as fs from 'fs';
import {RemoteBase, RemoteBreakpoint, BREAK_REASON_NUMBER, MemoryBank} from '../remotebase';
import {GenericWatchpoint, GenericBreakpoint} from '../../genericwatchpoint';
import {Z80RegistersClass, Z80_REG, Z80Registers} from '../z80registers';
import {MemBank16k} from './membank16k';
import {SnaFile} from './snafile';
import {NexFile} from './nexfile';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';
import * as path from 'path';
import {Remote} from '../remotefactory';
import {Labels} from '../../labels';
import {ZxMemory} from '../zxsimulator/zxmemory';
import {gzip, ungzip} from 'node-gzip';
import {StepHistory} from '../cpuhistory';
import {Mutex} from 'async-mutex';



/**
 * The DZP commands and responses.
 * The response contains the command with the bit 7 set.
 */
export enum DZRP {
	CMD_GET_CONFIG=1,
	CMD_GET_REGISTERS=2,
	CMD_SET_REGISTER=3,
	CMD_WRITE_BANK=4,
	CMD_CONTINUE=5,
	CMD_PAUSE=6,

	CMD_ADD_BREAKPOINT=7,
	CMD_REMOVE_BREAKPOINT=8,

	CMD_ADD_WATCHPOINT=9,
	CMD_REMOVE_WATCHPOINT=0xA,

	CMD_READ_MEM=0xB,
	CMD_WRITE_MEM=0xC,

	CMD_GET_SLOTS=0xD,

	CMD_READ_STATE=0xE,
	CMD_WRITE_STATE=0xF,
};

/**
 * DZRP notifications.
 */
export enum DZRP_NTF {
	NTF_PAUSE=1
};


/**
 * A class that communicates with the remote via the DZRP protocol.
 * It is base class for all DZRP remote classes that implement
 * special transports like serial connection or socket.
 */
export class DzrpRemote extends RemoteBase {

	// The function to hold the Promise's resolve function for a continue request.
	protected continueResolve?: ({breakNumber, breakData, breakReasonString}) => void;

	// This flag is used to pause a step-out.
	protected pauseStepOut=false;

	/// Constructor.
	/// Override this.
	constructor() {
		super();
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
	}


	/**
	 * Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		try {
			// Get configuration
			const resp=await this.sendDzrpCmdGetConfig();
			// Check configuration
			this.supportsZxNextRegisters=(resp.zxNextRegs==true);
			// Load sna or nex file
			const loadPath=Settings.launch.load;
			if (loadPath)
				await this.loadBin(loadPath);
			// Ready
			this.emit('initialized')
		}
		catch (err) {
			this.emit('error', err);
		}
	}


	/**
	 * Override.
	 * Stops the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
	}


	/**
	 * Override.
	 * Terminates the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 */
	public async terminate(): Promise<void> {
	}


	/**
	* If cache is empty retrieves the registers from
	* the Remote.
	*/
	public async getRegisters(): Promise<void> {
		if (Z80Registers.valid())
			return;

		// Get regs
		const regs=await this.sendDzrpCmdGetRegisters();
		// And set
		Z80Registers.setCache(regs);
	}


	/**
	 * Sets the value for a specific register.
	 * Reads the value from the emulator and returns it in the promise.
	 * Note: if in reverse debug mode the function should do nothing and the promise should return the previous value.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 * @return Promise with the "real" register value.
	 */
	public async setRegisterValue(register: string, value: number): Promise<number> {
		const index=Z80RegistersClass.getEnumFromName(register) as number;
		assert(index!=undefined);
		// Send command to set register
		await this.sendDzrpCmdSetRegister(index, value);
		// Send command to get registers
		Z80Registers.clearCache();
		await this.getRegisters();
		// Return
		const realValue=Z80Registers.getRegValueByName(register);
		return realValue;
	}


	/**
	 * Searches the 'breakpoints', the 'assertBreakpoints' and the
	 * 'logpoints' arrays for the given breakpoint ID.
	 * @param bpId the breakpoint ID to search (!=0).
	 * @returns The found GenericBreakpoint (or RemoteBreakPoint) or
	 * undefined if not breakpoint found.
	 */
	protected getBreakpointById(bpId: number): GenericBreakpoint|undefined {
		if (bpId)	// undefined or 0
			return undefined;
		// Search vscode breakpoints
		const foundBp = this.breakpoints.find(bp => bp.bpId==bpId);
		if (foundBp)
			return foundBp;
		// Search asserts
		const foundAssertBp=this.assertBreakpoints.find(bp => bp.bpId==bpId);
		if (foundAssertBp)
			return foundAssertBp;
		// Search log breakpoints
		const foundLogBp=this.assertBreakpoints.find(bp => bp.bpId==bpId);
		if (foundLogBp)
			return foundLogBp;
		// Nothing found
		return undefined;
	}


	/**
	 * Takes a breakpoint and checks if it'S condition is true and if
	 * log needs to be done.
	 * @param bp The GenericBreakpoint.
	 * @returns [condition, log]
	 * condition:
	 * - undefined = Condition not met
	 * - otherwise: The condition text or '' if no condition was set.
	 * log:
	 * - undefined: No log breakpoint or condition not met
	 * - otherwise: The logpoint text (and condition met).
	 */
	protected checkConditionAndLog(bp: GenericBreakpoint|undefined): {condition: string|undefined, log: string|undefined} {
		if (bp) {
			if (bp.condition) {
				// Check if condition is true
				const evalCond=Utility.evalExpression(bp.condition, true);
				if (evalCond!=0)
					return {condition: bp.condition, log: bp.log};
			}
			else {
				// No condition
				return {condition: '', log: bp.log};
			}
		}
		return {condition: '', log: undefined};
	}


	/**
	 * Constructs a human readable break-reason-string from the break number, data and
	 * an already existing reason string.
	 * @param breakNumber E.g. BREAK_REASON_NUMBER.WATCHPOINT_READ.
	 * @param breakData E.g. the breakpoint ID or the watchpoint address.
	 * @param condition An additional condition or '' if no condition.
	 * @param breakReasonString An already existing (part of the) reason string.
	 * The string transmitted from the remote.
	 * @returns A Promise to the reason string, e.g. "Breakpoint hit. A==4."
	 */
	protected async constructBreakReasonString(breakNumber: number, breakData: number, condition: string, breakReasonString: string): Promise<string> {
		assert(condition != undefined);
		if (!breakReasonString)
			breakReasonString='';

		// Generate reason text
		let reasonString='';
		switch (breakNumber) {
			case BREAK_REASON_NUMBER.MANUAL_BREAK:
				reasonString="Manual break. ";
				break;
			case BREAK_REASON_NUMBER.BREAKPOINT_HIT:
				// Check if it was an ASSERT.
				const abp = this.assertBreakpoints.find(abp => abp.bpId==breakData);
				if (abp) {
					condition=condition.substr(2);	// cut off "!("
					condition=condition.substr(0, condition.length-1);	// cut off trailing ")"
					reasonString="ASSERT ";
				}
				else
					reasonString="Breakpoint. ";
				break;
			case BREAK_REASON_NUMBER.WATCHPOINT_READ:
			case BREAK_REASON_NUMBER.WATCHPOINT_WRITE:
				// Watchpoint
				const address=breakData;
				const labels=Labels.getLabelsForNumber(address);
				labels.push(address.toString());	// as decimal number
				const labelsString=labels.join(', ');
				reasonString="Watchpoint "+((breakNumber==BREAK_REASON_NUMBER.WATCHPOINT_READ)? "read":"write")+" access at address 0x"+Utility.getHexString(address, 4)+" ("+labelsString+"). "+breakReasonString;
				break;
		}
		// condition
		if (condition.length>0)
			reasonString+=condition+'. ';
		breakReasonString=reasonString+((breakReasonString.length>0)? breakReasonString:'');
		return breakReasonString;
	}


	/**
	 * This method should be called before a step (stepOver, stepInto, stepOut,
	 * continue) is called.
	 * The idea here is to store the values for the (lite) step history.
	 * If  true history is used this should be overridden with an empty method.
	 */
	protected async preStep(): Promise<void> {
		// Make sure registers and callstack exist.
		await this.getRegisters();
		await this.getCallStack();
		// Store as (lite step history)
		await StepHistory.pushHistoryInfo(Z80Registers.getCache());
		StepHistory.pushCallStack(this.listFrames);
	}


	/**
	 * This method should be called after a step (stepOver, stepInto, stepOut,
	 * continue) is called.
	 * It will clear e.g. the register and teh call stack cache.
	 * So that the next time they are accessed they are immediately refreshed.
	 */
	protected postStep() {
		Z80Registers.clearCache();
		this.clearCallStack();
	}


	/**
	 * 'continue' debugger program execution.
	 * @returns A Promise with {breakReasonString}.
	 * Is called when it's stopped e.g. when a breakpoint is hit.
	 * breakReason contains the stop reason as string.
	 *
	 * This method assumes a 'stupid' external remote that does not evaluate the
	 * breakpoint's log string or condition.
	 * Instead evaluation is done here and if e.g. the condition is not met
	 * than another 'continue' is sent.
	 */
	public async continue(): Promise<{breakReasonString: string}> {
		return new Promise<{breakReasonString: string}>(resolve => {
			// Use a custom function here to evaluate breakpoint condition and log string.
			this.continueResolve=async ({breakNumber, breakData, breakReasonString}) => {
				try {
					// Get registers
					Z80Registers.clearCache();
					await Remote.getRegisters();

					// Check breakReason, i.e. check if it was a watchpoint.
					let condition;
					if (breakNumber==BREAK_REASON_NUMBER.WATCHPOINT_READ||breakNumber==BREAK_REASON_NUMBER.WATCHPOINT_WRITE) {
						// Condition not used at the moment
						condition='';
					}
					else if (breakNumber==BREAK_REASON_NUMBER.BREAKPOINT_HIT) {
						// Get corresponding breakpoint
						const bpId=breakData as number;
						assert(bpId)
						const bp=this.getBreakpointById(bpId);

						// Check for condition
						const {condition: cond, log}=this.checkConditionAndLog(bp);
						condition=cond;

						// Emit log?
						if (log) {
							// Convert
							const evalLog=await Utility.evalLogString(log);
							// Print
							this.emit('log', evalLog);
						}
					}
					else {
						// E.g. manual break
						condition='';
					}

					// Check for continue
					if (condition==undefined) {
						// Pre action
						await this.preStep();
						// Continue
						this.sendDzrpCmdContinue();
					}
					else {
						// Construct break reason string to report
						breakReasonString=await this.constructBreakReasonString(breakNumber, breakData, condition, breakReasonString);
						// return
						resolve({breakReasonString});
					}
				}
				catch (e) {
					resolve({breakReasonString: e});
				}
			};

			// Clear registers
			this.postStep();
			// Send 'run' command
			this.sendDzrpCmdContinue();
		});
	}


	/**
	 * 'pause' the debugger.
	 */
	public async pause(): Promise<void> {
		// Set this flag to pause a stepOut
		this.pauseStepOut=true;
		// Send 'run' command
		await this.sendDzrpCmdPause();
	}


	/**
	 * 'step over' an instruction in the debugger.
	 * @param stepOver true=step-over, false=step-into.
	 * @returns A Promise with:
	 * 'instruction' is the disassembly of the current line.
	 * 'breakReasonString' a possibly text with the break reason.
	 */
	public async stepOver(stepOver = true): Promise<{instruction: string, breakReasonString?: string}> {
		return new Promise<{instruction: string, breakReasonString?: string}>(async resolve => {
			// Do pre-step
			await this.preStep();
			// Calculate the breakpoints to use for step-over
			await this.getRegisters();
			let [opcode, bp1, bp2]=await this.calcStepBp(stepOver);

			// Disassemble
			const pc=this.getPC();
			const opCodeDescription=opcode.disassemble();
			const instruction=Utility.getHexString(pc, 4)+' '+opCodeDescription.mnemonic;
			// Prepare for break: This function is called by the PAUSE (break) notification:
			this.continueResolve=({breakReasonString}) => {
				// Clear registers
				this.postStep();
				// return
				resolve({instruction, breakReasonString});
			};

			// Send command to 'continue'
			await this.sendDzrpCmdContinue(bp1, bp2);
		});
	}


	/**
	 * 'step into' an instruction in the debugger.
	 * @returns A Promise:
	 * 'instruction' is the disassembly of the current line.
	 * 'breakReasonString' a possibly text with the break reason. This is mainly to keep the
	 * record consistent with stepOver. But it is e.g. used to inform when the
	 * end of the cpu history is reached.
	 */
	public async stepInto(): Promise<{instruction: string, breakReasonString?: string}> {
		return this.stepOver(false);
	}


	/**
	 * 'step out' of current subroutine.
	 * The step-out uses normal step (into) functionality and checks
	 * after each step if the last instruction was some RET and
	 * the stackpointer is bigger than at the beginning.
	 * @param A Promise that returns {breakReasonString}
	 * 'breakReasonString' a possibly text with the break reason.
	 */
	public async stepOut(): Promise<{breakReasonString?: string}> {

		return new Promise<{breakReasonString?: string}>(async resolve => {
			// Do pre-step
			await this.preStep();
			// Reset flag
			this.pauseStepOut=false;
			// Get current SP
			const startSp=Z80Registers.getRegValue(Z80_REG.SP);
			let prevSp=startSp;
			let prevPc=0;
			let breakReason;

			// Create mutex to wait for the breaks
			const mutex=new Mutex();
			let releaseMutex;

			// Loop until SP indicates that we are out of the current subroutine
			while (true) {
				// Give vscode some time to show debug controls
				// (Maybe this is required here because of the mutex)
				await Utility.timeout(1);

				// Lock mutex
				releaseMutex=await mutex.acquire();

				// Check if user breaked
				if (this.pauseStepOut) {
					// User pressed pause
					breakReason="Manual break";
					break;
				}

				// Other breakpoint hit
				if (breakReason)
					break;

				// Check if instruction was a RET(I/N)
				await this.getRegisters();
				const currSp=Z80Registers.getRegValue(Z80_REG.SP);
				if (currSp>startSp&&currSp>prevSp) {
					// Something has been popped. This is to exclude unexecuted RET cc.
					const bytes=await this.readMemoryDump(prevPc, 2);
					const opcodes=bytes[0]+(bytes[1]<<8);
					if (this.isRet(opcodes)) {
						// Stop here
						break;
					}
				}

				// Calculate the breakpoints to use for step-over
				let [, bp1, bp2]=await this.calcStepBp(true);


				// Prepare for break
				this.continueResolve=({breakReasonString}) => {
					breakReason=breakReasonString;
					Z80Registers.clearCache();
					releaseMutex();
				};

				// Send command to 'continue'
				prevPc=Z80Registers.getPC();
				await this.sendDzrpCmdContinue(bp1, bp2);

				// Next
				prevSp=currSp;
			}

			// Release mutex
			releaseMutex();

			// Clear registers
			this.postStep();

			// return
			resolve({breakReasonString: breakReason});
		});

	}


	/**
	 * Tests if the opcode is a RET instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns false=if not RET (or RETI or RETN or RET cc).
	 */
	public isRet(opcodes: number): boolean {
		// Check for RET
		const opcode0=opcodes&0xFF;
		if (0xC9==opcode0)
			return true;

		// Check for RETI or RETN
		if (0xED==opcode0) {
			const opcode1=(opcodes>>>8)&0xFF;
			if (0x4D==opcode1||0x45==opcode1)
				return true;
		}

		// Now check for RET cc
		const mask=0b11000111;
		if ((opcode0&mask)==0b11000000) {
			// RET cc
			return true;
		}

		// No RET
		return false;
	}


	/**
	 * Sets one watchpoint in the remote.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * Promises is execute when last watchpoint has been set.
	 * @param wp The watchpoint to set. Will set 'bpId' in the 'watchPoint'.
	 */
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		await this.sendDzrpCmdAddWatchpoint(wp.address, wp.size, wp.access, wp.condition);
	}


	/**
	 * Removes one watchpoint from the remote.
	 * Promises is execute when last watchpoint has been set.
	 * @param wp The watchpoint to renove. Will set 'bpId' in the 'watchPoint' to undefined.
	 */
	public async removeWatchpoint(wp: GenericWatchpoint): Promise<void> {
		await this.sendDzrpCmdRemoveWatchpoint(wp.address, wp.size);
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertBreakpoints(enable: boolean): Promise<void> {
		for (let abp of this.assertBreakpoints) {
			if (enable) {
				// Set breakpoint
				if (!abp.bpId) {
					const bpId=await this.sendDzrpCmdAddBreakpoint(abp.address);
					abp.bpId=bpId;
				}
			}
			else {
				// Remove breakpoint
				if (abp.bpId) {
					await this.sendDzrpCmdRemoveBreakpoint(abp.bpId);
					abp.bpId=undefined;
				}
			}
		}
		this.assertBreakpointsEnabled=enable;
	}


	/**
	 * Enables/disable all given points.
	 * Called at startup and once by enableLogpointGroup (to turn a group on or off).
	 * Promise is called after the last logpoint is set.
	 * @param logpoints A list of addresses to put a log breakpoint on.
	 * @param enable Enable or disable the logpoints.
	 * @returns A promise that is called after the last watchpoint is set.
	 */
	public async enableLogpoints(logpoints: Array<GenericBreakpoint>, enable: boolean): Promise<void> {
		// Logpoints are treated as normal breakpoints but without a reference to the source file.
		// This is not necessary as on a logpoint the execution simply continues after
		// logging.
		for (let lp of logpoints) {
			if (enable) {
				// Set breakpoint
				if (!lp.bpId) {
					const bpId=await this.sendDzrpCmdAddBreakpoint(lp.address);
					lp.bpId=bpId;
				}
			}
			else {
				// Remove breakpoint
				if (lp.bpId) {
					await await this.sendDzrpCmdRemoveBreakpoint(lp.bpId);
					lp.bpId=undefined;
				}
			}
		}
	}


	/*
	 * Sets breakpoint in the Remote.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public async setBreakpoint(bp: RemoteBreakpoint): Promise<number> {

		// Check if "real" PC breakpoint
		if (bp.address<0) {
			this.emit('warning', 'DZRP does only support PC breakpoints.');
			// set to unverified
			bp.address=-1;
			return 0;
		}

		// Set breakpoint
		const bpId=await this.sendDzrpCmdAddBreakpoint(bp.address, bp.condition);

		// Add to list
		bp.bpId=bpId;
		this.breakpoints.push(bp);

		// return
		return bpId;
	}


	/**
	 * Clears one breakpoint.
	 */
	protected async removeBreakpoint(bp: RemoteBreakpoint): Promise<void> {
		await this.sendDzrpCmdRemoveBreakpoint(bp.bpId);

		// Remove from list
		let index=this.breakpoints.indexOf(bp);
		assert(index!==-1, 'Breakpoint should be removed but does not exist.');
		this.breakpoints.splice(index, 1);
	}


	/**
	 * Reads a memory.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async readMemoryDump(address: number, size: number): Promise<Uint8Array> {
		return await this.sendDzrpCmdReadMem(address, size);
	}


	/**
	 * Writes a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 */
	public async writeMemoryDump(address: number, dataArray: Uint8Array): Promise<void> {
		return await this.sendDzrpCmdWriteMem(address, dataArray);
	}


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an array of MemoryBanks.
	 * @returns A Promise with an array with the available memory pages.
	 */
	public async getMemoryBanks(): Promise<MemoryBank[]> {
		// Prepare array
		const pages: Array<MemoryBank>=[];
		// Get the data
		const data=await this.sendDzrpCmdGetSlots();
		// Save in array
		let start=0x0000;
		data.map(slot => {
			const end=start+ZxMemory.MEMORY_BANK_SIZE-1;
			const name=(slot>=254)? "ROM":"BANK"+slot;
			pages.push({start, end, name});
			start+=ZxMemory.MEMORY_BANK_SIZE-1;
		});
		// Return
		return pages;
	}


	/**
	 * Loads .nex or .sna files.
	 */
	protected async loadBin(filePath: string): Promise<void> {
		// Check file extension
		const ext=path.extname(filePath);
		if (ext=='.sna')
			await this.loadBinSna(filePath);
		else if (ext=='.nex')
			await this.loadBinNex(filePath);
		else {
			// Error: neither sna nor nex file
			throw Error("File extension unknown in '"+filePath+"'. Can only load .sna and .nex files.");
		}
		// Make sure that the registers are reloaded
		Z80Registers.clearCache();
		this.clearCallStack();
	}


	/**
	 * Loads object file (binary without any meta data).
	 * @param filePath The absolute path to the file.
	 * @param startAddress The address where the data should be loaded.
	 */
	protected async loadObj(filePath: string, startAddress: number): Promise<void> {
		// Read file
		const objBuffer=fs.readFileSync(filePath);

		// Write as memory dump
		this.sendDzrpCmdWriteMem(startAddress, objBuffer);

		// Make sure that the registers are reloaded
		Z80Registers.clearCache();
		this.clearCallStack();
	}


	/**
	 * Loads a .sna file.
	 * See https://faqwiki.zxnet.co.uk/wiki/SNA_format
	 */
	protected async loadBinSna(filePath: string): Promise<void> {
		// Load and parse file
		const snaFile=new SnaFile();
		snaFile.readFile(filePath);

		// Transfer 16k memory banks
		for (const memBank of snaFile.memBanks) {
			// As 2x 8k memory banks
			const bank8=2*memBank.bank;
			await this.sendDzrpCmdWriteBank(bank8, memBank.data.slice(0, MemBank16k.BANK16K_SIZE/2));
			await this.sendDzrpCmdWriteBank(bank8+1, memBank.data.slice(MemBank16k.BANK16K_SIZE/2));
		}

		// Set the registers
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, snaFile.pc);
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, snaFile.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.AF, snaFile.af);
		await this.sendDzrpCmdSetRegister(Z80_REG.BC, snaFile.bc);
		await this.sendDzrpCmdSetRegister(Z80_REG.DE, snaFile.de);
		await this.sendDzrpCmdSetRegister(Z80_REG.HL, snaFile.hl);
		await this.sendDzrpCmdSetRegister(Z80_REG.IX, snaFile.ix);
		await this.sendDzrpCmdSetRegister(Z80_REG.IY, snaFile.iy);
		await this.sendDzrpCmdSetRegister(Z80_REG.AF2, snaFile.af2);
		await this.sendDzrpCmdSetRegister(Z80_REG.BC2, snaFile.bc2);
		await this.sendDzrpCmdSetRegister(Z80_REG.DE2, snaFile.de2);
		await this.sendDzrpCmdSetRegister(Z80_REG.HL2, snaFile.hl2);
		await this.sendDzrpCmdSetRegister(Z80_REG.R, snaFile.r);
		await this.sendDzrpCmdSetRegister(Z80_REG.I, snaFile.i);
		await this.sendDzrpCmdSetRegister(Z80_REG.IM, snaFile.im);
	}


	/**
	 * Loads a .nex file.
	 * See https://wiki.specnext.dev/NEX_file_format
	 */
	protected async loadBinNex(filePath: string): Promise<void> {
		// Load and parse file
		const nexFile=new NexFile();
		nexFile.readFile(filePath);
		// Transfer 16k memory banks
		for (const memBank of nexFile.memBanks) {
			// As 2x 8k memory banks
			const bank8=2*memBank.bank;
			await this.sendDzrpCmdWriteBank(bank8, memBank.data.slice(0, MemBank16k.BANK16K_SIZE/2));
			await this.sendDzrpCmdWriteBank(bank8+1, memBank.data.slice(MemBank16k.BANK16K_SIZE/2));
		}
		// Set the SP and PC registers
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, nexFile.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, nexFile.pc);
	}


	/**
	 * Called from "-state save" command.
	 * Stores all RAM, registers etc.
	 * Override.
	 * @param filePath The file path to store to.
	 */
	public async stateSave(filePath: string): Promise<void> {
		// Get state data
		const stateData=await this.sendDzrpCmdReadState();
		// Zip data
		const zippedData=await gzip(stateData);
		// Save data to .tmp/states directory
		fs.writeFileSync(filePath, zippedData);
	}


	/**
	 * Called from "-state restore" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * Override.
	 * @param filePath The file path to retore from.
	 */
	public async stateRestore(filePath: string): Promise<void> {
		// Read state dta
		const zippedData=fs.readFileSync(filePath);
		// Unzip data
		const stateData=await ungzip(zippedData);
		// Restore data
		await this.sendDzrpCmdWriteState(stateData);
		// Clear register cache
		Z80Registers.clearCache();
		this.clearCallStack();
	}


	//------- Send Commands -------

	/**
	 * Override.
	 * Sends the command to get the configuration.
	 * @returns The configuration, e.g. '{xNextRegs: true}'
	 */
	protected async sendDzrpCmdGetConfig(): Promise<{zxNextRegs: boolean}> {
		assert(false);
		return {zxNextRegs: false};
	}


	/**
	 * Override.
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	protected async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		assert(false);
		return new Uint16Array(0);
	}


	/**
	 * Override.
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	protected async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to pause a running program.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to add a breakpoint.
	 * @param bpAddress The breakpoint address. 0x0000-0xFFFF.
	 * @param condition The breakpoint condition as string. If there is n condition
	 * 'condition' may be undefined or an empty string ''.
	 * @returns A Promise with the breakpoint ID (1-65535) or 0 in case
	 * no breakpoint is available anymore.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition?: string): Promise<number> {
		assert(false);
		return 0;
	}


	/**
	 * Override.
	 * Sends the command to remove a breakpoint.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bpId: number): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * I.e. you can watch whole memory areas.
	 * @param condition The watchpoint condition as string. If there is n0 condition
	 * 'condition' may be undefined or an empty string ''.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string, condition: string): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to retrieve a memory dump.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		assert(false);
		return new Uint8Array(0);
	}


	/**
	 * Override.
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer|Uint8Array): Promise<void> {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to write a memory bank.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer|Uint8Array) {
		assert(false);
	}


	/**
	 * Override.
	 * Sends the command to read the slot/bank associations (8k banks).
	 * @returns A Promise with an number array of 8 slots.
	 *  Each entry contains the correspondent bank number.
 	*/
	public async sendDzrpCmdGetSlots(): Promise<number[]> {
		assert(false);
		return [];
	}


	/**
	 * Override.
	 * Sends the command to read the current state of the machine.
	 * I.e. memory, registers etc.
	 * @returns A Promise with state data. Format is unknown (remote specific).
	 * Data will just be saved.
 	*/
	public async sendDzrpCmdReadState(): Promise<Uint8Array> {
		assert(false);
		return new Uint8Array();
	}


	/**
	 * Override.
	 * Sends the command to wite a previously saved state to the remote.
	 * I.e. memory, registers etc.
	 * @param The state data. Format is unknown (remote specific).
 	*/
	public async sendDzrpCmdWriteState(stateData: Uint8Array): Promise<void> {
		assert(false);
	}
}

