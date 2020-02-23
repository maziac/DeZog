//import * as assert from 'assert';
//import {Z80Registers} from '../z80registers';
import * as SerialPort from 'serialport';
import {DzrpParser, DZRP, DZRP_NTF} from './dzrpparser';
import {Z80_REG} from '../z80registers';
import {ZxMemory} from '../zxsimulator/zxmemory';
import {ZxPorts} from '../zxsimulator/zxports';
import {Z80Cpu} from '../zxsimulator/z80cpu';
import {ZxSimulationView} from '../zxsimulator/zxulascreenview';
import {Utility} from '../../utility';
//import {Utility} from '../../utility';



/**
 * This class fakes the responses from real HW.
 * It is meant for testing/debugging purposes only.
 * To use it connect 2 USB/serial converters to your development PC
 * and connect RX with TX and TX with RX. I.e. loop the output of one to
 * the input of the other.
 */
export class SerialFake {

	// The serial port. https://serialport.io/docs/guide-usage
	public serialPort;

	// The read parser for the serial port.
	public parser;

	// For emulation of the CPU.
	protected z80Cpu: any;	// Z80Cpu
	protected zxMemory: ZxMemory;
	protected zxPorts: ZxPorts;
	protected zxSimulationView: ZxSimulationView;

	// A map with breakpoint ID as key and breakpoint address as value.
	protected breakpointsMap: Map<number, number>;

	// A temporary array with the set breakpoints.
	protected breakpoints: Array<number>;

	// The last used breakpoint ID.
	protected lastBpId: number;

	// Set to true as long as the CPU is running.
	protected cpuRunning: boolean;

