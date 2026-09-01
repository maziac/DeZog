import {Log, LogTransport} from '../../log';
import {AlternateCommand, DzrpMachineType, DZRP, DZRP_PROGRAM_NAME} from '../dzrp/dzrpremote';
import {Z80Registers, Z80RegistersClass, Z80_REG} from '../z80registers';
import {Utility} from '../../misc/utility';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {DzrpTransportType, Settings} from '../../settings/settings';
import {createDzrpSimpleMode} from './dzrpsimplemode';



/** A structure used to serialize the sent messages.
 */
class MessageBuffer {
	// The response timeout time
	public respTimeoutTime: number;

	// The buffer to send
	public buffer: Buffer;

	// The function to call when the response is received.
	public resolve: (buffer) => void;

	// The function to call when the command times out.
	public reject: (error) => void;
}


/** Conversion of SendDzrpCmd... functions as buffer and parsing of received messages.
 *
 * All sendDzrpCmd... methods are implemented. I.e. all commands
 * create a buffer to send. The buffer sending itself (sendBuffer) is
 * not implemented. Therefore the class needs to be derived.
 *
 * If some commands are not implemented in the derived remote, the derived remote should
 * not override the sendDzrpCmd... methods.
 * Instead it should use the supportedCommands property to indicate supported commands.
 * The configureFromCommands() will then manipulate the unused command
 * methods to throw errors.
 *
 * It receives the requests from the DebugSessionClass and
 * creates complete DZRP messages in a buffer.
 * At the end calls 'sendBuffer' which is not implemented.
 * I.e. this class needs derivation and overriding of method
 * 'sendBuffer' for the actual transport implementation.
 *
 * In the other direction a derived class needs to receive data
 * and call the 'receivedMsg' method with the data.
 * The rest is handled in this class.
 *
 * The class also sets up a message queue for the commands to send.
 *
 * This class does not implement any complex flow/state handling.
 *
 * IF YOU IMPLEMEMENT A REMOTE THAT USES A PHYSICAL TRANSPORT AND
 * USES THE DZRP PROTOCOL, YOU SHOULD DERIVE FROM THIS CLASS.
 */
export class DzrpTransportRemote extends DzrpQueuedRemote {
	/// Timeouts.
	protected static readonly CONNECTION_TIMEOUT = 1000;	// 1 sec // TODO: exchange the static TIMEOUTS with the one from the Settings.

	// The current required version of the protocol.
	// Remotes may overwrite this.
	protected DZRP_VERSION = [2, 2, 0];

	// The settings configuration for the DZRP remote.
	protected settingsDzrpTransportType: DzrpTransportType;

	// Sequence Number 1-15. Used for sending.
	protected sequenceNumber: number;

	// To collect received chunks.
	protected receivedData: Buffer;
	protected expectedLength: number;
	protected receivingHeader: boolean;

	// Handle for timeout between data chunks
	protected chunkTimeoutHandle?: NodeJS.Timeout;
	// The used chunk time out time in ms.
	protected chunkTimeout: number;


	/// Constructor.
	constructor(settingsDzrpTransportType: DzrpTransportType) {
		super();
		this.settingsDzrpTransportType = settingsDzrpTransportType;
		this.sequenceNumber = 0;
		// Instantiate the message queue
		this.messageQueue = new Array<MessageBuffer>();
	}


	/** Depending on (un)supported commands this method selects the
	 * appropriate mode.
	 * If CMD_ADD_BREAKPOINT is not supported, the 'simple mode' is used.
	 * Otherwise, nothing is done, which defaults to normal mode.
	 */
	protected selectMode(unsupportedCommands: number[]) {
		if (unsupportedCommands.includes(DZRP.CMD_ADD_BREAKPOINT)) {
			this.useSimpleMode();
		}
	}


	/** Takes care to use the DZRP 'simple mode' (CMD_SET_BREAKPOINTS)
	 * instead of the normal mode (CMD_ADD_BREAKPOINT).
	 * See {@link createDzrpSimpleMode} for more information.
	 */
	protected useSimpleMode() {
		// Change implementation to use the special CMD_SET_BREAKPOINTS and CMD_RESTORE_MEM commands.
		const currentClass = Object.getPrototypeOf(this).constructor;
		const VariantBClass = createDzrpSimpleMode(currentClass);

		// Change prototype to VariantBClass so that methods from VariantBClass are found
		Object.setPrototypeOf(this, VariantBClass.prototype);

		// Initialize instance properties that would normally be set by the constructor (constructor is NOT called when using setPrototypeOf!)
		(this as any).initSimpleMode();
	}


