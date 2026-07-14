import * as path from 'path';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG, Z80Registers, Z80RegistersClass} from '../z80registers';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Settings, SettingsParameters, Trs80SimType} from '../../settings/settings';
import {Labels} from '../../labels/labels';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {MemoryModelTrs80Model1, MemoryModelTrs80Model3} from '../MemoryModel/trs80memorymodels';
import {CmdFile} from './cmdfile';
import {Trs80, Trs80Screen, Keyboard, CassettePlayer, SilentSoundPlayer, Config, ModelType, BasicLevel, RamSize} from 'trs80-emulator';


/** The base Trs80Screen throws "Must be implemented" in setConfig()/writeChar().
 * This subclass makes the emulator constructible headless and buffers the
 * screen contents: the emulator pushes every VRAM write through writeChar(),
 * so the buffer is always current and a view only needs to poll the dirty
 * flag (no memory polling required).
 */
export class HeadlessScreen extends Trs80Screen {
	// The screen characters, 64x16, index 0 = VRAM 0x3C00 (upper-left).
	public chars = new Uint8Array(1024);

	// Set on every change; a view resets it after reading.
	public dirty = true;

	public setConfig(_config: Config) {
		// no-op
	}

	public writeChar(address: number, value: number) {
		const i = address - 0x3C00;
		if (i >= 0 && i < 1024 && this.chars[i] !== value) {
			this.chars[i] = value;
			this.dirty = true;
		}
	}

	public setExpandedCharacters(expanded: boolean) {
		super.setExpandedCharacters(expanded);
		this.dirty = true;
	}

	public setAlternateCharacters(alternate: boolean) {
		super.setAlternateCharacters(alternate);
		this.dirty = true;
	}
}


/**
 * The in-process TRS-80 remote ("trs80sim").
 * Runs Lawrence Kesteloot's TypeScript TRS-80 emulator (npm 'trs80-emulator')
 * inside the extension host and implements the sendDzrpCmd* methods with
 * direct method calls, following the pattern of ZSimRemote (zsim).
 * The emulator's own run loop and breakpoint handling are NOT used. Instead
 * trs80.step() serves as the instruction atom of a self-driven chunked loop
 * which checks DeZog's breakpoint lists, the step guard breakpoints (bp1/bp2)
 * and the stopCpu flag after every instruction.
 */
export class Trs80SimRemote extends DzrpRemote {

	// Pointer to the launch.json settings for 'trs80sim'.
	public trs80sim: Trs80SimType;

	// The Kesteloot emulator instance.
	public trs80: Trs80;

	// The buffering screen (also passed to the Trs80 instance).
	public screen: HeadlessScreen;

	// The emulated keyboard (Trs80 keeps it private, so hold our own reference).
	protected keyboard: Keyboard;

	// The last used breakpoint ID.
	protected lastBpId: number;

	// Set to true to stop the CPU from running. Is set when the user presses "break".
	protected stopCpu: boolean;

	// Can be enabled through commands to break when an interrupt occurs.
	protected breakOnInterrupt: boolean;

	// Used to calculate the passed instruction time (t-states since last step).
	protected prevTstates: number;


	/// Constructor.
	constructor(launchArguments: SettingsParameters) {
		super();
		// Init
		this.trs80sim = launchArguments.trs80sim;
		this.supportsASSERTION = true;
		this.supportsLOGPOINT = true;
		this.supportsBreakOnInterrupt = true;
		this.supportsWPMEM = false;	// M3: watchpoints via HAL wrapper

		this.stopCpu = true;
		this.lastBpId = 0;
		this.breakOnInterrupt = false;
		this.prevTstates = 0;
		// Set decoder
		Z80Registers.decoder = new Z80RegistersStandardDecoder();
	}


