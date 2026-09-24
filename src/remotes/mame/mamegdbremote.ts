import * as fs from 'fs';
import * as path from 'path';
import {BreakInfo} from '../dzrp/dzrpremote';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Log, LogTransport} from '../../log';
import {Socket} from 'net';
import {Utility} from '../../misc/utility';
import {HexFormat} from '../../misc/hexformat';
import {MameType, Settings} from '../../settings/settings';
import {Z80Registers, Z80_REG} from '../z80registers';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {Z80RegistersMameDecoder} from './z80registersmamedecoder';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {MemoryModelUnknown} from '../MemoryModel/genericmemorymodels';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {ErrorWrapper} from '../../misc/errorwrapper';
import {MemoryModelZxNext} from '../MemoryModel/zxnextmemorymodels';
import {SnaFile} from '../dzrp/snafile';
import {MemBank16k} from '../dzrp/membank16k';
import {Z80File} from '../dzrp/z80file';



// The "break" character.
const CTRL_C = '\x03';


/** The representation of a MAME remote.
 * Can handle the MAME gdbstub but only for Z80.
 */
export class MameGdbRemote extends DzrpQueuedRemote {
	protected override logName = 'MameGdbRemote';

	// The settings configuration for the Mame remote.
	protected settingsMameType: MameType;


	// The socket connection.
	public socket: Socket;

	// Stores the received data.
	protected receivedData: string;

	// If mame is using the Z80 Next CPU / tbblue.
	// Is determined during connection setup.
	protected Z80N: boolean;

	// Used for temporary bank reads/writes.
	// Requires slot 0 or 1 because ROM can only be paged into these slots.
	protected readonly TMP_SLOT = 0;