	/** Returns an array with command ids of those commands which
	 * are not in the supportedCommands string.
	 * @param supportedCommands A string, each character representing a
	 * command with that index. "0"=not supported, "1"=supported.
	 */
	protected getUnsupportedCommands(supportedCommands: string): number[] {
		// Revert the array
		const revSuppCmds = supportedCommands.replace(/_/g, '').split('').reverse();
		const revSuppCmdsLength = revSuppCmds.length;

		// Now exchange the unsupported commands
		const unsupportedCommands: number[] = [];
		const commandEntries = Object.entries(DZRP);
		for (const entry of commandEntries) {
			const cmdId = parseInt(entry[0]);
			if (isNaN(cmdId))
				break;
			if (revSuppCmdsLength <= cmdId || revSuppCmds[cmdId] === '0') {
				unsupportedCommands.push(cmdId);
				console.log(`Unsupported command: ${entry[1]} (${cmdId})`);
			}
		}
		return unsupportedCommands;
	}


	/** Disables the given commands.
	 * The corresponding function is set to a function that throws an error.
	 */
	protected disableUnsupportedCommands(unsupportedCommands: number[]): void {
		// Loop all disabled commands
		for (const cmdId of unsupportedCommands) {
			// Get name of command
			const cmdName = DZRP[cmdId] as string;
			const methodName = 'sendDzrp' + this.toPascalCase(cmdName);
			// Safety check that function exists at all
			if (typeof (this as any)[methodName] !== 'function') {
				throw Error(`Methode ${methodName} does not exist.`);
			}
			// Override function with function that throws an exception
			(this as any)[methodName] = async () => {
				throw Error(`Feature is not supported by the remote "${this.remoteType}". Details: DZRP command '${cmdName} (${cmdId})' is not supported.`);
			};
		}
	}


	/** Handles the CMD_GET_SUPPORTED_COMMANDS response.
	 * At least for the DzrpTransportRemote and subclasses.
	 * Upper classes (without physical DZRP support) may
	 * handle it differently.
	 */
	protected async handleSupportedCommands(): Promise<void> {
		const suppCmds = await this.sendDzrpCmdGetSupportedCommands();
		const unsupportedCmds = this.getUnsupportedCommands(suppCmds);
		this.disableUnsupportedCommands(unsupportedCmds);
		this.selectMode(unsupportedCmds);
		this.setAssertionWpmemLogpointSupport(unsupportedCmds);
	}


	/** Sets the ASSERTION, WPMEM and LOGPOINT support flags based
	 * on the given unsupported commands.
	 * Same for save/restore state.
	 * Also does some consistency checks.
	 * @throws Error if some inconsistency is found (e.g. CMD_ADD_BREAKPOINT
	 * is supported but CMD_REMOVE_BREAKPOINT is not).
	 */
	protected setAssertionWpmemLogpointSupport(unsupportedCommands: number[]): void {

		// Enable/disable ASSERTIONs, WPMEM and LOGPOINTs according supported commands:
		// Watchpoints/WPMEM:
		this.supportsWPMEM = !unsupportedCommands.includes(DZRP.CMD_ADD_WATCHPOINT);
		// ASSERTIONs/LOGPOINTs depend on normal breakpoints:
		this.supportsASSERTION = (!unsupportedCommands.includes(DZRP.CMD_SET_BREAKPOINTS)) || (!unsupportedCommands.includes(DZRP.CMD_ADD_BREAKPOINT));
		this.supportsLOGPOINT = this.supportsASSERTION;

		// Enable/disable state save/restore
		if (unsupportedCommands.includes(DZRP.CMD_WRITE_STATE)) {
			this.stateSave = async () => {
				throw Error(`Feature is not supported by the remote "${this.remoteType}". Details: DZRP command CMD_WRITE_STATE is not supported.`);
			};
		}
		if (unsupportedCommands.includes(DZRP.CMD_READ_STATE)) {
			this.stateRestore = async () => {
				throw Error(`Feature is not supported by the remote "${this.remoteType}". Details: DZRP command CMD_READ_STATE is not supported.`);
			};
		}

		// Do some plausibility checks.
		if (!unsupportedCommands.includes(DZRP.CMD_ADD_WATCHPOINT) && unsupportedCommands.includes(DZRP.CMD_REMOVE_WATCHPOINT))
			throw Error(`Inconsistency found in remote "${this.remoteType}". Details: DZRP command 'CMD_ADD_WATCHPOINT' supported but corresponding CMD_REMOVE_WATCHPOINT is not.`);
		if (!unsupportedCommands.includes(DZRP.CMD_SET_BREAKPOINTS) && unsupportedCommands.includes(DZRP.CMD_RESTORE_MEM))
			throw Error(`Inconsistency found in remote "${this.remoteType}". Details: DZRP command 'CMD_SET_BREAKPOINTS' supported but corresponding CMD_RESTORE_MEM is not.`);
		if (!unsupportedCommands.includes(DZRP.CMD_ADD_BREAKPOINT) && unsupportedCommands.includes(DZRP.CMD_REMOVE_BREAKPOINT))
			throw Error(`Inconsistency found in remote "${this.remoteType}". Details: DZRP command 'CMD_ADD_BREAKPOINT' supported but corresponding CMD_REMOVE_BREAKPOINT is not.`);
		if (!unsupportedCommands.includes(DZRP.CMD_READ_STATE) && unsupportedCommands.includes(DZRP.CMD_WRITE_STATE))
			throw Error(`Inconsistency found in remote "${this.remoteType}". Details: DZRP command 'CMD_READ_STATE' supported but corresponding CMD_WRITE_STATE is not.`);
	}


