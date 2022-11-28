import { BreakInfo } from '../dzrp/dzrpremote';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {LogTransport} from '../../log';
import {Socket} from 'net';
import {Utility} from '../../misc/utility';
import {Settings} from '../../settings/settings';
import {Z80Registers, Z80_REG} from '../z80registers';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {Z80RegistersMameDecoder} from './z80registersmamedecoder';
import {BREAK_REASON_NUMBER, Remote} from '../remotebase';
import {MemoryModelUnknown} from '../MemoryModel/predefinedmemorymodels';
import {SnaFile} from '../dzrp/snafile';
import {MemBank16k} from '../dzrp/membank16k';



/// Timeouts.
const CONNECTION_TIMEOUT = 1000;	// 1 sec

// The "break" character.
const CTRL_C = '\x03';


/**
 * The representation of a MAME remote.
 * Can handle the MAME gdbstub but only for Z80.
 */
export class MameGdbRemote extends DzrpQueuedRemote {

	// The socket connection.
	public socket: Socket;

	// Timeout between sending command and receiving response.
	protected cmdRespTimeout?: NodeJS.Timeout;

	// The used timeout time. (ms)
	protected cmdRespTimeoutTime = 500;	// Will be overwritten.
	protected initCloseRespTimeoutTime = 900;	// Timeout for CMD_INIT and CMD_CLOSE. This is not configurable and depends on vscode internal times.

	// Stores the received data.
	protected receivedData: string;


	/// Constructor.
	constructor() {
		super();
		// Init
		this.supportsASSERTION = true;
		this.supportsWPMEM = true;
		this.supportsLOGPOINT = true;
		this.cmdRespTimeoutTime = Settings.launch.mame.socketTimeout * 1000;
	}


	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {

		// Init socket
		this.socket = new Socket();
		this.socket.unref();

		// React on-open
		this.socket.on('connect', async () => {
			LogTransport.log('MameRemote: Connected to server!');

			this.receivedData = '';

			// Check for unsupported settings
			if (Settings.launch.history.codeCoverageEnabled) {
				this.emit('warning', "launch.json: codeCoverageEnabled==true: MAME gdb does not support code coverage.");
			}

			this.onConnect();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			//console.log('Close.');
			LogTransport.log('MameRemote: MAME terminated the connection: ' + hadError);
			// Error
			const err = new Error('MameRemote: MAME terminated the connection!');
			this.emit('error', err);
		});

		// Handle errors
		this.socket.on('error', err => {
			//console.log('Error: ', err);
			LogTransport.log('MameRemote: Error: ' + err);
			// Error
			this.emit('error', err);
		});

		// Receive data
		this.socket.on('data', data => {
			this.dataReceived(data.toString());
		});

		// Start socket connection
		this.socket.setTimeout(CONNECTION_TIMEOUT);
		const port = Settings.launch.mame.port;
		const hostname = Settings.launch.mame.hostname;
		this.socket.connect(port, hostname);
	}


