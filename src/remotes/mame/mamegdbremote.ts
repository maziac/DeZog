import * as fs from 'fs';
import * as path from 'path';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Log, LogTransport} from '../../log';
import {MameType} from '../../settings/settings';
import {Z80Registers, Z80_REG} from '../z80registers';
import {GdbRemote} from '../gdb/gdbremote';
import {Z80RegistersMameDecoder} from './z80registersmamedecoder';
import {MemBlock} from '../remotebase';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {MemoryModelZxNext} from '../MemoryModel/zxnextmemorymodels';
import {SnaFile} from '../dzrp/snafile';
import {MemBank16k} from '../dzrp/membank16k';
import {Z80File} from '../dzrp/z80file';


/** The representation of a MAME remote.
 * Can handle the MAME gdbstub but only for Z80.
 * In addition to the standard gdb packets of GdbRemote it uses MAME's
 * debugger console via qRcmd. This is required for everything the gdb
 * protocol cannot express, e.g. the MMU banking of the ZX Next.
 */
export class MameGdbRemote extends GdbRemote {
	protected override logName = 'MameGdbRemote';

	// The settings configuration for the Mame remote.
	protected settingsMameType: MameType;

	// If mame is using the Z80 Next CPU / tbblue.
	// Is determined during connection setup.
	protected Z80N: boolean;

	// Used for temporary bank reads/writes.
	// Requires slot 0 or 1 because ROM can only be paged into these slots.
	protected readonly TMP_SLOT = 0;

	// Max. number of values for one MAME 'print' command (MAX_COMMAND_PARAMS in MAME).
	protected readonly MAX_PRINT_VALUES = 128;
	// Max. length of the (unencoded) qRcmd command. MAME's packet size is 16384,
	// the command is hex encoded, i.e. it needs twice the size.
	protected readonly MAX_QRCMD_LENGTH = 6000;


	/// Constructor.
	constructor(settingsMameType: MameType) {
		super(settingsMameType);
		// Init
		this.settingsMameType = settingsMameType;
		this.Z80N = false;
	}


	/** Override to create another decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegistersMameDecoder();
	}


	// Start the ZXNext and wait until the ZXNextOS is ready.
	// It is checked by looking at interrupt being enabled
	// and the FRAMES sysvar:
	// 3 bytes (low, mid, high) @5C78
	protected async waitForZxInterrupt(): Promise<void> {
		// Start emulation
		await this.sendQrcmd('g');
		// Wait on interrupt
		let count = 0;
		let prevFRAMES = 0xFFFFFF;
		const dateStart = Date.now();
		while (true) {
			const response = await this.sendQrcmd('print im,iff1,256*w@5C79+b@5C78 ');
			const result = response.split(' ');
			// Check for IM1 and intterupt enabled
			const im = parseInt(result[0], 16);
			const iff1 = parseInt(result[1], 16);
			if (im !== 1 || iff1 !== 1) {
				count = 0;	// Reset counter for IM1/iff1 check
				continue;
			}
			// Check FRAMES sysvar
			const FRAMES = parseInt(result[2], 16);
			if (FRAMES !== prevFRAMES) {
				if (FRAMES > prevFRAMES) {
					count++;
					if (count > 10) {
						// 10 increments found
						break;
					}
				}
				else
					count = 0;	// Reset counter
				prevFRAMES = FRAMES;
			}
			// Sleep 30 ms
			await new Promise(resolve => setTimeout(resolve, 30));
			// Check for timeout
			if (Date.now() - dateStart > 20000) {	// 20 seconds timeout
				throw new Error('Timeout waiting for ZXNextOS to be ready.');
			}
		}
		// Stop emulation
		await this.sendQrcmd('step'); // Executes a single.step and stops afterwards.
	}


	/** Start Delay.
	 * Start emulation and wait for a given time.
	 * @param startDelay The time to wait in milliseconds.
	 */
	protected async startDelay(startDelay: number): Promise<void> {
		if (startDelay > 0) {
			// Start emulation
			await this.sendQrcmd('g');
			// Delay
			await new Promise(resolve => setTimeout(resolve, startDelay));
			// Stop emulation
			await this.sendQrcmd('step'); // Executes a single.step and stops afterwards.
		}
	}


