import * as assert from 'assert';
import { Utility } from './utility';
//import { Labels } from './labels';
import { Settings } from './settings';


/// The formatting (for VARIABLES) for each register is provided through a map.
export let Z80RegisterVarFormat: Map<string, string>;

/// The formatting (for hovering) for each register is provided through a map.
export let Z80RegisterHoverFormat: Map<string, string>;



/**
 * Class to deal with the Z80 registers.
 */
export class Z80Registers {

	/**
	 * Eg.
	 * PC=80cf SP=83f3 AF=0208 BC=0300 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=00ff HL'=f3f3 DE'=0001 I=00 R=0b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0
	 * A65E RETI
	 */

	 /// All values of the registers are provided in a map.
	/// Together with a function to retrieve the value from the data string.
	protected static regMap = new Map<string, {(data: string):number}>();


	// F flag constants for bit comparison.
	public static FLAG_S = 1 << 7;
	public static FLAG_Z = 1 << 6;
	public static FLAG_H = 1 << 4;
	public static FLAG_PV = 1 << 2;
	public static FLAG_N = 1 << 1;
	public static FLAG_C = 1 << 0;

	// Indices for first time search.
	protected static pcIndex = -1;
	protected static spIndex = -1;
	protected static afIndex = -1;
	protected static bcIndex = -1;
	protected static hlIndex = -1;
	protected static deIndex = -1;
	protected static ixIndex = -1;
	protected static iyIndex = -1;
	protected static af2Index = -1;
	protected static bc2Index = -1;
	protected static hl2Index = -1;
	protected static de2Index = -1;
	protected static iIndex = -1;
	protected static rIndex = -1;

	/**
	 * Called during the launchRequest.
	 */
	public static init() {
		Z80Registers.regMap.set("AF", Z80Registers.parseAF);
		Z80Registers.regMap.set("BC", Z80Registers.parseBC);
		Z80Registers.regMap.set("DE", Z80Registers.parseDE);
		Z80Registers.regMap.set("HL", Z80Registers.parseHL);
		Z80Registers.regMap.set("IX", Z80Registers.parseIX);
		Z80Registers.regMap.set("IY", Z80Registers.parseIY);
		Z80Registers.regMap.set("SP", Z80Registers.parseSP);
		Z80Registers.regMap.set("PC", Z80Registers.parsePC);

		Z80Registers.regMap.set("AF'", Z80Registers.parseAF2);
		Z80Registers.regMap.set("BC'", Z80Registers.parseBC2);
		Z80Registers.regMap.set("DE'", Z80Registers.parseDE2);
		Z80Registers.regMap.set("HL'", Z80Registers.parseHL2);

		Z80Registers.regMap.set("A", Z80Registers.parseA);
		Z80Registers.regMap.set("F", Z80Registers.parseF);
		Z80Registers.regMap.set("B", Z80Registers.parseB);
		Z80Registers.regMap.set("C", Z80Registers.parseC);
		Z80Registers.regMap.set("D", Z80Registers.parseD);
		Z80Registers.regMap.set("E", Z80Registers.parseE);
		Z80Registers.regMap.set("H", Z80Registers.parseH);
		Z80Registers.regMap.set("L", Z80Registers.parseL);
		Z80Registers.regMap.set("I", Z80Registers.parseI);
		Z80Registers.regMap.set("R", Z80Registers.parseR);
		Z80Registers.regMap.set("A'", Z80Registers.parseA2);
		Z80Registers.regMap.set("F'", Z80Registers.parseF2);

		Z80Registers.regMap.set("IXL", Z80Registers.parseIXL);
		Z80Registers.regMap.set("IXH", Z80Registers.parseIXH);
		Z80Registers.regMap.set("IYL", Z80Registers.parseIYL);
		Z80Registers.regMap.set("IYH", Z80Registers.parseIYH);

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
		for(let i=0; i<settingsMap.length; i+=2) {
			let regRegex = new RegExp('^' + settingsMap[i] + '$');
			let regFormat = settingsMap[i+1];
			// check for which registers the format should be used
			for(let [key,] of Z80Registers.regMap) {
				// get format
				const format = formattingMap.get(key);
				if(format != undefined)
					continue;	// has already a format string
				// now check if register is met
				let keyWo = key;
				let rLen = keyWo.length;
				if(keyWo[rLen-1] == '\'')
					keyWo = keyWo.substr(0, rLen-1);	// Remove the "'" in the register name
				const match = regRegex.exec(keyWo);
				if(match == undefined)
					continue;	// no match
				// use the format string  for this register
				formattingMap.set(key, regFormat);
			}
		}

		// All unset registers get a default formatting
		for(let [reg,] of Z80Registers.regMap) {
			// get format
			const format = formattingMap.get(reg);
			if(format != undefined)
				continue;	// has already a format string
			// set default format
			let rLen;
			if(reg == "IXH" || reg == "IXL" || reg == "IYH" || reg == "IYL") {
				// Value length = 1 byte
				rLen = 1;
			}
			else {
				rLen = reg.length;
				if(reg[rLen-1] == '\'') --rLen;	// Don't count the "'" in the register name
			}
			if(rLen == 1)
				formattingMap.set(reg, '${hex}h, ${unsigned}u');
			else
				formattingMap.set(reg, '${hex}h, ${unsigned}u${, :labelsplus|, }');
		}

		// return
		return formattingMap;
	}