	/**
	 * Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		try {
			// Init
			//const qReply =
			//await this.sendPacketData('?'); // Reply is ignored
			const qXmlReply = await this.sendPacketData('qXfer:features:read:target.xml:00,FFFF');	// Enable 'g', 'G', 'p', and 'P commands

			// Check the XML
			this.parseXml(qXmlReply);

			// Load executable
			await this.loadExecutable();

			Z80Registers.decoder = new Z80RegistersMameDecoder();

			// 64k ROM
			this.memoryModel = new MemoryModelUnknown()
			this.memoryModel.init();

			// Set Program Counter to execAddress
			await Remote.setLaunchExecAddress();

			// Get initial registers
			await this.getRegistersFromEmulator();

			// Ready
			this.emit('initialized', 'MAME connected!')
		}
		catch (err) {
			this.emit('error', err);
		}
	}


	/**
	 * This will disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		if (!this.socket)
			return;
		this.socket.removeAllListeners();

		// Send a k(ill) command
		// NOTE: Remove once MAME issue 9578 (https://github.com/mamedev/mame/issues/9578) 	is clarified:
		this.cmdRespTimeoutTime = 0;	// No response expected for kill command.
		this.socket.removeAllListeners();
		try {
			await this.sendPacketData('k');	// REMOVE with kill command
		}
		catch (e) {
			// E.g. if socket could not be connected.
			//console.log('exception', e);
		}

		return new Promise<void>(resolve => {
			if (!this.socket) {
				resolve();
				return;
			}
			// Timeout is required because socket.end() does not call the
			// callback if it is already closed and the state cannot
			// reliable be determined.
			const timeout = setTimeout(() => {
				if (resolve) {
					resolve();
				}
			}, 1000);	// 1 sec
			this.socket.end(() => {
				if (resolve) {
					clearTimeout(timeout);
					resolve();
				}
			});
			this.socket = undefined as any;
		});
	}


	/**
	 * Closes the socket.
	 */
	// Note: Remove once MAME issue 9578 (https://github.com/mamedev/mame/issues/9578) is clarified
	protected socketClose(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
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
			}, 10000);	// 1 sec
			socket.end(() => {	// NOSONAR
				if (resolve) {
					resolve();
					clearTimeout(timeout);
				}
			});
		});
	}


	/**
	 * Checks the XML received from MAME.
	 * Throws an exception if the architecture is not 'z80'.
	 */
	protected parseXml(xml: string) {
		// Check <architecture>z80</architecture>
		const match = /<architecture>(.*)<\/architecture>/.exec(xml);
		if (!match)
			throw Error("No architecture found in reply of MAME.");
		const architecture = match[1];
		if (architecture != 'z80')
			throw Error("Architecture '" + architecture + "' is not supported by DeZog. Please select a driver/ROM in MAME with a 'z80' architecture.");
	}


	/**
	 * Called when data has been received.
	 * If the packet is broken in several chunks this function might be called several times.
	 * It always analyzes the complete packet that is held in
	 * 'receivedData'.
	 */
	protected dataReceived(data: string) {
		LogTransport.log('dataReceived: ' + Utility.maxString(data, 50) + ', count=' + data.length);

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
					// Only reason for this in MAME gdbstub is a wrong checksum
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
			if (this.receivedData[0] != '$')
				throw Error("Wrong packet format. Expected '$'.");
			// Find the '#' that ends the packet
			let i = this.receivedData.indexOf('#');
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
			// Rethrow
			throw e;	// TODO: Connection is not closed on exception
		}
	}

	/**
	 * A response has been received.
	 * If there are still messages in the queue the next message is sent.
	 */
		// The function to hold the Promise's resolve function for a continue request.
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
				continueHandler({
					reasonNumber: result.breakReason,
					longAddr,
					reasonString: '',
					data: {
						pc64k: result.pc64k
					}
				});
			}
		}
		else {
			// Stop timeout
			this.stopCmdRespTimeout();
			// Get latest sent message
			const msg = this.messageQueue[0];
			Utility.assert(msg, "MAME: Response received without request.");

			// Queue next message
			this.messageQueue.shift();
			this.sendNextMessage();

			// Pass received data to right consumer
			msg.resolve(packetData);
		}
	}


	/**
	 * Returns the break reason.
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
		const pc64k = Utility.parseHexWordLE(packetData, i);

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


	/**
	 * Calculates the checksum.
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
		const hexString = Utility.getHexString(checkSum, 2);
		return hexString;
	}


	/**
	 * Sends data to MAME.
	 * The format is:
	 * $packet-data#checksum
	 * The packet is answer with an ACK (NACK) followed by a reply/response.
	 * @param packetData E.g. 'z0,C000,0' or '\x03' (CTRL_C) for break
	 * @param withCtrlC Set to true if a break should be sent. A break is
	 * never sent alone but always in conjunction with another command (e.g. 'g' to red registers).
	 * in order to get a reply from the gdbstub.
	 * @returns E.g. 'OK'
	 */
	protected async sendPacketData(packetData: string, withCtrlC?: boolean): Promise<string> {
		return new Promise<string>(async (resolve, reject) => {
			// Calculate checksum
			const checkSum = this.checksum(packetData);
			// Construct packet
			let packet = '$' + packetData + '#' + checkSum;
			LogTransport.log('>>> MameRemote: Sending ' + (withCtrlC ? 'CTRL-C, ' : '') + packet);
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
		});
	}


	/**
	 * Sends a packet to MAME that expects an 'OK' as reply.
	 * If something else is received an exception is thrown.
	 * @param packetData E.g. 'z1,C000,0'
	 */
	protected async sendPacketDataOk(packetData: string): Promise<void> {
		// Send
		const reply = await this.sendPacketData(packetData);
		// Check reply for 'OK'
		if (reply != 'OK')
			throw Error("Communication error: MAME replied with an Error: '" + reply + "'");
	}


	/**
	 * Writes the buffer to the socket.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.socket.write(buffer, err => {
				if (err)
					reject(err);
				else
					resolve();
			});
		});
	}


	/**
	 * Execute specific commands.
	 * Used to send (for testing) specific DZRP commands to the ZXNext.
	 * @param cmd E.g. 'cmd_continue.
	 * @returns A Promise with a return string, i.e. the decoded response.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		const cmdArray = cmd.split(' ');
		let cmd_name = cmdArray.shift();
		if (cmd_name == "help") {
			return `Send a command to MAME. Commands are:
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

		let response = "";
		if (cmd_name == "send") {
			let packetData;
			// Get string
			if (cmdArray.length == 0) {
				// CTRL-C
				cmd_name = 'CTRL-C, p0b';
				response = await this.sendPacketData('p0b', true);	// Command is: read register 0b (PC)
			}
			else {
				packetData = cmdArray[0];
				cmd_name = packetData;
				response = await this.sendPacketData(packetData);
			}
		}
		else if (cmd_name == "close") {
			await this.socketClose();
			response = 'Socket closed';
		}
		else {
			throw Error("Error: not supported.");
		}

		// Return string
		let result = "Sent: " + cmd_name + "\nResponse received";
		if (response)
			result += ": " + response;
		else
			result += ".";
		return result;
	}



	//------- Send Commands -------

	/**
	 * Sends the command to init the remote.
	 * @returns The error, program name (incl. version), dzrp version and the machine type.
	 * error is 0 on success. 0xFF if version numbers not match.
	 * Other numbers indicate an error on remote side.
	 */
	/*
	protected async sendDzrpCmdInit(): Promise<{error: string | undefined, programName: string, dzrpVersion: string, machineType: DzrpMachineType}> {
		return {error: undefined, dzrpVersion: '', programName: 'MAME', machineType: DzrpMachineType.ALL_ROM};
	}
*/

	/**
	 * If cache is empty retrieves the registers from
	 * the Remote.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		const regs = await this.sendPacketData('g');	// Returns a string with the reg values as hex
		Z80Registers.setCache(regs);
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		const permut = [
			0x0B,	// PC -> MAME
			0x0A,	// SP -> MAME
			0x00,	// AF -> MAME
			0x01,	// BC -> MAME
			0x02,	// DE -> MAME
			0x03,	// HL -> MAME
			0x08,	// IX -> MAME
			0x09,	// IY -> MAME
			0x04,	// AF2 -> MAME
			0x05,	// BC2 -> MAME
			0x06,	// DE2 -> MAME
			0x07,	// HL2 -> MAME
		];

		// Word registers:
		if (regIndex <= Z80_REG.HL2) {
			value &= 0xFFFF;
			const mameRegIndex = permut[regIndex];
			const cmdSet = 'P' + mameRegIndex.toString(16) + '=' + Utility.getHexWordStringLE(value);
			await this.sendPacketDataOk(cmdSet);
			return;
		}

		// Byte registers:
		if (regIndex >= Z80_REG.F && regIndex <= Z80_REG.H2) {
			value &= 0xFF;
			// Get the word register.
			const byteRegIndex = regIndex - Z80_REG.F;
			const dwordIndex = Math.floor(byteRegIndex / 2) + Z80_REG.AF;
			let dword = Z80Registers.getRegValue(dwordIndex);
			// Now check which half should be changed
			const half = byteRegIndex % 2;
			if (half) {
				// Upper half should be changed, e.g. B of BC
				dword = (dword & 0xFF) + 256 * value;
			}
			else {
				// Lower half should be changed, e.g. C of BC
				dword = (dword & 0xFF00) + value;
			}
			// Change dword register
			const mameRegIndex = permut[dwordIndex];
			const cmdSet = 'P' + mameRegIndex.toString(16) + '=' + Utility.getHexWordStringLE(dword);
			await this.sendPacketDataOk(cmdSet);
			return;
		}

		// All other registers are not supported
		throw Error("Changing register " + Z80_REG[regIndex] + " is not supported by MAME.");
	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
	 */
	public async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
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
				originalFuncContinueResolve(breakInfo);
			};

			// C(ontinue)
			this.funcContinueResolve = funcIntermediateContinueResolve;
			await this.sendPacketData('c');
		}
		catch (e) {
			this.emit('error', e);
		}
	}


	/**
	 * Removes temporary breakpoints that might have been set by a
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
				// Remove breakpoint
				const bp1 = 'z1,' + bp1Addr64k.toString(16) + ',0';
				await this.sendPacketDataOk(bp1);
				// Check PC
				if (pc == bp1Addr64k)
					bpHit = true;
			}
			if (bp2Addr64k != undefined) {
				// Remove breakpoint
				const bp2 = 'z1,' + bp2Addr64k.toString(16) + ',0';
				await this.sendPacketDataOk(bp2);
				// Check PC
				if (pc == bp2Addr64k)
					bpHit = true;
			}
		}
		catch (e) {
			this.emit('error', e);
		}

		// Return
		return bpHit;
	}


	/**
	 * Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
		// Send CTRL-C:
		await this.sendPacketData('p0b', true);	// Command is: read register 0b (PC)
	}


	/**
	 * Adds a breakpoint.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;	// Long addresses not supported
		const cmd = 'Z0,' + address64k.toString(16) + ',0';
		await this.sendPacketDataOk(cmd);
		bp.bpId = 1;	// Just need to set something not zero.
	}


	/**
	 * Removes a breakpoint.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;	// Long addresses not supported
		const cmd = 'z0,' + address64k.toString(16) + ',0';
		await this.sendPacketDataOk(cmd);
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		const address64k = address & 0xFFFF;	// Long addresses not supported
		let type = '4';	// rw
		if (access == 'r')
			type = '3';
		else if (access == 'w')
			type = '2';
		const cmd = 'Z' + type + ',' + address64k.toString(16) + ',' + size.toString(16);
		await this.sendPacketDataOk(cmd);
	}


	/**
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		const address64k = address & 0xFFFF;	// Long addresses not supported
		let type = '4';	// rw
		if (access == 'r')
			type = '3';
		else if (access == 'w')
			type = '2';
		const cmd = 'z' + type + ',' + address64k.toString(16) + ',' + size.toString(16);
		await this.sendPacketDataOk(cmd);
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(addr64k: number, size: number): Promise<Uint8Array> {
		const cmd = 'm' + addr64k.toString(16) + ',' + size.toString(16);
		const resp = await this.sendPacketData(cmd);
		// Parse the hex values
		const buffer = new Uint8Array(size);
		for (let i = 0; i < size; i++) {
			const k = 2 * i;
			const valString = resp.substring(k, k + 2);
			const val = parseInt(valString, 16);
			buffer[i] = val;
		}
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
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
				const val = dataArray[i];
				cmd += Utility.getHexString(val, 2);
			}
			// Send to MAME
			await this.sendPacketDataOk(cmd);
			// Next
			totalSize -= sendSize;
			addr64k += sendSize;
		}
	}


	/**
	 * Ignore command.
	 */
	protected async sendDzrpCmdClose(): Promise<void> {
		// Do nothing
	}


	/**
	 * Loads a .sna file.
	 * This does not use sendDrzpCmdWriteBank as MAME gdbstub does not
	 * support slots and banking the way Dezog would require it.
	 * Therefore only 48k Spectrum .sna files are supported and this is
	 * written into memory with sendDzrpWriteMemory.
	 * Loading a .sna file does make sense only for mame started with
	 * machine spectrum.
	 * If it is used with some other machine the behavior is undefined
	 * = user error.
	 */
	protected async loadBinSna(filePath: string): Promise<void> {
		// Load and parse file
		const snaFile = new SnaFile();
		snaFile.readFile(filePath);

		// Check that it is a 48k sna file
		if (snaFile.is128kSnaFile)
			throw Error('Loading of 128k .sna files into MAME is not supported. Only 48k .sna files are supported.');

		// Transfer 16k memory banks
		let address = MemBank16k.BANK16K_SIZE;
		for (const memBank of snaFile.memBanks) {
			// Write memory
			await this.writeMemoryDump(address, memBank.data);
			// Next
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

		 // Not supported by MAME:
		//await this.sendDzrpCmdSetRegister(Z80_REG.R, snaFile.r);
		//await this.sendDzrpCmdSetRegister(Z80_REG.I, snaFile.i);
		//await this.sendDzrpCmdSetRegister(Z80_REG.IM, snaFile.im);
	}


	/**
	 * Loads a .nex file.
	 * See https://wiki.specnext.dev/NEX_file_format
	 */
	protected async loadBinNex(filePath: string): Promise<void> {
		throw Error('Cannot load a .nex file into MAME.');
	}
}