	/// Constructor.
	constructor(settingsMameType: MameType) {
		super();
		// Init
		this.settingsMameType = settingsMameType;
		this.supportsASSERTION = true;
		this.supportsWPMEM = true;
		this.supportsLOGPOINT = true;
		this.supportsBreakOnInterrupt = false;
		this.Z80N = false;
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
		this.cmdRespTimeoutTime = this.settingsMameType.timeout * 1000;

		// React on-open
		this.socket.on('connect', () => {
			(async () => {
				LogTransport.log(this.logName + ': Connected to server!');

				this.receivedData = '';

				// Check for unsupported settings
				if (Settings.launch.history.codeCoverageEnabled) {
					this.emit('warning', "launch.json: codeCoverageEnabled==true: MAME gdb does not support code coverage.");
				}

				await this.onConnect();
			})();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			//console.log('Close.');
			LogTransport.log(this.logName + ': MAME terminated the connection: ' + hadError);
			// Error
			const err = new Error(this.logName + ': MAME terminated the connection!');
			try {
				this.emit('error', err);
			}
			catch {};
		});

		// Handle errors
		this.socket.on('error', err => {
			ErrorWrapper.wrap(err);
			//console.log('Error: ', err);
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
		this.socket.setTimeout(this.settingsMameType.timeout * 1000);
		const port = this.settingsMameType.port!;
		const hostname = this.settingsMameType.hostname!;
		this.socket.connect(port, hostname);
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


	/** Call this from 'doInitialization' when a successful connection
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

			// Check for ZX Next
			if (this.Z80N) {
				// ZX Next
				this.memoryModel = new MemoryModelZxNext();
				// ZX Next detected: Set ROM to ROM1 (48k)
				// We come from ZxNextOS so it is ROM3:
				await this.sendQrcmd('nr8e=3');
			}
			else {
				// Unknown memory model: 64k RAM assumed
				this.memoryModel = new MemoryModelUnknown()
			}
			this.memoryModel.init();

			// Load executable
			await this.load();

			Z80Registers.decoder = this.createZ80RegistersDecoder();

			// Ready
			this.emit('initialized', 'MAME connected!')
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
		if (!this.socket)
			return;
		this.socket.removeAllListeners();

		// Send a k(ill) command
		// NOTE: Remove once MAME issue 9578 (https://github.com/mamedev/mame/issues/9578) 	is clarified:
		this.cmdRespTimeoutTime = 0;	// No response expected for kill command.

		// Cancel any in-flight timeouts and clear the queue. We want the 'k' command to be sent
		// immediately. Otherwise there is a delay of 5 seconds before the 'k' command is actually
		// sent, causing the debug UI bar to remain visible until the command is sent.
		this.stopCmdRespTimeout();
		this.messageQueue.length = 0;

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
					resolve = undefined as any;
				}
			}, 1000);	// 1 sec
			this.socket.end(() => {
				if (resolve) {
					clearTimeout(timeout);
					resolve();
					resolve = undefined as any;
				}
			});
			this.socket = undefined as any;
		});
	}


	/** Closes the socket.
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


	/** Checks the XML received from MAME.
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
			if (!this.receivedData.startsWith('$'))
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
			try {
				this.emit('error', e);
			}
			catch {};
		}
	}

	/** A response has been received.
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
			Utility.assert(msg, "MAME: Response received without request.");

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
		const hexString = HexFormat.getHexString(checkSum, 2);
		return hexString;
	}


	/** Sends data to MAME.
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


	/** Sends a packet to MAME that expects an 'OK' as reply.
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
  qRcmd: Send special commands to the remote.
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
		else if (cmd_name?.toLowerCase() == "qrcmd") {
			const unencoded = cmdArray.join(' ');
			response = await this.sendQrcmd(unencoded);
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

	/** Sends the command to init the remote.
	 * @returns The error, program name (incl. version), dzrp version and the machine type.
	 * error is 0 on success. 0xFF if version numbers not match.
	 * Other numbers indicate an error on remote side.
	 */
	/*
	protected async sendDzrpCmdInit(): Promise<{error: string | undefined, programName: string, dzrpVersion: string, machineType: DzrpMachineType}> {
		return {error: undefined, dzrpVersion: '', programName: 'MAME', machineType: DzrpMachineType.ALL_ROM};
	}
	*/

	/** If cache is empty retrieves the registers from
	 * the Remote.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		// const regs = await this.sendPacketData('g');	// Returns a string with the reg values as hex
		// Z80Registers.setCache(regs);

		let cmd = 'print pc,sp,af,bc,de,hl,ix,iy,af2,bc2,de2,hl2,ir,im';
		if (this.Z80N)
			cmd += ',mmu0,mmu1,mmu2,mmu3,mmu4,mmu5,mmu6,mmu7';
		const regValues = await this.sendQrcmd(cmd);
		const regs = regValues.split(' ');	// Split the response into individual register values
		Z80Registers.setCache(regs);
	}

	// TODO: Should I implement this instead of changing getRegistersFromEmulator
	/** Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	// public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
	// 	const regs = await this.sendPacketData('g');	// Returns a string with the reg values as hex
	// 	Z80Registers.setCache(regs);
	// 	const regData = Z80Registers.getRegisterData();
	// 	return regData;
	// }


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


	/** Adds a breakpoint.
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


	/** Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	// TODO
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


	/** Sends the command to remove a watchpoint for an address range.
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


	/** Sends the command to retrieve a memory dump.
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
		const buffer = await this.sendDzrpCmdReadMem(addr64k, size);	// Use normal read mem function
		// Restore the original bank in the TMP_SLOT
		await this.sendDzrpCmdSetSlot(this.TMP_SLOT, tmpBank);
		return buffer;
	}


	/** Sends the command to write a memory dump.
	 * @param bankp1 The bank+1 value. 0=full 64k memory, 1=bank0, 2=bank1, etc.
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
				cmd += HexFormat.getHexString(val, 2);
			}
			// Send to MAME
			await this.sendPacketDataOk(cmd);
			// Next
			totalSize -= sendSize;
			addr64k += sendSize;
		}
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


	/** Sends the command to set the border.
	 */
	public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
		await this.sendDzrpCmdWritePort(0xFE, borderColor);
	}


	/** Enables/disables the interrupts.
	 * @param enable true to enable, false to disable interrupts.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		const enableInterrupt = (enable) ? 1 : 0;
		await this.sendQrcmd(`iff1=${enableInterrupt}`);
		await this.sendQrcmd(`iff2=${enableInterrupt}`);
	}


	/* Sends the command to write to a port.
	 * @param port The port address.
	 * @param value the value to write.
	 */
	protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
		await this.sendQrcmd(`ib@${port.toString(16)}=${value.toString(16)}`);
	}


	/** Ignore command.
	 */
	protected async sendDzrpCmdClose(): Promise<void> {
		// Do nothing
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
		const pcStr = await this.sendQrcmd('print pc');
		const memByteStr = await this.sendQrcmd(`print b@${pcStr}`);
		// Exchange with nop
		await this.sendQrcmd(`b@${pcStr}=0`);	// NOP
		// Single step
		await this.sendQrcmd('step');
		// Restore original byte at pc
		await this.sendQrcmd(`b@${pcStr}=${memByteStr}`);
		// Reset PC to original value
		await this.sendQrcmd(`pc=${pcStr}`);
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
		await this.sendDzrpCmdSetBorder(snaFile.borderColor);

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

