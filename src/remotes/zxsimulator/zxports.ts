import * as assert from 'assert';
import {MemBuffer} from '../../misc/membuffer';

/**
 * Represents the port behaviour of a ZX Spectrum
 * and ZX Next.
 */
export class ZxPorts {

	// Holds the memory banks.
	protected ports: Uint8Array;

	/// Constructor.
	constructor() {
		this.ports=new Uint8Array(0x10000);
	}


	/**
	 * Returns the values of all ports.
	 */
	public readState(): Uint8Array {
		// Get buffer
		const mem=MemBuffer.createBuffer(this.ports.length+4);

		// Get ports
		mem.writeArrayBuffer(this.ports);

		// Return
		const bytes=mem.getUint8Array();
		return bytes;
	}


	/**
	 * Writes the state. I.e. sets the internal state (registers etc.).
	 * Use in conjunction with 'readState'.
	 */
	public writeState(stateData: Uint8Array) {
		// Get buffer
		const mem=MemBuffer.from(stateData);

		// Create ports
		const buffer=mem.readArrayBuffer();
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