	/** Starts/prepares MAME before the debugged program is loaded.
	 */
	protected async afterXmlParsed(): Promise<void> {
		// Delay before starting?
		const startDelay = this.settingsMameType.startDelay;
		if (startDelay > 0) {
			await this.startDelay(startDelay);
		}

		// Wait on interrupts?
		let startWaitOnZxInterrupt = this.settingsMameType.startWaitOnZxInterrupt;
		if (startWaitOnZxInterrupt === undefined) {
			// Enabled by default for ZX Next, disabled for others.
			startWaitOnZxInterrupt = this.Z80N;
		}
		if (startWaitOnZxInterrupt) {
			await this.waitForZxInterrupt();
		}

		if (this.Z80N) {
			// ZX Next detected: Set ROM to ROM1 (48k)
			// We come from ZxNextOS so it is ROM3:
			await this.sendQrcmd('nr8e=3');
		}
	}


	/** The ZX Next uses a banked memory model.
	 */
	protected createMemoryModel() {
		if (this.Z80N)
			return new MemoryModelZxNext();
		return super.createMemoryModel();
	}


	protected override supportsBankedNexLoading(): boolean {
		return this.Z80N;
	}


	/** Checks the XML received from MAME.
	 * In addition to the architecture check it determines if the target is
	 * a Z80N (i.e. if the mmu registers are available).
	 */
	protected parseXml(xml: string) {
		super.parseXml(xml);
		// Check if Z80N (checks if mmu is available)
		let z80n = true;
		for (let mmu = 0; mmu < 8; mmu++) {
			const matchTxt = 'reg name="mmu' + mmu + '"';
			const regex = new RegExp(matchTxt);
			const found = regex.test(xml);
			if (!found) {
				z80n = false;
				break;
			}
		}
		this.Z80N = z80n;
	}


	protected unsupportedArchitectureError(architecture: string): string {
		return "Architecture '" + architecture + "' is not supported by DeZog. Please select a driver/ROM in MAME with a 'z80' architecture.";
	}


	protected noArchitectureError(): string {
		return "No architecture found in reply of MAME.";
	}


	/** Sends a qRcmd packet to MAME.
	 * @param command The command string to send. E.g. "print b@0xC000"
	 * @returns A Promise with the response string.
	 */
	protected async sendQrcmd(command: string): Promise<string> {
		// Log
		const timestamp = '[' + Log.getTimeString() + ']';
		LogTransport.log(timestamp + ' >>> ' + this.logName + ': sendQrcmd: ' + command);

		const encodedCommand = this.hexEncode(command);
		const response = await this.sendPacketData("qRcmd," + encodedCommand);
		// Check for error
		if (response.startsWith('E') || response.includes('error'))
			throw Error("MAME replied with an Error: '" + response + "' (for '" + command + "')");
		// Send return value (decoded response)
		const result = this.hexDecode(response);
		if (result.startsWith('>'))
			throw Error("MAME replied with an Error:\n" + result + "\n (for '" + command + "')");

		// Log response
		const respTimestamp = '[' + Log.getTimeString() + ']';
		LogTransport.log(respTimestamp + ' <<< ' + this.logName + ': sendQrcmd response: ' + result);
		return result;
	}

	// const encoded = this.hexEncode(unencoded);
	// const responseDecoded = await this.sendPacketData("qRcmd," + encoded);
	// response = this.hexDecode(responseDecoded);

	/** Adds the MAME specific 'qRcmd' command.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		const cmdArray = cmd.split(' ');
		const cmd_name = cmdArray.shift();
		if (cmd_name?.toLowerCase() == "qrcmd") {
			const unencoded = cmdArray.join(' ');
			const response = await this.sendQrcmd(unencoded);
			return "Sent: " + cmd_name + "\nResponse received: " + response;
		}
		return super.dbgExec(cmd);
	}


	/** Adds the MAME specific 'qRcmd' command to the help.
	 */
	protected dbgExecHelp(): string {
		return super.dbgExecHelp() + "  qRcmd: Send special commands to the remote.\n";
	}


	/** Encodes the string as hex string.
	 * Used for "qRcmd".
	 */
	protected hexEncode(str: string): string {
		let hex = '';
		for (let i = 0; i < str.length; i++) {
			hex += str.charCodeAt(i).toString(16).padStart(2, '0');
		}
		return hex;
	}


	/** Decodes a hex string.
	 * Used for "qRcmd".
	 */
	protected hexDecode(hex: string): string {
		let str = '';
		for (let i = 0; i < hex.length; i += 2) {
			str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
		}
		return str;
	}

	//------- Send Commands -------

