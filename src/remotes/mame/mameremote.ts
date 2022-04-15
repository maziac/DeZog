import {GenericBreakpoint} from '../../genericwatchpoint';
import {LogTransport} from '../../log';
import {Socket} from 'net';
import {Utility} from '../../misc/utility';
import {Settings} from '../../settings';
import {Z80Registers, Z80_REG} from '../z80registers';
import {DzrpQeuedRemote} from '../dzrp/dzrpqeuedremote';
import {Z80RegistersMameDecoder} from './z80registersmamedecoder';
import {AllRomModel} from '../Paging/memorymodel';
import {Labels} from '../../labels/labels';
import {Remote} from '../remotebase';



/// Timeouts.
const CONNECTION_TIMEOUT = 1000;	// 1 sec

// The "break" character.
const CTRL_C = '\x03';


/**
 * The representation of a MAME remote.
 * Can handle the MAME gdbstub but only for Z80.
 */
export class MameRemote extends DzrpQeuedRemote {

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
			/*
			TODO: What to do with this?
			if (Settings.launch.history.codeCoverageEnabled) {
				this.emit('warning', "launch.json: codeCoverageEnabled==true: CSpect does not support code coverage.");
			}
			*/

			this.onConnect();
		});

		// Handle disconnect
		this.socket.on('close', hadError => {
			LogTransport.log('MameRemote: MAME terminated the connection: ' + hadError);
			console.log('Close.');
			// Error
			const err = new Error('MameRemote: MAME terminated the connection!');
			this.emit('error', err);
		});

		// Handle errors
		this.socket.on('error', err => {
			LogTransport.log('MameRemote: Error: ' + err);
			console.log('Error: ', err);
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
			await this.sendPacketData('?'); // Reply is ignored
			const qXmlReply = await this.sendPacketData('qXfer:features:read:target.xml:00,FFFF');	// Enable 'g', 'G', 'p', and 'P commands

			// Check the XML
			this.parseXml(qXmlReply);

			// Load executable
			await this.loadExecutable();

			Z80Registers.decoder = new Z80RegistersMameDecoder();

			// 64k ROM
			this.memoryModel = new AllRomModel();
			this.memoryModel.init();
			Labels.convertLabelsTo(this.memoryModel);

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
		try {
			await this.sendDzrpCmdClose();
		}
		catch {}
	}


	/**
	 * Checks the XML received from MAME.
	 * Throws an exception if the architecture is not 'z80'.
	 */
	protected parseXml(xml: string) {
		// Check <architecture>z80</architecture>
		const match = /<architecture>(.*)<\/architecture>/.exec(xml);
		if (!match)
			throw Error("No architecture found in reply from MAME.");
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
		LogTransport.log('dataReceived, count='+data.length);

		try {
			// Add data to existing buffer
			this.receivedData += data;

			let i = 0;
			const c = this.receivedData[i++];
			switch (c) {
				case '+':	// ACK
					break;
				case '-':	// NACK
					// Only reason for this in MAME gdbstub is a wrong checksum
					throw Error("Received NACK. Reason: checksum error.");
				default:	// Unexpected
					throw Error("No ACK received.");
			}

			// For some commands (c, s) the '+' is treated as response
			// and the actual stop reply as a notification.
			// I.e. the 'c'(ontinue) command will return after the '+ is received.
			const msg = this.messageQueue[0];
			if (msg.customData.noReply) {
				// E.g. c(ontinue)
				this.receivedMsg();
			}
			else {
				// All other commands

				// Now the reply follows:
				// $reply#HH  with HH the hex checksum.
				const len = this.receivedData.length;
				if (len < 4)	// Minimum length: '$#00'
					return;
				if (this.receivedData[i++] != '$')
					throw Error("Wrong packet format. Expected '$'.");
				// Find the '#' that ends the packet
				do {
					i++;
					if (i >= len)
						return;	// End not yet found
				} while (this.receivedData[i] != '#');
				// Now skip checksum: The transport is considered reliable.
				// Checksum is not checked.
				const packetLen = i + 3;	// E.g. '+$xxx#HH'
				if (len < packetLen)
					return;	// Not everything received yet.

				// Complete packet received:
				// Get packet data
				const packetData = this.receivedData.substring(2, i);

				// Wait for next data
				this.receivedData = this.receivedData.substring(packetLen);	// Normally this returns an empty string

				// Handle received buffer
				this.receivedMsg(packetData);
			}
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
	protected receivedMsg(packetData?: string) {
		// Check for notification
		/*
		if (recSeqno == 0) {
			// Notification.
			// Call resolve of 'continue'
			if (this.funcContinueResolve) {
				const continueHandler = this.funcContinueResolve;
				this.funcContinueResolve = undefined;
				// Get data
				const breakNumber = data[2];
				let breakAddress = Utility.getWord(data, 3);
				if (Labels.AreLongAddressesUsed()) {
					const breakAddressBank = data[5];
					breakAddress += breakAddressBank << 16;
				}
				// Get reason string
				let breakReasonString = Utility.getStringFromBuffer(data, 6);
				if (breakReasonString.length == 0)
					breakReasonString = undefined as any;

				// Handle the break.
				continueHandler({breakNumber, breakAddress, breakReasonString});
			}
		}
		else
		*/
		{
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
			entry.customData = {noReply: (packetData == 'c')};

			// Try to send immediately
			if (this.messageQueue.length == 1)
				this.sendNextMessage();
		});
	}


	/**
	 * Writes the buffer to the socket.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		return new Promise<void>(resolve => {
			this.socket.write(buffer, () => {
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
  b: Break
  c: Continue
  s: Step into
  g: Read registers
  G: Write registers
  m: Read memory
  M: Write memory
  p: Read register
  P: Write register
  X: Load binary data
  z: Clear breakpoint/watchpoint
  Z: Set breakpoint/watchpoint
  send xxx: Sends the raw ascii string xxx. The $/# and the checksum is added before sending. An empty string sends a CTRL-C (break).`;
		}

		let response = "";
		if (cmd_name == "send") {
			let packetData;
			// Get string
			if (cmdArray.length == 0) {
				// CTRL-C
				cmd_name = 'CTRL-C, g';
				response = await this.sendPacketData('g', true);
			}
			else {
				packetData = cmdArray[0];
				cmd_name = packetData;
				response = await this.sendPacketData(packetData);
			}
		}
		else if (cmd_name == "c") {
			await this.sendDzrpCmdContinue();
		}
		else if (cmd_name == "b") {
			await this.sendDzrpCmdPause();
		}
		else if (cmd_name == "r") {
			const regs = await this.sendDzrpCmdGetRegisters();
			// Registers
			const regNames = ["PC", "SP", "AF", "BC", "DE", "HL", "IX", "IY", "AF'", "BC'", "DE'", "HL'", "IR", "IM"];
			let i = 0;
			for (const name of regNames) {
				const value = regs[i];
				response += "\n" + name + "(" + i + "): 0x" + Utility.getHexString(value, 4) + "/" + value;
				i++;
			}
		}
		else if (cmd_name == "P") {
			if (cmdArray.length < 2) {
				// Error
				throw Error("Expecting 2 parameters: regIndex and value.");
			}
			const regIndex = Utility.parseValue(cmdArray[0]);
			const value = Utility.parseValue(cmdArray[1]);
			await this.sendDzrpCmdSetRegister(regIndex as Z80_REG, value);
		}
		else if (cmd_name == "m") {
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
		else if (cmd_name == "M") {
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
		else if (cmd_name == "z0") {
			// "z0 address"
			if (cmdArray.length != 1) {
				// Error
				throw Error("Expecting 1 parameters: address.");
			}
			const address = Utility.parseValue(cmdArray[0]);
			// Create data to send
			const longAddress = address;
			const bp: GenericBreakpoint = {
				address: longAddress
			};
			await this.sendDzrpCmdAddBreakpoint(bp);
			response += '\n Breakpoint ID: ' + bp.bpId;
		}
		else if (cmd_name == "Z0") {
			// "Z0 breakpointId"
			if (cmdArray.length != 1) {
				// Error
				throw Error("Expecting 1 parameter: breakpoint ID.");
			}
			const bp: GenericBreakpoint = {
				address: -1,	// not used
				bpId: Utility.parseValue(cmdArray[0])
			};
			// Create data to send
			await this.sendDzrpCmdRemoveBreakpoint(bp);
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
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		return new Uint16Array();
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {

	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	public async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {

	}


	/**
	 * Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
	}


	/**
	 * Adds a breakpoint.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
	}


	/**
	 * Removes a breakpoint.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		//
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
	}


	/**
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		return new Uint8Array();
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer | Uint8Array): Promise<void> {
	}

}

