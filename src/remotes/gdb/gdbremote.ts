import {BreakInfo} from '../dzrp/dzrpremote';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Log, LogTransport} from '../../log';
import {Socket} from 'net';
import {Utility} from '../../misc/utility';
import {HexFormat} from '../../misc/hexformat';
import {DzrpTransportType, Settings} from '../../settings/settings';
import {Z80Registers, Z80_REG} from '../z80registers';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {Z80RegistersGdbDecoder} from './z80registersgdbdecoder';
import {BREAK_REASON_NUMBER, MemBlock} from '../remotebase';
import {MemoryModelUnknown} from '../MemoryModel/genericmemorymodels';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {ErrorWrapper} from '../../misc/errorwrapper';
import {MemBank16k} from '../dzrp/membank16k';
import {SnaFile} from '../dzrp/snafile';
import {Z80File} from '../dzrp/z80file';


// The "break" character.
const CTRL_C = '\x03';


/** A remote that talks the gdb remote serial protocol over a socket.
 * Only the standard packets are used: 'g', 'P', 'm', 'M', 'c', 'Z0'/'z0',
 * 'Z1'/'z1', 'Z2'-'Z4'/'z2'-'z4' and 'qXfer:features:read'.
 * Derive from this class for a concrete gdbstub and override/extend where
 * the stub offers more, see MameGdbRemote.
 */
export class GdbRemote extends DzrpQueuedRemote {
	protected override logName = 'GdbRemote';

	// The settings for the socket connection.
	protected settingsTransport: DzrpTransportType;

	// The socket connection.
	public socket!: Socket;

	// Stores the received data.
	protected receivedData!: string;


	/// Constructor.
	constructor(settingsTransport: DzrpTransportType) {
		super();
		// Init
		this.settingsTransport = settingsTransport;
		this.supportsASSERTION = true;
		this.supportsWPMEM = true;
		this.supportsLOGPOINT = true;
		this.supportsBreakOnInterrupt = false;
	}


	/** Initializes the machine.
	 * When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	 * The successful emit takes place in 'onConnect' which should be called
	 * by 'doInitialization' after a successful connect.
	 */
	protected async doInitialization(): Promise<void> {

		// Init socket
		this.socket = new Socket();
		this.socket.unref();
		// Perf: disable Nagle, otherwise small request/response packets can be delayed by up to ~200ms.
		this.socket.setNoDelay(true);
		this.cmdRespTimeoutTime = this.settingsTransport.timeout * 1000;

		// React on-open
		this.socket.on('connect', () => {
			(async () => {
				LogTransport.log(this.logName + ': Connected to server!');

				this.receivedData = '';

				// Check for unsupported settings
				if (Settings.launch.history.codeCoverageEnabled) {
					this.emit('warning', "launch.json: codeCoverageEnabled==true: the gdb protocol does not support code coverage.");
				}

				await this.onConnect();
			})();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			LogTransport.log(this.logName + ': The remote terminated the connection: ' + hadError);
			// Error
			const err = new Error(this.logName + ': The remote terminated the connection!');
			try {
				this.emit('error', err);
			}
			catch {};
		});

		// Handle errors
		this.socket.on('error', err => {
			ErrorWrapper.wrap(err);
			LogTransport.log(this.logName + ': Error: ' + err);
			// Error
			try {
				this.emit('error', err);
			}
			catch {};
		});

		// Receive data
		this.socket.on('data', data => {
			this.dataReceived(data.toString());
		});

		// Start socket connection
		this.socket.setTimeout(this.settingsTransport.timeout * 1000);
		const port = this.settingsTransport.port!;
		const hostname = this.settingsTransport.hostname!;
		this.socket.connect(port, hostname);
	}


	/** Override to create another decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegistersGdbDecoder();
	}


	/** Override to select another memory model.
	 */
	protected createMemoryModel() {
		// Unknown memory model: 64k RAM assumed
		return new MemoryModelUnknown();
	}