	/**
	 * Configures the machine: memory model and emulator instance.
	 * Model I/III is configuration (Config/ModelType), not a subclass.
	 */
	public configureMachine() {
		Z80Registers.decoder = new Z80RegistersStandardDecoder();	// Required for the memory model.

		// Memory model (flat, no banking; slots describe the fixed layout)
		const model = this.trs80sim.model;
		this.memoryModel = (model === 3)
			? new MemoryModelTrs80Model3()
			: new MemoryModelTrs80Model1();
		this.memoryModel.init();

		// Create the emulator with no-op collaborators (headless).
		const config = Config.makeDefault()
			.withModelType((model === 3) ? ModelType.MODEL3 : ModelType.MODEL1)
			.withBasicLevel(BasicLevel.LEVEL2)
			.withRamSize(RamSize.RAM_48_KB);
		this.screen = new HeadlessScreen();
		this.keyboard = new Keyboard();
		this.trs80 = new Trs80(config, this.screen, this.keyboard, new CassettePlayer(), new SilentSoundPlayer());
		this.trs80.reset();
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	public async doInitialization(): Promise<void> {
		// Decide what machine
		this.configureMachine();

		// Load .cmd etc.
		await this.load();

		// Ready
		this.emit('initialized');
	}


	/**
	 * Stops the simulator.
	 * Called e.g. when vscode sends a disconnectRequest.
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		// Stop running cpu
		this.funcContinueResolve = undefined;
		this.stopCpu = true;
	}


	/**
	 * Sets a specific register value in the emulator's RegisterSet.
	 * @param reg E.g. Z80_REG.PC or Z80_REG.A
	 * @param value The value to set.
	 */
	protected setRegValue(reg: Z80_REG, value: number) {
		const regs = this.trs80.z80.regs;
		switch (reg) {	// NOSONAR
			case Z80_REG.PC:
				regs.pc = value;
				break;
			case Z80_REG.SP:
				regs.sp = value;
				break;
			case Z80_REG.AF:
				regs.af = value;
				break;
			case Z80_REG.BC:
				regs.bc = value;
				break;
			case Z80_REG.DE:
				regs.de = value;
				break;
			case Z80_REG.HL:
				regs.hl = value;
				break;
			case Z80_REG.IX:
				regs.ix = value;
				break;
			case Z80_REG.IY:
				regs.iy = value;
				break;
			case Z80_REG.AF2:
				regs.afPrime = value;
				break;
			case Z80_REG.BC2:
				regs.bcPrime = value;
				break;
			case Z80_REG.DE2:
				regs.dePrime = value;
				break;
			case Z80_REG.HL2:
				regs.hlPrime = value;
				break;

			case Z80_REG.IM:
				regs.im = value;
				break;

			case Z80_REG.F:
				regs.f = value;
				break;
			case Z80_REG.A:
				regs.a = value;
				break;
			case Z80_REG.C:
				regs.c = value;
				break;
			case Z80_REG.B:
				regs.b = value;
				break;
			case Z80_REG.E:
				regs.e = value;
				break;
			case Z80_REG.D:
				regs.d = value;
				break;
			case Z80_REG.L:
				regs.l = value;
				break;
			case Z80_REG.H:
				regs.h = value;
				break;
			case Z80_REG.IXL:
				regs.ixl = value;
				break;
			case Z80_REG.IXH:
				regs.ixh = value;
				break;
			case Z80_REG.IYL:
				regs.iyl = value;
				break;
			case Z80_REG.IYH:
				regs.iyh = value;
				break;

			// The RegisterSet has no byte accessors for the shadow registers.
			case Z80_REG.F2:
				regs.afPrime = (regs.afPrime & 0xFF00) | (value & 0xFF);
				break;
			case Z80_REG.A2:
				regs.afPrime = (regs.afPrime & 0x00FF) | ((value & 0xFF) << 8);
				break;
			case Z80_REG.C2:
				regs.bcPrime = (regs.bcPrime & 0xFF00) | (value & 0xFF);
				break;
			case Z80_REG.B2:
				regs.bcPrime = (regs.bcPrime & 0x00FF) | ((value & 0xFF) << 8);
				break;
			case Z80_REG.E2:
				regs.dePrime = (regs.dePrime & 0xFF00) | (value & 0xFF);
				break;
			case Z80_REG.D2:
				regs.dePrime = (regs.dePrime & 0x00FF) | ((value & 0xFF) << 8);
				break;
			case Z80_REG.L2:
				regs.hlPrime = (regs.hlPrime & 0xFF00) | (value & 0xFF);
				break;
			case Z80_REG.H2:
				regs.hlPrime = (regs.hlPrime & 0x00FF) | ((value & 0xFF) << 8);
				break;
			case Z80_REG.R:
				// r7 holds bit 7 of R (LD R,A semantics), r the counting part.
				regs.r = value & 0xFF;
				regs.r7 = value & 0xFF;
				break;
			case Z80_REG.I:
				regs.i = value & 0xFF;
				break;
		}
	}


	/** Runs the cpu in chunks in order to give time to other
	 * processes. E.g. to receive a pause command.
	 * Adapted from ZSimRemote.z80CpuContinue; trs80.step() is the instruction
	 * atom (one Z80 instruction + hardware housekeeping).
	 * @param bp1 Breakpoint 1 address or -1 if not used.
	 * @param bp2 Breakpoint 2 address or -1 if not used.
	 */
	protected async trs80CpuContinue(bp1: number, bp2: number): Promise<void> {
		// The slots are static (no banking).
		const slots = this.memoryModel.initialSlots;
		// Leave the inner loop after ~2000 instructions to yield to the event loop.
		const CHUNK_SIZE = 2000;

		while (true) {
			let breakNumber = BREAK_REASON_NUMBER.NO_REASON;
			let breakReasonString = '';
			let longBreakAddress;
			let break_happened = false;
			try {
				// Run the emulator in a chunk
				for (let i = 0; i < CHUNK_SIZE; i++) {
					const prevIff1 = this.trs80.z80.regs.iff1;

					// Execute one instruction (+ hardware housekeeping)
					this.trs80.step();

					const pc = this.trs80.z80.regs.pc;
					// Convert to long address
					const pcLong = Z80Registers.createLongAddress(pc, slots);

					// Check if any real breakpoint is hit.
					// Note: Because of step-out this needs to be done before the bp1/bp2 check.
					const bpInner = this.tmpBreakpoints.get(pcLong);
					let logEvals;
					if (bpInner) {
						// To improve performance the condition check is already done here,
						// so it is not required to go up to the debug adapter just to
						// return here in case the condition is wrong.
						const regs = await this.sendDzrpCmdGetRegisters();
						Z80Registers.setCache(regs);
						// Now check if condition met or if logpoint:
						let bp;
						for (const bpElem of bpInner) {
							try {
								const {condition, log} = this.checkConditionAndLog(bpElem);
								// Emit log?
								if (log) {
									// Temporarily store
									if (!logEvals)
										logEvals = [];
									logEvals.push(log);
								}
								// Not a logpoint.
								else if (condition !== undefined) {	// Condition met?
									bp = bpElem;
									// Note: do not break: There could be more logpoints in the list
								}
							}
							catch (e) {
								// Some problem occurred, pass evaluation to DebugSessionClass
								bp = bpElem;
							}
						}
						// Breakpoint and condition OK
						if (bp) {
							breakNumber = BREAK_REASON_NUMBER.BREAKPOINT_HIT;
							longBreakAddress = pcLong;
							break_happened = true;
							break;	// stop loop
						}
					}

					// Check if given breakpoints are hit (64k address compare, not long addresses)
					if (pc === bp1 || pc === bp2) {
						longBreakAddress = pcLong;
						break_happened = true;
						break;
					}

					// Check if an interrupt was taken and it should be breaked on an interrupt.
					// Heuristic (until the HAL wrapper in M3): a taken maskable (IM1)
					// or non-maskable interrupt clears iff1 and jumps to 0x38/0x66.
					if (this.breakOnInterrupt && prevIff1 !== 0 && this.trs80.z80.regs.iff1 === 0
						&& (pc === 0x38 || pc === 0x66)) {
						breakNumber = BREAK_REASON_NUMBER.BREAK_INTERRUPT;
						longBreakAddress = pcLong;
						break_happened = true;
						break;
					}

					// Check if stopped from outside
					if (this.stopCpu) {
						breakNumber = BREAK_REASON_NUMBER.MANUAL_BREAK;	// Manual break
						break_happened = true;
						break;
					}

					// Note: logpoints are only evaluated if no other breakpoint is hit
					// because otherwise the logpoints are handled by DzrpRemote.
					if (logEvals) {
						for (const log of logEvals) {
							const evaluatedLog = await log.evaluate();
							// Print
							if (evaluatedLog) {
								this.emit('debug_console', "LOGPOINT: " + evaluatedLog);
							}
						}
					}
				}
			}
			catch (errorText) {
				breakReasonString = "TRS-80 CPU error: " + errorText;
				breakNumber = BREAK_REASON_NUMBER.UNKNOWN;
				break_happened = true;
			}

			// Check to leave
			if (break_happened) {
				// Stop immediately
				this.stopCpu = true;
				// Send Notification
				Utility.assert(this.funcContinueResolve);
				await this.funcContinueResolve!({
					reasonNumber: breakNumber,
					reasonString: breakReasonString,
					longAddr: longBreakAddress,
				});
				return;
			}

			// Give other tasks a little time and continue
			await Utility.timeout(1);

			// Check if meanwhile a manual break happened
			if (this.stopCpu) {
				// Can be undefined on disconnect, if disposed
				if (this.funcContinueResolve) {
					// Manual break: Create reason string
					breakNumber = BREAK_REASON_NUMBER.MANUAL_BREAK;
					longBreakAddress = 0;
					breakReasonString = await this.constructBreakReasonString(breakNumber, longBreakAddress, '', '');

					// Send Notification
					await this.funcContinueResolve({
						reasonNumber: breakNumber,
						reasonString: breakReasonString,
						longAddr: longBreakAddress,
					});
				}
				return;
			}
		}
	}


	/** Loads a TRS-80 .cmd file deterministically:
	 * parse with trszog's CmdFile, write the blocks directly into memory and
	 * set PC to the transfer address. This mimics the emulator's private
	 * startExecutable() (clear iff1/iff2 + jump) but bypasses runCmdProgram's
	 * event scheduler which would delay the load by clockHz*0.1 t-states.
	 */
	protected loadCmdFile(filePath: string) {
		// Parse
		const cmdFile = new CmdFile();
		cmdFile.readFile(filePath);

		// Let the ROM boot before loading. The boot initializes the system
		// RAM area (driver DCBs, vectors at 0x40xx) which ROM routines jump
		// through — without it a loaded program calling into the ROM would
		// derail on null vectors. This mirrors runCmdProgram, whose scheduler
		// fires the load after clockHz*0.1 t-states of boot (~11k instructions,
		// a few ms) — just synchronously instead of scheduler-delayed.
		const bootTstates = this.trs80.tStateCount + this.trs80.clockHz * 0.1;
		while (this.trs80.tStateCount < bootTstates)
			this.trs80.step();

		// Write all data blocks
		for (const block of cmdFile.dataBlocks) {
			this.trs80.writeMemoryBlock(block.address, block.data);
		}

		// Jump to the entry point (mimic startExecutable: disable interrupts)
		const regs = this.trs80.z80.regs;
		regs.iff1 = 0;
		regs.iff2 = 0;
		if (cmdFile.transferAddress > 0)
			regs.pc = cmdFile.transferAddress;
		else
			this.emit('warning', "CMD file '" + filePath + "' contains no transfer address. PC not set.");

		// On real hardware the ROM/DOS boot has set up the stack before a
		// program runs. The deterministic load bypasses the boot, so SP would
		// stay 0 (and e.g. break DeZog's RET detection for step-out).
		// Initialize it from 'topOfStack' if given, otherwise to top of RAM.
		let sp = 0xFFFF;
		if (Settings.launch.topOfStack) {
			const topOfStack = Labels.getNumberFromString64k(Settings.launch.topOfStack);
			if (!isNaN(topOfStack))
				sp = topOfStack;
		}
		regs.sp = sp;
	}


	/** Loads .cmd files. Other formats are not supported by the TRS-80.
	 */
	public async loadBin(filePath: string): Promise<void> {
		const ext = path.extname(filePath).toLowerCase();
		if (ext === '.cmd')
			this.loadCmdFile(filePath);
		else
			throw Error("File extension in '" + filePath + "' not supported with remoteType:'trs80sim'. Use a .cmd file.");
	}


	/**
	 * This method should be called after a step (stepOver, stepInto, stepOut,
	 * continue) is called.
	 */
	public stopProcessing() {
		super.stopProcessing();
		// General update, e.g. for the M2 screen view
		this.emit('update');
	}


	/**
	 * Resets the T-States counter. Used before stepping to measure the time.
	 */
	public async resetDeltaTstates(): Promise<void> {
		this.prevTstates = this.trs80.tStateCount;
	}


	/**
	 * Returns the number of T-States (since last break).
	 * @returns The number of T-States or 0 if not supported.
	 */
	public async getDeltaTstates(): Promise<number> {
		return this.trs80.tStateCount - this.prevTstates;
	}


	/**
	 * Returns the current CPU frequency.
	 * @returns The CPU frequency in Hz (e.g. 1774080 for 1.77408MHz).
	 */
	public async getCpuFrequency(): Promise<number> {
		return this.trs80.clockHz;
	}


	/** Injects a key event into the emulated keyboard (used by the screen
	 * webview). The next IN instruction reads the new state.
	 * @param key A JS KeyboardEvent.key string, e.g. "a", "Enter", "ArrowLeft".
	 * @param isPressed true on keydown, false on keyup.
	 */
	public keyEvent(key: string, isPressed: boolean) {
		this.keyboard.keyEvent(key, isPressed);
	}


	/** Enables to break on an interrupt.
	 * @param enable true=enable, break on interrupt, other disable.
	 * @returns The new value.
	 */
	public async enableBreakOnInterrupt(enable: boolean): Promise<boolean> {
		this.breakOnInterrupt = enable;
		return this.breakOnInterrupt;
	}


	//------- Send Commands -------

	/**
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		const regs = this.trs80.z80.regs;
		// The slots MUST match the memory model's initialSlots (no banking).
		const slots = this.memoryModel?.initialSlots || [0];
		return Z80RegistersClass.getRegisterData(
			regs.pc, regs.sp,
			regs.af, regs.bc, regs.de, regs.hl,
			regs.ix, regs.iy,
			regs.afPrime, regs.bcPrime, regs.dePrime, regs.hlPrime,
			regs.i, regs.rCombined,
			regs.im,
			slots);
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		this.setRegValue(regIndex, value);
	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
	 */
	public async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		if (bp1Addr64k == undefined) bp1Addr64k = -1;	// unreachable
		if (bp2Addr64k == undefined) bp2Addr64k = -1;	// unreachable
		// Run the CPU in a loop
		this.stopCpu = false;
		await this.trs80CpuContinue(bp1Addr64k, bp2Addr64k);
	}


