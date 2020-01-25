import * as assert from 'assert';
import { Z80Registers, Z80_REG } from '../z80registers';


/**
 * The specific handling of Z80 registers for the ZX Next.
 * The routines work completely on the cached data received from the ZX Next.
 * The cache is set and cleared only from outside this class while e.g. stepping or
 * reverse debugging.
 */
export class ZxNextRegisters extends Z80Registers {

	/// The register cache for values retrieved from ZEsarUX.
	/// Is a simple string that needs to get parsed.
	protected RegisterCache: Uint8Array|undefined;

	/**
	 * Called during the launchRequest.
	 */
	constructor() {
		super();
	}


	/**
	 * Clears the register cache.
	 */
	public clearCache() {
		this.RegisterCache = undefined;
	}


	/**
	 * Sets the register cache.
	 */
	public setCache(data: Uint8Array) {
		this.RegisterCache = data;
	}


	/**
	 * Returns the register cache.
	 */
	public getCache(): Uint8Array {
		return this.RegisterCache as Uint8Array;
	}


	/**
	 * Returns true if the register is available.
	 */
	public valid(): boolean {
		return this.RegisterCache != undefined;
	}


	/**
	 * Returns the register value as a number.
	 * @param regName The register name.
	 * @returns The value of the register.
	 */
	public getRegValueByName(regName: string): number {
		// Convert register name to enum
		const reg = Z80Registers.getEnumFromName(regName);
		if (reg == undefined)
			return 0;
		return this.getRegValue(reg);
	}


	/**
	 * Returns the register value as a number.
	 * @param reg The register enum.
	 * @returns The value of the register.
	 */
	public getRegValue(reg: Z80_REG): number {
		const cache = this.RegisterCache as Uint8Array;
		assert(cache);
		let i1 = -1;
		let i2 = -1;
		switch (reg) {
			case Z80_REG.PC: i2 = 0; break;
			case Z80_REG.SP: i2 = 2; break;
			case Z80_REG.AF: i2 = 4; break;
			case Z80_REG.BC: i2 = 6; break;
			case Z80_REG.DE: i2 = 8; break;
			case Z80_REG.HL: i2 = 10; break;
			case Z80_REG.IX: i2 = 12; break;
			case Z80_REG.IY: i2 = 14; break;
			case Z80_REG.AF2: i2 = 16; break;
			case Z80_REG.BC2: i2 = 18; break;
			case Z80_REG.DE2: i2 = 20; break;
			case Z80_REG.HL2: i2 = 22; break;
			case Z80_REG.A: i1 = 5; break;
			case Z80_REG.F: i1 = 4; break;
			case Z80_REG.B: i1 = 7; break;
			case Z80_REG.C: i1 = 6; break;
			case Z80_REG.D: i1 = 9; break;
			case Z80_REG.E: i1 = 8; break;
			case Z80_REG.H: i1 = 11; break;
			case Z80_REG.L: i1 = 10; break;
			case Z80_REG.I: i1 = 23; break;
			case Z80_REG.R: i1 = 24; break;
			case Z80_REG.A2: i1 = 17; break;
			case Z80_REG.F2: i1 = 16; break;
			case Z80_REG.B2: i1 = 19; break;
			case Z80_REG.C2: i1 = 18; break;
			case Z80_REG.D2: i1 = 21; break;
			case Z80_REG.E2: i1 = 20; break;
			case Z80_REG.H2: i1 = 23; break;
			case Z80_REG.L2: i1 = 22; break;
			case Z80_REG.IXH: i1 = 13; break;
			case Z80_REG.IXL: i1 = 12; break;
			case Z80_REG.IYH: i1 = 15; break;
			case Z80_REG.IYL: i1 = 14; break;
			default:
				assert(false);
		}
		// WORD:
		if (i2 >= 0) {
			const value = cache[i2] + (cache[i2 + 1] << 8);
			return value;
		}
		// Byte:
		assert(i1 >= 0);
		const value = cache[i1];
		return value;
	}
}
