import * as fs from 'fs';
import {RemoteBase, RemoteBreakpoint, BREAK_REASON_NUMBER} from '../remotebase';
import {GenericWatchpoint, GenericBreakpoint} from '../../genericwatchpoint';
import {Z80RegistersClass, Z80_REG, Z80Registers} from '../z80registers';
import {MemBank16k} from './membank16k';
import {SnaFile} from './snafile';
import {NexFile} from './nexfile';
import {Settings} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import * as path from 'path';
import {Labels} from '../../labels/labels';
import {gzip, ungzip} from 'node-gzip';
import {TimeWait} from '../../misc/timewait';
import {Log} from '../../log';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {PromiseCallbacks} from '../../misc/promisecallbacks';
import {MemoryModelZx128k, MemoryModelZx16k, MemoryModelZx48k, MemoryModelZxNextOneROM} from '../MemoryModel/predefinedmemorymodels';
import {DzrpTransportTest} from './dzrptransporttest';



// The program name and version transmitted during CMD_INIT.
export const DZRP_PROGRAM_NAME = "DeZog v" + process.version;


/** The DRZP commands and responses.
 * The response contains the command with the bit 7 set.
 */
export enum DZRP {
	// ZXNext: All Commands available in ZXNext (need to be consecutive)
	CMD_INIT = 1,

	CMD_CLOSE = 2,
	CMD_GET_REGISTERS = 3,
	CMD_SET_REGISTER = 4,
	CMD_WRITE_BANK = 5,
	CMD_CONTINUE = 6,
	CMD_PAUSE = 7,
	CMD_READ_MEM = 8,
	CMD_WRITE_MEM = 9,
	CMD_SET_SLOT = 10,
	CMD_GET_TBBLUE_REG = 11,
	CMD_SET_BORDER = 12,
	CMD_SET_BREAKPOINTS = 13,
	CMD_RESTORE_MEM = 14,
	CMD_LOOPBACK = 15,
	CMD_GET_SPRITES_PALETTE = 16,
	CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL = 17,

	// Sprites
	CMD_GET_SPRITES = 18,
	CMD_GET_SPRITE_PATTERNS = 19,

	CMD_READ_PORT = 20,
	CMD_WRITE_PORT = 21,
	CMD_EXEC_ASM = 22,
	CMD_INTERRUPT_ON_OFF = 23,

	// Breakpoint
	CMD_ADD_BREAKPOINT = 40,
	CMD_REMOVE_BREAKPOINT = 41,

	CMD_ADD_WATCHPOINT = 42,
	CMD_REMOVE_WATCHPOINT = 43,

	// State
	CMD_READ_STATE = 50,
	CMD_WRITE_STATE = 51,
}


/**
 * DZRP notifications.
 */
export enum DZRP_NTF {
	NTF_PAUSE = 1
}


/** Used for the DZRP CMD_CONTINUE alternate command for performance
 * improvement.
 * Is not implemented yet in DeZog but the DZRP already defines it.
 */
export enum AlternateCommand {
	CONTINUE = 0,   // I.e. no alternate command
	STEP_OVER = 1,
	STEP_OUT = 2
}


/** Defines the machine type that is returned in CMD_INIT.
 * It is required to determine the memory model.
 */
export enum DzrpMachineType {
	ZX16K = 1,
	ZX48K = 2,
	ZX128K = 3,
	ZXNEXT = 4,
}

/** This interface is passed after a break occurs and contains
 * break address and reason.
 */
export interface BreakInfo {
	// A number referring to the type of break.
	reasonNumber: BREAK_REASON_NUMBER;

	// An optional break reason string.
	reasonString: string;

	// The address where the break occurred. A long address. Either the PC value or e.g. a watched address.
	longAddr: number;

	// Optional data packet. E.g. used by MAME for the PC value.
	data?: any;
}


/** A class that communicates with the remote via the DZRP protocol.
 * It is base class for all DZRP remote classes that implement
 * special transports like serial connection or socket.
 *
 * All sendDzrpCmd... methods are empty stubs which need to be filled
 * by the specialized implementation.
 *
 * The class also implements flow/state handling for complex tasks
 * like 'continue'.
 */
export class DzrpRemote extends RemoteBase {
	// The current required version of the protocol.
	// Remotes may overwrite this.
	protected DZRP_VERSION = [2, 0, 0];

	// The function to hold the Promise's resolve function for a continue request.
	// Note:  The 'any' type is chosen here so that other Remotes (like MAME)
	// can extend the parameter list.
	protected funcContinueResolve?: (breakInfo: BreakInfo) => Promise<void>;

	// The associated Promise resolve. Stored here to be called at dispose.
	protected continueResolve?: PromiseCallbacks<string>;

	// This flag is used to pause a step-out.
	protected pauseStep = false;

	// Object to allow to give time to vscode during long running 'steps'.
	protected timeWait: TimeWait;

	// A temporary map with the set breakpoints and conditions.
	// The tmpBreakpoints are created out of the other breakpoints, assertionBreakpoints and logpoints
	// as soon as the z80CpuContinue is called.
	// It allows access of the breakpoint by a simple call to one map only.
	// It may happen seldom, but it can happen that 2 breakpoints share
	// the same address. Therefore the array contains an Array of GenericBreakpoints.
	// normally the inner array contains only 1 element.
	// The tmpBreakpoints are created when a Continue, StepOver, StepInto
	// or StepOut starts.
	// It is used mainly in 'evalBpConditionAndLog()'.
	// If a breakpoint is set during the debugged program being run
	// the tmpBreakpoints are updated.
	protected tmpBreakpoints = new Map<number, Array<GenericBreakpoint>>();

	// The watchpoints are collected here. These are all watchpoint set through setWatchpoint.
	// If the user could set watchpoints also manually this would include all WPMEM watchpoints plus
	// the user set watchpoints.
	// Note: it could happen that several watchpoints are defined for the same
	// address or that they overlap(they have size).
	protected addedWatchpoints = new Set<GenericWatchpoint>();

	// Used for testing the tranport mechanism, i.e. the serial transport.
	protected dzrpTransportTest: DzrpTransportTest | undefined;


	/// Constructor.
	/// Override this.
	constructor() {
		super();
	}


	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', exception);
	/// Don't override this, override 'doInitialization' instead.
	/// Take care to implement the emits otherwise the system will hang on a start.
	// public async init(): Promise<void> {
	// 	// Call super
	// 	super.init();
	// }


	/** Checks if there still is an open promise and runs it.
	 */
	public dispose() {
		// Check for open promise
		if (this.continueResolve) {
			// Call just to end
			this.continueResolve.resolve('');
			this.continueResolve = undefined;
			this.funcContinueResolve = undefined;
		}
		// As last
		super.dispose();
	}


	/** Override.
	 * Initializes the machine.
	 * When ready it emits this.emit('initialized') or this.emit('error', Error(...)).
	 * The successful emit takes place in 'onConnect' which should be called
	 * by 'doInitialization' after a successful connect.
	 */
	public async doInitialization(): Promise<void> {
		//
	}


