import * as assert from 'assert';
import {DZRP, DzrpParser} from './dzrpparser';
import {LogSocket} from '../../log';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80RegistersClass, Z80_REG} from '../z80registers';
import {Utility} from '../../misc/utility';
import {BREAK_REASON_NUMBER} from '../remotebase';



/**
 * A structure used to serialize the sent messages.
 */
class MessageBuffer {
	// The buffer to send
	public buffer: Buffer;

	// The function to call when the response is received.
	public resolve: (Buffer) => void;
}


/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial connection with the ZX Next HW.
 */
export class ZxNextRemote extends DzrpRemote {

	// The message queue (used to serialize the sent messages).
	protected messageQueue: Array<MessageBuffer>;

	// The read parser for the serial port.
	protected parser: DzrpParser;


	/// Constructor.
	constructor() {
		super();
		// Instantiate the message queue
		this.messageQueue=new Array<MessageBuffer>();
		// Create parser
		this.parser=new DzrpParser({}, 'Dezog');
	}


	/// Override.
	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization() {
	}


	/**
	 * Override.
	 * Stops the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
	}


	/**
	 * Override.
	 * Terminates the emulator.
	 * This will disconnect the socket to zesarux and un-use all data.
	 * Called e.g. when the unit tests want to terminate the emulator.
	 * This will also send a 'terminated' event. I.e. the vscode debugger
	 * will also be terminated.
	 */
	public async terminate(): Promise<void> {
	}


	/**
	 * Sends a DZRP command and waits for the response.
	 * @param cmd The command.
	 * @param data A buffer containing the data.
	 * @returns The response is returned in the Promise.
	 */
	protected async sendDzrpCmd(cmd: number, data?: Buffer|Array<number>): Promise<Buffer> {
		return new Promise<Buffer>(async resolve => {
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
			const seqno=this.parser.getNextSeqNo();
			buffer[4]=seqno;
			// Put command in buffer
			buffer[5]=cmd;
			// Copy data
			data?.copy(buffer, 6);

			// Put into queue
			this.putIntoQueue(buffer, resolve);

			// Try to send immediately
			if (this.messageQueue.length==1)
				this.sendNextMessage();
		});
	}


	/**
	 * Puts a new message into the queue.
	 * @returns A Promise. The resolve/reject functions are stored in the messageQueue.
	 */
	protected putIntoQueue(buffer: Buffer, resolve:(Buffer) => void) {
		// Create new buffer entry
		const entry=new MessageBuffer();
		entry.buffer=buffer;
		entry.resolve=resolve;
		// Add to queue
		this.messageQueue.push(entry);
	}


	/**
	 * If messageQueue is empty returnes immediately.
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
			// Log
			const seqno=msg.buffer[4];
			const cmd: DZRP=msg.buffer[5];
			const cmdName=DZRP[cmd];
			LogSocket.log('>>> '+cmdName+' (seqno='+seqno+')', msg.buffer[0]);
			await this.sendBuffer(msg.buffer);
			console.log("SENT ", msg.buffer[5], "SeqNo=", msg.buffer[4]);
		}
		catch (error) {
			console.log("SENT ERROR.");
			this.emit('error', error);
		}
	}


	/**
	 * Override.
	 * Writes the buffer to the serial port.
	 */
	protected async sendBuffer(buffer: Buffer): Promise<void> {
		assert(false);
	}


	/**
	 * A DZRP response has been received.
	 * It there are still messages in the queue the next message is sent.
	 */
	protected receivedMsg(data: Buffer) {
		// Safety check
		assert(data);
		// Log
		const recSeqno=data[0];
		const respName=(recSeqno==0)? "Notification":"Response";
		LogSocket.log('<< '+respName+' (seqno='+recSeqno+')', data);

		// Check for notification
		if (recSeqno==0) {
			// Notification.
			const breakNumber=data[3];
			const breakData=Utility.getWord(data, 4);
			/*
			// Check if called by step-out.
			if (this.stepOutHandler) {
				this.stepOutHandler(breakReasonNumber);
			}
			*/
			// Call resolve of 'continue'
			if (this.continueResolve) {
				const continueHandler=this.continueResolve;
				this.continueResolve=undefined;
				// Get reason string
				let breakReasonString=Utility.getStringFromBuffer(data, 6);
				if (breakReasonString.length==0)
					breakReasonString=undefined as any;
				// If no error text ...
				if (!breakReasonString) {
					// Add generic error text
					switch (breakNumber) {
						case 1:
							breakReasonString="Manual break"
							break;
						case 2:
							breakReasonString="Breakpoint hit"
							break;
					}
				}

				// Adds breakReasonNumber (as number) if consumer is step-out.
				assert((breakNumber==BREAK_REASON_NUMBER.NO_REASON&&breakReasonString==undefined)
					||(breakNumber!=BREAK_REASON_NUMBER.NO_REASON&&breakReasonString!=undefined));
				continueHandler({breakNumber, breakData, breakReasonString});
			}
		}
		else {
			// Get latest sent message
			const msg=this.messageQueue[0];
			assert(msg);
			// Get sequence number
			const seqno=msg.buffer[4];
			// Check response
			if (recSeqno!=seqno) {
				const error=Error("Received wrong SeqNo. '"+recSeqno+"' instead of expected '"+seqno+"'");
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
	 * Sends the command to get the configuration.
	 * @returns The configuration, e.g. '{xNextRegs: true}'
	 */
	protected async sendDzrpCmdGetConfig(): Promise<{zxNextRegs: boolean}> {
		const resp=await this.sendDzrpCmd(DZRP.CMD_GET_CONFIG);
		// Check configuration
		const zxNextRegs: boolean=((resp[0]&0x01)!=0);
		return {zxNextRegs};
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
		const im=regs[24];
		const i=regs[26];
		const r=regs[27];

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
	 * @param bpAddress The breakpoint address. 0x0000-0xFFFF.
	 * @param condition The breakpoint condition as string. If there is n condition
	 * 'condition' may be undefined or an empty string ''.
	 * @returns A Promise with the breakpoint ID (1-65535) or 0 in case
	 * no breakpoint is available anymore.
	 */
	protected async sendDzrpCmdAddBreakpoint(bpAddress: number, condition?: string): Promise<number> {
		// Convert condition string to Buffer
		if (!condition)
			condition='';
		const condBuf=Utility.getBufferFromString(condition);
		const data=await this.sendDzrpCmd(DZRP.CMD_ADD_BREAKPOINT, [bpAddress&0xFF, bpAddress>>>8, ...condBuf]);
		const bpId=Utility.getWord(data, 0);
		return bpId;
	}


	/**
	 * Sends the command to remove a breakpoint.
	 * @param bpId The breakpoint ID to remove.
	 */
	protected async sendDzrpCmdRemoveBreakpoint(bpId: number): Promise<void> {
		await this.sendDzrpCmd(DZRP.CMD_REMOVE_BREAKPOINT, [bpId&0xFF, bpId>>>8]);
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
	public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer|Uint8Array) {
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
	 * Sends the command to read the current state of the machine.
	 * I.e. memory, registers etc.
	 * @returns A Promise with state data. Format is unknown (remote specific).
	 * Data will just be saved.
 	*/
	public async sendDzrpCmdReadState(): Promise<Uint8Array> {
		assert(false);
		return new Uint8Array();
	}


	/**
	 * Sends the command to wite a previously saved state to the remote.
	 * I.e. memory, registers etc.
	 * @param The state data. Format is unknown (remote specific).
 	*/
	public async sendDzrpCmdWriteState(stateData: Uint8Array): Promise<void> {
		assert(false);
	}
}

