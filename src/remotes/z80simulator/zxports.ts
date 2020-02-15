//import * as assert from 'assert';

/**
 * Represents the port behaviour of a ZX Spectrum
 * and ZX Next.
 */
export class ZxPorts {

	/// Constructor.
	constructor() {
	}

	// Read 1 byte.
	public read(port: number): number {
		return port&0xFF;
	}

	// Write 1 byte.
	public write(port: number, data: number) {
	}

}

