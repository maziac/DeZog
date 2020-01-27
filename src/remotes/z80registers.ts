import * as assert from 'assert';
import { Utility } from '../utility';
import { Settings } from '../settings';


/// The formatting (for VARIABLES) for each register is provided through a map.
export let Z80RegisterVarFormat: Map<string, string>;

/// The formatting (for hovering) for each register is provided through a map.
export let Z80RegisterHoverFormat: Map<string, string>;


/// Enums for all Z80 Registers.
export enum Z80_REG {
	PC, SP,
	AF, BC, DE, HL, IX, IY,
	AF2, BC2, DE2, HL2,
	A, F, B, C, D, E, H, L, I, R,
	A2, F2, B2, C2, D2, E2, H2, L2,
	IXH, IXL, IYH, IYL
};


/// Used for the data received form the remote.
// I.e. holds any data.
export type RegisterData=any;



/**
 * Class to deal with the Z80 registers.
 * Note: the Z80Registers class and derivations are supposed
 * not to communicate via sockets directly.
 * I.e. there is no asynchronicity in these methods.
 */
export class Z80Registers {

	// F flag constants for bit comparison.
	public static FLAG_S = 1 << 7;
	public static FLAG_Z = 1 << 6;
	public static FLAG_H = 1 << 4;
	public static FLAG_PV = 1 << 2;
	public static FLAG_N = 1 << 1;
	public static FLAG_C = 1 << 0;


	/// All values of the registers are provided in a map.
	/// Together with a function to retrieve the value from the data string.
	protected regMap=new Map<string, {(data: string): number}>();


	// The names of all registers. Same order as enums.
	protected static registerNames: Array<string>;

	/// The register cache for values retrieved from ZEsarUX.
	/// Is a simple string that needs to get parsed.
	protected RegisterCache: RegisterData;