	// Returns e.g. "CmdInit" for "CMD_INIT"
	protected toPascalCase(s: string): string {
		return s
			.toLowerCase()
			.split('_')
			.map(part => part.charAt(0).toUpperCase() + part.slice(1))
			.join('');
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it should emit this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	/// If you override this, call the base implementation with 'await super.doInitialization();'
	/// to check for code coverage setting. None of the DZRP remotes (up to now)
	/// support code coverage.
	protected async doInitialization(): Promise<void> {
		// Check for unsupported settings
		if (Settings.launch.history.codeCoverageEnabled) {
			this.emit('warning', `launch.json: codeCoverageEnabled==true: '${this.remoteType}' does not support code coverage.`);
		}
	}


	/**
	 * Returns the next sequence number for sending
	 */
	public getNextSeqNo(): number {
		this.sequenceNumber++;
		if (this.sequenceNumber > 15)
			this.sequenceNumber = 1;
		return this.sequenceNumber;
	}


	/**
	 * Sends a DZRP command and waits for the response.
	 * @param cmd The command.
	 * @param data A buffer containing the data.
	 * @param respTimeoutTime The response timeout. Undefined=use default.
	 * @returns The response (payload data after seq no) is returned in the Promise.
	 */
	protected async sendDzrpCmd(cmd: DZRP, data?: Buffer | Array<number>, respTimeoutTime?: number): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			(async () => {
				// Calculate length
				let len = 0;
				if (data) {
					if (Array.isArray(data))
						data = Buffer.from(data);	// Convert to Buffer if Array
					len += data.length;
				}
				// Put length in buffer
				const totalLength = 4 + 2 + len;
				const buffer = Buffer.alloc(totalLength);
				// Encode length
				buffer[0] = len & 0xFF;
				buffer[1] = (len >>> 8) & 0xFF;
				buffer[2] = (len >>> 16) & 0xFF;
				buffer[3] = (len >>> 24) & 0xFF;
				// Put sequence number in buffer
				const seqno = this.getNextSeqNo();
				buffer[4] = seqno;
				// Put command in buffer
				buffer[5] = cmd;
				// Copy data
				data?.copy(buffer, 6);

				// Put into queue
				if (respTimeoutTime == undefined)
					respTimeoutTime = this.cmdRespTimeoutTime;
				this.putIntoQueue(buffer, respTimeoutTime, resolve, reject);

				// If command is CMD_CLOSE then prohibit any further commands to be sent.
				if (cmd == DZRP.CMD_CLOSE) {
					// Prohibit any further commands to be sent.
					// Any further calls will not put anything in the
					// messageQueue.
					this.putIntoQueue = () => {return undefined as any;};
				}

				// Try to send immediately
				if (this.messageQueue.length == 1)
					await this.sendNextMessage();
			})();
		});
	}


	/** Called when data has been received.
	 */
	protected dataReceived(data: Buffer) {
		//LogTransport.log('dataReceived, count=' + data.length);

		// Add data to existing buffer
		this.receivedData = Buffer.concat([this.receivedData, data]);

		if (this.receivedData.length > 0) {
			// Check if still data to receive
			if (this.receivedData.length < this.expectedLength) {
				this.startChunkTimeout();
				return;	// Wait for more
			}

			// Check length
			if (this.receivingHeader) {
				// Header has been received, read length
				const buffer = this.receivedData;
				let recLength = buffer[0];
				recLength += buffer[1] * 256;
				recLength += buffer[2] * 256 * 256;
				recLength += buffer[3] * 256 * 256 * 256;
				this.expectedLength = recLength + 4;
				this.receivingHeader = false;
				// Check if all payload has been received
				if (this.receivedData.length < this.expectedLength) {
					this.startChunkTimeout();
					return;	// Wait for more
				}
			}

			// Complete message received.
			this.stopChunkTimeout();

			// Strip length
			const length = this.expectedLength - 4;
			const strippedBuffer = Buffer.alloc(length);
			this.receivedData.copy(strippedBuffer, 0, 4, this.expectedLength);

			// Log
			const txt = this.dzrpRespBufferToString(this.receivedData);
			LogTransport.log('<<< Remote: Received ' + txt);

			// Handle received buffer
			this.receivedMsg(strippedBuffer);

			// Prepare next buffer. Copy remaining received bytes.
			const overLength = this.receivedData.length - this.expectedLength;
			Utility.assert(overLength >= 0);
			this.receivingHeader = true;
			if (overLength == 0) {
				this.expectedLength = 4;
				this.receivedData = Buffer.alloc(0);
				return;
			}

			// More data has been received
			const nextBuffer = Buffer.alloc(overLength);
			this.receivedData.copy(nextBuffer, 0, this.expectedLength);
			this.receivedData = Buffer.alloc(0);
			// Call again
			this.expectedLength = 4;
			this.dataReceived(nextBuffer);
		}
	}


	/**
	 * A DZRP response has been received.
	 * If there are still messages in the queue the next message is sent.
	 */
	protected receivedMsg(data: Buffer) {
		// Safety check
		Utility.assert(data);
		// Log
		const recSeqno = data[0];
		//const respName=(recSeqno==0)? "Notification":"Response";
		//LogSocket.log('<<< '+respName+' (seqno='+recSeqno+')', data);

		// Check for notification
		if (recSeqno == 0) {
			// Notification.
			// Call resolve of 'continue'
			if (this.funcContinueResolve) {
				const continueHandler = this.funcContinueResolve;
				this.funcContinueResolve = undefined;
				// Get data
				const type = data[2];
				let longAddr = Utility.getWord(data, 3);
				const breakAddressBank = data[5];
				longAddr += breakAddressBank << 16;
				// Get reason string
				let reasonString = Utility.getStringFromBuffer(data, 6);
				if (reasonString.length == 0)
					reasonString = undefined as any;

				// Handle the break.
				(async () => {
					await continueHandler({reasonNumber: type, longAddr, reasonString});
				})();
			}
		}
		else {
			// Stop timeout
			this.stopCmdRespTimeout();
			// Get latest sent message
			const msg = this.messageQueue[0];
			Utility.assert(msg, "DZRP: Response received without request.");
			// Get sequence number
			const seqno = msg.buffer[4];
			// Check response
			if (recSeqno != seqno) {
				const error = Error("DZRP: Received wrong SeqNo. '" + recSeqno + "' instead of expected '" + seqno + "'");
				LogTransport.log("Error: " + error);
				// Note: 'error' events have a special handling and throw an error if event was not handled:
				// "For all EventEmitter objects, if an 'error' event handler is not provided, the error will be thrown."
				try {
					this.emit('error', error);
				}
				catch {};
				msg.reject(error);
				return;
			}
			data = data.subarray(1);  // Cut off seq number
			// Queue next message
			this.messageQueue.shift();
			// Try to send it
			(async () => {
				await this.sendNextMessage();
				// Pass received data to right consumer
				msg.resolve(data);
			})();
		}
	}


	/**
	 * Starts the chunk timeout.
	 */
	protected startChunkTimeout() {
		this.stopChunkTimeout();
		Utility.assert(this.chunkTimeout !== undefined, 'Chunk timeout not set!');
		this.chunkTimeoutHandle = setTimeout(() => {
			const err = new Error('Socket chunk timeout.');
			// Log
			LogTransport.log('Error: ' + err.message);
			// Error
			try {
				this.emit('error', err);
			}
			catch {};
		}, this.chunkTimeout);
	}


	/**
	 * Stops the chunk timeout.
	 */
	protected stopChunkTimeout() {
		if (this.chunkTimeoutHandle)
			clearTimeout(this.chunkTimeoutHandle);
		this.chunkTimeoutHandle = undefined;
	}


	/**
	 * Creates a string out of a DZRP command.
	 * Meant for debugging.
	 */
	public dzrpCmdBufferToString(buffer: Buffer, index = 0): string {
		const count = buffer.length - index;
		let text = "";
		if (count >= 6) {
			const length = buffer[index] + 256 * buffer[index + 1] + 256 * 256 * buffer[index + 2] + 256 * 256 * 256 * buffer[index + 3];
			const lengthString = "" + buffer[index] + " " + buffer[index + 1] + " " + buffer[index + 2] + " " + buffer[index + 3];
			const seqno = buffer[index + 4];
			const cmd = buffer[index + 5];
			let cmdString
			try {
				cmdString = DZRP[cmd];
			}
			catch {
				cmdString = "Unknown(" + cmd.toString() + ")";
			}
			text += "Command " + cmdString + "\n";
			text += "  Length: " + length + " (" + lengthString + ")\n";
			text += "  SeqNo:  " + seqno + "\n";
			text += "  Cmd:    " + cmd + "\n";
			index += 6;
		}
		// Rest of data
		const dataString = Utility.getStringFromData(buffer, index);
		text += "  Data:   " + dataString + "\n";
		return text;
	}


	/**
	 * Creates a string out of a DZRP response.
	 * Also handles the notification.
	 * Meant for debugging.
	 */
	public dzrpRespBufferToString(buffer: Buffer, index = 0): string {
		const count = buffer.length - index;
		let text = "";
		if (count >= 5) {
			const length = buffer[index] + 256 * buffer[index + 1] + 256 * 256 * buffer[index + 2] + 256 * 256 * 256 * buffer[index + 3];
			const lengthString = "" + buffer[index] + " " + buffer[index + 1] + " " + buffer[index + 2] + " " + buffer[index + 3];
			const seqno = buffer[index + 4];
			if (seqno == 0)
				text += "Notification:\n";
			else
				text += "Response:\n";
			text += "  Length: " + length + " (" + lengthString + ")\n";
			text += "  SeqNo:  " + seqno + "\n";
			index += 5;
		}
		// Rest of data
		const dataString = Utility.getStringFromData(buffer, index);
		text += "  Data:   " + dataString + "\n";
		return text;
	}


	//------- Send Commands -------

	/**
	 * Sends the command to init the remote.
	 * @returns The error, program name (incl. version), dzrp version and the machine type.
	 * error is 0 on success. 0xFF if version numbers not match.
	 * Other numbers indicate an error on remote side.
	 */
	protected async sendDzrpCmdInit(): Promise<{error: string | undefined, programName: string, dzrpVersion: number[], machineType: DzrpMachineType}> {
		const nameBuffer = Utility.getBufferFromString(DZRP_PROGRAM_NAME);
		const resp = await this.sendDzrpCmd(DZRP.CMD_INIT, [...this.DZRP_VERSION, ...nameBuffer], this.initCloseRespTimeoutTime);
		// Error
		let error;
		if (resp[0] != 0)
			error = "Remote returned an error code: " + resp[0];
		// DZRP Version
		const dzrp_version = [resp[1], resp[2], resp[3]];
		// Get machine type
		const machineType = resp[4];
		// Program name
		const program_name = Utility.getStringFromBuffer(resp, 5);

		// Check version number. Check only major and minor number.
		if (this.DZRP_VERSION[0] != resp[1]
			|| this.DZRP_VERSION[1] > resp[2]) {
			error = "DZRP versions do not match.\n";
			error += "Required version is " + this.DZRP_VERSION[0] + "." + this.DZRP_VERSION[1] + " or higher.\n";
			error += "But this remote (" + program_name + ") supports only version " + resp[1] + "." + resp[2] + ".";
		}

		return {error, dzrpVersion: dzrp_version, programName: program_name, machineType};
	}


	/**
	 * The last command sent. Closes the debug session.
	 */
	protected async sendDzrpCmdClose(): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_CLOSE, undefined, this.initCloseRespTimeoutTime);
	}


	/**
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	protected async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		// Get regs
		Log.log('sendDzrpCmdGetRegisters ->', JSON.stringify(Z80Registers.getCache() || {}));
		const regs = await this.sendDzrpCmd(DZRP.CMD_GET_REGISTERS);
		Log.log('sendDzrpCmdGetRegisters ----', Z80Registers.getCache() || "undefined");
		const pc = Utility.getWord(regs, 0);
		const sp = Utility.getWord(regs, 2);
		const af = Utility.getWord(regs, 4);
		const bc = Utility.getWord(regs, 6);
		const de = Utility.getWord(regs, 8);
		const hl = Utility.getWord(regs, 10);
		const ix = Utility.getWord(regs, 12);
		const iy = Utility.getWord(regs, 14);
		const af2 = Utility.getWord(regs, 16);
		const bc2 = Utility.getWord(regs, 18);
		const de2 = Utility.getWord(regs, 20);
		const hl2 = Utility.getWord(regs, 22);
		const r = regs[24];
		const i = regs[25];
		const im = regs[26];

		// Get slots
		const slotCount = regs[28];
		const slots = new Array<number>(slotCount);
		for (let i = 0; i < slotCount; i++)
			slots[i] = regs[29 + i];

		// Convert regs
		const regData = Z80RegistersClass.getRegisterData(
			pc, sp,
			af, bc, de, hl,
			ix, iy,
			af2, bc2, de2, hl2,
			i, r, im,
			slots);

		Log.log('sendDzrpCmdGetRegisters <-', Z80Registers.getCache() || "undefined");

		return regData;
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	protected async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_SET_REGISTER, [regIndex, value & 0xFF, value >>> 8]);
	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Addr64k The 64k address of breakpoint 1 or undefined if not used.
	 * @param bp2Addr64k The 64k address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
		let bp1Enabled = 1;
		let bp2Enabled = 1;
		if (bp1Addr64k == undefined) {
			bp1Enabled = 0;
			bp1Addr64k = 0;
		}
		if (bp2Addr64k == undefined) {
			bp2Enabled = 0;
			bp2Addr64k = 0;
		}
		await this.sendDzrpCmd(DZRP.CMD_CONTINUE, [
			bp1Enabled, bp1Addr64k & 0xFF, bp1Addr64k >>> 8,
			bp2Enabled, bp2Addr64k & 0xFF, bp2Addr64k >>> 8,
			AlternateCommand.CONTINUE,
			0 /*unused*/, 0 /*unused*/,
			0 /*unused*/, 0 /*unused*/
		]);
	}


	/**
	 * Sends the command to pause a running program.
	 */
	protected async sendDzrpCmdPause(): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_PAUSE);
	}


	/**
	 * Sends the command to add a breakpoint.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID. If the breakpoint could not be set it is set to 0.
	 */
	protected async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const bpAddress = bp.longAddress;	// A long address
		let condition = bp.condition;
		// Convert condition string to Buffer
		if (!condition)
			condition = '';
		const condBuf = Utility.getBufferFromString(condition);
		const data = await this.sendDzrpCmd(DZRP.CMD_ADD_BREAKPOINT, [bpAddress & 0xFF, (bpAddress >>> 8) & 0xFF, (bpAddress >>> 16) & 0xFF, ...condBuf]);
		bp.bpId = Utility.getWord(data, 0);
	}


	/**
	 * Sends the command to remove a breakpoint.
	 * @param bp The breakpoint to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const bpId = bp.bpId!;
		await this.sendDzrpCmd(DZRP.CMD_REMOVE_BREAKPOINT, [bpId & 0xFF, bpId >>> 8]);
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * I.e. you can watch whole memory areas.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		let accessCode = 0;
		if (access.indexOf('r') >= 0)
			accessCode += 0x01;
		if (access.indexOf('w') >= 0)
			accessCode += 0x02;
		await this.sendDzrpCmd(DZRP.CMD_ADD_WATCHPOINT, [
			address & 0xFF,
			(address >>> 8) & 0xFF,
			(address >>> 16) & 0xFF, // bank
			size & 0xFF, size >>> 8,
			accessCode
		]);
	}


	/**
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		let accessCode = 0;
		if (access.indexOf('r') >= 0)
			accessCode += 0x01;
		if (access.indexOf('w') >= 0)
			accessCode += 0x02;
		await this.sendDzrpCmd(DZRP.CMD_REMOVE_WATCHPOINT, [
			address & 0xFF,
			(address >>> 8) & 0xFF,
			(address >>> 16) & 0xFF, // bank
			size & 0xFF, size >>> 8,
			accessCode
		]);
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param addr64k The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(addr64k: number, size: number): Promise<Uint8Array> {
		let buffer;
		// Handle special case size=0x10000
		if (size == 0x10000 && addr64k == 0) {
			// Get 2 chunks of memory as 0x10000 is too big).
			const data0 = await this.readMemoryDump(0, 0x8000);
			const data1 = await this.readMemoryDump(0x8000, 0x8000);
			// Create UInt8Array
			buffer = new Uint8Array(0x10000);
			// Combine both buffers
			buffer.set(data0);
			buffer.set(data1, 0x8000);
		}
		else {
			// Send command to get memory dump
			const data = await this.sendDzrpCmd(DZRP.CMD_READ_MEM, [0,
				addr64k & 0xFF, addr64k >>> 8,
				size & 0xFF, size >>> 8]);
			// Create UInt8Array
			buffer = new Uint8Array(data);
		}
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param addr64k The memory start address.
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(addr64k: number, dataArray: Buffer | Uint8Array): Promise<void> {
		const data = Buffer.from(dataArray);
		await this.sendDzrpCmd(DZRP.CMD_WRITE_MEM, [0,
			addr64k & 0xFF, addr64k >>> 8,
			...data]);
	}


	/**
	 * Sends the command to write a memory bank.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
	 * @throws An exception if e.g. the bank size does not match.
	  */
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer | Uint8Array): Promise<void> {
		const resp = await this.sendDzrpCmd(DZRP.CMD_WRITE_BANK, [bank, ...dataArray]);
		const error = resp[0];
		let errorString;
		if (error != 0) {
			errorString = Utility.getStringFromBuffer(resp, 1);
			throw Error("sendDzrpCmdWriteBank: " + errorString);
		}
	}


	/**
	 * Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error. An error can only occur on real HW if the slot with dezogif is overwritten.
	  */
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
		const buffer = await this.sendDzrpCmd(DZRP.CMD_SET_SLOT,
			[slot, bank]);
		const error = buffer[0];
		return error;
	}


	/**
	 * Sends the command to read the current state of the machine.
	 * I.e. memory, registers etc.
	 * @returns A Promise with state data. Format is unknown (remote specific).
	 * Data will just be saved.
	  */
	public async sendDzrpCmdReadState(): Promise<Uint8Array> {
		const state_buffer = await this.sendDzrpCmd(DZRP.CMD_READ_STATE);
		const state_u8array = new Uint8Array(state_buffer);
		return state_u8array;
	}


	/**
	 * Sends the command to wite a previously saved state to the remote.
	 * I.e. memory, registers etc.
	 * @param stateData The state data. Format is unknown (remote specific).
	  */
	public async sendDzrpCmdWriteState(stateData: Uint8Array): Promise<void> {
		const data = Array.from(stateData);
		await this.sendDzrpCmd(DZRP.CMD_WRITE_STATE, data);
	}


	/**
	 * Returns the value of one TBBlue register.
	 * @param register  The Tbblue register.
	 * @returns A promise with the value.
	  */
	public async sendDzrpCmdGetTbblueReg(register: number): Promise<number> {
		const buffer = await this.sendDzrpCmd(DZRP.CMD_GET_TBBLUE_REG, [register]);
		return buffer[0];
	}


	/**
	 * Sends the command to get a sprites palette.
	 * @param index 0/1. The first or the second palette.
	 * @returns An array with 256 entries with the 9 bit color.
	 * Each entry is 2 byte.
	 * 1rst byte: rrrgggbb
	 * 2nd byte:  0000000b, lowest blue bit.
	   */
	public async sendDzrpCmdGetSpritesPalette(index: number): Promise<Array<number>> {
		const buffer = await this.sendDzrpCmd(DZRP.CMD_GET_SPRITES_PALETTE, [index]);
		const palette = new Array<number>(256);
		for (let i = 0; i < 256; i++) {
			const color = 256 * buffer[2 * i + 1] + buffer[2 * i];
			palette[i] = color;
		}
		return palette;
	}


	/**
	 * Sends the command to get a number of sprite attributes.
	 * @param index The index of the sprite.
	 * @param count The number of sprites to return.
	 * @returns An array with 5 byte attributes for each sprite.
	  */
	public async sendDzrpCmdGetSprites(index: number, count: number): Promise<Array<Uint8Array>> {
		const buffer = await this.sendDzrpCmd(DZRP.CMD_GET_SPRITES, [index, count]);
		Utility.assert(count * 5 == buffer.length);
		const sprites = new Array<Uint8Array>();
		let p = 0;
		for (let i = 0; i < count; i++) {
			const sprite = new Uint8Array(5);
			for (let i = 0; i < 5; i++) {
				sprite[i] = buffer[p++];
			}
			sprites.push(sprite);
		}
		return sprites;
	}


	/**
	 * Sends the command to retrieve sprite patterns.
	 * Retrieves only 256 byte patterns. If a 128 byte patterns is required
	 * the full 256 bytes are returned.
	 * @param index The index of the pattern [0-63]
	 * @param count The number of patterns [0-64]
	 * @returns A promise with an Array with the sprite pattern for each index.
	 */
	protected async sendDzrpCmdGetSpritePatterns(index: number, count: number): Promise<Array<Array<number>>> {
		// Send command to get memory dump
		const data = await this.sendDzrpCmd(DZRP.CMD_GET_SPRITE_PATTERNS, [index, count]);
		// Each pattern is 256 bytes, divide
		Utility.assert(data.length == 256 * count);
		const array = [...data];	// Convert to number array
		const patterns = Array<Array<number>>();
		for (let i = 0; i < count; i++) {
			const start = i * 256;
			const pattern = array.slice(start, start + 256);
			patterns.push(pattern);
		}
		return patterns;
	}


	/**
	 * Sends the command to get the sprites clipping window.
	 * @returns A Promise that returns the clipping dimensions (xl, xr, yt, yb).
	  */
	public async sendDzrpCmdGetSpritesClipWindowAndControl(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		const data = await this.sendDzrpCmd(DZRP.CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL);
		return {
			xl: data[0], xr: data[1], yt: data[2], yb: data[3], control: data[4]
		};
	}


	/**
	 * Sends the command to set the border.
	  */
	public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_SET_BORDER, [borderColor]);
	}


	/**
	 * Sends the command to set all breakpoints.
	 * For the ZXNext all breakpoints are set at once just before the
	 * next 'continue' is executed.
	 * @param bpAddresses The breakpoint addresses. Each 0x0000-0xFFFF.
	 * @returns A Promise with the memory contents from each breakpoint address.
	 */
	protected async sendDzrpCmdSetBreakpoints(bpAddresses: Array<number>): Promise<Array<number>> {
		// Create buffer from array
		const count = bpAddresses.length;
		const buffer = Buffer.alloc(3 * count);
		let i = 0;
		for (const addr of bpAddresses) {
			buffer[i++] = addr & 0xFF;
			buffer[i++] = (addr >>> 8) & 0xFF;
			buffer[i++] = (addr >>> 16) & 0xFF;
		}
		const opcodes = await this.sendDzrpCmd(DZRP.CMD_SET_BREAKPOINTS, buffer);
		return [...opcodes];
	}


	/**
	 * Sends the command to restore the memory for all breakpoints.
	 * This is send just after the 'continue' command.
	 * So that the user only sees correct memory contents even if doing
	 * a disassembly or memory read.
	 * It is also required otherwise the breakpoints in 'calcStep' are not correctly
	 * calculated.
	 * @param elems The addresses + memory content.
	 */
	protected async sendDzrpCmdRestoreMem(elems: Array<{address: number, value: number}>): Promise<void> {
		// Create buffer from array
		const count = elems.length;
		const buffer = Buffer.alloc(4 * count);
		let i = 0;
		for (const elem of elems) {
			const addr = elem.address;
			buffer[i++] = addr & 0xFF;
			buffer[i++] = (addr >>> 8) & 0xFF;
			buffer[i++] = (addr >>> 16) & 0xFF;
			buffer[i++] = elem.value;
		}
		await this.sendDzrpCmd(DZRP.CMD_RESTORE_MEM, buffer);
	}

	/** Sends the command to loopback data.
	 * Only used for testing.
	 * @param elems The addresses + memory content.
	 */
	protected async sendDzrpCmdLoopback(data: Buffer): Promise<Buffer> {
		const recData = await this.sendDzrpCmd(DZRP.CMD_LOOPBACK, data);
		return recData;
	}


	/**
	 * Sends the command to enable or disable the interrupts.
	 * @param enable true to enable, false to disable interrupts.
	 */
	protected async sendDzrpCmdInterruptOnOff(enable: boolean): Promise<void> {
		const on = enable ? 1 : 0;
		await this.sendDzrpCmd(DZRP.CMD_INTERRUPT_ON_OFF, [on]);
	}


	/**
	 * Sends the command to read from a port.
	 * @param port The port address.
	 * @returns The value read from the port.
	 */
	protected async sendDzrpCmdReadPort(port: number): Promise<number> {
		const data = await this.sendDzrpCmd(DZRP.CMD_READ_PORT, [port & 0xFF, port >>> 8]);
		return data[0];
	}


	/**
	 * Override.
	 * Sends the command to write to a port.
	 * @param port The port address.
	 * @param value the value to write.
	 */
	protected async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_WRITE_PORT, [port & 0xFF, port >>> 8, value]);
	}


	/**
	 * Sends Z80 to execute in the remote.
	 * The code needs no trailing RET.
	 * Returns registers AF, BC, DE, HL.
	 * @param code A buffer with the code to send.
	 * @returns An error code (0=no error). The registers AF, BC, DE, HL.
	 */
	protected async sendDzrpCmdExecAsm(code: Array<number>): Promise<{error: number, a: number, f: number, bc: number, de: number, hl: number}> {
		const data = await this.sendDzrpCmd(DZRP.CMD_EXEC_ASM, code);
		return {
			error: data[0],
			f: data[1],
			a: data[2],
			bc: data[3] + 256 * data[4],
			de: data[5] + 256 * data[6],
			hl: data[7] + 256 * data[8]
		};
	}


	/** Sends the command to get the supported commands of the remote.
	 * @returns a string with a character representing each command.
	 * E.g. "1001110": Right = index 0. Not supported: command 0,4,5.
	 * Supported: command 1,2,3,6.
	 */
	protected async sendDzrpCmdGetSupportedCommands(): Promise<string> {
		const data = await this.sendDzrpCmd(DZRP.CMD_GET_SUPPORTED_COMMANDS);
		let bitString = '';
		for (const value of data) {
			// Process each value if needed
			bitString = '_' + value.toString(2).padStart(8, '0') + bitString;
		}
		return bitString;
	}
}