	/**
	 * Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
		// If running then pause
		this.stopCpu = true;
	}


	/**
	 * The simulator does not add any breakpoint here because it already
	 * has the breakpoint, logpoint and assertion lists.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		this.lastBpId++;
		bp.bpId = this.lastBpId;
	}


	/**
	 * The simulator does not remove any breakpoint here because it already
	 * has the breakpoint, logpoint and assertion lists.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		//
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * Note: Trs80 has no block read API (getMemory() does not exist in
	 * v2.3.x), so the block is assembled byte by byte via readMemory().
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async sendDzrpCmdReadMem(addr64k: number, size: number): Promise<Uint8Array> {
		const buffer = new Uint8Array(size);
		for (let i = 0; i < size; i++)
			buffer[i] = this.trs80.readMemory((addr64k + i) & 0xFFFF);
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param addr64k The memory start address.
	 * @param dataArray The data to write.
	 */
	public async sendDzrpCmdWriteMem(addr64k: number, dataArray: Buffer | Uint8Array): Promise<void> {
		const data = (dataArray instanceof Uint8Array) ? dataArray : new Uint8Array(dataArray);
		this.trs80.writeMemoryBlock(addr64k & 0xFFFF, data);
	}


	/**
	 * Sends the command to enable or disable the interrupts.
	 * @param enable true to enable, false to disable interrupts.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		const enableInterrupt = (enable) ? 1 : 0;
		this.trs80.z80.regs.iff1 = enableInterrupt;
		this.trs80.z80.regs.iff2 = enableInterrupt;
	}
}
