import {LogSocket} from '../../log';
import {DzrpRemote, AlternateCommand} from '../dzrp/dzrpremote';
import {Z80RegistersClass, Z80_REG, Z80Registers, Z80RegistersStandardDecoder} from '../z80registers';
import {Utility} from '../../misc/utility';
import {DZRP, DZRP_VERSION, DZRP_PROGRAM_NAME} from '../dzrp/dzrpremote';
import {GenericBreakpoint} from '../../genericwatchpoint';



/// Timeouts.
export const CONNECTION_TIMEOUT=1000;	///< 1 sec
const CHUNK_TIMEOUT=1000;	///< 1 sec
//const QUIT_TIMEOUT=1000;	///< 1 sec




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
 * All sendDzrpCmd... methods are implemented. I.e. all commands are
 * create a buffer to send. The buffer sending itself (sendBuffer) is
 * not implemented. Therefore the class needs to be derived.
 *
 * It receives the requests from the DebugSesssionClass and
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
export class DzrpBufferRemote extends DzrpRemote {

	// The message queue (used to serialize the sent messages).
	protected messageQueue: Array<MessageBuffer>;

	// Sequence Number 1-255. Used for sending.
	protected sequenceNumber: number;

	// Timeout between sending command and receiving response.
	protected cmdRespTimeout?: NodeJS.Timeout;

	// The used timeout time.
	protected cmdRespTimeoutTime=500;	// Will be overwritten.
	protected initCloseRespTimeoutTime=900;	// Timeout for CMD_INIT and CMD_CLOSE. This is not configurable and depends on vscode internal times.

	// To collect received chunks.
	protected receivedData: Buffer;
	protected expectedLength: number;
	protected receivingHeader: boolean;

	// Timeout between data chunks
	protected chunkTimeout?: NodeJS.Timeout;