	/** Override to create another decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegistersStandardDecoder();
	}


	/** Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		try {
			// Get configuration
			const resp = await this.sendDzrpCmdInit();
			if (resp.error)
				throw Error(resp.error);

			// Load executable
			await this.load();

			Z80Registers.decoder = this.createZ80RegistersDecoder();
			// Set memory model according machine type
			switch (resp.machineType) {
				case DzrpMachineType.ZX16K:
					// ZX Spectrum 16K
					this.memoryModel = new MemoryModelZx16k();
					break;
				case DzrpMachineType.ZX48K:
					// ZX Spectrum 48K
					this.memoryModel = new MemoryModelZx48k();
					break;
				case DzrpMachineType.ZX128K:
					// ZX Spectrum 128K
					this.memoryModel = new MemoryModelZx128k();
					break;
				case DzrpMachineType.ZXNEXT:
					// ZxNext: 8x8k banks
					this.memoryModel = new MemoryModelZxNextOneROM();
					break;
				default:
					// Error: Unknown type
					throw Error("Unknown machine type " + resp.machineType + " received.");
			}
			this.memoryModel.init();

			// Ready
			const text = "'" + resp.programName + "' initialized.";
			this.emit('initialized', text)
		}
		catch (err) {
			try {
				this.emit('error', err);
			}
			catch {};
		}
	}


	/** Override.
	 * Stops the emulator.
	 * This will disconnect e.g. any socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 */
	// public async disconnect(): Promise<void> {
	// 	await super.disconnect();
	// }