	/**
	* Called during the launchRequest.
	*/
	constructor() {
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
	public parsePC(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseSP(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseAF(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseBC(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseHL(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseDE(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseIX(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseIY(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseAF2(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseBC2(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseHL2(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseDE2(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseI(data: RegisterData): number {
		assert(false);
		return 0;
	}

	public parseR(data: RegisterData): number {
		assert(false);
		return 0;
	}


	// Note: No need to override the 1 byte register access functions.
	public parseA(data: RegisterData): number {
		const res=this.parseAF(data)>>8;
		return res;
	}

	public parseF(data: RegisterData): number {
		const res=this.parseAF(data)&0xFF;
		return res;
	}

	public parseB(data: RegisterData): number {
		const res=this.parseBC(data)>>8;
		return res;
	}

	public parseC(data: RegisterData): number {
		const res=this.parseBC(data)&0xFF;
		return res;
	}

	public parseD(data: RegisterData): number {
		const res=this.parseDE(data)>>8;
		return res;
	}

	public parseE(data: RegisterData): number {
		const res=this.parseDE(data)&0xFF;
		return res;
	}

	public parseH(data: RegisterData): number {
		const res=this.parseHL(data)>>8;
		return res;
	}

	public parseL(data: RegisterData): number {
		const res=this.parseHL(data)&0xFF;
		return res;
	}

	public parseA2(data: RegisterData): number {
		const res=this.parseAF2(data)>>8;
		return res;
	}

	public parseF2(data: RegisterData): number {
		const res=this.parseAF2(data)&0xFF;
		return res;
	}

	public parseIXL(data: RegisterData): number {
		const res=this.parseIX(data)&0xFF;
		return res;
	}

	public parseIXH(data: RegisterData): number {
		const res=this.parseIX(data)>>8;
		return res;
	}

	public parseIYL(data: RegisterData): number {
		const res=this.parseIY(data)&0xFF;
		return res;
	}

	public parseIYH(data: RegisterData): number {
		const res=this.parseIY(data)>>8;
		return res;
	}


	/**
	 * Called during the launchRequest.
	 */
	public static Init() {
		// Fill array with register names
		const names = Object.values(Z80_REG);
		this.registerNames = new Array<string>();
		for (let name of names) {
			if (typeof name != 'string')
				break;
			name = name.replace('2', "'");	// for the shadow registers
			this.registerNames.push(name);
		}

		// Formatting
		Z80RegisterVarFormat = Z80Registers.createFormattingMap(Settings.launch.formatting.registerVar);
		Z80RegisterHoverFormat = Z80Registers.createFormattingMap(Settings.launch.formatting.registerHover);
	}


	/**
	 * Creates a map out of the given formatting.
	 * @param settingsMap hover or variable map from the settings.
	 * @returns A map that consists of a formatting for every register.
	 */
	private static createFormattingMap(settingsMap: any): any {
		const formattingMap = new Map();

		// Read all formatting settings
		for (let i = 0; i < settingsMap.length; i += 2) {
			let regRegex = new RegExp('^' + settingsMap[i] + '$');
			let regFormat = settingsMap[i + 1];
			// check for which registers the format should be used
			for (let regName of Z80Registers.registerNames) {
				// get format
				const format = formattingMap.get(regName);
				if (format != undefined)
					continue;	// has already a format string
				// now check if register is met
				let keyWo = regName;
				let rLen = keyWo.length;
				if (keyWo[rLen - 1] == '\'')
					keyWo = keyWo.substr(0, rLen - 1);	// Remove the "'" in the register name
				const match = regRegex.exec(keyWo);
				if (match == undefined)
					continue;	// no match
				// use the format string  for this register
				formattingMap.set(regName, regFormat);
			}
		}

		// All unset registers get a default formatting
		for (let [regName,] of Z80Registers.registerNames) {
			// get format
			const format = formattingMap.get(regName);
			if (format != undefined)
				continue;	// has already a format string
			// set default format
			let rLen;
			if (regName == "IXH" || regName == "IXL" || regName == "IYH" || regName == "IYL") {
				// Value length = 1 byte
				rLen = 1;
			}
			else {
				rLen = regName.length;
				if (regName[rLen - 1] == '\'')--rLen;	// Don't count the "'" in the register name
			}
			if (rLen == 1)
				formattingMap.set(regName, '${hex}h, ${unsigned}u');
			else
				formattingMap.set(regName, '${hex}h, ${unsigned}u${, :labelsplus|, }');
		}

		// return
		return formattingMap;
	}


	/**
	 * Returns the register enum value for a geister string.
	 * @param reg E.g. "HL" (case insensitive)
	 * @returns E.g. Z80_REG.HL
	 */
	protected static getEnumFromName(reg: string): Z80_REG|undefined {
		const regUpper = reg.toUpperCase();
		const index = Z80Registers.registerNames.indexOf(regUpper);
		if (index < 0)
			return undefined;
		return index;
	}


	/**
	 * Returns true if the string contains a register.
	 * @param reg To check for a register name.
	 */
	public static isRegister(reg: string): boolean {
		return (Z80Registers.getEnumFromName(reg) != undefined);
	}


	/**
	 * Check if the cc condition is met by the flags.
	 * @param cc E.g. 010b for "NC" (as in "CALL NC,nnnn")
	 * @param flags E.g. 00000001b, C is set. Only the lower byte is important.
	 * @returns false, NC is not met.
	 */
	public static isCcMetByFlag(cc: number, flags: number): boolean {
		const testSet=((cc&0x01)!=0);
		let condTest;
		cc=(cc>>1)&0x03;
		switch (cc) {
			case 0:	// NZ, Z
				condTest=((flags&Z80Registers.FLAG_Z)!=0);
				break;
			case 1:	// NC, C
				condTest=((flags&Z80Registers.FLAG_C)!=0);
				break;
			case 2:	// PO, PE
				condTest=((flags&Z80Registers.FLAG_PV)!=0);
				break;
			case 3:	// P, M
				condTest=((flags&Z80Registers.FLAG_S)!=0);
				break;
			default:
				assert(false);	// Impossible.
		}

		const ccIsTrue=(condTest==testSet);
		return ccIsTrue;
	}


	/**
	 * Clears the register cache.
	 */
	public clearCache() {
		this.RegisterCache=undefined;
	}


	/**
	 * Sets the register cache.
	 * Used by ZesaruxEmulator.getRegistersFromEmulator and the cpu history.
	 */
	public setCache(data: RegisterData) {
		this.RegisterCache=data;
	}


	/**
	 * Returns the register cache.
	 * Used by the cpu history.
	 */
	public getCache(): RegisterData {
		return this.RegisterCache;
	}


	/**
	 * Returns true if the register is available.
	 */
	public valid(): boolean {
		return this.RegisterCache!=undefined;
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
		if (reg[rLen - 1] == '\'')--rLen;	// Don't count the "'" in the register name

		assert(this.valid());
		const res = Utility.numberFormattedSync(value, rLen, format, false, reg);
		return res;
	}


	/**
	 * Returns the 'letiable' formatted register value.
	 * @param reg The name of the register, e.g. "A" or "BC"
	 * @returns The formatted string.
	 */
	public getVarFormattedReg(reg: string): string {
		return this.getFormattedReg(reg, Z80RegisterVarFormat);
	}

	/**
	 * Returns the 'hover' formatted register value.
	 * @param reg The name of the register, e.g. "A" or "BC"
	 * @returns The formatted string.
	 */
	public getHoverFormattedReg(reg: string): string {
		return this.getFormattedReg(reg, Z80RegisterVarFormat);
	}


	/**
	 * Returns the register value as a number.
	 * @param regName The register name.
	 * @returns The value of the register.
	 */
	public getRegValueByName(regName: string): number {
		let handler=this.regMap.get(regName.toUpperCase())||(data => 0);
		assert(handler!=undefined, 'Register '+regName+' does not exist.');
		assert(this.RegisterCache);
		let value=handler(this.RegisterCache as string);
		return value;
	}


	/**
	 * Returns the register value as a number.
	 * Override.
	 * @param reg The register enum.
	 * @returns The value of the register.
	 */
	public getRegValue(reg: Z80_REG): number {
		const name=Z80Registers.registerNames[reg];
		return this.getRegValueByName(name);
	}


	/**
	 * @returns The value of the Program Counter
	 */
	public getPC(): number {
		return this.getRegValue(Z80_REG.PC);
	}


	/**
	 * @returns The value of the Stack Pointer
	 */
	public getSP(): number {
		return this.getRegValue(Z80_REG.SP);
	}

}
