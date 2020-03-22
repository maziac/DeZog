import * as assert from 'assert';
import {MemBuffer} from '../../misc/membuffer';

/**
 * Represents the port behaviour of a ZX Spectrum
 * and ZX Next.
 */
export class ZxPorts {

	// Holds the memory banks.
	protected ports: Uint8Array;


	// TODO: Remove
	public hitAddress: number=-1
		;

	/// Constructor.
	constructor() {
		this.ports=new Uint8Array(0x10000);
	}


	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer=new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size=memBuffer.getSize();
		return size;
	}


	/**
	 * Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Get ports
		memBuffer.writeArrayBuffer(this.ports);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read ports from buffer
		const buffer=memBuffer.readArrayBuffer();
		assert(buffer.length==this.ports.length);
		this.ports.set(buffer);
	}



	// Read 1 byte. Used by the CPU.
	public read(port: number): number {
		assert(port>=0&&port<0x10000);
		const value=this.ports[port];
		return value;
	}

	// Write 1 byte. Used by the CPU.
	public write(port: number, data: number) {
		if(port==0x7ffd)
			this.hitAddress=port;
	}

	// Change the port value. Simulates HW access.
	// Is e.g. called if a key is "pressed".
	public setPortValue(port: number, data: number) {
		assert(port>=0&&port<0x10000);
		this.ports[port]=data;
	}

	// Get a port value.
	// Is e.g. called if a key is "pressed".
	public getPortValue(port: number): number {
		assert(port>=0&&port<0x10000);
		return this.ports[port];
	}
}

