import * as assert from 'assert';
import { Utility } from './utility';
//import { Labels } from './labels';
import { Settings } from './settings';


/// The formatting (for VARIABLES) for each register is provided through a map.
export var Z80RegisterVarFormat: Map<string, string>;

/// The formatting (for hovering) for each register is provided through a map.
export var Z80RegisterHoverFormat: Map<string, string>;

/// All values of the registers are provided in a map.
/// Together with a function to retrieve the value from the data string.
var regMap = new Map<string, {(data: string):number}>();


/**
 * Class to deal with the Z80 registers.
 */
export class Z80Registers {

	/**
	 * Eg.
	 * PC=6005 SP=6094 BC=0100 AF=cf8c HL=02df DE=0fc9 IX=663c IY=5c3a AF'=0044 BC'=050e HL'=2758 DE'=0047 I=3f R=5e  F=S---3P-- F'=-Z---P-- MEMPTR=0000 IM1 IFF-- VPS: 0
	 * A65E RETI
	 */

	// F flag constants for bit comparison.
	public static FLAG_S = 1 << 7;
	public static FLAG_Z = 1 << 6;
	public static FLAG_H = 1 << 4;
	public static FLAG_PV = 1 << 2;
	public static FLAG_N = 1 << 1;
	public static FLAG_C = 1 << 0;

	/**
	 * Called during the launchRequest.
	 */
	public static init() {
		regMap.set("AF", Z80Registers.parseAF);
		regMap.set("BC", Z80Registers.parseBC);
		regMap.set("DE", Z80Registers.parseDE);
		regMap.set("HL", Z80Registers.parseHL);
		regMap.set("IX", Z80Registers.parseIX);
		regMap.set("IY", Z80Registers.parseIY);
		regMap.set("SP", Z80Registers.parseSP);
		regMap.set("PC", Z80Registers.parsePC);

		regMap.set("AF'", Z80Registers.parseAF2);
		regMap.set("BC'", Z80Registers.parseBC2);
		regMap.set("DE'", Z80Registers.parseDE2);
		regMap.set("HL'", Z80Registers.parseHL2);

		regMap.set("A", Z80Registers.parseA);
		regMap.set("F", Z80Registers.parseF);
		regMap.set("B", Z80Registers.parseB);
		regMap.set("C", Z80Registers.parseC);
		regMap.set("D", Z80Registers.parseD);
		regMap.set("E", Z80Registers.parseE);
		regMap.set("H", Z80Registers.parseH);
		regMap.set("L", Z80Registers.parseL);
		regMap.set("I", Z80Registers.parseI);
		regMap.set("R", Z80Registers.parseR);
		regMap.set("A'", Z80Registers.parseA2);
		regMap.set("F'", Z80Registers.parseF2);

		regMap.set("IXL", Z80Registers.parseIXL);
		regMap.set("IXH", Z80Registers.parseIXH);
		regMap.set("IYL", Z80Registers.parseIYL);
		regMap.set("IYH", Z80Registers.parseIYH);

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
		for(var i=0; i<settingsMap.length; i+=2) {
			var regRegex = new RegExp('^' + settingsMap[i] + '$');
			var regFormat = settingsMap[i+1];
			// check for which registers the format should be used
			for(let [key,] of regMap) {
				// get format
				const format = formattingMap.get(key);
				if(format != undefined)
					continue;	// has already a format string
				// now check if register is met
				var keyWo = key;
				var rLen = keyWo.length;
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
		for(let [reg,] of regMap) {
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
		const res = parseInt(data.substr(3,4),16);
		return res;
	}

	public static parseSP(data: string): number {
		const res = parseInt(data.substr(11,4),16);
		return res;
	}

	public static parseAF(data: string): number {
		// AF
		const res = parseInt(data.substr(27,4),16);
		return res;
	}

	public static parseBC(data: string): number {
		const res = parseInt(data.substr(19,4),16);
		return res;
	}

	public static parseHL(data: string): number {
		const res = parseInt(data.substr(35,4),16);
		return res;
	}

	public static parseDE(data: string): number {
		const res = parseInt(data.substr(43,4),16);
		return res;
	}

	public static parseIX(data: string): number {
		const res = parseInt(data.substr(51,4),16);
		return res;
	}

	public static parseIY(data: string): number {
		const res = parseInt(data.substr(59,4),16);
		return res;
	}

	public static parseAF2(data: string): number {
		// AF'
		const res = parseInt(data.substr(68,4),16);
		return res;
	}

	public static parseBC2(data: string): number {
		const res = parseInt(data.substr(77,4),16);
		return res;
	}

	public static parseHL2(data: string): number {
		const res = parseInt(data.substr(86,4),16);
		return res;
	}

	public static parseDE2(data: string): number {
		const res = parseInt(data.substr(95,4),16);
		return res;
	}

	public static parseI(data: string): number {
		const res = parseInt(data.substr(102,2),16);
		return res;
	}

	public static parseR(data: string): number {
		const res = parseInt(data.substr(107,2),16);
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
		return regMap.get(regUpper) != undefined;
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
		var rLen = reg.length;
		if(reg[rLen-1] == '\'') --rLen;	// Don't count the "'" in the register name

		Utility.numberFormatted(reg, value, rLen, format, undefined, handler);
	}


	/**
	 * Returns the 'variable' formatted register value.
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
		//var handler = (data) => {};
		var handler = regMap.get(regName.toUpperCase()) || (data => 0);
		assert(handler != undefined, 'Register ' + regName + ' does not exist.');
		var value = handler(regsString);
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
		var resRegs:Array<string> = [];
		if(regsString && regsString.length > 0) {
			const regs = [ "HL", "DE", "IX", "IY", "SP", "BC", "HL'", "DE'", "BC'" ];
			resRegs = regs.filter(reg => value == this.getRegValueByName(reg, regsString));
		}
		return resRegs;
	}

	/**
	 * Check if the cc condition is met by the flags.
	 * @param cc E.g. 010b for "NC" (as in "CALL NC,nnnn")
	 * @param flags E.g. 00000001b, C is set
	 * @returns false, NC is not met.
	 */
	public static isCcMetByFlag(cc: number, flags: number): boolean {
		const testSet = ((cc & 0x01) != 0);
		let condTest;
		cc = (cc >> 1) & 0x03;
		switch(cc) {
			case 0:	// NZ, Z
				condTest = ((flags & this.FLAG_Z) != 0);
				break;
			case 1:	// NC, C
				condTest = ((flags & this.FLAG_C) != 0);
				break;
			case 2:	// PO, PE
				condTest = ((flags & this.FLAG_PV) != 0);
				break;
			case 3:	// P, M
				condTest = ((flags & this.FLAG_S) != 0);
				break;
			default:
				assert(false);	// Impossible.
		}

		const ccIsTrue = (condTest == testSet);
		return ccIsTrue;
	}
}