	/** If cache is empty retrieves the registers from
	 * the Remote.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		let cmd = 'print pc,sp,af,bc,de,hl,ix,iy,af2,bc2,de2,hl2,ir,im';
		if (this.Z80N)
			cmd += ',mmu0,mmu1,mmu2,mmu3,mmu4,mmu5,mmu6,mmu7';
		const regValues = await this.sendQrcmd(cmd);
		// Split the response into individual register values
		const regs = regValues.split(' ');
		Z80Registers.setCache(regs);
	}


	/** Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		let regString = Z80Registers.getRegName(regIndex);
		regString = regString.replace("'", "2");
		const valueHexString = value.toString(16);
		const cmd = `${regString}=${valueHexString}`;
		await this.sendQrcmd(cmd);
	}


	/** Adds a breakpoint with MAME's 'bpset'.
	 * In contrast to the gdb 'Z0' packet this can be made conditional on
	 * the bank that is paged in (ZX Next).
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;
		let condition = '';

		// ZXNext banking support
		if (this.Z80N) {
			// Creates e.g.: bpset 0xc000,mmu6==0x21
			const bankp1 = (bp.longAddress >>> 16) & 0xFF;
			if (bankp1 > 0) {
				const bank = bankp1 - 1;
				const slot = address64k >>> 13;
				condition = `,mmu${slot}==0x${bank.toString(16)}`;
			}
		}

		// Send the command to set the breakpoint
		const cmd = `bpset 0x${address64k.toString(16)}${condition}`;
		const response = await this.sendQrcmd(cmd);
		// response is e.g. 'Breakpoint 1A set', starts at 1
		const mameBpId = response.split(' ')[1];	// Extract the ID from the response
		bp.bpId = parseInt(mameBpId, 16);	//
	}


	/** Removes a breakpoint.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const mameBpId = bp.bpId!;
		const cmd = `bpclear 0x${mameBpId.toString(16)}`;
		const response = await this.sendQrcmd(cmd);
		if (!response.includes('cleared'))
			throw Error(`MAME: ${response}`);
	}


	/** Sends the command to retrieve one or several memory blocks.
	 * A single block is read with 'm'.
	 * Several blocks are read together with qRcmd 'print w@$...,b@$...'.
	 * Several 'print' commands (each with max. 128 values) are combined
	 * with ';' into one qRcmd. MAME returns each 'print' as a line of
	 * hex values separated by spaces.
	 * @param blocks The 64k start addresses and sizes of the blocks.
	 * @returns A promise with an array of Uint8Arrays, one for each block.
	 */
	protected async sendDzrpCmdReadMemBlocks(blocks: MemBlock[]): Promise<Uint8Array[]> {
		if (blocks.length === 1)
			return [await this.readMemWithM(blocks[0].addr64k, blocks[0].size)];
		return this.readMemWithPrint(blocks);
	}


	/** Reads the memory blocks with qRcmd 'print'.
	 * Each block is read word-wise with 'w@' (little endian), only the last
	 * byte of a block with odd size is read with 'b@'.
	 * E.g. a block of size 5 results in 2x 'w@' and 1x 'b@'.
	 * MAME prints the values without leading zeros, separated by spaces
	 * or newlines.
	 * As few qRcmds as possible are sent.
	 * @param blocks The 64k start addresses and sizes of the blocks.
	 * @returns An array of Uint8Arrays, one for each block.
	 */
	protected async readMemWithPrint(blocks: MemBlock[]): Promise<Uint8Array[]> {
		// Create the print terms
		// Note: '$' is required, otherwise e.g. 'bc' would be the register
		const terms: string[] = [];
		for (const {addr64k, size} of blocks) {
			const end = addr64k + size;
			let addr = addr64k;
			for (; addr + 1 < end; addr += 2)
				terms.push('w@$' + (addr & 0xFFFF).toString(16));
			if (addr < end)
				terms.push('b@$' + (addr & 0xFFFF).toString(16));
		}

		// Read all values
		const hexValues: string[] = [];
		let termIndex = 0;
		while (termIndex < terms.length) {
			// Combine several 'print' commands into one qRcmd
			const printCmds: string[] = [];
			let cmdLength = 0;
			let count = 0;
			while (termIndex + count < terms.length && cmdLength < this.MAX_QRCMD_LENGTH) {
				const part = terms.slice(termIndex + count, termIndex + count + this.MAX_PRINT_VALUES);
				const printCmd = 'print ' + part.join(',');
				printCmds.push(printCmd);
				cmdLength += printCmd.length + 1;
				count += part.length;
			}
			const response = await this.sendQrcmd(printCmds.join(';'));
			// Each 'print' returns a line, long lines are wrapped by MAME
			hexValues.push(...response.split(/\s+/).filter(value => value !== ''));
			termIndex += count;
		}
		if (hexValues.length !== terms.length)
			throw Error("MAME: Expected " + terms.length + " values but got " + hexValues.length + ": '" + hexValues.join(' ') + "'");

		// Decode the blocks
		const result: Uint8Array[] = [];
		let index = 0;
		for (const {size} of blocks) {
			const data = new Uint8Array(size);
			let k = 0;
			for (; k + 1 < size; k += 2) {
				// Little endian: the byte at the lower address is the low byte
				const value = parseInt(hexValues[index++], 16);
				data[k] = value & 0xFF;
				data[k + 1] = value >> 8;
			}
			if (k < size)
				data[k] = parseInt(hexValues[index++], 16);
			result.push(data);
		}
		return result;
	}