	/** Called during 'onConnect' after the target XML has been parsed and
	 * before the memory model is created. Override to start/prepare the target.
	 */
	protected async afterXmlParsed(): Promise<void> {
		// Nothing to do
	}


	/** Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		try {
			// Enables the 'g', 'G', 'p' and 'P' commands
			const qXmlReply = await this.sendPacketData('qXfer:features:read:target.xml:00,FFFF');

			// Check the XML
			this.parseXml(qXmlReply);

			// Hook for anything the concrete remote needs before loading
			await this.afterXmlParsed();

			this.memoryModel = this.createMemoryModel();
			this.memoryModel.init();

			// Load executable
			await this.load();

			Z80Registers.decoder = this.createZ80RegistersDecoder();

			// Ready
			this.emit('initialized', this.logName + ' connected!')
		}
		catch (err) {
			try {
				this.emit('error', err);
			}
			catch {};
		}
	}


	/** This will disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		await this.socketClose(1000);
	}


	/** Closes the socket.
	 */
	protected socketClose(timeoutMs = 10000): Promise<void> {
		return new Promise<void>(resolve => {
			const socket = this.socket;
			if (!socket)
				return;
			this.socket = undefined as any;

			socket.removeAllListeners();
			// Timeout is required because socket.end() does not call the
			// callback if it is already closed and the state cannot
			// reliable be determined.
			const timeout = setTimeout(() => {	// NOSONAR
				if (resolve) {
					resolve();
				}
			}, timeoutMs);
			socket.end(() => {	// NOSONAR
				if (resolve) {
					resolve();
					clearTimeout(timeout);
				}
			});
		});
	}


	/** Checks the XML received from the remote.
	 * Throws an exception if the architecture is not 'z80'.
	 */
	protected parseXml(xml: string) {
		// Check <architecture>z80</architecture>
		const match = /<architecture>(.*)<\/architecture>/.exec(xml);
		if (!match)
			throw Error(this.noArchitectureError());
		const architecture = match[1];
		if (architecture != 'z80')
			throw Error(this.unsupportedArchitectureError(architecture));
	}


	/** The error message if the target XML contains no architecture.
	 */
	protected noArchitectureError(): string {
		return "No architecture found in reply of the remote.";
	}


	/** The error message for a non-z80 architecture. Override to add a hint.
	 */
	protected unsupportedArchitectureError(architecture: string): string {
		return "Architecture '" + architecture + "' is not supported by DeZog. A 'z80' architecture is required.";
	}


	/** Called when data has been received.
	 * If the packet is broken in several chunks this function might be called several times.
	 * It always analyzes the complete packet that is held in
	 * 'receivedData'.
	 */
	protected dataReceived(data: string) {
		// Log
		const timestamp = '[' + Log.getTimeString() + ']';
		LogTransport.log(timestamp + ' ' + '<<< ' + this.logName + ': dataReceived: ' + Utility.maxString(data, 50) + ', count=' + data.length);

		try {
			// Add data to existing buffer
			this.receivedData += data;

			const c = this.receivedData[0];
			switch (c) {
				case '+':	// ACK
					// Consume '+'
					this.receivedData = this.receivedData.substring(1);
					break;
				case '-':	// NACK
					throw Error("Received NACK. Reason: checksum error.");
			}

			// For some commands (c, s) the '+' is treated as response
			// and the actual stop reply as a notification.
			// I.e. the 'c'(ontinue) command will return after the '+' is received.
			const msg = this.messageQueue[0];
			if (msg?.customData.noReply) {
				// E.g. c(ontinue)
				this.receivedMsg();
				// Note: normally there shouldn't be anything following.
				// But in edge cases a notification could follow.
			}

			// Now decode the reply:
			// $reply#HH  with HH the hex checksum.
			const len = this.receivedData.length;
			if (len < 4)	// Minimum length: '$#00'
				return;
			if (!this.receivedData.startsWith('$'))
				throw Error("Wrong packet format. Expected '$'.");
			// Find the '#' that ends the packet
			const i = this.receivedData.indexOf('#');
			if (i < 0)
				return;	// String end not yet found
			// Now skip checksum: The transport is considered reliable.
			// Checksum is not checked.
			const packetLen = i + 3;	// E.g. '$xxx#HH'
			if (len < packetLen)
				return;	// Not everything received yet.

			// Complete packet received:
			// Get packet data
			const packetData = this.receivedData.substring(1, i);

			// Wait for next data
			this.receivedData = this.receivedData.substring(packetLen);	// Normally this returns an empty string

			// Handle received buffer
			this.receivedMsg(packetData);
		}
		catch (e) {
			this.receivedData = '';
			try {
				this.emit('error', e);
			}
			catch {};
		}
	}


