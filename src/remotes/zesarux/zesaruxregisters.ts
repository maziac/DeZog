import * as assert from 'assert';
import { Utility } from '../../utility';
import { Z80Registers, Z80_REG } from '../../z80registers';


/**
 * The specific handling of Z80 registers in ZEsarUX format.
 * The routines work completely on the cached register string received from ZEsarUX.
 * The cache is set and cleared only from outside this class while e.g. stepping or
 * reverse debugging.
 * This class does not communicate with the zesarux socket on its own.
 */
export class ZesaruxRegisters extends Z80Registers {

	/**
	 * Eg.
	 * PC=80cf SP=83f3 AF=0208 BC=0300 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=00ff HL'=f3f3 DE'=0001 I=00 R=0b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0
	 * A65E RETI
	 */

	/// All values of the registers are provided in a map.
	/// Together with a function to retrieve the value from the data string.
	protected regMap = new Map<string, {(data: string):number}>();

	/// The register cache for values retrieved from ZEsarUX.
	/// Is a simple string that needs to get parsed.
	protected RegisterCache: string|undefined;

	// Indices for first time search.
	protected pcIndex: number;
	protected spIndex: number;
	protected afIndex: number;
	protected bcIndex: number;
	protected hlIndex: number;
	protected deIndex: number;
	protected ixIndex: number;
	protected iyIndex: number;
	protected af2Index: number;
	protected bc2Index: number;
	protected hl2Index: number;
	protected de2Index: number;
	protected iIndex: number;
	protected rIndex: number;



	/**
	 * Called during the launchRequest.
	 */
	constructor() {
		super();

		// Indices for first time search.
		this.pcIndex = -1;
		this.spIndex = -1;
		this.afIndex = -1;
		this.bcIndex = -1;
		this.deIndex = -1;
		this.hlIndex = -1;
		this.ixIndex = -1;
		this.iyIndex = -1;
		this.af2Index = -1;
		this.bc2Index = -1;
		this.hl2Index = -1;
		this.de2Index = -1;
		this.iIndex = -1;
		this.rIndex = -1;

		// Init the map
		this.regMap.set("PC", this.parsePC.bind(this));
		this.regMap.set("SP", this.parseSP.bind(this));

		this.regMap.set("AF", this.parseAF.bind(this));
		this.regMap.set("BC", this.parseBC.bind(this));
		this.regMap.set("DE", this.parseDE.bind(this));
		this.regMap.set("HL", this.parseHL.bind(this));
		this.regMap.set("IX", this.parseIX.bind(this));
		this.regMap.set("IY", this.parseIY.bind(this));

		this.regMap.set("AF'", this.parseAF2.bind(this));
		this.regMap.set("BC'", this.parseBC2.bind(this));
		this.regMap.set("DE'", this.parseDE2.bind(this));
		this.regMap.set("HL'", this.parseHL2.bind(this));

		this.regMap.set("A", this.parseA.bind(this));
		this.regMap.set("F", this.parseF.bind(this));
		this.regMap.set("B", this.parseB.bind(this));
		this.regMap.set("C", this.parseC.bind(this));
		this.regMap.set("D", this.parseD.bind(this));
		this.regMap.set("E", this.parseE.bind(this));
		this.regMap.set("H", this.parseH.bind(this));
		this.regMap.set("L", this.parseL.bind(this));
		this.regMap.set("I", this.parseI.bind(this));
		this.regMap.set("R", this.parseR.bind(this));
		this.regMap.set("A'", this.parseA2.bind(this));
		this.regMap.set("F'", this.parseF2.bind(this));

		this.regMap.set("IXL", this.parseIXL.bind(this));
		this.regMap.set("IXH", this.parseIXH.bind(this));
		this.regMap.set("IYL", this.parseIYL.bind(this));
		this.regMap.set("IYH", this.parseIYH.bind(this));
	}