	/**
	 * Parses the zesarux register output for PC etc.
	 * @param data The output from zesarux.
	 * @returns The value.
	 */
	public static parsePC(data: string): number {
		if(Z80Registers.pcIndex < 0) {
			Z80Registers.pcIndex = data.indexOf('PC=');
			assert(Z80Registers.pcIndex >= 0);
			Z80Registers.pcIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.pcIndex,4),16);
		return res;
	}

	public static parseSP(data: string): number {
		if(Z80Registers.spIndex < 0) {
			Z80Registers.spIndex = data.indexOf('SP=');
			assert(Z80Registers.spIndex >= 0);
			Z80Registers.spIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.spIndex,4),16);
		return res;
	}

	public static parseAF(data: string): number {
		if(Z80Registers.afIndex < 0) {
			Z80Registers.afIndex = data.indexOf('AF=');
			assert(Z80Registers.afIndex >= 0);
			Z80Registers.afIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.afIndex,4),16);
		return res;
	}

	public static parseBC(data: string): number {
		if(Z80Registers.bcIndex < 0) {
			Z80Registers.bcIndex = data.indexOf('BC=');
			assert(Z80Registers.bcIndex >= 0);
			Z80Registers.bcIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.bcIndex,4),16);
		return res;
	}

	public static parseHL(data: string): number {
		if(Z80Registers.hlIndex < 0) {
			Z80Registers.hlIndex = data.indexOf('HL=');
			assert(Z80Registers.hlIndex >= 0);
			Z80Registers.hlIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.hlIndex,4),16);
		return res;
	}

	public static parseDE(data: string): number {
		if(Z80Registers.deIndex < 0) {
			Z80Registers.deIndex = data.indexOf('DE=');
			assert(Z80Registers.deIndex >= 0);
			Z80Registers.deIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.deIndex,4),16);
		return res;
	}

	public static parseIX(data: string): number {
		if(Z80Registers.ixIndex < 0) {
			Z80Registers.ixIndex = data.indexOf('IX=');
			assert(Z80Registers.ixIndex >= 0);
			Z80Registers.ixIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.ixIndex,4),16);
		return res;
	}

	public static parseIY(data: string): number {
		if(Z80Registers.iyIndex < 0) {
			Z80Registers.iyIndex = data.indexOf('IY=');
			assert(Z80Registers.iyIndex >= 0);
			Z80Registers.iyIndex += 3;
		}
		const res = parseInt(data.substr(Z80Registers.iyIndex,4),16);
		return res;
	}

	public static parseAF2(data: string): number {
		if(Z80Registers.af2Index < 0) {
			Z80Registers.af2Index = data.indexOf("AF'=");
			assert(Z80Registers.af2Index >= 0);
			Z80Registers.af2Index += 4;
		}
		const res = parseInt(data.substr(Z80Registers.af2Index,4),16);
		return res;
	}

	public static parseBC2(data: string): number {
		if(Z80Registers.bc2Index < 0) {
			Z80Registers.bc2Index = data.indexOf("BC'=");
			assert(Z80Registers.bc2Index >= 0);
			Z80Registers.bc2Index += 4;
		}
		const res = parseInt(data.substr(Z80Registers.bc2Index,4),16);
		return res;
	}

	public static parseHL2(data: string): number {
		if(Z80Registers.hl2Index < 0) {
			Z80Registers.hl2Index = data.indexOf("HL'=");
			assert(Z80Registers.hl2Index >= 0);
			Z80Registers.hl2Index += 4;
		}
		const res = parseInt(data.substr(Z80Registers.hl2Index,4),16);
		return res;
	}

	public static parseDE2(data: string): number {
		if(Z80Registers.de2Index < 0) {
			Z80Registers.de2Index = data.indexOf("DE'=");
			assert(Z80Registers.de2Index >= 0);
			Z80Registers.de2Index += 4;
		}
		const res = parseInt(data.substr(Z80Registers.de2Index,4),16);
		return res;
	}

	public static parseI(data: string): number {
		if(Z80Registers.iIndex < 0) {
			Z80Registers.iIndex = data.indexOf('I=');
			assert(Z80Registers.iIndex >= 0);
			Z80Registers.iIndex += 2;
		}
		const res = parseInt(data.substr(Z80Registers.iIndex,2),16);
		return res;
	}

	public static parseR(data: string): number {
		if(Z80Registers.rIndex < 0) {
			Z80Registers.rIndex = data.indexOf('R=');
			assert(Z80Registers.rIndex >= 0);
			Z80Registers.rIndex += 2;
		}
		const res = parseInt(data.substr(Z80Registers.rIndex,2),16);
		return res;
	}

	public static parseA(data: string): number {
		const res = Z80Registers.parseAF(data)>>8;
		return res;
	}

	public static parseF(data: string): number {
		const res = Z80Registers.parseAF(data) & 0xFF;
		return res;
	}

	public static parseB(data: string): number {
		const res = Z80Registers.parseBC(data)>>8;
		return res;
	}

	public static parseC(data: string): number {
		const res = Z80Registers.parseBC(data) & 0xFF;
		return res;
	}

	public static parseD(data: string): number {
		const res = Z80Registers.parseDE(data)>>8;
		return res;
	}

	public static parseE(data: string): number {
		const res = Z80Registers.parseDE(data) & 0xFF;
		return res;
	}

	public static parseH(data: string): number {
		const res = Z80Registers.parseHL(data)>>8;
		return res;
	}

	public static parseL(data: string): number {
		const res = Z80Registers.parseHL(data) & 0xFF;
		return res;
	}

	public static parseA2(data: string): number {
		const res = Z80Registers.parseAF2(data)>>8;
		return res;
	}

	public static parseF2(data: string): number {
		const res = Z80Registers.parseAF2(data) & 0xFF;
		return res;
	}

	public static parseIXL(data: string): number {
		const res = Z80Registers.parseIX(data) & 0xFF;
		return res;
	}

	public static parseIXH(data: string): number {
		const res = Z80Registers.parseIX(data)>>8;
		return res;
	}

	public static parseIYL(data: string): number {
		const res = Z80Registers.parseIY(data) & 0xFF;
		return res;
	}

	public static parseIYH(data: string): number {
		const res = Z80Registers.parseIY(data)>>8;
		return res;
	}


	/**
	 * Returns true if the string contains a register.
	 * @param reg To check for a register name.
	 */
	public static isRegister(reg: string): boolean {
		if(!reg)
			return false;
		/*
		if(reg.length == 2) {
			// Check if both are upper case or both are lower case
			if( (reg[0] == reg[0].toUpperCase()) != (reg[1] == reg[1].toUpperCase()))
				return false;
		}
		*/
		const regUpper = reg.toUpperCase();
		return Z80Registers.regMap.get(regUpper) != undefined;
	}


	/**
	 * Returns the formatted register value.
	 * @param regIn The name of the register, e.g. "A" or "BC"
	 * @param data The data string returned by zesarux.
	 * @param formatMap The map with the formattings (hover map or variables map)
	 * @param handler A function that is called with the formatted string as argument.
	 * It is required because it might be that for formatting it is required to
	 * get more data from the socket.
	 */
	private static getFormattedReg(regIn: string, data: string, formatMap: any, handler: {(formattedString: string)} = (data) => {}) {
		// Every register has a formatting otherwise it's not a valid register name
		const reg = regIn.toUpperCase();
		const format = formatMap.get(reg);
		assert(format != undefined, 'Register ' + reg + ' does not exist.');

		// Get value of register
		const value = Z80Registers.getRegValueByName(reg, data);

		// do the formatting
		let rLen = reg.length;
		if(reg[rLen-1] == '\'') --rLen;	// Don't count the "'" in the register name

		Utility.numberFormatted(reg, value, rLen, format, undefined, handler);
	}


	/**
	 * Returns the 'letiable' formatted register value.
	 * @param reg The name of the register, e.g. "A" or "BC"
	 * @param data The data string returned by zesarux.
	 * @param handler A function that is called with the formatted string as argument.
	 * It is required because it might be that for formatting it is required to
	 * get more data from the socket.
	 */
	public static getVarFormattedReg(reg: string, data: string, handler: {(formattedString: string)} = (data) => {}) {
		Z80Registers.getFormattedReg(reg, data, Z80RegisterVarFormat, handler);
	}

	/**
	 * Returns the 'hover' formatted register value.
	 * @param reg The name of the register, e.g. "A" or "BC"
	 * @param data The data string returned by zesarux.
	 * @param handler A function that is called with the formatted string as argument.
	 * It is required because it might be that for formatting it is required to
	 * get more data from the socket.
	 */
	public static getHoverFormattedReg(reg: string, data: string, handler: {(formattedString: string)} = (data) => {}) {
		Z80Registers.getFormattedReg(reg, data, Z80RegisterHoverFormat, handler);
	}


	/**
	 * Returns the register value as a number.
	 * @param regName The register value.
	 * @param regsString The data string returned by zesarux.
	 * @returns The value of the register.
	 */
	public static getRegValueByName(regName: string, regsString:string): number {
		let handler = Z80Registers.regMap.get(regName.toUpperCase()) || (data => 0);
		assert(handler != undefined, 'Register ' + regName + ' does not exist.');
		let value = handler(regsString);
		return value;
	}


	/**
	 * Returns all registers with the given value.
	 * Is used to find registers that match a certain address.
	 * @param value The value to find.
	 * @param regsString The string zesarux returns if asked for register values. Returns an empty array if omitted.
	 * @returns An array of strings with register names that match. If no matching register is found returns an empty array.
	 */
	public static getRegistersEqualTo(value: number, regsString: string): Array<string> {
		let resRegs: Array<string> = [];
		if(regsString && regsString.length > 0) {
			const regs = [ "HL", "DE", "IX", "IY", "SP", "BC", "HL'", "DE'", "BC'" ];
			resRegs = regs.filter(reg => value == Z80Registers.getRegValueByName(reg, regsString));
		}
		return resRegs;
	}

	/**
	 * Check if the cc condition is met by the flags.
	 * @param cc E.g. 010b for "NC" (as in "CALL NC,nnnn")
	 * @param flags E.g. 00000001b, C is set. Only the lower byte is important.
	 * @returns false, NC is not met.
	 */
	public static isCcMetByFlag(cc: number, flags: number): boolean {
		const testSet = ((cc & 0x01) != 0);
		let condTest;
		cc = (cc >> 1) & 0x03;
		switch(cc) {
			case 0:	// NZ, Z
				condTest = ((flags & Z80Registers.FLAG_Z) != 0);
				break;
			case 1:	// NC, C
				condTest = ((flags & Z80Registers.FLAG_C) != 0);
				break;
			case 2:	// PO, PE
				condTest = ((flags & Z80Registers.FLAG_PV) != 0);
				break;
			case 3:	// P, M
				condTest = ((flags & Z80Registers.FLAG_S) != 0);
				break;
			default:
				assert(false);	// Impossible.
		}

		const ccIsTrue = (condTest == testSet);
		return ccIsTrue;
	}
}
