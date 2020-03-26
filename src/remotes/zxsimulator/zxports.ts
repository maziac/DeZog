import * as assert from 'assert';
import {MemBuffer} from '../../misc/membuffer';

/**
 * Represents the port behaviour of a ZX Spectrum
 * and ZX Next.
 */
export class ZxPorts {

	// Holds the ports for reading.
	protected ports: Uint8Array;

	// It is possible to add behavior when writing to a port.
	// This map maps port addresses to functions that are executed on a port write.
	protected outPortMap: Map<number, (port: number, value: number) => void>;

	// The bitmask for the port. Only 1 bits are used to decode.
	// E.g. the ZX128 does not use bit 1 and bit 15.
	public portBitMask=0xFFFF;


	/// Constructor.
	constructor() {
		this.ports=new Uint8Array(0x10000);
		this.outPortMap =new Map<number, (port: number, value: number) => void>();
	}


	/**
	 * Registers a function for a specific port address.
	 * @param port The port address
	 * @param func The function to execute if the port is written.
	 */
	public registerOutPortFunction(port: number, func: ((port: number, value: number) => void)|undefined) {
		if (func)
			this.outPortMap.set(port, func);
		else
			this.outPortMap.delete(port);
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



	/**
	 *  Read 1 byte. Used by the CPU.
	 */
	public read(port: number): number {
		assert(port>=0&&port<0x10000);
		const value=this.ports[port];
		return value;
	}


	/**
	 * Write 1 byte. Used by the CPU.
	 * Executes a custom method.
	 */
	public write(port: number, data: number) {
		const func=this.outPortMap.get(port);
		if (!func)
			return;
		func(port, data);
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