	/** If cache is empty retrieves the registers from
	 * the Remote.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		//Log.log('clearRegisters ->', Z80Registers.getCache() || "undefined");
		// Get regs
		const regs = await this.sendDzrpCmdGetRegisters();
		// Adjust ROM bank. Change 0xFF in slot 0 to 0xFE.
		if (this.memoryModel instanceof MemoryModelZxNextOneROM) {
			// Only for CSpect and ZXNext
			const k = Z80_REG.IM + 2;
			if (regs[k] === 0xFF) {
				regs[k]--;	// Change slot 0 to 0xFE
			}
		}
		// And set
		Z80Registers.setCache(regs);
		//Log.log('clearRegisters <-', Z80Registers.getCache() || "undefined");
	}


	/** Execute specific commands.
	 * Used to send (for testing) specific DZRP commands to the ZXNext.
	 * @param cmd E.g. 'cmd_continue.
	 * @returns A Promise with a return string, i.e. the decoded response.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		const cmdArray = cmd.split(' ');
		const cmd_name = cmdArray.shift();
		if (cmd_name === "help") {
			return "Use e.g. 'cmd_init' to send a DZRP command to the ZX Next.";
		}

		let response = "";
		if (cmd_name === "cmd_init") {
			const resp = await this.sendDzrpCmdInit();
			response = "Program: '" + resp.programName + "', DZRP Version: " + resp.dzrpVersion + "', machineType: " + resp.machineType + ", Error: " + resp.error;
		}
		else if (cmd_name === "cmd_close") {
			await this.sendDzrpCmdClose();
		}
		else if (cmd_name === "cmd_continue") {
			await this.sendDzrpCmdContinue();
		}
		else if (cmd_name === "cmd_pause") {
			await this.sendDzrpCmdPause();
		}
		else if (cmd_name === "cmd_get_registers") {
			const regs = await this.sendDzrpCmdGetRegisters();
			// Registers
			const regNames = ["PC", "SP", "AF", "BC", "DE", "HL", "IX", "IY", "AF'", "BC'", "DE'", "HL'", "IR", "IM"];
			let i = 0;
			for (const name of regNames) {
				const value = regs[i];
				response += "\n" + name + "(" + i + "): 0x" + Utility.getHexString(value, 4) + "/" + value;
				i++;
			}
			// Slots
			const slotCount = regs[i++];
			response += '\nslots.length=' + slotCount;
			for (let k = 0; k < slotCount; k++)
				response += '\n slots[' + k + ']=' + regs[k + i];
		}
		else if (cmd_name === "cmd_set_register") {
			if (cmdArray.length < 2) {
				// Error
				throw Error("Expecting 2 parameters: regIndex and value.");
			}
			const regIndex = Utility.parseValue(cmdArray[0]);
			const value = Utility.parseValue(cmdArray[1]);
			await this.sendDzrpCmdSetRegister(regIndex as Z80_REG, value);
		}
		else if (cmd_name === "cmd_write_bank") {
			if (cmdArray.length < 1) {
				// Error
				throw Error("Expecting 1 parameter: 8k bank number [0-223].");
			}
			const bank = Utility.parseValue(cmdArray[0]);
			// Create test data
			const data = new Uint8Array(0x2000);
			for (let i = 0; i < data.length; i++)
				data[i] = i & 0xFF;
			await this.sendDzrpCmdWriteBank(bank, data);
		}
		else if (cmd_name === "cmd_read_mem") {
			if (cmdArray.length < 2) {
				// Error
				throw Error("Expecting at least 2 parameters: address and count.");
			}
			const addr = Utility.parseValue(cmdArray[0]);
			const count = Utility.parseValue(cmdArray[1]);
			const data = await this.sendDzrpCmdReadMem(addr, count);
			// Print
			response = Utility.getHexString(addr, 4) + "h: ";
			for (const dat of data)
				response += Utility.getHexString(dat, 2) + "h ";
		}
		else if (cmd_name === "cmd_write_mem") {
			if (cmdArray.length < 2) {
				// Error
				throw Error("Expecting at least 2 parameters: address and memory content list.");
			}
			const addr = Utility.parseValue(cmdArray.shift()!);
			// Create test data
			const length = cmdArray.length;
			const data = new Uint8Array(length);
			for (let i = 0; i < data.length; i++)
				data[i] = Utility.parseValue(cmdArray[i]) & 0xFF;
			await this.sendDzrpCmdWriteMem(addr, data);
		}
		else if (cmd_name === "cmd_set_slot") {
			if (cmdArray.length != 2) {
				// Error
				throw Error("Expecting 2 parameters: slot and bank.");
			}
			const slot = Utility.parseValue(cmdArray[0]);
			const bank = Utility.parseValue(cmdArray[1]);
			await this.sendDzrpCmdSetSlot(slot, bank);
		}
		else if (cmd_name === "cmd_get_tbblue_reg") {
			if (cmdArray.length < 1) {
				// Error
				throw Error("Expecting 1 parameter: register.");
			}
			const reg = Utility.parseValue(cmdArray[0]);
			const value = await this.sendDzrpCmdGetTbblueReg(reg);
			response += "\nReg[" + Utility.getHexString(reg, 2) + "h/" + reg + "]: " + Utility.getHexString(value, 2) + "h/" + value;
		}
		else if (cmd_name === "cmd_get_sprites_palette") {
			if (cmdArray.length < 1) {
				// Error
				throw Error("Expecting 1 parameter: palette number (0 or 1).");
			}
			const paletteNumber = Utility.parseValue(cmdArray[0]);
			const palette = await this.sendDzrpCmdGetSpritesPalette(paletteNumber);
			// Print
			for (const p of palette)
				response += Utility.getHexString(p, 3) + " ";
		}
		else if (cmd_name === "cmd_get_sprites_clip_window_and_control") {
			const clip = await this.sendDzrpCmdGetSpritesClipWindow();
			response += "xl=" + clip.xl + ", xr=" + clip.xr + ", yt=" + clip.yt + ", yb=" + clip.yb + ", control=" + Utility.getBitsString(clip.control, 8);
		}
		else if (cmd_name === "cmd_set_breakpoints") {
			// Note: This command supports only the setting of 1 breakpoint:
			// "cmd_set_breakpoints address bank"
			if (cmdArray.length != 2) {
				// Error
				throw Error("Expecting 2 parameters: address and bank.");
			}
			const address = Utility.parseValue(cmdArray[0]);
			const bank = Utility.parseValue(cmdArray[1]);
			// Create data to send
			const longAddress = address + ((bank + 1) << 16);
			const memValues = await this.sendDzrpCmdSetBreakpoints([longAddress]);
			const value = memValues[0];
			response += '\n Response: 0x' + Utility.getHexString(value, 2) + '/' + value;
		}
		else if (cmd_name === "cmd_restore_mem") {
			// Note: This command supports only the restoring of 1 breakpoint:
			// "cmd_restore_mem address bank value"
			if (cmdArray.length != 3) {
				// Error
				throw Error("Expecting 3 parameters: address, bank and value.");
			}
			const address = Utility.parseValue(cmdArray[0]);
			const bank = Utility.parseValue(cmdArray[1]);
			const value = Utility.parseValue(cmdArray[2]);
			// Create data to send
			const longAddress = address + ((bank + 1) << 16);
			await this.sendDzrpCmdRestoreMem([{address: longAddress, value}]);
		}
		else if (cmd_name === "cmd_read_port") {
			// "cmd_read_port port"
			if (cmdArray.length != 1) {
				// Error
				throw Error("Expecting 1 parameter: port.");
			}
			const port = Utility.parseValue(cmdArray[0]);
			// Send
			const portValue = await this.sendDzrpCmdReadPort(port);
			response += '\n in (0x' + Utility.getHexString(port, 4) + '): 0x' + Utility.getHexString(portValue, 2);
		}
		else if (cmd_name === "cmd_write_port") {
			// "cmd_write_port port value"
			if (cmdArray.length != 2) {
				// Error
				throw Error("Expecting 2 parameters: port and value.");
			}
			const port = Utility.parseValue(cmdArray[0]);
			const portValue = Utility.parseValue(cmdArray[1]);
			// Send
			await this.sendDzrpCmdWritePort(port, portValue);
		}
		else if (cmd_name === "cmd_exec_asm") {
			// "cmd_exec_asm val [val ...]"
			if (cmdArray.length === 0) {
				// Error
				throw Error("Expecting 1 or more values (the code).");
			}
			// Convert strings to numbers
			const code = cmdArray.map(value => Utility.parseValue(value));
			// Send
			const resp = await this.sendDzrpCmdExecAsm(code);
			response += `
error: ${resp.error}
a: 0x${Utility.getHexString(resp.a, 2)}
f: 0x${Utility.getHexString(resp.f, 2)}
bc: 0x${Utility.getHexString(resp.bc, 4)}
de: 0x${Utility.getHexString(resp.de, 4)}
hl: 0x${Utility.getHexString(resp.hl, 4)}`;
		}
		else if (cmd_name === "cmd_interrupt_on_off") {
			// "cmd_interrupt_on_off val"
			if (cmdArray.length != 1) {
				// Error
				throw Error("Expecting 1 parameter: enable (0 or 1).");
			}
			const enable = Utility.parseValue(cmdArray[0]) !== 0;
			// Send
			await this.sendDzrpCmdInterruptOnOff(enable);
		}
		else if (cmd_name === "cmd_add_breakpoint") {
			// "cmd_add_breakpoint address bank"
			if (cmdArray.length != 2) {
				// Error
				throw Error("Expecting 2 parameters: address and bank.");
			}
			const address = Utility.parseValue(cmdArray[0]);
			const bank = Utility.parseValue(cmdArray[1]);
			// Create data to send
			const longAddress = address + ((bank + 1) << 16);
			const bp: GenericBreakpoint = {
				longAddress: longAddress
			};
			await this.sendDzrpCmdAddBreakpoint(bp);
			response += '\n Breakpoint ID: ' + bp.bpId;
		}
		else if (cmd_name === "cmd_remove_breakpoint") {
			// "cmd_remove_breakpoint breakpointId"
			if (cmdArray.length != 1) {
				// Error
				throw Error("Expecting 1 parameter: breakpoint ID.");
			}
			const bp: GenericBreakpoint = {
				longAddress: -1,	// not used
				bpId: Utility.parseValue(cmdArray[0])
			};
			// Create data to send
			await this.sendDzrpCmdRemoveBreakpoint(bp);
		}
		else if (cmd_name === "test") {
			// "test start 0 100" or "test end"
			if (cmdArray.length === 0) {
				// Error
				throw Error("Expecting parameter 'start' or 'end'.");
			}
			// start or end
			const startEnd = cmdArray[0];
			if (startEnd === "start") {
				// "test start 0 100"
				// 0 100 = the pause to use between messages
				if (cmdArray.length !== 3) {
					// Error
					throw Error("Expecting parameter 3 parameters: start min_time max_time.");
				}
				const minTime = Utility.parseValue(cmdArray[1]);
				const maxTime = Utility.parseValue(cmdArray[2]);
				await this.dzrpTransportTest?.cmdsEnd();
				this.dzrpTransportTest = new DzrpTransportTest(this);
				this.dzrpTransportTest.on('debug_console', msg => {
					// Forward
					this.emit('debug_console', msg);
				});
				await this.dzrpTransportTest.cmdsStart(minTime, maxTime);
				return "Started test loop sending commands...";
			}
			if (startEnd === "end") {
				// "test end"
				await this.dzrpTransportTest?.cmdsEnd();
				this.dzrpTransportTest = undefined;
				return "Stopped sending commands.";
			}
			if (startEnd === "timeout") {
				// "test timeout 100 200 400 6"
				// 100 = first part length
				// 200 = second part length
				// 400 = 400ms pause between parts
				// 6 = sequence number to use
				if (cmdArray.length < 3) {
					// Error
					throw Error("Expecting at least 3 parameters: timeout len1 len2 [pause [seqNumber]].");
				}
				const len1 = Utility.parseValue(cmdArray[1]);
				const len2 = Utility.parseValue(cmdArray[2]);
				const pause = Utility.parseValue(cmdArray[3]);
				const seqno = Utility.parseValue(cmdArray[4]);
				const dzrpTimeoutTest = new DzrpTransportTest(this);
				await dzrpTimeoutTest.sendCmdWithPause(len1, len2, pause, seqno);
				return "Two parts sent.";
			}
			else {
				// Error
				throw Error("Expecting parameter 'start', 'end' or 'timeout'.");
			}

		}

		/*
		else if (cmd_name=="cmd_get_sprites") {
			if (cmdArray.length<2) {
				// Error
				return "Expecting 2 parameters: sprite start index and count.";
			}
			const index=Utility.parseValue(cmdArray[0]);
			const count=Utility.parseValue(cmdArray[1]);
			const data=await this.sendDzrpCmdGetSprites(index, count);
			// Print
			for (let i=0; i<data.length; i++) {
				if (i%5==0)
					response+="\nSprite "+(i/5)+": ";
				//const value: number=data[0];
				//response+=Utility.getHexString(value, 2)+" ";
				response+=data[i]+" ";
			}
		}
		*/
		else {
			throw Error("Error: not supported.");
		}

