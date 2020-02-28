//import * as assert from 'assert';
//import * as SerialPort from 'serialport';
import {DzrpParser, DZRP, DZRP_NTF} from './dzrpparser';
//import {ZxSimulationView} from '../zxsimulator/zxulascreenview';
import {Utility} from '../../utility';
import {ZxSimulatorRemote} from '../zxsimulator/zxsimremote';
import {GenericBreakpoint} from '../../genericwatchpoint';


let SerialPort;

/**
 * This class fakes the responses from real HW.
 * It is meant for testing/debugging purposes only.
 * To use it connect 2 USB/serial converters to your development PC
 * and connect RX with TX and TX with RX. I.e. loop the output of one to
 * the input of the other.
 */
export class SerialFake extends ZxSimulatorRemote {

	// The serial port. https://serialport.io/docs/guide-usage
	public serialPort;

	// The read parser for the serial port.
	public parser;

	// A map with breakpoint ID as key and breakpoint address/condition as value.
	protected breakpointsMap: Map<number, GenericBreakpoint>;


	/// Constructor.
	constructor() {
		super();
		this.breakpointsMap=new Map<number, GenericBreakpoint>();
	}


	/// Initializes the serial port.
	/// Asynchronous: returns when serial port opened.
	public async doInitialization(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Just in case
			if (this.serialPort&&this.serialPort.isOpen)
				this.serialPort.close();

			// Load the roms
			this.zxMemory.loadRom();

			// Open the serial port
			this.serialPort=new SerialPort("/dev/cu.usbserial-14620", {
				baudRate: 115200, autoOpen: false
			});

			// Create parser
			this.parser=this.serialPort.pipe(new DzrpParser({}, 'SerialFake'));

			// Handle errors
			this.parser.on('error', err => {
				console.log('Error: ', err);
			});

			// Install listener
			this.parser.on('data', data => {
				console.log('data SerialFake');
				this.receivedMsg(data);
			});

			// React on-open
			this.serialPort.on('open', async () => {
				console.log('Open SerialFake');
				// Open the ZX screen simulation view
				//this.zxSimulationView=new ZxSimulationView(this.zxMemory, this.zxPorts);
				this.emit('initialized')
				// Ready for first command
				resolve();
			});

			this.serialPort.on('close', async () => {
			});

			// Handle errors
			this.serialPort.on('error', err => {
				console.log('Error SerialFake: ', err.message);
			});

			// Open the serial port
			this.serialPort.open(err => {
				if (err) {
					console.log('Error SerialFake: ', err.message);
					// Error
					reject(err);
				}
			});
		});
	}


	/**
	 * Closes the serial port.
	 */
	public async close(): Promise<void> {
		return new Promise<void>(resolve => {
			//this.zxSimulationView.close();
			this.emit('closed')
			this.serialPort.close(() => {
				resolve();
			});
		});
	}


	/**
	 * Returns all registers from the CPU in an array.
	 */
	protected getRegValues(): number[] {
		const regs=[
			this.z80Cpu.pc&0xFF,
			this.z80Cpu.pc>>8,
			this.z80Cpu.sp&0xFF,
			this.z80Cpu.sp>>8,

			this.z80Cpu.r1.f,
			this.z80Cpu.r1.a,
			this.z80Cpu.r1.c,
			this.z80Cpu.r1.b,
			this.z80Cpu.r1.e,
			this.z80Cpu.r1.d,
			this.z80Cpu.r1.l,
			this.z80Cpu.r1.h,
			this.z80Cpu.r1.ixl,
			this.z80Cpu.r1.ixh,
			this.z80Cpu.r1.iyl,
			this.z80Cpu.r1.iyh,

			this.z80Cpu.r2.f,
			this.z80Cpu.r2.a,
			this.z80Cpu.r2.c,
			this.z80Cpu.r2.b,
			this.z80Cpu.r2.e,
			this.z80Cpu.r2.d,
			this.z80Cpu.r2.l,
			this.z80Cpu.r2.h,
			this.z80Cpu.r,
			this.z80Cpu.i,
		];
		return regs;
	}


	/**
	 * A DZRP command has been received and the response is sent.
	 */
	protected receivedMsg(data: Buffer) {
		// Check
		if (!data)
			return;
		if (data.length<2) {
			throw Error("Message too short: "+data);
		}
		// Check what has been received
		const seqno=data[0];
		const cmd=data[1];
		switch (cmd) {
			case DZRP.CMD_GET_CONFIG:
				this.sendDzrpResp(seqno, [0]);
				break;
			case DZRP.CMD_GET_REGISTERS:
				this.sendDzrpResp(seqno, this.getRegValues());
				break;
			case DZRP.CMD_SET_REGISTER:
				const reg=data[2];
				let value=data[3]|(data[4]<<8);
				this.setRegValue(reg, value);
				this.sendDzrpResp(seqno);
				break;
			case DZRP.CMD_WRITE_BANK:
				const bank=data[2];
				this.zxMemory.writeBank(bank, data.slice(3));
				this.sendDzrpResp(seqno);
				break;
			case DZRP.CMD_CONTINUE:
				{
					// Get the breakpoints
					let bp1=-1;	// unreachable
					let bp2=-1;
					const bp1Enabled=(data[2]!=0);
					if (bp1Enabled)
						bp1=data[3]+(data[4]<<8);
					const bp2Enabled=(data[5]!=0);
					if (bp2Enabled)
						bp2=data[6]+(data[7]<<8);

					// Respond
					this.sendDzrpResp(seqno);

					// Set the breakpoints array
					const pcBps=Array.from(this.breakpointsMap.values());
					this.tmpBreakpoints=this.createTemporaryBreakpoints(pcBps);

					// Function called after a break
					this.continueResolve=({breakReason, tStates, cpuFreq}) => {
						// Reconstruct breakReasonNumber from text
						let breakReasonNumber=255;
						switch (breakReason) {
							case undefined: breakReasonNumber=0; breakReason=''; break;
							case "Manual break": breakReasonNumber=1; breakReason=''; break;
							case "Breakpoint hit": breakReasonNumber=2; breakReason=''; break;
						}
						// Send Notification
						const ntfSeqNo=this.parser.getNextSeqNo();
						const breakBuffer=Utility.getBufferFromString(breakReason);
						this.sendDzrpNtf(ntfSeqNo, [DZRP_NTF.NTF_PAUSE, breakReasonNumber, 0, 0, ...breakBuffer]);
						this.continueResolve=undefined;
					};
					// Run the Z80-CPU in a loop
					this.cpuRunning=true;
					this.z80CpuContinue(bp1, bp2);
				}
				break;
			case DZRP.CMD_PAUSE:
				{
					// If running then pause
					this.cpuRunning=false;
					// Respond
					this.sendDzrpResp(seqno);
				}
				break;
			case DZRP.CMD_ADD_BREAKPOINT:
				{
					// Create a new breakpoint
					const bpAddress=Utility.getWord(data, 2);
					const bpCondition=Utility.getStringFromBuffer(data, 4);
					const bpId=this.createNewBreakpoint(bpAddress, bpCondition);
					// Respond
					this.sendDzrpResp(seqno, [bpId&0xFF, bpId>>8]);
				}
				break;
			case DZRP.CMD_REMOVE_BREAKPOINT:
				{
					// Get breakpoint ID
					const bpId=Utility.getWord(data, 2);
					// Remove it
					this.breakpointsMap.delete(bpId);
					this.sendDzrpResp(seqno, [bpId&0xFF, bpId>>8]);
				}
				break;
			case DZRP.CMD_READ_MEM:
				{
					// Get address and size
					const addr=Utility.getWord(data, 3);
					const size=Utility.getWord(data, 5);
					// Return memory data
					const mem=this.zxMemory.readBlock(addr, size);
					// Respond
					this.sendDzrpResp(seqno, new Buffer(mem));
				}
				break;
			case DZRP.CMD_WRITE_MEM:
				{
					// Get address
					const addr=Utility.getWord(data, 3);
					//const size=length-5;
					// Set memory data
					const mem: Uint8Array=data.slice(5);
					this.zxMemory.writeBlock(addr, mem);
					// Respond
					this.sendDzrpResp(seqno);
				}
				break;
			default:
				throw Error("Unknown command: "+cmd);
		}
	}


	/**
	 * Sends a DZRP notification.
	 * @param seqno The sequence number to use.
	 * @param data A buffer containing the data.
	 */
	protected async sendDzrpNtf(seqno: number, data?: Buffer|Array<number>): Promise<void> {
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
		buffer[1]=(len>>8)&0xFF;
		buffer[2]=(len>>16)&0xFF;
		buffer[3]=(len>>24)&0xFF;
		// Notification
		buffer[4]=0;
		buffer[5]=seqno;
		// Copy data
		data?.copy(buffer, 6);

		// Send data
		await this.serialPort.write(buffer);
	}


	/**
	 * Sends a DZRP response.
	 * @param seqno The sequence number to use.
	 * @param data A buffer containing the data.
	 */
	protected async sendDzrpResp(seqno: number, data?:Buffer|Array<number>): Promise<void>{
		// Calculate length
		let len=1;
		if(data) {
			if (Array.isArray(data))
				data=Buffer.from(data);	// Convert to Buffer if Array
			len+=data.length;
		}
		// Put length in buffer
		const totalLength=4+len;
		const buffer=Buffer.alloc(totalLength);
		// Encode length
		buffer[0]=len&0xFF;
		buffer[1]=(len>>8)&0xFF;
		buffer[2]=(len>>16)&0xFF;
		buffer[3]=(len>>24)&0xFF;
		// Put response ID in buffer
		buffer[4]=seqno;
		// Copy data
		data?.copy(buffer, 5);

		// Send data
		await this.serialPort.write(buffer);
	}


	/**
	 * Creates a new breakpoint.
	 * @param bpAddress The address to use for the breakpoint.
	 * @returns The new breakpoint ID.
	 */
	protected createNewBreakpoint(bpAddress: number, condition: string): number {
		this.lastBpId++;
		const gbp: GenericBreakpoint={bpId: this.lastBpId, address: bpAddress, condition: condition, log: undefined};
		this.breakpointsMap.set(this.lastBpId, gbp);
		return this.lastBpId;
	}
}

