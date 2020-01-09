import * as assert from 'assert';
//import { Utility } from './utility';
import { Settings } from './settings';


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
	A2, F2, IXL, IXH, IYL, IYH
};


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



	// The names of all registers. Same order as enums.
	protected static registerNames: Array<string>;


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
	 * Returns true if the string contains a register.
	 * @param reg To check for a register name.
	 */
	public static isRegister(reg: string): boolean {
		if (!reg)
			return false;
		/*
		if(reg.length == 2) {
			// Check if both are upper case or both are lower case
			if( (reg[0] == reg[0].toUpperCase()) != (reg[1] == reg[1].toUpperCase()))
				return false;
		}
		*/
		const regUpper = reg.toUpperCase();
		return Z80Registers.registerNames.indexOf(regUpper) >= 0;
	}


	/**
	 * Returns true if the register values are valid.
	 * E.g. used if the cached values are not valid anymore.
	 */
	public valid(): boolean {
		return false;
	}


	/**
	 * Returns the formatted register value.
	 * Override.
	 * @param regIn The name of the register, e.g. "A" or "BC"
	 * @param formatMap The map with the formattings (hover map or variables map)
	 * @returns The formatted string.
	 */
	protected getFormattedReg(regIn: string, formatMap: any): string {
		assert(false);
		return regIn;
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
	 * Override.
	 * @param regName The register name.
	 * @returns The value of the register.
	 */
	public getRegValueByName(regName: string): number {
		assert(false);
		return 0;
	}


	/**
	 * Returns the register value as a number.
	 * Override.
	 * @param reg The register enum.
	 * @returns The value of the register.
	 */
	public getRegValue(reg: Z80_REG): number {
		assert(false);
		return 0;
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
		switch (cc) {
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