	/**
	 * Parses the zesarux register output for PC etc.
	 * @param data The output from zesarux.
	 * @returns The value.
	 */
	public parsePC(data: string): number {
		if(this.pcIndex < 0) {
			this.pcIndex = data.indexOf('PC=');
			assert(this.pcIndex >= 0);
			this.pcIndex += 3;
		}
		const res = parseInt(data.substr(this.pcIndex,4),16);
		return res;
	}

	public parseSP(data: string): number {
		if(this.spIndex < 0) {
			this.spIndex = data.indexOf('SP=');
			assert(this.spIndex >= 0);
			this.spIndex += 3;
		}
		const res = parseInt(data.substr(this.spIndex,4),16);
		return res;
	}

	public parseAF(data: string): number {
		if(this.afIndex < 0) {
			this.afIndex = data.indexOf('AF=');
			assert(this.afIndex >= 0);
			this.afIndex += 3;
		}
		const res = parseInt(data.substr(this.afIndex,4),16);
		return res;
	}

	public parseBC(data: string): number {
		if(this.bcIndex < 0) {
			this.bcIndex = data.indexOf('BC=');
			assert(this.bcIndex >= 0);
			this.bcIndex += 3;
		}
		const res = parseInt(data.substr(this.bcIndex,4),16);
		return res;
	}

	public parseHL(data: string): number {
		if(this.hlIndex < 0) {
			this.hlIndex = data.indexOf('HL=');
			assert(this.hlIndex >= 0);
			this.hlIndex += 3;
		}
		const res = parseInt(data.substr(this.hlIndex,4),16);
		return res;
	}

	public parseDE(data: string): number {
		if(this.deIndex < 0) {
			this.deIndex = data.indexOf('DE=');
			assert(this.deIndex >= 0);
			this.deIndex += 3;
		}
		const res = parseInt(data.substr(this.deIndex,4),16);
		return res;
	}

	public parseIX(data: string): number {
		if(this.ixIndex < 0) {
			this.ixIndex = data.indexOf('IX=');
			assert(this.ixIndex >= 0);
			this.ixIndex += 3;
		}
		const res = parseInt(data.substr(this.ixIndex,4),16);
		return res;
	}

	public parseIY(data: string): number {
		if(this.iyIndex < 0) {
			this.iyIndex = data.indexOf('IY=');
			assert(this.iyIndex >= 0);
			this.iyIndex += 3;
		}
		const res = parseInt(data.substr(this.iyIndex,4),16);
		return res;
	}

	public parseAF2(data: string): number {
		if(this.af2Index < 0) {
			this.af2Index = data.indexOf("AF'=");
			assert(this.af2Index >= 0);
			this.af2Index += 4;
		}
		const res = parseInt(data.substr(this.af2Index,4),16);
		return res;
	}

	public parseBC2(data: string): number {
		if(this.bc2Index < 0) {
			this.bc2Index = data.indexOf("BC'=");
			assert(this.bc2Index >= 0);
			this.bc2Index += 4;
		}
		const res = parseInt(data.substr(this.bc2Index,4),16);
		return res;
	}

	public parseHL2(data: string): number {
		if(this.hl2Index < 0) {
			this.hl2Index = data.indexOf("HL'=");
			assert(this.hl2Index >= 0);
			this.hl2Index += 4;
		}
		const res = parseInt(data.substr(this.hl2Index,4),16);
		return res;
	}

	public parseDE2(data: string): number {
		if(this.de2Index < 0) {
			this.de2Index = data.indexOf("DE'=");
			assert(this.de2Index >= 0);
			this.de2Index += 4;
		}
		const res = parseInt(data.substr(this.de2Index,4),16);
		return res;
	}

	public parseI(data: string): number {
		if(this.iIndex < 0) {
			this.iIndex = data.indexOf('I=');
			assert(this.iIndex >= 0);
			this.iIndex += 2;
		}
		const res = parseInt(data.substr(this.iIndex,2),16);
		return res;
	}