	/** A response has been received.
	 * If there are still messages in the queue the next message is sent.
	 */
	protected receivedMsg(packetData?: string) {
		// Check if it is a Stop Reply Packet
		if (packetData?.startsWith('T')) {
			// Yes, a Stop Reply Packet which is treated as a notification.
			// E.g. 'T050a:0000;0b:0100;'

			// Call resolve of 'continue'
			if (this.funcContinueResolve) {
				const continueHandler = this.funcContinueResolve;
				this.funcContinueResolve = undefined;
				// Get break reason
				const result = this.parseStopReplyPacket(packetData);
				const longAddr = Z80Registers.createLongAddress(result.addr64k);
				// Handle the break.
				(async () => {
					await continueHandler({
						reasonNumber: result.breakReason,
						longAddr,
						reasonString: '',
						data: {
							pc64k: result.pc64k
						}
					});
				})();
			}
		}
		else {
			// Stop timeout
			this.stopCmdRespTimeout();
			// Get latest sent message
			const msg = this.messageQueue[0];
			Utility.assert(msg, this.logName + ": Response received without request.");

			// Queue next message
			this.messageQueue.shift();
			// Try to send it
			(async () => {
				await this.sendNextMessage();
				// Pass received data to right consumer
				msg.resolve(packetData);
			})();
		}
	}


	/** Returns the break reason.
	 * Parses the Stop Reply Packet and retrieves the info.
	 * E.g. 'T050a:0000;0b:0100;'
	 * Note: it should have been checked already that it is a Stop Reply,
	 * i.e. that it starts with 'T'.
	 * @returns {
	 * 	breakReason: The break reason, e.g. normal breakpoint or watchpoint.
	 * 	addr64k: The 64k breakpoint or watch address.
	 * 	pc: The 64k PC value.
	 * }
	 */
	protected parseStopReplyPacket(packetData: string): {breakReason: number, addr64k: number, pc64k: number} {
		packetData = packetData.toLowerCase();

		// Search for PC register ('0b')
		let i = packetData.indexOf('0b:');
		if (i < 0)
			throw Error("No break address (PC) found.");
		i += 3;	// Skip '0b:'
		const pc64k = HexFormat.parseHexWordLE(packetData, i);

		// Get break reason
		let k = packetData.indexOf(':');
		const param = packetData.substring(3, k);	// Skip break signal (is always '5')
		let addr64k;
		let breakReason;
		if (param.endsWith('watch')) {
			// Watchpoint hit
			breakReason = param.startsWith('r') ? BREAK_REASON_NUMBER.WATCHPOINT_READ : BREAK_REASON_NUMBER.WATCHPOINT_WRITE;
			k++;	// Skip ':'
			addr64k = parseInt(packetData.substring(k), 16);	// Note: not target byte order
		}
		else {
			// Normal breakpoint
			breakReason = BREAK_REASON_NUMBER.BREAKPOINT_HIT;
			addr64k = pc64k;
		}

		return {breakReason, addr64k, pc64k};
	}


	/** Calculates the checksum.
	 * A simple addition of the ASCII value mod 256.
	 * @param packetData E.g. 'z0,C000,0'
	 * @returns The checksum in hex, e.g. 'A7'
	 */
	protected checksum(packetData: string): string {
		// Calculate checksum
		let checkSum = 0;
		const len = packetData.length;
		for (let i = 0; i < len; i++)
			checkSum += packetData.charCodeAt(i);
		checkSum &= 0xFF;	// modulo 256
		// Convert to hex string
		return HexFormat.getHexString(checkSum, 2);
	}