	/// Constructor.
	constructor() {
		// Create a Z80 CPU to emulate Z80 behaviour
		this.zxMemory=new ZxMemory();
		this.zxPorts=new ZxPorts();
		this.z80Cpu=new Z80Cpu(this.zxMemory, this.zxPorts, false);
		this.cpuRunning=false;
		this.breakpointsMap=new Map<number, number>();
		this.lastBpId=0;
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
				this.zxSimulationView=new ZxSimulationView(this.zxMemory, this.zxPorts);
				this.zxSimulationView.update();
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
			this.zxSimulationView.close();
			this.serialPort.close(() => {
				resolve();
			});
		});
	}


	/**
	 * Helper method to set a WORD from two successing indices in the
	 * given buffer. (Little endian)
	 * @param buffer The buffer to use.
	 * @param index The index into the buffer.
	 * @param value buffer[index] = value&0xFF; buffer[index+1] = value>>8;
	 */
	protected setWord(buffer: Buffer, index: number, value: number) {
		buffer[index]=value&0xFF;
		buffer[index+1]=value>>8;
	}


	/**
	 * Helper method to return a WORD from two successing indices in the
	 * given buffer. (Little endian)
	 * @param buffer The buffer to use.
	 * @param index The index into the buffer.
	 * @return buffer[index] + (buffer[index+1]<<8)
	 */
	protected getWord(buffer: Buffer, index: number): number {
		const value=buffer[index]+(buffer[index+1]<<8);
		return value;
	}


	/**
	 * Gets a specific register value.
	 * @param reg E.g. Z80_REG.PC or Z80_REG.A
	 * @return The value of the register.
	 */
	/*
	protected getRegister(reg: Z80_REG) {
		// Set register in z80 cpu
		switch (reg) {
			case Z80_REG.PC:
				return this.z80Cpu.pc;
			case Z80_REG.SP:
				return this.z80Cpu.sp;
			case Z80_REG.AF:
				return this.z80Cpu.r1.af;
			case Z80_REG.BC:
				return this.z80Cpu.r1.bc;
			case Z80_REG.DE:
				return this.z80Cpu.r1.de;
			case Z80_REG.HL:
				return this.z80Cpu.r1.hl;
			case Z80_REG.IX:
				return this.z80Cpu.r1.ix;
			case Z80_REG.IY:
				return this.z80Cpu.r1.iy;
			case Z80_REG.AF2:
				return this.z80Cpu.r2.af;
			case Z80_REG.BC2:
				return this.z80Cpu.r2.bc;
			case Z80_REG.DE2:
				return this.z80Cpu.r2.de;
			case Z80_REG.HL2:
				return this.z80Cpu.r2.hl;

			case Z80_REG.F:
				return this.z80Cpu.r1.f;
			case Z80_REG.A:
				return this.z80Cpu.r1.a;
			case Z80_REG.C:
				return this.z80Cpu.r1.c;
			case Z80_REG.B:
				return this.z80Cpu.r1.b;
			case Z80_REG.E:
				return this.z80Cpu.r1.e;
			case Z80_REG.D:
				return this.z80Cpu.r1.d;
			case Z80_REG.L:
				return this.z80Cpu.r1.l;
			case Z80_REG.H:
				return this.z80Cpu.r1.h;
			case Z80_REG.IXL:
				return this.z80Cpu.r1.ixl;
			case Z80_REG.IXH:
				return this.z80Cpu.r1.ixh;
			case Z80_REG.IYL:
				return this.z80Cpu.r1.iyl;
			case Z80_REG.IYH:
				return this.z80Cpu.r1.iyh;

			case Z80_REG.F2:
				return this.z80Cpu.r2.f;
			case Z80_REG.A2:
				return this.z80Cpu.r2.a;
			case Z80_REG.C2:
				return this.z80Cpu.r2.c;
			case Z80_REG.B2:
				return this.z80Cpu.r2.b;
			case Z80_REG.E2:
				return this.z80Cpu.r2.e;
			case Z80_REG.D2:
				return this.z80Cpu.r2.d;
			case Z80_REG.L2:
				return this.z80Cpu.r2.l;
			case Z80_REG.H2:
				return this.z80Cpu.r2.h;
			case Z80_REG.R:
				return this.z80Cpu.r;
			case Z80_REG.I:
				return this.z80Cpu.i;
		}
	}
*/

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
	 * Sets a specific register value.
	 * @param reg E.g. Z80_REG.PC or Z80_REG.A
	 * @param value The value to set.
	 */
	protected setRegValue(reg: Z80_REG, value: number) {
		// Set register in z80 cpu
		switch (reg) {
			case Z80_REG.PC:
				this.z80Cpu.pc=value;
				break;
			case Z80_REG.SP:
				this.z80Cpu.sp=value;
				break;
			case Z80_REG.AF:
				this.z80Cpu.r1.af=value;
				break;
			case Z80_REG.BC:
				this.z80Cpu.r1.bc=value;
				break;
			case Z80_REG.DE:
				this.z80Cpu.r1.de=value;
				break;
			case Z80_REG.HL:
				this.z80Cpu.r1.hl=value;
				break;
			case Z80_REG.IX:
				this.z80Cpu.r1.ix=value;
				break;
			case Z80_REG.IY:
				this.z80Cpu.r1.iy=value;
				break;
			case Z80_REG.AF2:
				this.z80Cpu.r2.af=value;
				break;
			case Z80_REG.BC2:
				this.z80Cpu.r2.bc=value;
				break;
			case Z80_REG.DE2:
				this.z80Cpu.r2.de=value;
				break;
			case Z80_REG.HL2:
				this.z80Cpu.r2.hl=value;
				break;

			case Z80_REG.F:
				this.z80Cpu.r1.f=value;
				break;
			case Z80_REG.A:
				this.z80Cpu.r1.a=value;
				break;
			case Z80_REG.C:
				this.z80Cpu.r1.c=value;
				break;
			case Z80_REG.B:
				this.z80Cpu.r1.b=value;
				break;
			case Z80_REG.E:
				this.z80Cpu.r1.e=value;
				break;
			case Z80_REG.D:
				this.z80Cpu.r1.d=value;
				break;
			case Z80_REG.L:
				this.z80Cpu.r1.l=value;
				break;
			case Z80_REG.H:
				this.z80Cpu.r1.h=value;
				break;
			case Z80_REG.IXL:
				this.z80Cpu.r1.ixl=value;
				break;
			case Z80_REG.IXH:
				this.z80Cpu.r1.ixh=value;
				break;
			case Z80_REG.IYL:
				this.z80Cpu.r1.iyl=value;
				break;
			case Z80_REG.IYH:
				this.z80Cpu.r1.iyh=value;
				break;

			case Z80_REG.F2:
				this.z80Cpu.r2.f=value;
				break;
			case Z80_REG.A2:
				this.z80Cpu.r2.a=value;
				break;
			case Z80_REG.C2:
				this.z80Cpu.r2.c=value;
				break;
			case Z80_REG.B2:
				this.z80Cpu.r2.b=value;
				break;
			case Z80_REG.E2:
				this.z80Cpu.r2.e=value;
				break;
			case Z80_REG.D2:
				this.z80Cpu.r2.d=value;
				break;
			case Z80_REG.L2:
				this.z80Cpu.r2.l=value;
				break;
			case Z80_REG.H2:
				this.z80Cpu.r2.h=value;
				break;
			case Z80_REG.R:
				this.z80Cpu.r=value;
				break;
			case Z80_REG.I:
				this.z80Cpu.i=value;
				break;
		}
	}


	/**
	 * Runs the cpu in time chunks in order to give tiem to other
	 * processes. E.g. to receive a pause command.
	 * @param bp1 Breakpoint 1 address or -1 if not used.
	 * @param bp2 Breakpoint 2 address or -1 if not used.
	 */
	protected z80CpuContinue(bp1: number, bp2: number) {
//		Utility.timeDiff();
		// Run the Z80-CPU in a loop
		let breakReason=0;
		let counter=100000;
		let error_string='';
		for (; counter>0; counter--) {
			try {
				this.z80Cpu.execute();
			}
			catch (errorText) {
				error_string="Z80CPU Error: "+errorText;
				console.log(error_string);
				breakReason=255;
				break;
			};
			// Check if any real breakpoint is hit
			// Note: Because of step-out this needs to be done before the other check.
			const pc=this.z80Cpu.pc;
			const bpHit=this.breakpoints.includes(pc);
			if (bpHit) {
				breakReason=2;
				break;
			}
			// Check if stopped from outside
			if (!this.cpuRunning) {
				breakReason=1;	// Manual break
				break;
			}
			// Check if breakpoints are hit
			if (pc==bp1||pc==bp2)
				break;
		}
//		const time=Utility.timeDiff();
//		console.log("Time="+time+" ms");

		// Update the screen
		this.zxSimulationView.update();

		// Check if stopped or just the counter elapsed
		if (counter==0) {
			// Restart
			setTimeout(() => {
				this.z80CpuContinue(bp1, bp2);
			}, 10);
		}
		else {
			// Otherwise stop
			this.cpuRunning=false;

			// Send Notification
			const ntfSeqNo=this.parser.getNextSeqNo();
			const strArr=error_string.split('').map(char => char.codePointAt(0) as number);
			this.sendDzrpNtf(ntfSeqNo, [DZRP_NTF.NTF_PAUSE, breakReason, 0, 0, ...strArr]);
		}
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
					this.breakpoints=Array.from(this.breakpointsMap.values());
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
					const bpId=this.createNewBreakpoint(bpAddress);
					// Respond
					this.sendDzrpResp(seqno, [bpId&0xFF, bpId>>8]);
				}
				break;
			case DZRP.CMD_REMOVE_BREAKPOINT:
				{
					// Get breakpoint ID
					const bpId=Utility.getWord(data, 2);
					// Remove it
					this.removeBreakpoint(bpId);
					this.sendDzrpResp(seqno, [bpId&0xFF, bpId>>8]);
				}
				break;
			case DZRP.CMD_READ_MEM:
				{
					// Get address and size
					const addr=this.getWord(data, 3);
					const size=this.getWord(data, 5);
					// Return memory data
					const mem=this.zxMemory.readBlock(addr, size);
					// Respond
					this.sendDzrpResp(seqno, new Buffer(mem));
				}
				break;
			case DZRP.CMD_WRITE_MEM:
				{
					// Get address
					const addr=this.getWord(data, 3);
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
	protected createNewBreakpoint(bpAddress: number): number {
		this.lastBpId++;
		this.breakpointsMap.set(this.lastBpId, bpAddress);
		return this.lastBpId;
	}


	/**
	 * Removes a breakpoint.
	 * @param bpId The breakpoint ID to delete.
	 */
	protected removeBreakpoint(bpId: number) {
		this.breakpointsMap.delete(bpId);
	}
}


// Comment this if SerialFake should not be started.
export var FakeSerial = new SerialFake();