	/** Sends the command to retrieve a memory dump.
	 * @param bank The bank value.
	 * @param offset The memory start offset within the bank.
	 * @param size The data size.
	 */
	protected async sendDzrpCmdReadBankMem(bank: number, offset: number, size: number): Promise<Uint8Array> {
		if (!this.Z80N)
			throw Error('MAME/DeZog does support banked memory reads only for Z80N.');

		// For banked memory switch in the appropriate bank temporarily:
		// Get bank for tmp slot
		const slots = this.getSlots();
		const tmpBank = slots[this.TMP_SLOT];
		// Set new bank
		await this.sendDzrpCmdSetSlot(this.TMP_SLOT, bank);
		// Read memory
		const slotOffs = this.TMP_SLOT * 0x2000; // Each slot is 8k, TMP_SLOT offset in memory
		const addr64k = (offset & 0x1FFF) + slotOffs;
		const buffer = await this.readMemWithM(addr64k, size);
		// Restore the original bank in the TMP_SLOT
		await this.sendDzrpCmdSetSlot(this.TMP_SLOT, tmpBank);
		return buffer;
	}


	/** Sends the command to write a memory dump.
	 * @param bank The bank value.
	 * @param offset The memory start offset within the bank.
	 * @param size The data size.
	  */
	public async sendDzrpCmdWriteBankMem(bank: number, offset: number, dataArray: Buffer | Uint8Array): Promise<void> {
		if (!this.Z80N)
			throw Error('MAME/DeZog does support banked memory writes only for Z80N.');

		// For banked memory switch in the appropriate bank temporarily:
		// Get bank for tmp slot
		const tmpBankString = await this.sendQrcmd(`print mmu${this.TMP_SLOT}`);
		const tmpBank = parseInt(tmpBankString, 16);
		// Set new bank
		await this.sendDzrpCmdSetSlot(this.TMP_SLOT, bank);
		// Copy memory
		const slotOffs = this.TMP_SLOT * 0x2000; // Each slot is 8k, TMP_SLOT offset in memory
		const addr64k = (offset & 0x1FFF) + slotOffs;
		await this.sendDzrpCmdWriteMem(addr64k, dataArray);	// Use normal write mem function
		// Restore the original bank in the TMP_SLOT
		await this.sendDzrpCmdSetSlot(this.TMP_SLOT, tmpBank);
	}