	/// Constructor.
	constructor() {
		super();
		this.sequenceNumber=0;
		// Instantiate the message queue
		this.messageQueue=new Array<MessageBuffer>();
		// Set decoder
		Z80Registers.decoder=new Z80RegistersStandardDecoder();
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void>  {
	}


	/**
	 * Override if needed.
	 * This will disconnect the socket and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		try {
			await this.sendDzrpCmdClose();
		}
		catch {};
	}


	/**
	 * Starts the command/response timeout.
	 * If the timer elapses a warning is shown.
	 * The message is removed from the message queue.
	 * It is normal that this e.g. happens if a ZX Next is connected and has a running
	 * (non-paused) program. In that case the UART is not configured for the joy ports
	 * and is not able to receive anything at all.
	 * @param respTimeoutTime The response timeout.
	 */
	protected startCmdRespTimeout(respTimeoutTime: number) {
		this.stopCmdRespTimeout();
		this.cmdRespTimeout=setTimeout(() => {
			this.stopCmdRespTimeout();
			const err=new Error('No response received.');
			// Log
			LogSocket.log('Warning: '+err.message);
			// Show warning
			this.emit('warning', err.message);
			// Remove message / Queue next message
			const msg=this.messageQueue.shift()!;
			this.sendNextMessage();
			// Pass error data to right consumer
			msg.reject(err);
		}, respTimeoutTime);
	}


	/**
	 * Stops the command/response timeout.
	 */
	protected stopCmdRespTimeout() {
		if (this.cmdRespTimeout)
			clearTimeout(this.cmdRespTimeout);
		this.cmdRespTimeout=undefined;
	}


	/**
	 * Returns the next sequence number for sending
	 */
	public getNextSeqNo(): number {
		this.sequenceNumber++;
		if (this.sequenceNumber>255)
			this.sequenceNumber=1;
		return this.sequenceNumber;
	}


	/**
	 * Sends a DZRP command and waits for the response.
	 * @param cmd The command.
	 * @param data A buffer containing the data.
	 * @param respTimeoutTime The response timeout. Undefined=use default.
	 * @returns The response is returned in the Promise.
	 */
	protected async sendDzrpCmd(cmd: DZRP, data?: Buffer|Array<number>, respTimeoutTime?: number): Promise<Buffer> {
		return new Promise<Buffer>(async (resolve, reject) => {
			// Calculate length
			let len=2;
			if (data) {
				if (Array.isArray(data))
					data=Buffer.from(data);	// Convert to Buffer if Array
				len+=data.length;
			}
			// Put length in buffer
			const totalLength=4+len;
			const buffer=Buffer.alloc(totalLength);
			// Encode length
			buffer[0]=len&0xFF;
			buffer[1]=(len>>>8)&0xFF;
			buffer[2]=(len>>>16)&0xFF;
			buffer[3]=(len>>>24)&0xFF;
			// Put sequence number in buffer
			const seqno=this.getNextSeqNo();
			buffer[4]=seqno;
			// Put command in buffer
			buffer[5]=cmd;
			// Copy data
			data?.copy(buffer, 6);

			// Put into queue
			if (respTimeoutTime==undefined)
				respTimeoutTime=this.cmdRespTimeoutTime;
			this.putIntoQueue(buffer, respTimeoutTime, resolve, reject);

			// Try to send immediately
			if (this.messageQueue.length==1)
				this.sendNextMessage();
		});
	}


	/**
	 * Puts a new message into the queue.
	 * @param buffer The buffer to send.
	 * @param respTimeoutTime The response timeout.
	 * @param resolve Called with the data when a response is received.
	 * @param reject Called when the command/response timeout elapses.
	 * @returns A Promise. The resolve/reject functions are stored in the messageQueue.
	 */
	protected putIntoQueue(buffer: Buffer, respTimeoutTime: number, resolve: (buffer) => void, reject:(error) => void) {
		// Create new buffer entry
		const entry=new MessageBuffer();
		entry.buffer=buffer;
		entry.respTimeoutTime=respTimeoutTime;
		entry.resolve=resolve;
		entry.reject=reject;
		// Add to queue
		this.messageQueue.push(entry);
	}


	/**
	 * If messageQueue is empty returns immediately.
	 * Otherwise the first message in the queue is sent.
	 */
	protected async sendNextMessage(): Promise<void> {
		if (this.messageQueue.length==0)
			return;

		// Get next message from buffer
		const msg=this.messageQueue[0];
		if (!msg)
			return;

		try {
			this.startCmdRespTimeout(msg.respTimeoutTime);
			await this.sendBuffer(msg.buffer);
		}
		catch (error) {
			LogSocket.log("SENT ERROR.");
			console.log("SENT ERROR.");
			this.emit('error', error);
		}
	}


	/**
	 * Override.
	 * Writes the buffer to the serial port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		Utility.assert(false);
	}


	/**
	 * Called when data has been received.
	 */
	protected dataReceived(data: Buffer) {
		//LogSocket.log('dataReceived, count='+data.length);

		// Add data to existing buffer
		this.receivedData=Buffer.concat([this.receivedData, data]);

		if (this.receivedData.length>0) {
			// Check if still data to receive
			if (this.receivedData.length<this.expectedLength) {
				this.startChunkTimeout();
				return;	// Wait for more
			}

			// Check length
			if (this.receivingHeader) {
				// Header has been received, read length
				const buffer=this.receivedData;
				let recLength=buffer[0];
				recLength+=buffer[1]*256;
				recLength+=buffer[2]*256*256;
				recLength+=buffer[3]*256*256*256;
				this.expectedLength=recLength+4;
				this.receivingHeader=false;
				// Check if all payload has been received
				if (this.receivedData.length<this.expectedLength) {
					this.startChunkTimeout();
					return;	// Wait for more
				}
			}

			// Complete message received.
			this.stopChunkTimeout();

			// Strip length
			const length=this.expectedLength-4;
			const strippedBuffer=new Buffer(length);
			this.receivedData.copy(strippedBuffer, 0, 4, this.expectedLength);

			// Log
			const txt=this.dzrpRespBufferToString(this.receivedData);
			LogSocket.log('<<< Remote: Received '+txt);

			// Handle received buffer
			this.receivedMsg(strippedBuffer);

			// Prepare next buffer. Copy to many received bytes.
			const overLength=this.receivedData.length-this.expectedLength;
			Utility.assert(overLength>=0);
			this.receivingHeader=true;
			if (overLength==0) {
				this.expectedLength=4;
				this.receivedData=new Buffer(0);
				return;
			}

			// More data has been received
			const nextBuffer=new Buffer(overLength);
			this.receivedData.copy(nextBuffer, 0, this.expectedLength);
			this.receivedData=new Buffer(0);
			// Call again
			this.expectedLength=4;
			this.dataReceived(nextBuffer);
		}
	}


	/**
	 * A DZRP response has been received.
	 * It there are still messages in the queue the next message is sent.
	 */
	protected receivedMsg(data: Buffer) {
		// Safety check
		Utility.assert(data);
		// Log
		const recSeqno=data[0];
		//const respName=(recSeqno==0)? "Notification":"Response";
		//LogSocket.log('<<< '+respName+' (seqno='+recSeqno+')', data);

		// Check for notification
		if (recSeqno==0) {
			// Notification.
			const breakNumber=data[2];
			const breakAddress=Utility.getWord(data, 3);
			// Call resolve of 'continue'
			if (this.continueResolve) {
				const continueHandler=this.continueResolve;
				this.continueResolve=undefined;
				// Get reason string
				let breakReasonString=Utility.getStringFromBuffer(data, 5);
				if (breakReasonString.length==0)
					breakReasonString=undefined as any;

				// Handle the break
				continueHandler({breakNumber, breakAddress, breakReasonString});
			}
		}
		else {
			// Stop timeout
			this.stopCmdRespTimeout();
			// Get latest sent message
			const msg=this.messageQueue[0];
			Utility.assert(msg);
			// Get sequence number
			const seqno=msg.buffer[4];
			// Check response
			if (recSeqno!=seqno) {
				const error=Error("Received wrong SeqNo. '"+recSeqno+"' instead of expected '"+seqno+"'");
				LogSocket.log("Error: "+error);
				this.emit('error', error);
				return;
			}
			data=data.subarray(1);  // Cut off seq number
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
		this.chunkTimeout=setTimeout(() => {
			const err=new Error('Socket chunk timeout.');
			// Log
			LogSocket.log('Error: '+err.message);
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
		this.chunkTimeout=undefined;
	}


	/**
	 * Creates a string out of a DZRP command.
	 * Meant for debugging.
	 */
	public dzrpCmdBufferToString(buffer: Buffer, index=0): string {
		const count=buffer.length-index;
		let text="";
		if (count>=6) {
			const length=buffer[index]+256*buffer[index+1]+256*256*buffer[index+2]+256*256*256*buffer[index+3];
			const lengthString=""+buffer[index]+" "+buffer[index+1]+" "+buffer[index+2]+" "+buffer[index+3];
			const seqno=buffer[index+4];
			const cmd=buffer[index+5];
			let cmdString
			try {
				cmdString=DZRP[cmd];
			}
			catch {
				cmdString="Unknown("+cmd.toString()+")";
			}
			text+="Command "+cmdString+"\n";
			text+="  Length: "+length+" ("+lengthString+")\n";
			text+="  SeqNo:  "+seqno+"\n";
			text+="  Cmd:    "+cmd+"\n";
			index+=6;
		}
		// Rest of data
		const dataString=Utility.getStringFromData(buffer, index);
		text+="  Data:   "+dataString+"\n";
		return text;
	}


	/**
	 * Creates a string out of a DZRP response.
	 * Also handles the notification.
	 * Meant for debugging.
	 */
	public dzrpRespBufferToString(buffer: Buffer, index=0): string {
		const count=buffer.length-index;
		let text="";
		if (count>=5) {
			const length=buffer[index]+256*buffer[index+1]+256*256*buffer[index+2]+256*256*256*buffer[index+3];
			const lengthString=""+buffer[index]+" "+buffer[index+1]+" "+buffer[index+2]+" "+buffer[index+3];
			const seqno=buffer[index+4];
			if(seqno==0)
				text+="Notification:\n";
			else
				text+="Response:\n";
			text+="  Length: "+length+" ("+lengthString+")\n";
			text+="  SeqNo:  "+seqno+"\n";
			index+=5;
		}
		// Rest of data
		const dataString=Utility.getStringFromData(buffer, index);
		text+="  Data:   "+dataString+"\n";
		return text;
	}


	//------- Send Commands -------

	/**
	 * Sends the command to init the remote.
	 * @returns The error, program name (incl. version) and dzrp version.
	 * error is 0 on success. 0xFF if version numbers not match.
	 * Other numbers indicate an error on remote side.
	 */
	protected async sendDzrpCmdInit(): Promise<{error: string|undefined, programName: string, dzrpVersion: string}> {
		const nameBuffer=Utility.getBufferFromString(DZRP_PROGRAM_NAME);
		const resp=await this.sendDzrpCmd(DZRP.CMD_INIT, [...DZRP_VERSION, ...nameBuffer], this.initCloseRespTimeoutTime);
		let error;
		if (resp[0]!=0)
			error="Remote returned an error code: "+resp[0];
		const dzrp_version=""+resp[1]+"."+resp[2]+"."+resp[3];
		let program_name=Utility.getStringFromBuffer(resp, 4);
		if (!program_name)
			program_name="Unknown";
		// Check version number. Check only major and minor number.
		if (DZRP_VERSION[0]!=resp[1]
			||DZRP_VERSION[1]!=resp[2]) {
			error="DZRP versions do not match.\n";
			error+="Required version is "+DZRP_VERSION[0]+"."+DZRP_VERSION[1]+".\n";
			error+="But this remote ("+program_name+") supports only version "+resp[1]+"."+resp[2]+".";
		}
		return {error, dzrpVersion: dzrp_version, programName: program_name};
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
		const regs=await this.sendDzrpCmd(DZRP.CMD_GET_REGISTERS);
		const pc=Utility.getWord(regs, 0);
		const sp=Utility.getWord(regs, 2);
		const af=Utility.getWord(regs, 4);
		const bc=Utility.getWord(regs, 6);
		const de=Utility.getWord(regs, 8);
		const hl=Utility.getWord(regs, 10);
		const ix=Utility.getWord(regs, 12);
		const iy=Utility.getWord(regs, 14);
		const af2=Utility.getWord(regs, 16);
		const bc2=Utility.getWord(regs, 18);
		const de2=Utility.getWord(regs, 20);
		const hl2=Utility.getWord(regs, 22);
		const r=regs[24];
		const i=regs[25];
		const im=regs[26];

		// Convert regs
		const regData=Z80RegistersClass.getRegisterData(
			pc, sp,
			af, bc, de, hl,
			ix, iy,
			af2, bc2, de2, hl2,
			i, r, im);

		return regData;
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	protected async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_SET_REGISTER, [regIndex, value&0xFF, value>>>8]);
	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	protected async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {
		let bp1Enabled=1;
		let bp2Enabled=1;
		if (bp1Address==undefined) {
			bp1Enabled=0;
			bp1Address=0;
		}
		if (bp2Address==undefined) {
			bp2Enabled=0;
			bp2Address=0;
		}
		await this.sendDzrpCmd(DZRP.CMD_CONTINUE, [
			bp1Enabled, bp1Address&0xFF, bp1Address>>>8,
			bp2Enabled, bp2Address&0xFF, bp2Address>>>8,
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
		const bpAddress=bp.address;
		let condition=bp.condition;
		// Convert condition string to Buffer
		if (!condition)
			condition='';
		const condBuf=Utility.getBufferFromString(condition);
		const data=await this.sendDzrpCmd(DZRP.CMD_ADD_BREAKPOINT, [bpAddress&0xFF, bpAddress>>>8, ...condBuf]);
		bp.bpId=Utility.getWord(data, 0);
	}


	/**
	 * Sends the command to remove a breakpoint.
	 * @param bp The breakpoint to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const bpId=bp.bpId!;
		await this.sendDzrpCmd(DZRP.CMD_REMOVE_BREAKPOINT, [bpId&0xFF, bpId>>>8]);
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * I.e. you can watch whole memory areas.
	 * @param condition The watchpoint condition as string. If there is n0 condition
	 * 'condition' may be undefined or an empty string ''.
	 */
	protected async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string, condition: string): Promise<void> {
		// Convert condition string to Buffer
		if (!condition)
			condition='';
		const condBuf=Utility.getBufferFromString(condition);
		let accessCode=0;
		if (access.indexOf('r')>=0)
			accessCode+=0x01;
		if (access.indexOf('w')>=0)
			accessCode+=0x02;
		await this.sendDzrpCmd(DZRP.CMD_ADD_WATCHPOINT, [
			address&0xFF, address>>>8,
			size&0xFF, size>>>8,
			accessCode,
			...condBuf,
		]);
	}


	/**
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_REMOVE_WATCHPOINT, [
			address&0xFF, address>>>8,
			size&0xFF, size>>>8
		]);
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	protected async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		// Send command to get memory dump
		const data=await this.sendDzrpCmd(DZRP.CMD_READ_MEM, [0,
			address&0xFF, address>>>8,
			size&0xFF, size>>>8]);
		// Create UInt8array
		const buffer=new Uint8Array(data);
		return buffer;
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer|Uint8Array): Promise<void> {
		const data=Buffer.from(dataArray);
		await this.sendDzrpCmd(DZRP.CMD_WRITE_MEM, [0,
			address&0xFF, address>>>8,
			...data]);
	}


	/**
	 * Sends the command to write a memory bank.
	 * @param bank 8k memory bank number.
	 * @param dataArray The data to write.
 	*/
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer|Uint8Array): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_WRITE_BANK, [bank, ...dataArray]);
	}


	/**
	 * Sends the command to read the slot/bank associations (8k banks).
	 * @returns A Promise with an number array of 8 slots.
	 *  Each entry contains the correspondent bank number.
 	*/
	public async sendDzrpCmdGetSlots(): Promise<number[]> {
		const buffer=await this.sendDzrpCmd(DZRP.CMD_GET_SLOTS);
		const slots=[...buffer];
		return slots;
	}


	/**
	 * Sends the command to set a slot/bank associations (8k banks).
	 * @param slot The slot to set
	 * @param bank The 8k bank to associate the slot with.
	 * @returns A Promise with an error. An error can only occur on real HW if the slot with dezogif is overwritten.
 	*/
	public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
		const buffer=await this.sendDzrpCmd(DZRP.CMD_SET_SLOT,
			[slot, bank]);
		const error=buffer[0];
		return error;
	}


	/**
	 * Sends the command to read the current state of the machine.
	 * I.e. memory, registers etc.
	 * @returns A Promise with state data. Format is unknown (remote specific).
	 * Data will just be saved.
 	*/
	public async sendDzrpCmdReadState(): Promise<Uint8Array> {
		Utility.assert(false);
		return new Uint8Array();
	}


	/**
	 * Sends the command to wite a previously saved state to the remote.
	 * I.e. memory, registers etc.
	 * @param The state data. Format is unknown (remote specific).
 	*/
	public async sendDzrpCmdWriteState(stateData: Uint8Array): Promise<void> {
		Utility.assert(false);
	}


	/**
	 * Returns the value of one TBBlue register.
	 * @param register  The Tbblue register.
	 * @returns A promise with the value.
 	*/
	public async sendDzrpCmdGetTbblueReg(register: number): Promise<number> {
		const buffer=await this.sendDzrpCmd(DZRP.CMD_GET_TBBLUE_REG, [register]);
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
		const buffer=await this.sendDzrpCmd(DZRP.CMD_GET_SPRITES_PALETTE, [index]);
		const palette=new Array<number>(256);
		for (let i=0; i<256; i++) {
			const color=256*buffer[2*i+1]+buffer[2*i];
			palette[i]=color;
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
		const buffer=await this.sendDzrpCmd(DZRP.CMD_GET_SPRITES, [index, count]);
		Utility.assert(count*5==buffer.length);
		const sprites=new Array<Uint8Array>();
		let p=0;
		for (let i=0; i<count; i++) {
			const sprite=new Uint8Array(5);
			for (let i=0; i<5; i++) {
				sprite[i]=buffer[p++];
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
		const data=await this.sendDzrpCmd(DZRP.CMD_GET_SPRITE_PATTERNS, [index, count]);
		// Each pattern is 256 bytes, divide
		Utility.assert(data.length==256*count);
		const array=[...data];	// Convert to number array
		const patterns=Array<Array<number>>();
		for (let i=0; i<count; i++) {
			const start=i*256;
			const pattern=array.slice(start, start+256);
			patterns.push(pattern);
		}
		return patterns;
	}


	/**
	 * Sends the command to get the sprites clipping window.
	 * @returns A Promise that returns the clipping dimensions (xl, xr, yt, yb).
 	*/
	public async sendDzrpCmdGetSpritesClipWindow(): Promise<{xl: number, xr: number, yt: number, yb: number, control: number}> {
		const data=await this.sendDzrpCmd(DZRP.CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL);
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

}