	/** Sends data to the remote.
	 * The format is:
	 * $packet-data#checksum
	 * The packet is answered with an ACK (NACK) followed by a reply/response.
	 * @param packetData E.g. 'z0,C000,0' or '\x03' (CTRL_C) for break
	 * @param withCtrlC Set to true if a break should be sent. A break is
	 * never sent alone but always in conjunction with another command (e.g. 'g' to read registers)
	 * in order to get a reply from the gdbstub.
	 * @returns E.g. 'OK'
	 */
	protected async sendPacketData(packetData: string, withCtrlC?: boolean): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			(async () => {
				// Calculate checksum
				const checkSum = this.checksum(packetData);
				// Construct packet
				let packet = '$' + packetData + '#' + checkSum;
				const timestamp = '[' + Log.getTimeString() + ']';
				LogTransport.log(timestamp + ' >>> ' + this.logName + ': Sending ' + (withCtrlC ? 'CTRL-C, ' : '') + packet);
				if (withCtrlC)
					packet = CTRL_C + packet;

				// Convert to buffer
				const buffer = Buffer.from(packet);
				// Put into queue
				const entry = this.putIntoQueue(buffer, this.cmdRespTimeoutTime, resolve, reject);
				entry.customData = {
					packet,	// Note: packet is used only for debugging.
					noReply: (packetData == 'c')
				};

				// Try to send immediately
				if (this.messageQueue.length == 1)
					await this.sendNextMessage();
			})();
		});
	}


	/** Sends a packet that expects an 'OK' as reply.
	 * If something else is received an exception is thrown.
	 * @param packetData E.g. 'z1,C000,0'
	 */
	protected async sendPacketDataOk(packetData: string): Promise<void> {
		// Send
		const reply = await this.sendPacketData(packetData);
		// Check reply for 'OK'
		if (reply != 'OK')
			throw Error("Communication error: the remote replied with an Error: '" + reply + "'");
	}


	/** Writes the buffer to the socket.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.socket.write(buffer, err => {
				ErrorWrapper.wrap(err);
				if (err)
					reject(err);
				else
					resolve();
			});
		});
	}


	/** Execute specific commands.
	 * Used to send (for testing) specific packets to the remote.
	 * @param cmd E.g. 'send g'.
	 * @returns A Promise with a return string, i.e. the decoded response.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		const cmdArray = cmd.split(' ');
		let cmd_name = cmdArray.shift();
		if (cmd_name == "help")
			return this.dbgExecHelp();

		let response = "";
		if (cmd_name == "send") {
			// Get string
			if (cmdArray.length == 0) {
				// CTRL-C
				cmd_name = 'CTRL-C, p0b';
				response = await this.sendPacketData('p0b', true);	// Command is: read register 0b (PC)
			}
			else {
				const packetData = cmdArray[0];
				cmd_name = packetData;
				response = await this.sendPacketData(packetData);
			}
		}
		else if (cmd_name == "close") {
			await this.socketClose();
			response = 'Socket closed';
		}
		else {
			throw Error("Command not supported.");
		}

		// Return string
		let result = "Sent: " + cmd_name + "\nResponse received";
		if (response)
			result += ": " + response;
		else
			result += ".";
		return result;
	}


	/** The help text of 'dbgExec'. Extend for additional commands.
	 */
	protected dbgExecHelp(): string {
		return `Send a command to the remote. Commands are:
  send <cmd>:	<cmd> is the ASCII command, e.g.
	c: Continue
	s: Step into
	g: Read registers
	G: Write registers
	m: Read memory
	M: Write memory
	p: Read register
	P: Write register
	z: Clear breakpoint/watchpoint
	Z: Set breakpoint/watchpoint
  send:  Without other parameter. Used to send a break (CTRL-C).
  	The break is automatically followed by a 'p0b' (get PC register).
  close: Closes the port.
`;
	}


	//------- Send Commands -------

	/** Retrieves the registers with the 'g' packet.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		const regs = await this.sendPacketData('g');	// Returns the reg values as one hex string
		Z80Registers.setCache(regs);
	}


	/** Sends the command to set a register value with 'P'.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		// DeZog register order -> 'g' packet order
		const permut = [
			0x0B,	// PC
			0x0A,	// SP
			0x00,	// AF
			0x01,	// BC
			0x02,	// DE
			0x03,	// HL
			0x08,	// IX
			0x09,	// IY
			0x04,	// AF2
			0x05,	// BC2
			0x06,	// DE2
			0x07	// HL2
		];

		// Word registers
		if (regIndex <= Z80_REG.HL2) {
			value &= 0xFFFF;
			const cmd = 'P' + permut[regIndex].toString(16) + '=' + HexFormat.getHexWordStringLE(value);
			await this.sendPacketDataOk(cmd);
			return;
		}

		// Byte registers: read-modify-write the containing word register
		if (regIndex >= Z80_REG.F && regIndex <= Z80_REG.H2) {
			value &= 0xFF;
			const byteRegIndex = regIndex - Z80_REG.F;
			const dwordIndex = Math.floor(byteRegIndex / 2) + Z80_REG.AF;
			let dword = Z80Registers.getRegValue(dwordIndex);
			if (byteRegIndex % 2)
				dword = (dword & 0xFF) + 256 * value;	// Upper half, e.g. B of BC
			else
				dword = (dword & 0xFF00) + value;	// Lower half, e.g. C of BC
			const cmd = 'P' + permut[dwordIndex].toString(16) + '=' + HexFormat.getHexWordStringLE(dword);
			await this.sendPacketDataOk(cmd);
			return;
		}

		// All other registers are not supported
		this.emit('warning', this.logName + ": Changing register " + Z80_REG[regIndex] + " is not supported.");
	}


	/** Executes the continue ('run') operation.
	 * Sets temporary GDB breakpoints, sends the continue packet, and intercepts
	 * funcContinueResolve to clean up the temporary breakpoints on break.
	 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
	 */
	public async dzrpContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		try {
			// Set temporary breakpoints
			if (bp1Addr64k != undefined) {
				const bp1String = 'Z1,' + bp1Addr64k.toString(16) + ',0';
				await this.sendPacketDataOk(bp1String);
			}
			if (bp2Addr64k != undefined) {
				const bp2String = 'Z1,' + bp2Addr64k.toString(16) + ',0';
				await this.sendPacketDataOk(bp2String);
			}

			// Intercept the this.funcContinueResolve to check the temporary breakpoints.
			// (for the break reason when stepping).
			const originalFuncContinueResolve = this.funcContinueResolve!;
			const funcIntermediateContinueResolve = async (breakInfo: BreakInfo) => {
				// Handle temporary breakpoints
				const tmpBpHit = await this.checkTmpBreakpoints(breakInfo.data.pc64k, bp1Addr64k, bp2Addr64k);
				if (tmpBpHit) {
					breakInfo.reasonNumber = BREAK_REASON_NUMBER.NO_REASON;
				}
				// Call "real" function
				await originalFuncContinueResolve(breakInfo);
			};

			// C(ontinue)
			this.funcContinueResolve = funcIntermediateContinueResolve;
			await this.sendPacketData('c');
		}
		catch (e) {
			try {
				this.emit('error', e);
			}
			catch {};
		}
	}


	/** Removes temporary breakpoints that might have been set by a
	 * step function.
	 * Additionally it is checked if PC is currently at one of the bps.
	 * @param pc The current PC value.
	 * @param bp1Addr64k First 64k breakpoint or undefined.
	 * @param bp2Addr64k Second 64k breakpoint or undefined.
	 * @returns true if one of the bps is equal to the PC.
	 */
	protected async checkTmpBreakpoints(pc: number, bp1Addr64k?: number, bp2Addr64k?: number): Promise<boolean> {
		let bpHit = false;
		try {
			// Remove temporary breakpoints
			if (bp1Addr64k != undefined) {
				const bp1 = 'z1,' + bp1Addr64k.toString(16) + ',0';
				await this.sendPacketDataOk(bp1);
				// Check PC
				if (pc == bp1Addr64k)
					bpHit = true;
			}
			if (bp2Addr64k != undefined) {
				const bp2 = 'z1,' + bp2Addr64k.toString(16) + ',0';
				await this.sendPacketDataOk(bp2);
				// Check PC
				if (pc == bp2Addr64k)
					bpHit = true;
			}
		}
		catch (e) {
			try {
				this.emit('error', e);
			}
			catch {};
		}

		// Return
		return bpHit;
	}


	/** Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
		// Send CTRL-C:
		await this.sendPacketData('p0b', true);	// Command is: read register 0b (PC)
	}


	/** Adds a breakpoint with 'Z0'.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;	// Long addresses not supported
		await this.sendPacketDataOk('Z0,' + address64k.toString(16) + ',0');
		bp.bpId = 1;	// Removal is by address, so any non-zero id will do.
	}


	/** Removes a breakpoint with 'z0'.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;	// Long addresses not supported
		await this.sendPacketDataOk('z0,' + address64k.toString(16) + ',0');
	}


	/** Returns the gdb watchpoint type for an access.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected watchpointType(access: string): string {
		if (access == 'r')
			return '3';
		if (access == 'w')
			return '2';
		return '4';	// rw
	}


	/** Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * Note: DzrpRemote filters the bank to allow watchpoints on banks.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		const address64k = address & 0xFFFF;	// Long addresses not supported
		const cmd = 'Z' + this.watchpointType(access) + ',' + address64k.toString(16) + ',' + size.toString(16);
		await this.sendPacketDataOk(cmd);
	}


	/** Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		const address64k = address & 0xFFFF;	// Long addresses not supported
		const cmd = 'z' + this.watchpointType(access) + ',' + address64k.toString(16) + ',' + size.toString(16);
		await this.sendPacketDataOk(cmd);
	}


	/** Sends the command to retrieve one or several memory blocks.
	 * Each block is read with its own 'm'.
	 * @param blocks The 64k start addresses and sizes of the blocks.
	 * @returns A promise with an array of Uint8Arrays, one for each block.
	 */
	protected async sendDzrpCmdReadMemBlocks(blocks: MemBlock[]): Promise<Uint8Array[]> {
		const result: Uint8Array[] = [];
		for (const {addr64k, size} of blocks)
			result.push(await this.readMemWithM(addr64k, size));
		return result;
	}


	/** Plain gdb has no standard support for banked NEX loading.
	 */
	protected async loadBinNex(filePath: string): Promise<number> {
		if (!this.supportsBankedNexLoading())
			throw Error("Loading .nex files is not supported by the generic gdb remote.");
		return super.loadBinNex(filePath);
	}


	/** Loads a .sna file.
	 * This does not use sendDrzpCmdWriteBank as gdbremote does not
	 * support slots and banking the way Dezog would require it.
	 * Therefore only 48k Spectrum .sna files are supported and this is
	 * written into memory with sendDzrpWriteMemory.
	 * Loading a .sna file does make sense only for a spectrum machine target.
	 * If it is used with some other machine the behavior is undefined = user error.
	 * As gdb does not support it the following limitations apply:
	 * - border color is not set
	 * - the R, I and IM registers are not set
	 * - The interrupt is not turned on/off
	 */
	protected override async loadBinSna(filePath: string): Promise<number> {
		if (this.supportsBankedNexLoading())
			return super.loadBinSna(filePath);

		const snaFile = new SnaFile();
		snaFile.readFile(filePath);
		if (snaFile.is128kFile)
			throw Error(`Loading of 128k .sna files is not supported by the ${this.remoteType} remote.`);

		let address = MemBank16k.BANK16K_SIZE;
		for (const memBank of snaFile.memBanks) {
			await this.sendDzrpCmdWriteMem(address, memBank.data);
			address += MemBank16k.BANK16K_SIZE;
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

		// // Set ROM1 or ROM0
		// if (snaFile.is128kFile) { // Note: Is already checked earlier
		// 	// Write port 7FFD
		// 	const port7ffd = snaFile.port7ffd;
		// 	await this.sendDzrpCmdWritePort(0x7FFD, port7ffd);
		// }

		await this.afterLoadBinSna(snaFile);
		return snaFile.sp;
	}


	/** Hook for target-specific state not represented by standard gdb packets.
	 */
	protected async afterLoadBinSna(_snaFile: SnaFile): Promise<void> {
		// Nothing to do
	}


	/** Loads a 48K Z80 snapshot into the flat 64K address space.
	 * This does not use sendDrzpCmdWriteBank as gdbremote does not
	 * support slots and banking the way Dezog would require it.
	 * Therefore only 48k Spectrum .z80 files are supported and this is
	 * written into memory with sendDzrpWriteMemory.
	 * Loading a .z80 file does make sense only for a spectrum machine target.
	 * If it is used with some other machine the behavior is undefined = user error.
	 */
	protected override async loadBinZ80(filePath: string): Promise<number> {
		const z80File = new Z80File();
		z80File.readFile(filePath);
		if (!z80File.is48kFile)
			throw Error(`Only loading of 48k .z80 files is supported by the ${this.remoteType} remote.`);

		for (const memBank of z80File.memBanks) {
			let address: number;
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
					throw Error('Unexpected memory bank in 48k .z80 file: ' + memBank.bank);
			}
			await this.sendDzrpCmdWriteMem(address, memBank.data);
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

		await this.afterLoadBinZ80(z80File);
		return z80File.sp;
	}


	/** Hook for target-specific state not represented by standard gdb packets.
	 */
	protected async afterLoadBinZ80(_z80File: Z80File): Promise<void> {
		// Nothing to do
	}


	/** Override when the gdbstub also implements the required banked-memory operations.
	 */
	protected supportsBankedNexLoading(): boolean {
		return false;
	}


	/** Reads a memory block with 'm'.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async readMemWithM(addr64k: number, size: number): Promise<Uint8Array> {
		const buffer = new Uint8Array(size);
		let offset = 0;
		while (offset < size) {
			const remaining = size - offset;
			const address = (addr64k + offset) & 0xFFFF;
			const cmd = 'm' + address.toString(16) + ',' + remaining.toString(16);
			const resp = await this.sendPacketData(cmd);
			const bytesRead = Math.min(Math.floor(resp.length / 2), remaining);
			if (bytesRead === 0)
				throw Error('No memory data received for "' + cmd + '".');
			for (let i = 0; i < bytesRead; i++) {
				const valString = resp.substring(2 * i, 2 * i + 2);
				buffer[offset + i] = parseInt(valString, 16);
			}
			offset += bytesRead;
		}
		return buffer;
	}


	/** Sends the command to write a memory dump with 'M'.
	 * @param addr64k The memory start address (64k).
	 * @param dataArray The data to write.
	 */
	public async sendDzrpCmdWriteMem(addr64k: number, dataArray: Buffer | Uint8Array): Promise<void> {
		const chunkSize = 2000;	// empirical value: at least on macos up to 5000 seems safe.
		let totalSize = dataArray.length;
		let i = 0;
		while (totalSize > 0) {
			// Next sending size
			let sendSize = totalSize;
			if (sendSize > chunkSize)
				sendSize = chunkSize;
			// The command
			let cmd = 'M' + addr64k.toString(16) + ',' + sendSize.toString(16) + ':';
			// Convert memory array into a string (cmd)
			const end = i + sendSize;
			for (; i < end; i++) {
				cmd += HexFormat.getHexString(dataArray[i], 2);
			}
			// Send
			await this.sendPacketDataOk(cmd);
			// Next
			totalSize -= sendSize;
			addr64k += sendSize;
		}
	}


	/** Ignore command.
	 */
	protected async sendDzrpCmdClose(): Promise<void> {
		await this.sendPacketDataOk('D');
	}
}