	/** Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error. An error can only occur on real HW if the slot with dezogif is overwritten.
	 */
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
		const bankHexString = '0x' + bank.toString(16);
		await this.sendQrcmd(`do mmu${slot}=${bankHexString}`);
		return 0;	// No error
	}



	/** Enables/disables the interrupts.
	 * @param enable true to enable, false to disable interrupts.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		const enableInterrupt = (enable) ? 1 : 0;
		await this.sendQrcmd(`iff1=${enableInterrupt}`);
		await this.sendQrcmd(`iff2=${enableInterrupt}`);
	}


	/** Sends the command to write several ZX Next registers.
	 * @param regValues Array with register/value pairs. The registers
	 * are written in this order.
	 */
	protected async sendDzrpCmdSetNextregs(regValues: Array<[number, number]>): Promise<void> {
		// Create one command that sets all registers
		const allCommands = regValues.map(([reg, value]) => `nr${reg.toString(16)}=${value.toString(16)}`).join(';');
		await this.sendQrcmd(allCommands);
	}


	/* Sends the command to write to a port.
	 * @param port The port address.
	 * @param value the value to write.
	 */
	protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
		await this.sendQrcmd(`ib@${port.toString(16)}=${value.toString(16)}`);
	}


	/** MAME requires killing the emulator to allow a fresh gdb connection.
	 */
	protected override async sendDzrpCmdClose(): Promise<void> {
		if (!this.socket)
			return;
		this.socket.removeAllListeners();
		this.cmdRespTimeoutTime = 0;
		this.stopCmdRespTimeout();
		this.messageQueue.length = 0;
		try {
			await this.sendPacketData('k');
		}
		catch {
			// The socket may already be closed.
		}
	}


	/** Called from "-state save" command.
	 * Uses the MAME debugger command "statesave" (via qRcmd).
	 * The state file is written by MAME itself (MAME's own .sta format).
	 * Note: MAME does not report an error via qRcmd. Therefore, if MAME
	 * runs on the local host, the existence of the file is checked.
	 * @param filePath The file path to store to.
	 */
	public override async stateSave(filePath: string): Promise<void> {
		//filePath += '.sta';
		// If MAME is not local then strip the base dir (which is local)
		const isLocal = this.isMameOnLocalHost();
		if (isLocal) {
			if (fs.existsSync(filePath))
				fs.unlinkSync(filePath); // Remove the old file if it exists
		}
		else
			filePath = path.basename(filePath);
		// Save (quotes are stripped by MAME, they allow spaces and commas in the path)
		await this.sendQrcmd(`statesave "${filePath}"`);
		// Check
		if (isLocal && !fs.existsSync(filePath))
			throw Error("MAME could not save the state file.");
	}


	/** Called from "-state restore" command.
	 * Uses the MAME debugger command "stateload" (via qRcmd).
	 * @param filePath The file path to restore from.
	 */
	public override async stateRestore(filePath: string): Promise<void> {
		//filePath += '.sta';
		const isLocal = this.isMameOnLocalHost();
		if (isLocal) {
			// Check that file exists if MAME is running locally
			if (!fs.existsSync(filePath))
				throw Error("State file does not exist.");
		}
		else {
			// Do not use the local dir if mame runs not locally
			filePath = path.basename(filePath);
		}
		// Load
		await this.sendQrcmd(`stateload "${filePath}"`);
	}


	/** Returns true if MAME runs on the same host as DeZog.
	 * Only then the state files can be checked by DeZog.
	 */
	protected isMameOnLocalHost(): boolean {
		const hostname = this.settingsMameType.hostname!.toLowerCase();
		return ['localhost', '127.0.0.1', '::1'].includes(hostname);
	}


	/** Calls the super function but works around an issue
	 * with mame:
	 * In mame it needs execution of at least one "step" to
	 * show the effects of the loading. E.g. the new screen
	 * or the set border color are shown not before the next
	 * step.
	 * Therefore a nop is injected at the PC and stepped once.
	 * Afterwords the PC is reset and the value is restored.
	 * TODO: maybe this will be fixed in MAME with this commit https://github.com/mamedev/mame/pull/16232/changes/a23da4ec121c82093f4da00470e548309d25c876
	 * If so I can remove the method.
	 * @returns The sp after loading the file.
	 */
	public async loadBin(filePath: string): Promise<number> {
		const sp = await super.loadBin(filePath);
		// Remember byte at pc
		const qRcmds = [
			`temp0=pc`,
			`temp1=b@pc`,
			`b@pc=0`,	// NOP
			`step`,
			'pc=temp0',
			`b@pc=temp1`,
		]
		const qRcmdsStr = qRcmds.join(';');
		await this.sendQrcmd(qRcmdsStr);
		return sp;
	}


	/** Loads a .sna file.
	 * This does not use sendDrzpCmdWriteBank as MAME gdbstub does not
	 * support slots and banking the way Dezog would require it.
	 * Therefore only 48k Spectrum .sna files are supported and this is
	 * written into memory with sendDzrpWriteMemory.
	 * Loading a .sna file does make sense only for mame started with
	 * machine spectrum.
	 * If it is used with some other machine the behavior is undefined
	 * = user error.
	 */
	protected async loadBinSna(filePath: string): Promise<number> {
		// If ZxNext the "normal" load sna routine can be used,
		// (otherwise only 48k .sna files are supported.)
		if (this.Z80N)
			return super.loadBinSna(filePath);

		// Load and parse file (48K only)
		const snaFile = new SnaFile();
		snaFile.readFile(filePath);

		// Check that it is a 48k sna file
		if (snaFile.is128kFile)
			throw Error('Loading of 128k .sna files into MAME is not supported. Only 48k .sna files are supported.');

		// Transfer 16k memory banks
		let address = MemBank16k.BANK16K_SIZE;
		for (const memBank of snaFile.memBanks) {
			// Write memory
			await this.writeMemoryDump(address, memBank.data);
			// Next
			address += MemBank16k.BANK16K_SIZE;
		}

		// Set the border
		await this.sendDzrpCmdWritePort(0xFE, snaFile.borderColor);

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

		// Set ROM1 or ROM0
		if (snaFile.is128kFile) {
			// Write port 7FFD
			const port7ffd = snaFile.port7ffd;
			await this.sendDzrpCmdWritePort(0x7FFD, port7ffd);
		}

		// Check if interrupt should be enabled
		const interrupt_enabled = (snaFile.iff2 & 0b00000100) !== 0;
		await this.sendDzrpCmdInterruptOnOff(interrupt_enabled);

		return snaFile.sp;
	}


	/** Loads a .z80 file.
	 * This does not use sendDrzpCmdWriteBank as MAME gdbstub does not
	 * support slots and banking the way Dezog would require it.
	 * Therefore only 48k Spectrum .z80 files are supported and this is
	 * written into memory with sendDzrpWriteMemory.
	 * Loading a .z80 file does make sense only for mame started with
	 * machine spectrum.
	 * If it is used with some other machine the behavior is undefined
	 * = user error.
	 */
	protected async loadBinZ80(filePath: string): Promise<number> {
		// Load and parse file
		const z80File = new Z80File();
		z80File.readFile(filePath);

		// Check that it is a 48k z80 file
		if (!z80File.is48kFile)
			throw Error('Only loading of 48k .z80 files into MAME is supported.');

		// Transfer 16k memory banks
		let address;
		for (const memBank of z80File.memBanks) {
			switch (memBank.bank) {
				case 5:
					address = 0x4000;
					break;
				case 2:
					address = 0x8000;
					break;
				case 0:
					address = 0xC000;
					break;
				default:
					// Should not happen
					throw Error('Unexpected memory bank: ' + memBank.bank);
			}
			// Write memory
			await this.writeMemoryDump(address, memBank.data);
			// Next
			address += MemBank16k.BANK16K_SIZE;
		}

		// Set the registers
		await this.sendDzrpCmdSetRegister(Z80_REG.PC, z80File.pc);
		await this.sendDzrpCmdSetRegister(Z80_REG.SP, z80File.sp);
		await this.sendDzrpCmdSetRegister(Z80_REG.AF, z80File.af);
		await this.sendDzrpCmdSetRegister(Z80_REG.BC, z80File.bc);
		await this.sendDzrpCmdSetRegister(Z80_REG.DE, z80File.de);
		await this.sendDzrpCmdSetRegister(Z80_REG.HL, z80File.hl);
		await this.sendDzrpCmdSetRegister(Z80_REG.IX, z80File.ix);
		await this.sendDzrpCmdSetRegister(Z80_REG.IY, z80File.iy);
		await this.sendDzrpCmdSetRegister(Z80_REG.AF2, z80File.af2);
		await this.sendDzrpCmdSetRegister(Z80_REG.BC2, z80File.bc2);
		await this.sendDzrpCmdSetRegister(Z80_REG.DE2, z80File.de2);
		await this.sendDzrpCmdSetRegister(Z80_REG.HL2, z80File.hl2);
		await this.sendDzrpCmdSetRegister(Z80_REG.R, z80File.r);
		await this.sendDzrpCmdSetRegister(Z80_REG.I, z80File.i);
		await this.sendDzrpCmdSetRegister(Z80_REG.IM, z80File.im);

		// Set ROM1 or ROM0
		if (z80File.is128kFile) {
			// Write port 7FFD
			const port7ffd = z80File.port7ffd!;
			await this.sendDzrpCmdWritePort(0x7FFD, port7ffd);
		}

		// Check if interrupt should be enabled
		const interrupt_enabled = (z80File.iff1 !== 0);
		await this.sendDzrpCmdInterruptOnOff(interrupt_enabled);

		return z80File.sp;
	}
}

