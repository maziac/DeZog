import {Log, LogTransport} from '../../log';
import {AlternateCommand, DzrpMachineType, DZRP, DZRP_VERSION, DZRP_PROGRAM_NAME} from '../dzrp/dzrpremote';
import {Z80Registers, Z80RegistersClass, Z80_REG} from '../z80registers';
import {Utility} from '../../misc/utility';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {BankInfo, MemoryModel, SlotRange} from '../MemoryModel/memorymodel';



/// Timeouts.
export const CONNECTION_TIMEOUT = 1000;	// 1 sec
const CHUNK_TIMEOUT = 1000;	// 1 sec




/**
 * A structure used to serialize the sent messages.
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


/**
 * Conversion of SendDzrpCmd... functions as buffer and parsing of received messages.
 *
 * All sendDzrpCmd... methods are implemented. I.e. all commands
 * create a buffer to send. The buffer sending itself (sendBuffer) is
 * not implemented. Therefore the class needs to be derived.
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
 */
export class DzrpBufferRemote extends DzrpQueuedRemote {

	// Sequence Number 1-255. Used for sending.
	protected sequenceNumber: number;

	// Timeout between sending command and receiving response.
	protected cmdRespTimeout?: NodeJS.Timeout;

	// The used timeout time. (ms)
	protected cmdRespTimeoutTime = 500;	// Will be overwritten.
	protected initCloseRespTimeoutTime = 900;	// Timeout for CMD_INIT and CMD_CLOSE. This is not configurable and depends on vscode internal times.

	// To collect received chunks.
	protected receivedData: Buffer;
	protected expectedLength: number;
	protected receivingHeader: boolean;

	// Timeout between data chunks
	protected chunkTimeout?: NodeJS.Timeout;


	/// Constructor.
	constructor() {
		super();
		this.sequenceNumber = 0;
		// Instantiate the message queue
		this.messageQueue = new Array<MessageBuffer>();
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Override this
	}


	/**
	 * Returns the next sequence number for sending
	 */
	public getNextSeqNo(): number {
		this.sequenceNumber++;
		if (this.sequenceNumber > 255)
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
		return new Promise<Buffer>(async (resolve, reject) => {
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

			// Try to send immediately
			if (this.messageQueue.length == 1)
				this.sendNextMessage();
		});
	}