	public parseR(data: string): number {
		if(this.rIndex < 0) {
			this.rIndex = data.indexOf('R=');
			assert(this.rIndex >= 0);
			this.rIndex += 2;
		}
		const res = parseInt(data.substr(this.rIndex,2),16);
		return res;
	}

	public parseA(data: string): number {
		const res = this.parseAF(data)>>8;
		return res;
	}

	public parseF(data: string): number {
		const res = this.parseAF(data) & 0xFF;
		return res;
	}

	public parseB(data: string): number {
		const res = this.parseBC(data)>>8;
		return res;
	}

	public parseC(data: string): number {
		const res = this.parseBC(data) & 0xFF;
		return res;
	}

	public parseD(data: string): number {
		const res = this.parseDE(data)>>8;
		return res;
	}

	public parseE(data: string): number {
		const res = this.parseDE(data) & 0xFF;
		return res;
	}

	public parseH(data: string): number {
		const res = this.parseHL(data)>>8;
		return res;
	}

	public parseL(data: string): number {
		const res = this.parseHL(data) & 0xFF;
		return res;
	}

	public parseA2(data: string): number {
		const res = this.parseAF2(data)>>8;
		return res;
	}

	public parseF2(data: string): number {
		const res = this.parseAF2(data) & 0xFF;
		return res;
	}

	public parseIXL(data: string): number {
		const res = this.parseIX(data) & 0xFF;
		return res;
	}

	public parseIXH(data: string): number {
		const res = this.parseIX(data)>>8;
		return res;
	}

	public parseIYL(data: string): number {
		const res = this.parseIY(data) & 0xFF;
		return res;
	}

	public parseIYH(data: string): number {
		const res = this.parseIY(data)>>8;
		return res;
	}


	/**
	 * Clears the register cache.
	 */
	public clearCache() {
		this.RegisterCache = undefined;
	}


	/**
	 * Sets the register cache.
	 * Used by ZesaruxEmulator.getRegistersFromEmulator and the cpu history.
	 */
	public setCache(line: string) {
		this.RegisterCache = line;
	}


	/**
	 * Returns the register cache.
	 * Used by the cpu history.
	 */
	public getCache(): string {
		return this.RegisterCache as string;
	}


	/**
	 * Returns true if the register is available.
	 */
	public valid(): boolean {
		return this.RegisterCache != undefined;
	}


	/**
	 * Returns the formatted register value.
	 * @param regIn The name of the register, e.g. "A" or "BC"
	 * @param formatMap The map with the formattings (hover map or variables map)
	 * @returns The formatted string.
	 */
	protected getFormattedReg(regIn: string, formatMap: any): string {
		// Every register has a formatting otherwise it's not a valid register name
		const reg = regIn.toUpperCase();
		const format = formatMap.get(reg);
		assert(format != undefined, 'Register ' + reg + ' does not exist.');

		// Get value of register
		const value = this.getRegValueByName(reg);

		// do the formatting
		let rLen = reg.length;
		if(reg[rLen-1] == '\'') --rLen;	// Don't count the "'" in the register name

		assert(this.RegisterCache)
		const res = Utility.numberFormattedSync(value, rLen, format, false, reg);
		return res;
	}


	/**
	 * Returns the register value as a number.
	 * @param regName The register name.
	 * @returns The value of the register.
	 */
	public getRegValueByName(regName: string): number {
		let handler = this.regMap.get(regName.toUpperCase()) || (data => 0);
		assert(handler != undefined, 'Register ' + regName + ' does not exist.');
		assert(this.RegisterCache);
		let value = handler(this.RegisterCache as string);
		return value;
	}


	/**
	 * Returns the register value as a number.
	 * Override.
	 * @param reg The register enum.
	 * @returns The value of the register.
	 */
	public getRegValue(reg: Z80_REG): number {
		const name = Z80Registers.registerNames[reg];
		return this.getRegValueByName(name);
	}
}