		// Return string
		let result = "Sent " + cmd_name.toUpperCase() + ".\nResponse received";
		if (response)
			result += ": " + response;
		else
			result += ".";
		return result;
	}


	/** Sets the value for a specific register.
	 * Reads the value from the emulator and returns it in the promise.
	 * Note: if in reverse debug mode the function should do nothing and the promise should return the previous value.
	 * @param register The register to set, e.g. "BC" or "A'". Note: the register name has to exist. I.e. it should be tested before.
	 * @param value The new register value.
	 */
	public async setRegisterValue(register: string, value: number) {
		const index = Z80RegistersClass.getEnumFromName(register) as number;
		Utility.assert(index != undefined);
		// Send command to set register
		await this.sendDzrpCmdSetRegister(index, value);
		// Send command to get registers
		await this.getRegistersFromEmulator(); // Not necessary: this.clearRegsAndSlots();
	}


	/** Sets the slot to a specific bank.
	 * Used by the unit tests.
	 * @param slot The slot to set.
	 * @param bank The bank for the slot.
	 */
	public async setSlot(slotIndex: number, bank: number): Promise<void> {
		await this.sendDzrpCmdSetSlot(slotIndex, bank);
	}


	/** Returns the array of watchpoint for a given address.
	 * Normally the array is empty or contains only 1 watchpoint.
	 * But it could happen that several watchpoints are defined for the same address.
	 * @param address The address to check. Could be a long address.
	 * @return An array with all corresponding watchpoints. Usually only 1 or an empty array.
	 */
	protected getWatchpointsByAddress(address: number): Array<GenericWatchpoint> {
		const address64 = address & 0xFFFF;
		const arr = new Array<GenericWatchpoint>();
		const slots = this.getSlots();
		for (const wp of this.addedWatchpoints) {
			// Check if address falls in range
			const longWpAddr = wp.longOr64kAddress;
			const addr64 = longWpAddr & 0xFFFF;
			if (address64 < addr64 || address64 >= addr64 + wp.size)	// Note: wrap around is ignored
				continue;

			// Check if wp start address is currently paged in
			const bank = Z80RegistersClass.getBankFromAddress(longWpAddr);
			// If a long address check the bank
			if (bank >= 0) {
				const slotNr = Z80Registers.getSlotFromAddress(longWpAddr);
				const slotBank = slots[slotNr];
				if (bank != slotBank)
					continue;	// Wrong bank -> Next
			}

			// WP fits
			arr.push(wp);
		}
		return arr;
	}


	/** Searches the 'breakpoints', the 'assertionBreakpoints' and the
	 * 'logpoints' arrays for the given breakpoint ID.
	 * In fact searches tmpBreakpoints. Therefore make sure you called
	 * createTemporaryBreakpoints before.
	 * @param bpAddress the breakpoint address to search (!=0).
	 * @returns The found GenericBreakpoints (or RemoteBreakPoints) or
	 * [] if no breakpoint found.
	 */
	protected getBreakpointsByAddress(bpAddress: number): Array<GenericBreakpoint> {
		let foundBps = this.tmpBreakpoints.get(bpAddress);
		if (!foundBps) // Try 64k address
			foundBps = this.tmpBreakpoints.get(bpAddress&0xFFFF) ?? [];
		// Nothing found
		return foundBps;
	}

	/** Creates a temporary map from the breakpoints, logpoints and assertions.
	 * If one entry is set the entry contains a pointer to the breakpoint.
	 * Or better it contains an array of breakpoints that all share the
	 * same address.
	 * Note: normally this array contains only one entry.
	 */
	protected createTemporaryBreakpoints() {
		const tmpBps = this.tmpBreakpoints;
		// Clear
		tmpBps.clear()
		// Get all breakpoints from the enabled logpoints
		const enabledLogPoints = this.getEnabledLogpoints();
		// Assertion breakpoints
		const assertionBps = (this.assertionBreakpointsEnabled) ? this.assertionBreakpoints : [];
		const allBps = [...this.breakpoints, ...enabledLogPoints, ...assertionBps];
		allBps.forEach(bp => {
			this.addTmpBreakpoint(bp);
		});
	}


	/** Adds a breakpoint to the temporary array.
	 * Is called by createTemporaryBreakpoints or if a BP
	 * is created during a running debugged program.
	 */
	protected addTmpBreakpoint(bp: GenericBreakpoint) {
		const tmpBps = this.tmpBreakpoints;
		const bpAddress = bp.longAddress;
		let bpInner = tmpBps.get(bpAddress);
		if (!bpInner) {
			// Create new array
			bpInner = new Array<GenericBreakpoint>();
			tmpBps.set(bp.longAddress, bpInner);
		}
		bpInner.push(bp);
	}


	/** Removes a breakpoint from the temporary array.
	 * Is called by createTemporaryBreakpoints or if a BP
	 * is removed during a running debugged program.
	 */
	protected removeTmpBreakpoint(bp: GenericBreakpoint) {
		const bpAddress = bp.longAddress;
		const bpArray = this.tmpBreakpoints.get(bpAddress)!;
		Utility.assert(bpArray);
		const len = bpArray.length;
		// Find breakpoint ID
		for (let i = 0; i < len; i++) {
			const bpa = bpArray[i];
			if (bpa.bpId === bp.bpId) {
				// Breakpoint found
				// Remove element
				bpArray.splice(i, 1);
				// Check if complete array is empty
				if (bpArray.length === 0)
					this.tmpBreakpoints.delete(bpAddress);
				return;
			}
		}
	}


	/** Takes a breakpoint and checks if it's condition is true and if
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
	protected checkConditionAndLog(bp: GenericBreakpoint | undefined): {condition: string | undefined, log: string | undefined} {
		if (bp) {
			if (bp.condition) {
				// Check if condition is true
				// REMARK: If I would allow 'await evalExpression' I could also allow e.g. memory checks
				try {
					const evalCond = Utility.evalExpression(bp.condition, true);
					if (evalCond != 0)
						return {condition: bp.condition, log: bp.log};
				}
				catch (e) {
					// Extend message
					e.message = "Evaluation condition '" + bp.condition + "': " + (e.message || "Unknown error");
					throw e;
				}
				return {condition: undefined, log: bp.log};
			}
			else {
				// No condition
				return {condition: '', log: bp.log};
			}
		}
		return {condition: '', log: undefined};
	}


	/** Constructs a human readable break-reason-string from the break number, data and
	 * an already existing reason string.
	 * @param breakNumber E.g. BREAK_REASON_NUMBER.WATCHPOINT_READ.
	 * @param breakAddress E.g. the breakpoint or the watchpoint address.
	 * @param condition An additional condition or '' if no condition.
	 * @param breakReasonString An already existing (part of the) reason string.
	 * The string transmitted from the remote.
	 * @returns A Promise to the reason string, e.g. "Breakpoint hit. A==4."
	 */

	protected async constructBreakReasonString(breakNumber: number, breakAddress: number, condition: string, breakReasonString: string): Promise<string> {
		Utility.assert(condition != undefined);
		if (breakReasonString === undefined)
			breakReasonString = '';

		// Generate reason text
		let reasonString;
		switch (breakNumber) {
			case BREAK_REASON_NUMBER.NO_REASON:
				reasonString = "";
				break;
			case BREAK_REASON_NUMBER.MANUAL_BREAK:
				reasonString = "Manual break.";
				break;
			case BREAK_REASON_NUMBER.BREAKPOINT_HIT: {
				// Check if it was an ASSERTION.
				const abps = this.assertionBreakpoints.filter(abp => abp.longAddress === breakAddress);
				for (const abp of abps) {
					if (condition === abp.condition) {
						const assertionCond = Utility.getAssertionFromCondition(condition);
						//reasonString = "Assertion failed: " + assertionCond;
						const replaced = Utility.replaceVarsWithValues(assertionCond);
						reasonString = "Assertion failed: " + replaced;
						return reasonString;
					}
				}
				// Or breakpoint
				const addrString = Utility.getHexString(breakAddress & 0xFFFF, 4);
				let bankString = "";
				const bank = breakAddress >>> 16;
				if (bank != 0)
					bankString = " (bank=" + (bank - 1).toString() + ")";
				//this.getSlotFromAddress(breakAddress);
				reasonString = "Breakpoint hit @" + addrString + "h" + bankString + ".";
				if (condition)
					reasonString += " Condition: " + condition;
				return reasonString;
			}

			case BREAK_REASON_NUMBER.WATCHPOINT_READ:
			case BREAK_REASON_NUMBER.WATCHPOINT_WRITE: {
				// Watchpoint
				const address = breakAddress;
				reasonString = "Watchpoint " + ((breakNumber === BREAK_REASON_NUMBER.WATCHPOINT_READ) ? "read" : "write") + " access at address " + Utility.getLongAddressString(address);
				const labels = Labels.getLabelsPlusIndexForNumber64k(address);
				if (labels.length > 0) {
					const labelsString = labels.join(', ');
					reasonString += " (" + labelsString + ")";
				}
				reasonString += ". " + breakReasonString;
				break;
			}

			case BREAK_REASON_NUMBER.BREAK_INTERRUPT:
				reasonString = "Break on interrupt.";
				break;

			default:
				reasonString = breakReasonString;
		}

		return reasonString;
	}


	/** This method is called before a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 */
	public startProcessing() {
		this.createTemporaryBreakpoints();
		// Reset flag
		this.pauseStep = false;
		// Start timer
		this.timeWait = new TimeWait(1000, 200, 100);	// Every second for 10ms
	}


	/** This method is called after a step (stepOver, stepInto, stepOut,
	 * continue, stepBack, etc.) is called.
	 */
	/*
	public stopProcessing() {
	}
	*/


	/** Evaluates the breakpoint condition and log (logpoint).
	 * Checks also pauseStep and returns '' if it is true.
	 * @param breakType The break reason as number, e.g. BREAK_REASON_NUMBER.BREAKPOINT_HIT
	 * @param breakAddress The address of the breakpoint or watchpoint.
	 * @returns A struct with a corrected break type and a condition text.
	 * condition text:
	 * If the breakpoint condition is not true: undefined is returned.
	 * If the condition is true:
	 * - If a log is present the log text is evaluated and a 'debug_console' with the text will be emitted. 'undefined' is returned.
	 * - If no log is present the condition text is returned.
	 * All in all:
	 * If undefined is returned no break should be done.
	 * If a text is returned the bp condition was true and a break should be done.
	 *
	 * The correctedBreakNumber is normally the breakNumber
	 * that has been given. But in some cases a NO_REASON
	 * might be turned into a BREAKPOINT_HIT.
	 */
	protected async evalBpConditionAndLog(breakType: number, breakAddress: number): Promise<{condition: string | undefined, correctedBreakNumber: number}> {
		// Check breakReason, i.e. check if it was a watchpoint.
		let condition;
		let correctedBreakNumber = breakType;
		switch (breakType) {
			case BREAK_REASON_NUMBER.WATCHPOINT_READ:
			case BREAK_REASON_NUMBER.WATCHPOINT_WRITE: {
				// Check if watchpoint really exists, i.e. it could be that a watchpoint for a wrong bank was hit.
				// If no watchpoint is found condition stays undefined.
				const wps = this.getWatchpointsByAddress(breakAddress);
				for (const wp of wps) {
					let found = false;
					if (breakType === BREAK_REASON_NUMBER.WATCHPOINT_READ) {
						found = wp.access.includes('r');
					}
					else {
						// WATCHPOINT_WRITE
						found = wp.access.includes('w');
					}
					if (found) {
						// REMARK: evaluate condition
						// Condition not used at the moment
						condition = '';
						break;
					}
				}
				break;
			}

			case BREAK_REASON_NUMBER.NO_REASON:
			case BREAK_REASON_NUMBER.BREAKPOINT_HIT: {
				// Get corresponding breakpoint
				const bps = this.getBreakpointsByAddress(breakAddress);
				// Note: If breakAddress is not found (e.g. break in wrong bank) then bps is empty.
				// This results in condition being undefined on return which in turn
				// results in another continue.

				// Loop over all matching breakpoints (normally only one, but could be 2 or more. E.g. if manual BP is at the same point as a LOGPOINT)
				for (const bp of bps) {
					// Check for condition
					let {condition: cond, log} = this.checkConditionAndLog(bp);
					//condition=cond;

					// Emit log?
					if (cond != undefined && log) {
						// Convert
						const evalLog = await Utility.evalLogString(log);
						// Print
						this.emit('debug_console', "Log: " + evalLog);
						// Don't eval condition again
						cond = undefined;
					}

					if (cond != undefined) {
						// At least one break condition found
						condition = cond;
						correctedBreakNumber = BREAK_REASON_NUMBER.BREAKPOINT_HIT;
						//break;
					}
				}

				// Handle continue-breakpoints
				if (breakType === BREAK_REASON_NUMBER.NO_REASON) {
					// Only if other breakpoints not found or condition is false
					if (condition === undefined) {
						// Temporary breakpoint hit.
						condition = '';
					}
				}
				break;
			}

			case BREAK_REASON_NUMBER.STEPPING_NOT_ALLOWED:
			// Flow through

			default:
				// Another reason, e.g. manual break or CPU error
				condition = '';	// Do a break.
		}

		// Check for pause
		if (correctedBreakNumber === BREAK_REASON_NUMBER.NO_REASON || condition === undefined) {
			// Check for manual pause
			if (this.pauseStep) {
				condition = '';	// Break
				correctedBreakNumber = BREAK_REASON_NUMBER.MANUAL_BREAK;
			}
		}

		return {condition, correctedBreakNumber};
	}


	/** 'continue' debugger program execution.
	 * @returns A Promise with a string containing the break reason.
	 */
	public async continue(): Promise<string> {
		return new Promise<string>(resolve => {
			(async () => {
				// Remember the promise resolve for dispose
				Utility.assert(!this.continueResolve);
				this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

				// Use a custom function here to evaluate breakpoint condition and log string.
				const funcContinueResolve = async (breakInfo: BreakInfo) => {
					try {
						// Get registers
						await this.getRegistersFromEmulator();

						// Check for break condition
						const {condition, correctedBreakNumber} = await this.evalBpConditionAndLog(breakInfo.reasonNumber, breakInfo.longAddr);

						// Check for continue
						if (condition === undefined) {
							// Continue
							this.funcContinueResolve = funcContinueResolve;
							await this.sendDzrpCmdContinue();
						}
						else {
							// Construct break reason string to report
							const breakReasonString = await this.constructBreakReasonString(correctedBreakNumber, breakInfo.longAddr, condition, breakInfo.reasonString);
							// Clear registers
							await this.getRegistersFromEmulator();
							await this.getCallStackFromEmulator();
							// return
							this.continueResolve!.resolve(breakReasonString);
						}
					}
					catch (e) {
						// Clear registers
						try {
							await this.getRegistersFromEmulator();
							await this.getCallStackFromEmulator();
						} catch {}	// Ignore if error already happened
						const reason: string = e.message;
						this.continueResolve!.resolve(reason);
					}
				};

				// Send 'run' command
				this.funcContinueResolve = funcContinueResolve;
				await this.sendDzrpCmdContinue();
			})();
		});
	}


	/** 'pause' the debugger.
	 */
	public async pause(): Promise<void> {
		// Set this flag to pause a stepOut etc
		this.pauseStep = true;
		// Send 'pause' command
		await this.sendDzrpCmdPause();
	}


	/** 'step over' an instruction in the debugger.
	 * @param stepOver true=step-over, false=step-into.
	 * @returns A Promise with a string with the break reason.
	 * Or 'undefined' if no reason.
	 */
	public async stepOver(stepOver = true): Promise<string | undefined> {
		return new Promise<string | undefined>(resolve => {
			(async () => {
				// Remember the promise resolve for dispose
				Utility.assert(!this.continueResolve);
				this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

				// Prepare for break: This function is called by the PAUSE (break) notification:
				const funcContinueResolve = async (breakInfo: BreakInfo) => {
					// Give vscode a little time
					await this.timeWait.waitAtInterval();

					// Get registers
					await this.getRegistersFromEmulator();

					// Check for break condition
					let {condition, correctedBreakNumber} = await this.evalBpConditionAndLog(breakInfo.reasonNumber, breakInfo.longAddr);

					// Check for continue
					if (condition === undefined) {
						// Calculate the breakpoints to use for step-over/step-into
						//	[, bp1, bp2]=await this.calcStepBp(stepOver);
						// Note: we need to use the original bp addresses
						// Continue
						this.funcContinueResolve = funcContinueResolve;
						await this.sendDzrpCmdContinue(bp1, bp2);
					}
					else {
						// Construct break reason string to report
						const breakReasonString = await this.constructBreakReasonString(correctedBreakNumber, breakInfo.longAddr, condition, breakInfo.reasonString);
						// Clear registers
						await this.getCallStackFromEmulator();
						// return
						this.continueResolve!.resolve(breakReasonString);
					}
				};

				// Calculate the breakpoints (64k) to use for step-over
				//await this.getRegisters();
				let [, bp1, bp2] = await this.calcStepBp(stepOver);
				//this.emit('debug_console', instruction);
				// Send 'run' command
				this.funcContinueResolve = funcContinueResolve;
				// Send command to 'continue'
				await this.sendDzrpCmdContinue(bp1, bp2);
			})();
		});
	}


	/** 'step into' an instruction in the debugger.
	 * @returns A Promise with a string with the break reason.
	 * Or 'undefined' if no reason.
	 */
	public async stepInto(): Promise<string | undefined> {
		return this.stepOver(false);
	}


	/** 'step out' of current subroutine.
	 * The step-out uses normal step (into) functionality and checks
	 * after each step if the last instruction was some RET and
	 * the stackpointer is bigger than at the beginning.
	 * @returns A Promise with a string containing the break reason.
	 */
	public async stepOut(): Promise<string | undefined> {
		return new Promise<string | undefined>(resolve => {
			(async () => {
				// Remember the promise resolve for dispose
				Utility.assert(!this.continueResolve);
				this.continueResolve = new PromiseCallbacks<string>(this, 'continueResolve', resolve);

				// Get current SP
				const startSp = Z80Registers.getRegValue(Z80_REG.SP);
				let prevSp = startSp;
				let prevPc = 0;

				// Use a custom function here to evaluate breakpoint condition and log string.
				const funcContinueResolve = async (breakInfo: BreakInfo) => {
					try {
						// Give vscode a little time
						await this.timeWait.waitAtInterval();

						// Get registers
						await this.getRegistersFromEmulator();

						// Check for break condition
						let {condition, correctedBreakNumber} = await this.evalBpConditionAndLog(breakInfo.reasonNumber, breakInfo.longAddr);
						// For StepOut ignore the stepping tmp breakpoints
						if (correctedBreakNumber === BREAK_REASON_NUMBER.NO_REASON)
							condition = undefined;

						// Check if instruction was a RET(I/N)
						if (condition === undefined) {
							const currSp = Z80Registers.getRegValue(Z80_REG.SP);
							if (currSp > startSp && currSp > prevSp) {
								// Something has been popped. This is to exclude unexecuted RET cc.
								const bytes = await this.readMemoryDump(prevPc, 2);
								const opcodes = bytes[0] + (bytes[1] << 8);
								if (this.isRet(opcodes)) {
									// Stop here
									condition = '';
									correctedBreakNumber = BREAK_REASON_NUMBER.NO_REASON;
								}
							}
						}

						// Check for continue
						if (condition === undefined) {
							// Calculate the breakpoints to use for step-over
							let [, sobp1, sobp2] = await this.calcStepBp(true);
							// Continue
							this.funcContinueResolve = funcContinueResolve;
							prevPc = Z80Registers.getPC();
							await this.sendDzrpCmdContinue(sobp1, sobp2);
						}
						else {
							// Construct break reason string to report
							const breakReasonString = await this.constructBreakReasonString(correctedBreakNumber, breakInfo.longAddr, condition, breakInfo.reasonString);
							// Clear registers
							await this.getRegistersFromEmulator();
							await this.getCallStackFromEmulator();
							// return
							this.continueResolve!.resolve(breakReasonString);
						}
					}
					catch (e) {
						// Clear registers
						await this.getRegistersFromEmulator();
						await this.getCallStackFromEmulator();
						const reason: string = e;
						this.continueResolve!.resolve(reason);
					}
				};

				// Calculate the breakpoints to use for step-over
				let [, bp1, bp2] = await this.calcStepBp(true);
				// Send 'run' command
				this.funcContinueResolve = funcContinueResolve;
				prevPc = Z80Registers.getPC();
				await this.sendDzrpCmdContinue(bp1, bp2);
			})();
		});
	}


	/** Tests if the opcode is a RET instruction.
	 * @param opcodes E.g. 0xe52a785c
	 * @returns false=if not RET (or RETI or RETN or RET cc).
	 */
	public isRet(opcodes: number): boolean {
		// Check for RET
		const opcode0 = opcodes & 0xFF;
		if (0xC9 === opcode0)
			return true;

		// Check for RETI or RETN
		if (0xED === opcode0) {
			const opcode1 = (opcodes >>> 8) & 0xFF;
			if (0x4D === opcode1 || 0x45 === opcode1)
				return true;
		}

		// Now check for RET cc
		const mask = 0b11000111;
		if ((opcode0 & mask) === 0b11000000) {
			// RET cc
			return true;
		}

		// No RET
		return false;
	}


	/** Sets one watchpoint in the remote.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * @param wp The watchpoint to set.
	 */
	public async setWatchpoint(wp: GenericWatchpoint): Promise<void> {
		// Remember watchpoint
		this.addedWatchpoints.add(wp);

		// Forward request
		await this.sendDzrpCmdAddWatchpoint(wp.longOr64kAddress, wp.size, wp.access);
	}


	/** Removes one watchpoint from the remote.
	 * @param wp The watchpoint to remove.
	 */
	public async removeWatchpoint(wp: GenericWatchpoint): Promise<void> {
		// Forget watchpoint
		this.addedWatchpoints.delete(wp);

		// Forward request
		await this.sendDzrpCmdRemoveWatchpoint(wp.longOr64kAddress, wp.size, wp.access);
	}


	/** Enables/disables all assertion breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertionBreakpoints(enable: boolean): Promise<void> {
		for (let abp of this.assertionBreakpoints) {
			if (enable) {
				// Set breakpoint
				if (!abp.bpId) {
					await this.sendDzrpCmdAddBreakpoint(abp);	// Sets sbp.bpId
				}
			}
			// Remove breakpoint
			else if (abp.bpId) {
				await this.sendDzrpCmdRemoveBreakpoint(abp);
				abp.bpId = undefined;
			}
		}
		this.assertionBreakpointsEnabled = enable;
	}


	/** Enables/disable all given points.
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
					await this.sendDzrpCmdAddBreakpoint(lp);
				}
			}
			// Remove breakpoint
			else if (lp.bpId) {
				await this.sendDzrpCmdRemoveBreakpoint(lp);
				lp.bpId = undefined;
			}
		}
	}


	/** Sets breakpoint in the Remote.
	 * Sets the breakpoint ID (bpId) in bp.
	 * @param bp The breakpoint.
	 * @returns The used breakpoint ID. 0 if no breakpoint is available anymore.
	 */
	public async setBreakpoint(bp: RemoteBreakpoint): Promise<number> {

		// Check if "real" PC breakpoint
		if (bp.longAddress < 0) {
			this.emit('warning', 'DZRP does only support PC breakpoints.');
			// set to unverified
			bp.longAddress = -1;
			return 0;
		}

		// Set breakpoint
		await this.sendDzrpCmdAddBreakpoint(bp);
		if (bp.bpId === 0)
			bp.longAddress = -1;

		// Add to list
		this.breakpoints.push(bp);

		// If running then add also to temporary list
		if (this.funcContinueResolve) {
			this.addTmpBreakpoint(bp);
		}

		// return
		return bp.bpId;
	}


	/** Clears one breakpoint.
	 */
	public async removeBreakpoint(bp: RemoteBreakpoint): Promise<void> {
		// Remove from list
		let index = this.breakpoints.indexOf(bp);
		Utility.assert(index !== -1, 'Breakpoint should be removed but does not exist.');
		this.breakpoints.splice(index, 1);

		// If running then add remove to temporary list
		if (this.funcContinueResolve) {
			this.removeTmpBreakpoint(bp);
		}

		// Remove
		await this.sendDzrpCmdRemoveBreakpoint(bp);
	}


	/** Reads a memory.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async readMemoryDump(addr64k: number, size: number): Promise<Uint8Array> {
		return this.sendDzrpCmdReadMem(addr64k, size);
	}


	/** Writes a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	 */
	public async writeMemoryDump(address: number, dataArray: Uint8Array): Promise<void> {
		await this.sendDzrpCmdWriteMem(address, dataArray);
	}


	/** Loads .nex or .sna files.
	 */
	protected async loadBin(filePath: string): Promise<void> {
		// Check file extension
		const ext = path.extname(filePath);
		if (ext === '.P' || ext === '.p')
			await this.loadBinP(filePath);
		else
		if (ext === '.sna')
			await this.loadBinSna(filePath);
		else if (ext === '.nex')
			await this.loadBinNex(filePath);
		else {
			// Error: neither sna nor nex file
			throw Error("File extension not supported in '" + filePath + "' with remoteType:'" + Settings.launch.remoteType + "'. Can only load .sna and .nex files.");
		}
	}


	/** Loads object file (binary without any meta data).
	 * @param filePath The absolute path to the file.
	 * @param startAddress The address where the data should be loaded.
	 */
	protected async loadObj(filePath: string, startAddress: number): Promise<void> {
		// Read file
		const objBuffer = fs.readFileSync(filePath);

		// Write as memory dump
		await this.sendDzrpCmdWriteMem(startAddress, objBuffer);

		// Make sure that the registers are reloaded
		//await this.getRegistersFromEmulator();
		//await this.getCallStackFromEmulator();
	}


	/** Loads a .sna file.
	 * See https://faqwiki.zxnet.co.uk/wiki/SNA_format
	 */
	protected async loadBinSna(filePath: string): Promise<void> {
		// Load and parse file
		const snaFile = new SnaFile();
		snaFile.readFile(filePath);

		// Set the border
		await this.sendDzrpCmdSetBorder(snaFile.borderColor);

		// Transfer 16k memory banks
		for (const memBank of snaFile.memBanks) {
			// As 2x 8k memory banks. I.e. DZRP is for ZX Next only.
			const bank8 = 2 * memBank.bank;
			await this.sendDzrpCmdWriteBank(bank8, memBank.data.slice(0, MemBank16k.BANK16K_SIZE / 2));
			await this.sendDzrpCmdWriteBank(bank8 + 1, memBank.data.slice(MemBank16k.BANK16K_SIZE / 2));
		}

		// Set the default slot/bank association
		const slotBanks = [254, 255, 10, 11, 4, 5, 0, 1];	// 5, 2, 0
		for (let slot = 0; slot < 8; slot++) {
			const bank8 = slotBanks[slot];
			await this.sendDzrpCmdSetSlot(slot, bank8);
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

		// Check if interrupt should be enabled
		const interrupt_enabled = (snaFile.iff2 & 0b00000100) !== 0;
		await this.sendDzrpCmdInterruptOnOff(interrupt_enabled);
	}


	/** Loads a .nex file.
	 * See https://wiki.specnext.dev/NEX_file_format
	 */
	protected async loadBinNex(filePath: string): Promise<void> {
		// Load and parse file
		const nexFile = new NexFile();
		nexFile.readFile(filePath);

		// Set the border
		await this.sendDzrpCmdSetBorder(nexFile.borderColor);

		// Transfer 16k memory banks
		for (const memBank of nexFile.memBanks) {
			Log.log("loadBinNex: Writing 16k bank " + memBank.bank);
			// As 2x 8k memory banks
			const bank8 = 2 * memBank.bank;
			await this.sendDzrpCmdWriteBank(bank8, memBank.data.slice(0, MemBank16k.BANK16K_SIZE / 2));
			await this.sendDzrpCmdWriteBank(bank8 + 1, memBank.data.slice(MemBank16k.BANK16K_SIZE / 2));
		}

		// Set the default slot/bank association.
		// Note: slot 0 and 1 is set to ROM. It is not set which ROM, 0 or 1.
		const  entryBank8 = 2 * nexFile.entryBank;	// Convert 16k bank into 8k
		const slotBanks = [255, 255, 10, 11, 4, 5, entryBank8, entryBank8+1];	// ROM, 5, 2, custom
		for (let slot = 0; slot < 8; slot++) {
			const bank8 = slotBanks[slot];
			await this.sendDzrpCmdSetSlot(slot, bank8);
		}

		// Set the SP and PC registers
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, nexFile.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, nexFile.pc);
	}

	/** Load a ZX81 P file. @zx81
	 * See https://k1.spdns.de/Develop/Projects/zasm/Info/O80%20and%20P81%20Format.txt
	 */
	protected async loadBinP(filePath: string): Promise<void> {
		// Load the content of the file
		const objBuffer = fs.readFileSync(filePath);
		// Write as memory dump. The loading address is always 0x4009.
		await this.sendDzrpCmdWriteMem(0x4009, objBuffer);
	}


	/** Called from "-state save" command.
	 * Stores all RAM, registers etc.
	 * Override.
	 * @param filePath The file path to store to.
	 */
	public async stateSave(filePath: string): Promise<void> {
		// Get state data
		const stateData = await this.sendDzrpCmdReadState();
		// Zip data
		const zippedData = await gzip(stateData);
		// Save data to .tmp/states directory
		fs.writeFileSync(filePath, zippedData);
	}


	/** Called from "-state restore" command.
	 * Restores all RAM + the registers from a former "-state save".
	 * Override.
	 * @param filePath The file path to retore from.
	 */
	public async stateRestore(filePath: string): Promise<void> {
		// Read state dta
		const zippedData = fs.readFileSync(filePath);
		// Unzip data
		const stateData = await ungzip(zippedData);
		// Restore data
		await this.sendDzrpCmdWriteState(stateData);
		// Clear register cache
		await this.getRegistersFromEmulator();
		await this.getCallStackFromEmulator();
	}



	// ZX Next related ---------------------------------


	/** Retrieves the TBBlue register value from the emulator.
	 * @param registerNr The number of the register.
	 * @returns A promise with the value of the register.
	 */
	public async getTbblueRegister(registerNr: number): Promise<number> {
		const value = await this.sendDzrpCmdGetTbblueReg(registerNr);
		return value;
	}


	/** Retrieves the sprites palette from the emulator.
	 * @param paletteNr 0 or 1.
	 * @returns A Promise that returns a 256 element Array<number> with the palette values.
	 */
	public async getTbblueSpritesPalette(paletteNr: number): Promise<Array<number>> {
		const palette = await this.sendDzrpCmdGetSpritesPalette(paletteNr);
		return palette;
	}


	/** Retrieves the sprites clipping window from the emulator.
	 * @returns A Promise that returns the clipping dimensions and the control byte(xl, xr, yt, yb, control).
	 */
	public async getTbblueSpritesClippingWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		const clip = await this.sendDzrpCmdGetSpritesClipWindow();
		return clip;
	}


	/** Retrieves the sprites from the emulator.
	 * @param slot The start slot.
	 * @param count The number of slots to retrieve.
	 * @returns A Promise with an array of sprite attribute data.
	 */
	public async getTbblueSprites(slot: number, count: number): Promise<Array<Uint8Array>> {
		const sprites = await this.sendDzrpCmdGetSprites(slot, count);
		return sprites;
	}


	/** Retrieves the sprite patterns from the emulator.
	 * @param index The start index.
	 * @param count The number of patterns to retrieve.
	 * @preturns A Promise with an array of sprite pattern data.
	 */
	public async getTbblueSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		const patterns = await this.sendDzrpCmdGetSpritePatterns(index, count);
		return patterns;
	}





	//------- Send Commands -------

	/** Override.
	 * The first command send. Includes the version number.
	 * @returns The error, program name (incl. version), dzrp version and the machine type.
	 * error is 0 on success. 0xFF if version numbers not match.
	 * Other numbers indicate an error on remote side.
	 */
	protected async sendDzrpCmdInit(): Promise<{error: string | undefined, programName: string, dzrpVersion: string, machineType: DzrpMachineType}> {
		Utility.assert(false);
		return {error: undefined, dzrpVersion: "", programName: "", machineType: DzrpMachineType.ZX48K};
	}


	/** Override.
	 * The last command sent. Closes the debug session.
	 */
	protected async sendDzrpCmdClose(): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	protected async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		Utility.assert(false);
		return new Uint16Array(0);
	}


	/** Override.
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	protected async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to continue ('run') the program.
	 * @param bp1Addr64k The 64k address (not long address) of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address (not long address) of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to pause a running program.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to add a breakpoint.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID. If the breakpoint could not be set it is set to 0.
	 */
	protected async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Removes a breakpoint from the list.
	 * @param bp The breakpoint to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		throw Error("Watchpoints not supported!");
	}


	/** Override.
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		throw Error("Watchpoints not supported!");
	}


	/** Override.
	 * Sends the command to retrieve a memory dump.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(addr64k: number, size: number): Promise<Uint8Array> {
		Utility.assert(false);
		return new Uint8Array(0);
	}


	/** Override.
	 * Sends the command to write a memory dump.
	 * @param addr64k The memory start address (64k).
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(addr64k: number, dataArray: Buffer | Uint8Array): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to write a memory bank.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
	 * @throws An exception if e.g. the bank size does not match.
	  */
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer | Uint8Array): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error. An error can only occur on real HW if the slot with dezogif is overwritten.
	  */
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
		Utility.assert(false);
		return 0;
	}


	/** Override.
	 * Sends the command to read the current state of the machine.
	 * I.e. memory, registers etc.
	 * @returns A Promise with state data. Format is unknown (remote specific).
	 * Data will just be saved.
	  */
	public async sendDzrpCmdReadState(): Promise<Uint8Array> {
		throw Error("Read state not supported!");
		//return new Uint8Array();
	}


	/** Override.
	 * Sends the command to wite a previously saved state to the remote.
	 * I.e. memory, registers etc.
	 * @param The state data. Format is unknown (remote specific).
	  */
	public async sendDzrpCmdWriteState(stateData: Uint8Array): Promise<void> {
		throw Error("Write state not supported!");
	}



	/** Returns the value of one TBBlue register.
	 * @param register  The Tbblue register.
	 * @returns A promise with the value.
	  */
	public async sendDzrpCmdGetTbblueReg(register: number): Promise<number> {
		throw Error("Reading Tbblue registers is not supported.");
	}


	/** Sends the command to get a sprites palette.
	 * @param index 0/1. The first or the second palette.
	 * @returns An array with 256 entries with the 9 bit color.
	  */
	public async sendDzrpCmdGetSpritesPalette(index: number): Promise<Array<number>> {
		throw Error("Get sprite palette not supported!");
		//return [];
	}


	/** Sends the command to get a number of sprite attributes.
	 * @param index The index of the sprite.
	 * @param count The number of sprites to return.
	 * @returns An array with 5 byte attributes for each sprite.
	  */
	public async sendDzrpCmdGetSprites(index: number, count: number): Promise<Array<Uint8Array>> {
		throw Error("Get sprites not supported!");
		//return [];
	}


	/** Sends the command to retrieve sprite patterns.
	 * Retrieves only 256 byte patterns. If a 128 byte patterns is required
	 * the full 256 bytes are returned.
	 * @param index The index of the pattern [0-63]
	 * @param count The number of patterns [0-64]
	 * @returns A promise with an Array with the sprite pattern for each index.
	 */
	protected async sendDzrpCmdGetSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		throw Error("Get sprite patterns not supported!");
		//return [[]];
	}


	/** Sends the command to get the sprites clipping window.
	 * @returns A Promise that returns the clipping dimensions and the control byte (xl, xr, yt, yb, control).
	  */
	public async sendDzrpCmdGetSpritesClipWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		throw Error("Get sprites clip window not supported!");
		//return {xl: 0, xr: 0, yt: 0, yb: 0, control: 0};
	}


	/** Sends the command to set the border.
	 */
	public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
		Utility.assert(false);
	}


	/** Sends the command to set all breakpoints.
	 * For the ZXNext all breakpoints are set at once just before the
	 * next 'continue' is executed.
	 * @param bpAddresses The breakpoint addresses. Each 0x0000-0xFFFF.
	 * @returns A Promise with the memory contents from each breakpoint address.
	 */
	protected async sendDzrpCmdSetBreakpoints(bpAddresses: Array<number>): Promise<Array<number>> {
		Utility.assert(false);
		return [];
	}


	/** Sends the command to restore the memory for all breakpoints.
	 * This is send just after the 'continue' command.
	 * So that the user only sees correct memory contents even if doing
	 * a disassembly or memory read.
	 * It is also required otherwise the breakpoints in 'calcStep' are not correctly
	 * calculated.
	 * @param elems The addresses + memory content.
	 */
	protected async sendDzrpCmdRestoreMem(elems: Array<{address: number, value: number}>): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends the command to read from a port.
	 * @param port The port address.
	 * @returns The value read from the port.
	 */
	protected async sendDzrpCmdReadPort(port: number): Promise<number> {
		Utility.assert(false);
		return 0;
	}


	/** Override.
	 * Sends the command to write to a port.
	 * @param port The port address.
	 * @param value the value to write.
	 */
	protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
		Utility.assert(false);
	}


	/** Override.
	 * Sends Z80 to execute in the remote.
	 * The code needs no trailing RET.
	 * Returns registers AF, BC, DE, HL.
	 * @param code A buffer with the code to send.
	 * @returns An error code (0=no error). The registers AF, BC, DE, HL.
	 */
	protected async sendDzrpCmdExecAsm(code: Array<number>): Promise<{error: number, a: number, f: number, bc: number, de: number, hl: number}> {
		Utility.assert(false);
		return {error: 0, f: 0, a: 0, bc: 0, de: 0, hl: 0};
	}


	/** Override.
	 * Sends the command to enable or disable the interrupts.
	 * @param enable true to enable, false to disable interrupts.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		Utility.assert(false);
	}
}

