import * as assert from 'assert';

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

