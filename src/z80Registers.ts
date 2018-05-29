import { Utility } from './utility';
//import { Labels } from './labels';
import { Settings } from './settings';

var assert = require('assert');



/// The formating (for VARIABLES) for each register is provided through a map.
var regVarFormat: Map<string, string>;

/// The formating (for hovering) for each register is provided through a map.
var regHoverFormat: Map<string, string>;

/// All values of the registers are provided in a map.
/// Together with a function to retrieve the value from the data string.
var regMap = new Map<string, {(data: string):number}>();


/**
 * Class to deal with the Z80 registers.
 */
export class Z80Registers {

	/**
	 * Eg.
	 * PC=a65e SP=9f0a BC=0808 A=01 HL=5c78 DE=0014 IX=0300 IY=5c3a
	 * A'=1f BC'=0200 HL'=a9b3 DE'=56b5 I=fe R=47  F=S    HNC F'=    3HN
	 * MEMPTR=a656 EI IM2 VPS: 0 TSTATES: 577
	 * A65E RETI
	 */


	/**
	 * Called during the launchRequest.
	 */
	public static init() {
		regMap["AF"] = Z80Registers.parseAF;
		regMap["BC"] = Z80Registers.parseBC;
		regMap["DE"] = Z80Registers.parseDE;
		regMap["HL"] = Z80Registers.parseHL;
		regMap["IX"] = Z80Registers.parseIX;
		regMap["IY"] = Z80Registers.parseIY;
		regMap["SP"] = Z80Registers.parseSP;
		regMap["PC"] = Z80Registers.parsePC;

		regMap["AF'"] = Z80Registers.parseAF2;
		regMap["BC'"] = Z80Registers.parseBC2;
		regMap["DE'"] = Z80Registers.parseDE2;
		regMap["HL'"] = Z80Registers.parseHL2;

		regMap["A"] = Z80Registers.parseA;
		regMap["F"] = Z80Registers.parseF;
		regMap["B"] = Z80Registers.parseB;
		regMap["C"] = Z80Registers.parseC;
		regMap["D"] = Z80Registers.parseD;
		regMap["E"] = Z80Registers.parseE;
		regMap["H"] = Z80Registers.parseH;
		regMap["L"] = Z80Registers.parseL;
		regMap["I"] = Z80Registers.parseI;
		regMap["R"] = Z80Registers.parseR;
		regMap["A'"] = Z80Registers.parseA2;
		regMap["F'"] = Z80Registers.parseF2;

		regVarFormat = Z80Registers.createFormattingMap(Settings.launch.registerVarFormat);
		regHoverFormat = Z80Registers.createFormattingMap(Settings.launch.registerHoverFormat);
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
			for(const key in regMap) {
				// get format
				const format = formattingMap[key];
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
				formattingMap[key] = regFormat;
			}
		}

		// All unset registers get a default formatting
		for(const key in regMap) {
			// get format
			const format = formattingMap[key];
			if(format != undefined)
				continue;	// has already a format string
			// set default format
			formattingMap[key] = '${hex}';
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


	/**
	 * Returns true if the string contains a register.
	 * @param reg To check for a register name.
	 */
	public static isRegister(reg: string): boolean {
		if(reg.length == 2) {
			// Check if both are upper case or both are lower case
			if( (reg[0] == reg[0].toUpperCase()) != (reg[1] == reg[1].toUpperCase()))
				return false;
		}
		const regUpper = reg.toUpperCase();
		return regMap[regUpper] != undefined;
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
		const format = formatMap[reg];
		assert(format != undefined, 'Register ' + reg + ' does not exist.');

		// Get value of register
		const value = Z80Registers.getRegValueByName(reg, data);

		// do the formatting
		var rLen = reg.length;
		if(reg[rLen-1] == '\'') --rLen;	// Don't count the "'" in the register name

		Utility.numberFormattedBy(reg, value, rLen, format, undefined, handler);
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
		Z80Registers.getFormattedReg(reg, data, regVarFormat, handler);
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
		Z80Registers.getFormattedReg(reg, data, regHoverFormat, handler);
	}


	/**
	 * Returns the register value as a number.
	 * @param regName The register value.
	 * @param data The data string returned by zesarux.
	 */
	public static getRegValueByName(regName: string, data:string): number {
		var handler = regMap[regName];
		assert(handler != undefined, 'Register ' + regName + ' does not exist.');
		var value = handler(data);
		return value;
	}

}