	/**
	 * Called when data has been received.
	 */
	protected dataReceived(data: Buffer) {
		//LogSocket.log('dataReceived, count='+data.length);

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
			LogTransport.log('<<< Remote: Received, overLength=' + overLength);
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
				continueHandler({reasonNumber: type, longAddr, reasonString});
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
				this.emit('error', error);
				return;
			}
			data = data.subarray(1);  // Cut off seq number
			// Queue next message
			this.messageQueue.shift();
			this.sendNextMessage();
			// Pass received data to right consumer
			msg.resolve(data);
		}
	}


	/**
	 * Starts the chunk timeout.
	 */
	protected startChunkTimeout() {
		this.stopChunkTimeout();
		this.chunkTimeout = setTimeout(() => {
			const err = new Error('Socket chunk timeout.');
			// Log
			LogTransport.log('Error: ' + err.message);
			// Error
			this.emit('error', err);
		}, CHUNK_TIMEOUT);
	}


	/**
	 * Stops the chunk timeout.
	 */
	protected stopChunkTimeout() {
		if (this.chunkTimeout)
			clearTimeout(this.chunkTimeout);
		this.chunkTimeout = undefined;
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
	protected async sendDzrpCmdInit(): Promise<{error: string | undefined, programName: string, dzrpVersion: string, machineType: DzrpMachineType}> {
		const nameBuffer = Utility.getBufferFromString(DZRP_PROGRAM_NAME);
		const resp = await this.sendDzrpCmd(DZRP.CMD_INIT, [...DZRP_VERSION, ...nameBuffer], this.initCloseRespTimeoutTime);
		// Error
		let error;
		if (resp[0] != 0)
			error = "Remote returned an error code: " + resp[0];
		// DZRP Version
		const dzrp_version = "" + resp[1] + "." + resp[2] + "." + resp[3];
		// Get machine type
		const machineType = resp[4];
		// Program name
		const program_name = Utility.getStringFromBuffer(resp, 5);

		// Check version number. Check only major and minor number.
		// if (DZRP_VERSION[0] != resp[1]
		// 	|| DZRP_VERSION[1] != resp[2]) {
		// 	error = "DZRP versions do not match.\n";
		// 	error += "Required version is " + DZRP_VERSION[0] + "." + DZRP_VERSION[1] + ".\n";
		// 	error += "But this remote (" + program_name + ") supports only version " + resp[1] + "." + resp[2] + ".";
		// }

		// Check only major number (TODO: check if this is OK)
		if (DZRP_VERSION[0] != resp[1]) {
			error = "DZRP versions do not match.\n";
			error += "Required version is " + DZRP_VERSION[0] + "." + DZRP_VERSION[1] + ".\n";
			error += "But this remote (" + program_name + ") supports only version " + resp[1] + "." + resp[2] + ".";
		}

		return {error, dzrpVersion: dzrp_version, programName: program_name, machineType};
	}


	/**
	 * Only if CMD_INIT returns a CUSTOM_MEMORY_MODEL this command is sent.
	 * It retrieves the memory configuration of the target.
	 * Used by MAME.
	 * @returns The memory model.
	 */
	protected async sendDzrpCmdGetMemoryModel(): Promise<MemoryModel> {
		const data = await this.sendDzrpCmd(DZRP.CMD_GET_MEMORY_MODEL);
		let i = 0;

		// Read name
		const modelName = Utility.getStringFromBuffer(data, i);
		i += modelName.length + 1;

		// Read slot ranges
		const slotRanges: SlotRange[] = [];
		const bankInfos: (BankInfo|undefined)[] = [];
		const slotCount = data[i++];
		for (let s = 0; s < slotCount; s++) {
			const start = Utility.getWord(data, i);
			i += 2;
			const end = Utility.getWord(data, i);
			i += 2;
			// Banks for slot
			const banks = new Set<number>();
			const bankCount = data[i++];
			for (let b = 0; b < bankCount; b++) {
				banks.add(data[i++]);
			}
			// Create slot range
			slotRanges.push({start, end, banks});
		}

		// Bank infos
		const bankCount = data[i++];
		for (let b = 0; b < bankCount; b++) {
			// Name
			const name = Utility.getStringFromBuffer(data, i);
			i += name.length + 1;
			// Short name
			const shortName = Utility.getStringFromBuffer(data, i);
			i += shortName.length + 1;
			// Size of the bank
			const size = Utility.getWord(data, i);
			i += 2;
			// 0=UNKNOWN, 1=ROM, 2=RAM
			const bankType = data[i++];
			// Create bank info
			bankInfos[b] = {name, shortName, size, bankType};
		}

		// Create config
		const slotInfos: any[] = [];
		for (const slotRange of slotRanges) {
			const slotInfo = {
				range: [slotRange.start, slotRange.end],
				banks: new Array<any>()
			};
			for (const bankNumber of slotRange.banks) {
				const bankInfo: any = {index: bankNumber};
				const bank = bankInfos[bankNumber];
				if (bank) {
					// Add name and short name
					bankInfo.name = bank.name;
					bankInfo.shortName = bank.shortName;
					// Each bank need to be defined only once
					bankInfos[bankNumber] = undefined;
				}
				// Add to slot
				slotInfo.banks.push(bankInfo);
			}
			slotInfos.push(slotInfo);
		}

		// Create memory model
		const memModel = new MemoryModel({slots: slotInfos});
		console.log('memModel=' + memModel.getMemModelInfo());
		memModel.name = modelName;
		return memModel;
	}


	/**
	 * The last command sent. Closes the debug session.
	 */
	protected async sendDzrpCmdClose(): Promise<void> {
		try { // TODO: Remove try/catch
			console.log('sendDzrpCmdClose: start');
			await this.sendDzrpCmd(DZRP.CMD_CLOSE, undefined, this.initCloseRespTimeoutTime);
			console.log('sendDzrpCmdClose: end');
		}
		catch (e) {
			console.error("Failed to close debug session: " + e);
			throw e;
		}
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
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		return new Promise<Uint8Array>(async (resolve, reject) => {
			let buffer;
			// Handle special case size=0x10000
			if (size == 0x10000 && address == 0) {
				// Get 2 chunks of memory as 0x10000 is too big).
				const data0 = await this.sendDzrpCmd(DZRP.CMD_READ_MEM, [0,
					0, 0,
					0, 0x80]);
				const data1 = await this.sendDzrpCmd(DZRP.CMD_READ_MEM, [0,
					0, 0x80,
					0, 0x80]);
				//const data0 = await this.readMemoryDump(0, 0x8000);
				//const data1 = await this.readMemoryDump(0x8000, 0x8000);
				// Create UInt8Array
				buffer = new Uint8Array(0x10000);
				// Combine both buffers
				buffer.set(data0);
				buffer.set(data1, 0x8000);
			}
			else {
				// Send command to get memory dump
				const data = await this.sendDzrpCmd(DZRP.CMD_READ_MEM, [0,
					address & 0xFF, address >>> 8,
					size & 0xFF, size >>> 8]);
				// Create UInt8Array
				buffer = new Uint8Array(data);
			}
			resolve(buffer);
		});
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer | Uint8Array): Promise<void> {
		const data = Buffer.from(dataArray);
		await this.sendDzrpCmd(DZRP.CMD_WRITE_MEM, [0,
			address & 0xFF, address >>> 8,
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
	public async sendDzrpCmdGetSpritesClipWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
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

}

