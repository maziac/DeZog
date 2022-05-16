import {Labels} from '../labels/labels';
import {Settings} from '../settings';
import {Z80RegistersClass} from '../remotes/z80registers';
import {Remote} from '../remotes/remotebase';
import * as fs from 'fs';
import {UnifiedPath} from './unifiedpath';
import {Log} from '../log';
import * as requireFromString from 'require-from-string';
import * as vm from 'vm';
import * as jsonc from 'jsonc-parser';



/**
 * A collection of useful functions.
 */
export class Utility {

	/// The rootpath to the project. Used in abs and relative filename functions.
	protected static rootPath: string;

	/// The extension's path.
	protected static extensionPath: string;

	/**
	 * Returns a value shrinked to a boundary.
	 * Used to calculate address boundaries.
	 * E.g. the boundary of 19 to a 16 boundary is 16.
	 * @param value The value to bound.
	 * @param boundary The boundary, usually 16.
	 * @returns The bounded value.
	 */
	public static getBoundary(value: number, boundary: number): number {
		// Boundary check
		if (value < 0)	// Always return 0 for negative values
			return 0;
		const boundValue = value - (value % boundary);
		return boundValue;
	}


	/**
	 * Returns a hex string from a number with leading zeroes.
	 * @param value The number to convert
	 * @param size The number of digits for the resulting string.
	 * @returns E.g. "AF" or "0BC8"
	 */
	public static getHexString(value: number | undefined, size: number): string {
		if (value != undefined) {
			const s = value.toString(16).toUpperCase().padStart(size, '0');
			return s;
		}
		// Undefined
		return "?".repeat(size);
	}


	/**
	 * Returns a value as a 4 digit hex string in little endian.
	 * I.e. the low byte comes first.
	 * @param value A value, e.g. 0x1234
	 * @returns Little endian string, e.g. "3412"
	 */
	public static getHexWordStringLE(value: number): string {
		const hex = Utility.getHexString(value, 4);
		// Exchange high and low
		return hex.substring(2) + hex.substring(0, 2);
	}


	/**
	 * Returns a hex string from a long address the string is in the format.
	 * "F7A4h @bank5" for a long address and
	 * "F7A4h" for a 64k address.
	 * @param value The number to convert
	 * @returns E.g. "F7A4h @bank5" or "F7A4h"
	 */
	public static getLongAddressString(value: number): string {
		let addrString = this.getHexString(value & 0xFFFF, 4) + 'h';
		const bank = value >>> 16;
		if (bank > 0)
			addrString += " @bank" + (bank - 1);
		return addrString;
	}


	/**
	 * Returns a binary string from a number with leading zeroes.
	 * @param value The number to convert
	 * @param size The number of digits for the resulting string.
	 */
	public static getBitsString(value: number, size: number) {
		const s = value.toString(2).padStart(size, '0');
		return s;
	}


	/**
	 * Strips the assembler ';' comment from the line.
	 * @param line The line to strip.
	 * @returns The line without any comment.
	 */
	public static stripComment(line: string): string {
		// find comment character
		const k = line.indexOf(';');
		if (k < 0)
			return line;	// no comment
		// Return anything but the comment
		return line.substring(0, k);
	}


	/**
	 * Parses a hex string, but parses in little endian.
	 * I.e. '12FA' returns 0xFA12.
	 * @param hexString A string, e.g. '12FA'
	 * @param index Starts from this index. If omitted starts at 0.
	 * @returns The result, e.g. 0xFA12.
	 */
	public static parseHexWordLE(hexString: string, index = 0): number {
		const sub1 = hexString.substring(index, index + 2);
		const sub2 = hexString.substring(index+2, index + 4);
		const value = parseInt(sub2, 16) * 256 + parseInt(sub1, 16);
		return value;
	}


	/**
	 * Parses a string and converts it to a number.
	 * The string might be decimal or in an hex format.
	 * If the string begins with '0x' or '$' or ends with 'h' or 'H'
	 * it is assumed to be a hex value.
	 * If the string ends with 'b' or 'B' a bit value is assumed.
	 * Otherwise decimal is used.
	 * If the string starts with _ a flag value is assumed. I.e. following flags
	 * are allowed: SZHPNC
	 * Otherwise decimal is used.
	 * @param valueString The string to convert. Ignores case.
	 * @returns The value of valueString. Can also return NaN in error cases.
	 */
	public static parseValue(valueString: string): number {

		const match = /^\s*((0x|\$)([0-9a-f]+)([^0-9a-f]*))?(([0-9a-f]+)h(.*))?(([01]+)b(.*))?(_([szhnpc]+)([^szhnpc])*)?((-?\d+)(\D*))?('([\S ]+)')?/i.exec(valueString);	// NOSONAR
		if (!match)
			return NaN;	// Error during parsing

		const ghex = match[3];	// 0x or $
		const ghex_empty = match[4];	// should be empty

		const ghexh = match[6];	// h
		const ghexh_empty = match[7];	// should be empty

		const gbit = match[9];	// b
		const gbit_empty = match[10];	// should be empty

		let gflags = match[12];	// _
		const gflags_empty = match[13];	// should be empty

		const gdec = match[15];	// decimal
		const gdec_empty = match[16];	// should be empty

		const gchar = match[18];	// ASCII character

		// Hex
		if (ghex) {
			if (ghex_empty)
				return NaN;
			return parseInt(ghex, 16);
		}
		if (ghexh) {
			if (ghexh_empty)
				return NaN;
			return parseInt(ghexh, 16);
		}

		// Decimal
		if (gdec) {
			if (gdec_empty)
				return NaN;
			return parseInt(gdec, 10);
		}
		// Bits
		if (gbit) {
			if (gbit_empty)
				return NaN;
			return parseInt(gbit, 2);
		}

		// Check if status flag value
		if (gflags) {
			if (gflags_empty)
				return NaN;
			gflags = gflags.toLowerCase()
			let flags = 0;
			if (gflags.includes('s')) flags |= 0x80;
			if (gflags.includes('z')) flags |= 0x40;
			if (gflags.includes('h')) flags |= 0x10;
			if (gflags.includes('p')) flags |= 0x04;
			if (gflags.includes('n')) flags |= 0x02;
			if (gflags.includes('c')) flags |= 0x01;
			return flags;
		}

		// ASCII character
		if (gchar) {
			if (gchar.length < 1)
				return NaN;
			return gchar.charCodeAt(0);
		}

		// Unknown
		return NaN;
	}


	/**
	 * Checks if the expression contains any main register.
	 * This is used to evaluate if the expression is constant or could potentially
	 * change on each debugging step.
	 * @param expr The expression to evaluate. May contain math expressions , registers and labels.
	 * @returns true if expression contains registers.
	 */
	public static exprContainsMainRegisters(expr: string): boolean {
		const regString = 'pc|sp|af|bc|de|hl|ix|iy|a|f|b|c|d|e|h|l';
		const regex = new RegExp('\\b(' + regString + '|' + regString.toUpperCase() + ')\\b');
		const match = regex.exec(expr);
		return (match != undefined);
	}


	/**
	 * Replaces all registers and labels with numbers.
	 * Works in the 64k space only. I.e. long addresses are changed to 64k addresses.
	 * Example:
	 * "A == 7"  =>  "2 == 7"
	 * @param expr The expression to evaluate. May contain math expressions and labels.
	 * Also evaluates numbers in formats like '$4000', '2FACh', 100111b, 'G'.
	 * @param evalRegisters If true then register names will also be evaluated.
	 * @param modulePrefix An optional prefix to use for each label. (sjasmplus)
	 * @param lastLabel An optional last label to use for local labels. (sjasmplus)
	 * @returns The 'expr' with all labels and registers replaced by numbers.
	 */
	public static replaceVarsWithValues(expr: string, evalRegisters = true, modulePrefix?: string, lastLabel?: string): string {
		const exprLabelled = expr.replace(/(0x[a-fA-F0-9]+\b|\b[a-zA-Z_\.][a-zA-Z0-9_\.]*'?|[\$][0-9a-fA-F]+\b|[a-fA-F0-9]+h\b|[01]+b\b|\d+\b|'[\S ]+')/g, (match, p1) => {	// NOSONAR
			let res;
			if (evalRegisters) {
				// Check if it might be a register name.
				if (Z80RegistersClass.isRegister(p1)) {
					// Note: this is called synchronously because the cached register is available.
					// If (it should not but if) it would be called asynchronously the
					// addressString would simply be not decoded.
					try {
						res = Remote.getRegisterValue(p1);
					}
					catch {}
				}
			}
			if (isNaN(res)) {
				// Assume it is a label or number
				let lbl = p1;

				// Local label?
				if (lastLabel && lbl.startsWith('.')) {
					lbl = lastLabel + lbl;
				}
				// module prefix?
				if (modulePrefix) {
					res = Labels.getNumberFromString64k(modulePrefix + lbl) || NaN;
				}

				if (isNaN(res)) {
					// Check for "normal" label
					res = Labels.getNumberFromString64k(lbl);
					if (isNaN(res))
						res = p1;	// Return unchanged substring
				}
			}
			return res.toString();
		});

		// Return the expression with variables replaced by numbers
		return exprLabelled;
	}


	/**
	 * Evaluates all registers and labels in a string.
	 * For parameters see replaceVarsWithValues.
	 * Examples:
	 * 2-5*3 => -13, -Dh
	 * LBL_TEST+1 => 32769, 8001h
	 * HL' != 1111h
	 * @returns A number. In case of boolean: 0 or 1.
	 * Throws an error if evaluation not possible.
	  */
	public static evalExpression(expr: string, evalRegisters = true, modulePrefix?: string, lastLabel?: string): number {
		try {
			// Get all labels and registers replaced with numbers
			const exprLabelled = this.replaceVarsWithValues(expr, evalRegisters, modulePrefix, lastLabel);

			// Evaluate
			const result = eval(exprLabelled);

			// Check if boolean
			if (typeof (result) == 'boolean')
				return (result) ? 1 : 0;

			// Return normal number
			return result;
		}
		catch (e) {
			// Rethrow
			throw Error("Error evaluating '" + expr + "': " + e.message);
		}
	}

	/**
	 * Evaluates all registers and labels in a string.
	 * Also evaluates ${...}.
	 * For parameters see replaceVarsWithValues.
	 * Examples:
	 * ${(HL)} == 5
	 * @returns A number. In case of boolean: 0 or 1.
	 * Throws an error if evaluation not possible.
	  */
	/*
	public static async substCondition(expr: string): Promise<string> {
		// Look for ${...} expressions
		const exprSoph = await this.evalLogString(expr);

		// Get all labels and simple register names replaced with numbers
		const exprLabelled = this.replaceVarsWithValues(exprSoph);

		// Return normal number
		return exprLabelled;
	}
	*/

	/**
	 * Returns the full label form a label, lastLabel and modulePrefix info.
	 * Is e.g. used on hovering to reconstruct a full label from a part of a label.
	 * @param label The (found or main) label, e.g. "main.loop" or ".loop".
	 * @param modulePrefix If defined a possible module (with dot), e.g. "module.".
	 * @param lastLabel The last label found in the file, e.g. "main.loop". Will be added to the label,
	 * if the label is a local label.
	 * @returns A full label, e.g. "module.main.something.end".
	 */
	public static createFullLabel(label: string, modulePrefix?: string, lastLabel?: string): string {
		// Local label?
		if (lastLabel && label.startsWith('.')) {
			label = lastLabel + label;
		}
		// Module prefix?
		if (modulePrefix) {
			label = modulePrefix + label;
		}
		return label;
	}


	/**
	 * Evaluates/formats a logstring.
	 * The LOGPOINT syntax is:
	 * ; LOGPOINT [group] text ${(var):signed} text ${reg:hex} text ${w@(reg)} text ${b@(reg):unsigned}
	 * with:
	 * [group]: (Note: the [ ] are meant literally here) The log group. Separate log groups might be turned on/off separately. E.g. "[SPRITES]". If omitted  DEFAULT" is used as group.
	 * reg: a register name, e.g. A, BC, HL, IX, H, IXL.
	 * var: a label.
	 * text: A simple text that may include variables. Here are a few examples for variables:
	 * LOGPOINT [SPRITES] Status=${A}, Counter=${(sprite.counter):unsigned}
	 * LOGPOINT Status=${w@(HL)}, ${(DE)}, ${b@(DE)} Note: ${(DE)} is equal to ${b@(DE)} and prints the byte value at DE.
	 *
	 * The function is asynchronous as it might make calls to the Remote.
	 * @param logString Starts after the [group].
	*/
	public static async evalLogString(logString: string): Promise<string> {
		// logString e.g. "${b@(HL):hex}"
		//await Remote.getRegisters();	// Make sure that registers are available.

		// Replace does not work asynchrounously, therefore we need to store the results in arrays.
		const offsets: Array<number> = [];
		const promises: Array<Promise<string>> = [];

		const regex = /\${(.*?)(:(.*?))?}/g;
		const reAt = /([bw]@)?\((.*?)\)/i;
		let offsCorrection = 0;
		logString = logString.replace(regex, (match, statement /*p1*/, p2, format /*p3*/, offset) => {
			// 'statement' contains the statement, e.g. "b@(HL)".
			// 'format' contains the formatting, e.g. "hex".
			let promise = new Promise<string>(async resolve => {
				let size = 1;
				try {
					let value;
					const reMatch = reAt.exec(statement);
					if (reMatch) {
						// Found something like "b@(HL)", "w@(LABEL)" or "(DE)".
						size = (reMatch[1]?.startsWith('w')) ? 2 : 1;
						// Get value of 'inner'
						const addrString = reMatch[2];
						const addr = Utility.evalExpression(addrString);
						// Get memory contents
						const memValues = await Remote.readMemoryDump(addr, size);
						value = memValues[0];
						if (size > 1)
							value += memValues[1] << 8;
					}
					else {
						// It's a simple value, register or label.
						value = Utility.evalExpression(statement, true);
						if (Z80RegistersClass.isRegister(statement) && statement.length > 1)
							size = 2;	// Two byte register, e.g. "DE"
					}

					// Now format value
					let formatString = format || 'unsigned';
					formatString = '${' + formatString + '}';
					const result = await this.numberFormatted('', value, size, formatString, undefined);
					resolve(result);
				}
				catch (e) {
					// Return the error in case of an error.
					resolve(e);
				}
			});
			// Store
			offset -= offsCorrection;
			offsets.push(offset);
			promises.push(promise);
			offsCorrection += match.length;
			return '';
		});

		// Wait on all promises
		const data = await Promise.all(promises);

		// Create string
		let result = '';
		let replacement;
		let i = 0;
		while (replacement = data.shift()) {
			const offset = offsets.shift() as number;
			const length = offset - i;
			//result += logString.substr(i, length);
			result += logString.substring(i, i+length);
			i = offset;
			result += replacement;
		}
		// Add last
		result += logString.substring(i);

		return result;
	}


	/**
	 * Calculates the (minimum) tabsize from the format string.
	 * For all formats the max. string length is assumed and then
	 * the tab size is calculated.
	 * Note 1: this is not meant for ${name} or ${labels} as these can
	 * vary in size.
	 * Note 2: This cannot be achieved by running 'numberFormattedBy' with a
	 * max. value because the max. string may vary for the different formats.
	 * @param format The format string, e.g. "${hex}\t(${unsigned})"
	 * @param size The value size in bytes. (1=byte, 2= word).
	 * @returns An array of numbers with the size of each tab +1 (1 for a space).
	 */
	public static calculateTabSizes(format: string, size: number): any {
		// Test if format string includes tabs
		if (!format.includes('\t'))
			return null;	// no tabs
		// Replace every formatting with maximum size replacement
		const result = format.replace(/\${([^}]*?:)?([^:]*?)(:[\s\S]*?)?}/g, (match, p1, p2, p3) => {
			let usedSize = size;
			// Check modifier p1
			const modifier = (p1 == null) ? '' : p1.substr(0, p1.length - 1);
			switch (modifier) {
				case 'b@':
					usedSize = 1;
					break;
				case 'w@':
					usedSize = 2;
					break;
			}
			// Check formatting
			switch (p2) {
				case 'name':
					return "nn";
				case 'dhex':
					if (usedSize == 2)
						return "hhhhh";
				// Otherwise just like 'hex'.
				// Flow through.
				case 'hex':
					return "h".repeat(2 * usedSize);
				case 'bits':
					return "b".repeat(8 * usedSize);
				case 'unsigned':
					return (Math.pow(256, usedSize) - 1).toString();
				case 'signed':
					return '-' + (Math.pow(256, usedSize) / 2).toString();
				case 'char':
					return "c";
				case 'flags':
					return "SZHPNC";
				case 'labels':
				case 'labelsplus':
					return "ll";
			}
			// default
			return "";
		});

		// Now get max. length
		const arr = result.split('\t');
		return arr;
	}


	/**
	 * Returns the ASCII character for a given value.
	 * @param value The value to convert
	 * @returns An ASCII character. Some special values for not printable characters.
	 */
	public static getASCIIChar(value: number): string {
		if (value == 0)
			return '0\u0332';
		if (value >= 32 && value < 127)
			return String.fromCharCode(value);
		// For all other just return a dot
		return '.';
	}


	/**
	 * Same as getASCIIChar but returns &nbsp; instead of a space.
	 * @param value The value to convert
	 * @returns An ASCII/HTML character. Some special values for not printable characters.
	 */
	public static getHTMLChar(value: number): string {
		const res = (value == ' '.charCodeAt(0)) ? '&nbsp;' : Utility.getASCIIChar(value);
		return res;
	}


	/**
	 * Returns a formatted number.
	 * Formatting is done according to size and especially the format string.
	 * @param name The name, e.g. a register name "A" etc. or a label name
	 * @param value The value to convert
	 * @param size The size of the value, e.g. 1 for a byte and 2 for a word
	 * @param format The format string:
	 * ${name} = the name of the register, e.g. HL
	 * ${hex} = value as hex, e.g. A9F5
	 * ${dhex} = value as hex but (for words) with a space in between, useful for double registers, e.g. "A9 F5"
	 * ${unsigned} = value as unsigned, e.g. 1234
	 * $(signed) = value as signed, e.g. -59
	 * $(bits) = value as bits , e.g. 10011011
	 * $(flags) = value interpreted as status flags (only useful for F and F'), e.g. ZNC
	 * ${labels} = value as label (or several labels)"
	 * @param tabSizeArr An array of strings each string contains the max number of characters for each tab. Or null. If null the tab sizes are calculated on the fly.
	 * @param undefText Text to use if value is undefined. Defaults to "undefined".
	 * @returns A Promise with the formatted string.
	 * A Promise is required because it might be that for formatting it is required to
	 * get more data from the remote.
	 */
	public static async numberFormatted(name: string, value: number, size: number, format: string, tabSizeArr: Array<string> | undefined, undefText = "undefined"): Promise<string> {
		// Safety check
		if (value == undefined) {
			return undefText;
		}

		// Variables
		let memWord = 0;
		let regsAsWell = false;

		// Check if registers might be returned as well.
		// Return registers only if 'name' itself is not a register.
		if (!Z80RegistersClass.isRegister(name)) {
			regsAsWell = true;
			//await Remote.getRegisters();
		}

		// Check first if we need to retrieve address values
		const matchAddr = /(\${b@:|\${w@:)/.exec(format);
		if (matchAddr) {
			// Retrieve memory values
			const data = await Remote.readMemoryDump(value, 2);
			const b1 = data[0]
			const b2 = data[1];
			memWord = (b2 << 8) + b1;
		}

		// Formatting
		const valString = Utility.numberFormattedSync(value, size, format, regsAsWell, name, memWord, tabSizeArr);

		// Return
		return valString;
	}


	/**
	 * Returns a formatted number.
	 * Formatting is done according to size and especially the format string.
	 * This function works synchronously, if wordAtAddress or register values should be used
	 * they have to be retrieved beforehand or use 'numberFormatted', the asynchrous version.
	 * @param value The value to convert.
	 * @param size The size of the value, e.g. 1 for a byte and 2 for a word.
	 * @param format The format string:
	 * ${name} = the name of the register, e.g. HL
	 * ${hex} = value as hex, e.g. A9F5
	 * ${dhex} = value as hex but (for words) with a space in between, useful for double registers, e.g. "A9 F5"
	 * ${unsigned} = value as unsigned, e.g. 1234
	 * $(signed) = value as signed, e.g. -59
	 * $(bits) = value as bits , e.g. 10011011
	 * $(flags) = value interpreted as status flags (only useful for F and F'), e.g. ZNC
	 * ${labels} = value as label (or several labels)"
	 * @param regsAsWell If true then also matching register names will be returned.
	 * @param paramName The name, e.g. a register name "A" etc. or a label name. Can be omitted or undefined or ''.
	 * @param paramWordAtAddress If value is an address and formatting should print that the value is given here.
	 * The same value (the low byte) is also used for displaying the byte at address. Can be omitted or 0 if unused.
	 * @param tabSizeArr An array of strings each string contains the max number of characters for each tab. Or null. If null the tab sizes are calculated on the fly.
	 * @returns The formatted string.
	 */
	public static numberFormattedSync(value: number, size: number, format: string, regsAsWell = false, paramName?: string, paramWordAtAddress?: number, tabSizeArr?: Array<string>): string {
		// Check for defaults
		const name = paramName || '';
		const wordAtAddress = paramWordAtAddress || 0;
		// Search for format string '${...}'
		// Note: [\s\S] is the same as . but also includes newlines.
		// First search for '${'
		let valString = format.replace(/\${([\s\S]*?)(?=\${|$)/g, (match, p) => {
			// '${...' found now check for } from the left side.
			// This assures that } can also be used inside a ${...}
			const k = p.lastIndexOf('}');
			//const k=p.indexOf('}');
			if (k < 0) {
				// Not a ${...} -> continue
				return p;
			}
			const p1 = p.substr(0, k);
			const restP = p.substr(k + 1);
			// Complete '${...}' found. now check content
			const innerMatch = /^([^\|]*?:)?([^\|]*?)(\|[\s\S]*?)?(\|[\s\S]*?)?$/.exec(p1);
			if (innerMatch == undefined)
				return '${' + p1 + '???}' + restP;
			// Modifier
			let usedValue;
			let usedSize;
			let modifier = innerMatch[1];	// e.g. 'b@:' or 'w@:'
			modifier = (modifier == null) ? '' : modifier.substring(0, modifier.length - 1);
			switch (modifier) {
				case 'b@':
					usedValue = wordAtAddress & 0xFF;	// use byte at address
					usedSize = 1;
					break;
				case 'w@':
					usedValue = wordAtAddress;	// use word at address
					usedSize = 2;
					break;
				case '':	// no modifier found
				default:	// in case of 'labels'
					usedValue = value;	// normal case
					usedSize = size;
					break;
			}
			// Continue formatting
			const formatting = innerMatch[2];	// e.g. 'hex' or 'name' or the pre-strign for labels
			let innerLabelSeparator = innerMatch[3];	// e.g. ', '
			innerLabelSeparator = (innerLabelSeparator == null) ? '' : innerLabelSeparator.substring(1);
			let endLabelSeparator = innerMatch[4];	// e.g. ', '
			endLabelSeparator = (endLabelSeparator == null) ? '' : endLabelSeparator.substring(1);
			switch (formatting) {
				case 'name':
					return name + restP;
				case 'dhex':
					if (usedSize == 2) {
						return Utility.getHexString(usedValue >> 8, 2) + ' ' + Utility.getHexString(usedValue & 0xFF, 2) + restP;
					}
				// Otherwise just like 'hex'.
				// Flow through.
				case 'hex':
					return Utility.getHexString(usedValue, 2 * usedSize) + restP;
				case 'bits':
					return Utility.getBitsString(usedValue, usedSize * 8) + restP;
				case 'unsigned':
					return usedValue.toString() + restP;
				case 'signed':
					const maxValue = Math.pow(256, usedSize);
					const halfMaxValue = maxValue / 2;
					return ((usedValue >= halfMaxValue) ? usedValue - maxValue : usedValue).toString() + restP;
				case 'char':
					const s = Utility.getASCIIChar(usedValue);
					return s + restP
				case 'flags':
					// Interpret byte as Z80 flags:
					const res = this.getFlagsString(usedValue);
					return res + restP;

				case 'labels':
					{
						// calculate labels
						const labels = Labels.getLabelsForNumber64k(value, regsAsWell);
						// format
						if (labels && labels.length > 0)
							return modifier + labels.join(innerLabelSeparator) + endLabelSeparator + restP;
						// No label
						return '' + restP;
					}

				case 'labelsplus':
					{
						// calculate labels
						const labels = Labels.getLabelsPlusIndexForNumber64k(value, regsAsWell);
						// format
						if (labels && labels.length > 0)
							return modifier + labels.join(innerLabelSeparator) + endLabelSeparator + restP;
						// No label
						return '' + restP;
					}

				default:
					// unknown formatting
					return '${' + 1 + '???}' + restP;
			}
		});

		// Format on tabs
		//if(!tabSizeArr)
		//	tabSizeArr = Utility.calculateTabSizes(format, size);
		if (tabSizeArr) {
			if (tabSizeArr.length == valString.split('\t').length) {
				let index = 0;
				valString += '\t';	// to replace also the last string
				valString = valString.replace(/(.*?)\t/g, (match, p1, offset) => {
					const tabSize = tabSizeArr[index].length;
					//if(index == 0)
					//	--tabSize;	// First line missing the space in front
					++index;
					let result = p1.padStart(tabSize) + " ";
					return result;
				});
			}
		}
		else {
			// Remove any tabs
			valString = valString.replace(/\t/g, ' ');
		}

		// return
		return valString;
	}


	/**
	 * Convert value to flags string.
	 * Useful to convert the F register number into a human readable string.
	 */
	public static getFlagsString(flagValue: number) {
		// Interpret byte as Z80 flags:
		// Zesarux: (e.g. "SZ5H3PNC")
		// S Z X H X P/V N C
		let res = (flagValue & 0x80) ? 'S' : '-';	// S=sign
		res += (flagValue & 0x40) ? 'Z' : '-';	// Z=zero
		res += (flagValue & 0x20) ? '1' : '-';
		res += (flagValue & 0x10) ? 'H' : '-';	// H=Half Carry
		res += (flagValue & 0x08) ? '1' : '-';
		res += (flagValue & 0x04) ? 'P' : '-';	// P/V=Parity/Overflow
		res += (flagValue & 0x02) ? 'N' : '-';	// N=Add/Subtract
		res += (flagValue & 0x01) ? 'C' : '-';	// C=carry
		return res;
	}


	/**
	 * Convert a bytes from memory into a number.
	 * Little or big endian.
	 * @param memory The memory array.
	 * @param index The start index for conversion.
	 * @param count (Optional, defaults to 1) The number of bytes to convert.
	 * @param little_endian (optional) set to false for big endian.
	 * @returns a number
	 */
	public static getUintFromMemory(memory: Uint8Array, index: number, count = 1, littleEndian = true): number {
		let memVal = 0;
		if (littleEndian) {
			// Little endian
			for (let i = index + count - 1; i >= index; i--)
				memVal = 256 * memVal + memory[i];
		}
		else {
			// Big endian
			const end = index + count;
			for (let i = index; i < end; i++)
				memVal = 256 * memVal + memory[i];
		}
		return memVal;
	}


	/**
	 * Converts a number into a series of bytes for the memory.
	 * Little or big endian.
	 * @param memVal The value to convert.
	 * @param memory The memory target array.
	 * @param index The start index for conversion.
	 * @param count (Optional, defaults to 1) The number of bytes to convert.
	 * @param little_endian (optional) set to false for big endian.
	 * @returns a number
	 */
	public static setUintToMemory(memVal: number, memory: Uint8Array, index: number, count = 1, littleEndian = true) {
		// Change neg to pos
		if (memVal < 0)
			memVal += (0x1) << (8 * count);

		const end = index + count;
		// Note: bit wise operators would work on 32 bits only.
		if (littleEndian) {
			// Little endian
			for (let i = index; i < end; i++) {
				memory[i] = memVal % 256;
				memVal = Math.trunc(memVal / 256);
			}
		}
		else {
			// Big endian
			const end = index + count;
			for (let i = end - 1; i >= index; i--) {
				memory[i] = memVal % 0x100;
				memVal = Math.trunc(memVal / 0x100);
			}
		}
	}


	/**
	 * Returns the formatted register value. Does a request to the Remote to obtain the register value.
	 * @param regIn The name of the register, e.g. "A" or "BC"
	 * @param formatMap The map with the formattings (hover map or variables map)
	 * @returns A Promise with the formatted string.
	 */
	public static async getFormattedRegister(regIn: string, formatMap: any): Promise<string> {
		// Every register has a formatting otherwise it's not a valid register name
		const reg = regIn.toUpperCase();
		const format = formatMap.get(reg);
		Utility.assert(format != undefined, 'Register ' + reg + ' does not exist.');

		//await Remote.getRegisters();
		// Get value of register
		const value = Remote.getRegisterValue(reg);

		// do the formatting
		let rLen;
		if (reg == "IXH" || reg == "IXL" || reg == "IYH" || reg == "IYL") {
			// Value length = 1 byte
			rLen = 1;
		}
		else {
			rLen = reg.length;
			if (reg[rLen - 1] == '\'') --rLen;	// Don't count the "'" in the register name
		}

		const formattedRegister = await Utility.numberFormatted(reg, value, rLen, format, undefined);
		return formattedRegister;
	}


	/**
	 * If absFilePath starts with vscode.workspace.rootPath
	 * this part is removed.
	 * @param absFilePath An absolute path
	 * @returns A relative path
	 */
	public static getRelFilePath(absFilePath: string): string {
		//const filePath = path.relative(Utility.rootPath || '', absFilePath);
		let filePath = absFilePath;
		let rootPath = Utility.rootPath;
		if (rootPath) {
			if (!rootPath.endsWith('/'))
				rootPath += '/';
			// If window paths, then make sure both path start with lower case letters for comparison. rootPath does already.
			const lcFilePath = UnifiedPath.getUnifiedPath(filePath);
			if (lcFilePath.startsWith(rootPath))
				filePath = filePath.substring(rootPath.length);
		}
		return filePath;
	}


	/**
	 * If relFilePath is a relative path the vscode.workspace.rootPath
	 * path is added.
	 * @param relFilePath A relative path
	 * @returns An absolute path
	 */
	public static getAbsFilePath(relFilePath: string, rootPath?: string): string {
		if (UnifiedPath.isAbsolute(relFilePath))
			return relFilePath;
		// Change from relative to absolute
		const usedRootPath = (rootPath) ? rootPath : Utility.rootPath || '';
		const filePath = UnifiedPath.join(usedRootPath, relFilePath);
		return filePath;
	}


	/**
	 * Looks for a file in the given directories.
	 * If found returns it's absolute file path.
	 * @param srcPath The file to search.
	 * @param srcDirs The (relative) directories to search in.
	 */
	public static getAbsSourceFilePath(srcPath: string, srcDirs: Array<string>) {
		if (UnifiedPath.isAbsolute(srcPath))
			return srcPath;
		// Check all sources directories and try to locate the srcPath file.
		for (let srcDir of srcDirs) {
			const fPath = UnifiedPath.join(srcDir, srcPath);
			const absFPath = Utility.getAbsFilePath(fPath);
			if (fs.existsSync(absFPath))
				return absFPath;
		}
		// Not found, return given path
		return srcPath;
	}


	/**
	 * Returns the relative path srcPath is found in.
	 * I.e. searches for srcPath in all srcDirs and returns the path+the src dir.
	 * @param srcPath E.g. "src/main.asm"
	 * @param srcDirs E.g. [ "src", "includes" ]
	 */
	public static getRelSourceFilePath(srcPath: string, srcDirs: Array<string>) {
		srcPath = UnifiedPath.getUnifiedPath(srcPath);
		if (UnifiedPath.isAbsolute(srcPath))
			return Utility.getRelFilePath(srcPath);

		// Check all sources directories and try to locate the srcPath file.
		for (let srcDir of srcDirs) {
			const fPath = UnifiedPath.join(srcDir, srcPath);
			const absFPath = Utility.getAbsFilePath(fPath);
			if (fs.existsSync(absFPath))
				return fPath;
		}
		// Not found, return given path
		return srcPath;
	}


	/**
	 * Returns the file path of a file in the tmp dir.
	 * @param fileName E.g. "state0.bin"
	 * @returns The relative file path, e.g. ".tmp/state0.bin".
	 */
	public static getRelTmpFilePath(fileName: string): string {
		const relFilePath = UnifiedPath.join(Settings.launch.tmpDir, fileName);
		return relFilePath;
	}


	/**
	 * Returns the file path of a state filename. Used for
	 * saving/loading the state.
	 * @param stateName A state name that is appended, e.g. "0"
	 * @returns The abs file path, e.g. "/Volumes/.../.tmp/state_0.bin".
	 */
	public static getAbsStateFileName(stateName: string): string {
		const fPath = UnifiedPath.join('states', stateName)
		const relPath = Utility.getRelTmpFilePath(fPath);
		return Utility.getAbsFilePath(relPath);
	}


	/**
	 * Sets the root path or absolute and relative file functions.
	 * @param rootPath What e.g. vscode.workspace.rootPath would return
	 */
	public static setRootPath(rootPath: string) {
		Utility.assert(rootPath);
		(Utility.rootPath as any) = UnifiedPath.getUnifiedPath(rootPath);
	}

	/**
	 * Returns the root path.
	 * @param rootPath Must be set beforehand via setRootPath.
	 */
	public static getRootPath(): string {
		return Utility.rootPath;
	}


	/**
	 * Sets the extension's path.
	 * @param extPath Set this on activation.
	 */
	public static setExtensionPath(extPath: string) {
		Utility.extensionPath = UnifiedPath.getUnifiedPath(extPath);
	}


	/**
	 * Returns the extension's path.
	 * @return The path.
	 */
	public static getExtensionPath() {
		return Utility.extensionPath;
	}


	/**
	 * Call the 'handler' in an interval until 'handler' returns true.
	 * This can be used to wait on an event to happen, e.g. to poll
	 * a variable.
	 * @param handler(time) The handler. I t normally checks a value
	 * and acts accordingly. E.g. it polls a variable and does
	 * some action when it changes.
	 * When the handler should not be called anymore it need to return true.
	 * The handler gets parameter time in secs. So it#s possible
	 * to check how long this function already tries.
	 * @param interval Interval in secs
	 */
	public static delayedCall(handler: (time: number) => boolean, interval = 0.1) {
		let count = 0;
		const f = () => {
			const time = count * interval;
			const result = handler(time);
			if (result)
				return;
			// Set timeout to wait for next try
			count++;
			setTimeout(() => {
				f();
			}, interval * 1000);
		};

		// Start waiting
		f();
	}


	/**
	 * Helper method to set a WORD from two successing indices in the
	 * given buffer. (Little endian)
	 * @param buffer The buffer to use.
	 * @param index The index into the buffer.
	 * @param value buffer[index] = value&0xFF; buffer[index+1] = value>>>8;
	 */
	public static setWord(buffer: Buffer, index: number, value: number) {
		buffer[index] = value & 0xFF;
		buffer[index + 1] = value >>> 8;
	}


	/**
	 * Helper method to return a WORD from two successing indices in the
	 * given buffer. (Little endian)
	 * @param buffer The buffer to use.
	 * @param index The index into the buffer.
	 * @return buffer[index] + (buffer[index+1]<<8)
	 */
	public static getWord(buffer: Buffer, index: number): number {
		const value = buffer[index] + (buffer[index + 1] * 256);
		return value;
	}


	/**
	 * Returns a string (0-terminated) from the buffer.
	 * @param data The buffer.
	 * @param startIndex String conversion starts here (and ends at the next found 0.
	 */
	public static getStringFromBuffer(data: Buffer, startIndex: number): string {
		// Get string
		let result = '';
		const len = data.length;
		for (let i = startIndex; i < len; i++) {
			const char = data[i];
			if (char == 0)
				break;
			result += String.fromCharCode(char);
		}
		return result;
	}


	/**
	 * Creates a string from data bytes.
	 * @param data The data buffer.
	 * @param start The start index inside the buffer.
	 * @param count The max. number of data items to show.
	 */
	public static getStringFromData(data: Buffer, start = 0, count = -1): string {
		if (count == -1)
			count = data.length;
		if (start + count > data.length)
			count = data.length - start;
		if (count <= 0)
			return "---";

		let result = "";
		let printCount = count;
		if (printCount > 300)
			printCount = 300;
		for (let i = 0; i < printCount; i++)
			result += data[i + start].toString() + " ";
		if (printCount != count)
			result += "...";
		return result;
	}


	/**
	 * Builds a condition for a breakpoint from an ASSERTION expression.
	 * Simply inverts the expression by surrounding it with "!(...)".
	 * @param assertionExpression E.g. "A == 7"
	 * @returns E.g. "!(A == 7)"
	 */
	public static getConditionFromAssertion(assertionExpression: string) {
		if (assertionExpression.trim().length == 0)
			assertionExpression = 'false';
		return '!(' + assertionExpression + ')';
	}


	/**
	 * Strips off the "!(...)" from a breakpoint condition to
	 * display it as ASSERTION expression.
	 * Does no checking, simply strips away the character position.
	 * @param bpCondition E.g. "!(A == 7)"
	 * @returns E.g. "A == 7"
	 */
	public static getAssertionFromCondition(bpCondition: string | undefined) {
		if (!bpCondition)
			return '';
		let assertionCond = bpCondition.substring(2);	// cut off "!("
		assertionCond = assertionCond.substring(0, assertionCond.length - 1);	// cut off trailing ")"
		return assertionCond;
	}

	/**
	 * Does a 'require' but on a string.
	 * If an error occurs it parses the output for the line number.
	 * 'line' and 'column' is added to the thrown error.
	 * @param code The js file as a string.
	 * @param timeout Specifies the number of milliseconds to execute code before terminating execution. If execution is terminated, an Error will be thrown.
	 * @param filename Optional filename to use.
	 * @param lineOffset Used for reporting the line number.
	 * @throws An Error with an additional property 'position' that contains
	 * {filename, line, column}.
	 */
	public static runInContext(code: string, context: any, timeout?: number, filename?: string, lineOffset = 0): any {
		try {
			// Contextify the object.
			vm.createContext(context);
			// Run
			vm.runInContext(code, context, {timeout, filename, lineOffset});
		}
		catch (e) {
			// e.stack contains the error location with the line number.
			// E.g. '/Volumes/SDDPCIE2TB/Projects/Z80/asm/z80-peripherals-sample/simulation/ports.js:93\nxAPI.tick = () => {\n^\n\nReferenceError: xAPI is not defined\n\tat /Volumes/SDDPCIE2TB/Projects/Z80/asm/z80-peripherals-sample/simulation/ports.js:93:1\n\tat Script.runInContext (vm.js:143:18)\n\tat Object.runInContext (vm.js:294:6)\n\tat Function.runInContext (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/misc/utility.js:1028:16)\n\tat Function.runInContext (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remo…mcode.js:183:20)\n\tat CustomCode.load (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/customcode.js:195:14)\n\tat new CustomCode (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/customcode.js:114:14)\n\tat ZSimRemote.configureMachine (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/zsimremote.js:286:31)\n\tat ZSimRemote.<anonymous> (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/zsimremote.js:311:18)'
			if (filename) {
				// Remove windows \r
				const stackWo = e.stack.replace(/\r/g, '');
				const stack = stackWo.split('\n');
				let errorText = '';
				for (const stackLine of stack) {
					// Search for "at "
					if (stackLine.startsWith('\tat ')) {
						// Check if this line is e.g. '/Volumes/.../ports.js:93:1'
						const regex = new RegExp(filename + ':(\\d+):(\\d+)');
						const match = regex.exec(stackLine);
						if (match) {
							// Add line/column to error.
							// Extract line number.
							const line = parseInt(match[1]) - 1;
							// Extract column
							const column = parseInt(match[2]) - 1;
							// Return
							e.position = {filename, line, column};
						}
						else {
							// Other wise use line number of first line.
							// '/Volumes/.../ports.js:93'
							const regexFirst = new RegExp(filename + ':(\\d+)');
							const matchFirst = regexFirst.exec(stack[0]);
							if (matchFirst) {
								// Extract line number.
								const line = parseInt(matchFirst[1]) - 1;
								// Return
								e.position = {filename, line, column: 0};
							}
						}
						break;
					}

					// Belongs to error text
					errorText += stackLine + '\n';
				}
				e.message = errorText || "Unknown error";
			}

			// Re-throw
			throw e;
		}
	}



	/**
	 * Does a 'require' but on a string.
	 * If an error occurs it parses the output for the line number.
	 * 'line' and 'column' is added to the thrown error.
	 * @param code The js file as a string.
	 * @param fileName Optional filename to use.
	 */
	public static requireFromString(code: string, fileName?: string): any {
		try {
			return requireFromString(code, fileName);
		}
		catch (e) {
			// e.stack contains the error location with the line number.
			// e.stack contains the error location with the line number.
			// Remove windows \r
			const stackWo = e.stack.replace(/\r/g, '');
			const stack = stackWo.split('\n');
			if (stack.length > 1) {
				// Try this pattern:
				// 'ReferenceError: xsuite is not defined\n\tat Object.<anonymous> (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/src/firsttests2.ut.jsm:20:1)\n...'
				const firstAt = stack[1];
				const match = /.*?:(\d+):(\d+)/.exec(firstAt);
				if (match) {
					// Add line/column to error.
					// Extract line number.
					const line = parseInt(match[1]) - 1;
					// Extract column number.
					const column = parseInt(match[2]) - 1;
					// Return
					e.position = {line, column};
				}
				else {
					// Try this pattern:
					// ':192\n\tawait dezogExecAddr(address, sp, a, f, bc, de, hl);\n\t^^^^^\n\nSyntaxError: await is only valid in async functions and the top level bodies of modules\n\tat wrapSafe (internal/modules/cjs/loader.js:1033:16)\n...'
					const line0 = stack[0];
					const match2 = /^:(\d+)$/.exec(line0);
					if (match2) {
						// Add line/column to error.
						// Extract line number.
						const line = parseInt(match2[1]) - 1;
						// Return
						e.position = {line, column: 0};
					}
				}
			}

			// Re-throw
			throw e;

			/*
			'ReferenceError: xsuite is not defined\n\tat Object.<anonymous> (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/src/firsttests2.ut.jsm:20:1)\n\tat Module._compile (internal/modules/cjs/loader.js:1125:30)\n\tat Object..js (internal/modules/cjs/loader.js:1155:10)\n\tat Module.load (internal/modules/cjs/loader.js:982:32)\n\tat internal/modules/cjs/loader.js:823:14\n\tat Function.<anonymous> (electron/js2c/asar_bundle.js:5:12913)\n\tat Function.<anonymous> (/Volumes/SDDPCIE2TB/Applications/Visual Studio Code.app/C…ostProcess.js:90:14919)\n\tat Function._callActivate (/Volumes/SDDPCIE2TB/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/services/extensions/node/extensionHostProcess.js:90:14592)\n\tat /Volumes/SDDPCIE2TB/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/services/extensions/node/extensionHostProcess.js:90:12789\n\tat processTicksAndRejections (internal/process/task_queues.js:93:5)\n\tat async Promise.all (index 14)\n\tat async Promise.all (index 0)'
			*/
		}
	}



	/**
	 * Returns the line (and column) number of the current execution location.
	 * @param depth The depth. O = current line. 1 = caller function etc.
	 * @param file (Optional) The file name. Other files are ignored during depth search.
	 * E.g. 'dezog.unittest.js'
	 * @returns {line, column} The line number and column. Lines/columns start at 0. undefined if something was wrong.
	 */
	public static getLineNumber(depth = 0, file?: string): {line: number, column: number} | undefined {
		try {
			throw new Error('getLineNumber');
		}
		catch (e) {
			return this.getLineNumberFromError(e, depth, file);
		}
	}


	/**
	 * Returns the line (and column) number from the givven Error.
	 * @param e An error that was thrown.
	 * @param depth The depth. O = current line. 1 = caller function etc.
	 * @param file (Optional) The file name. Other files are ignored during depth search.
	 * E.g. 'dezog.unittest.js'
	 * @returns {line, column} The line number and column. Lines/columns start at 0. undefined if something was wrong.
	 */
	public static getLineNumberFromError(e: Error, depth = 0, file?: string): {line: number, column: number} | undefined {
		if (e && e.stack) {
			// e.stack contains the error location with the line number.
			// Remove windows \r
			const stackWo = e.stack.replace(/\r/g, '');
			const stackWhole = stackWo.split('\n');
			let stack;
			if (file)
				stack = stackWhole.filter(line => line.includes(file));
			else
				stack = stackWhole;
			const index = depth + 1;
			const indexAt = stack[index];
			const match = /.*?:(\d+):(\d+)/.exec(indexAt);
			// If asynchronous we have to step up until we find a line number.
			if (match) {
				// Add line/column to error.
				// Extract line number.
				const line = parseInt(match[1]) - 1;
				// Extract column number.
				const column = parseInt(match[2]) - 1;
				return {line, column};
			}
		}
		return undefined;
	}



	/**
	 * Returns a Buffer from a string. The buffer is 0-terminated.
	 * @param text A String. If 'undefined' a Buffer with just a 0 is returned.
	 * @returns A Buffer (0-terminated)
	 */
	public static getBufferFromString(text: string | undefined): Buffer {
		if (text == undefined)
			text = '';
		const zeroText = text + String.fromCharCode(0);
		const buf = Buffer.from(zeroText, 'ascii');
		return buf;
	}


	/**
	 * Returns the line number of a regex found in a text.
	 * @param regex The regular expression to search for.
	 * @param text The text being searched.
	 * @returns The line number.
	 */
	public static getLineNumberInText(regex: RegExp, text: string) {
		// Search the string
		const match = regex.exec(text);
		if (!match)
			return undefined;
		// Now get the line number by counting the \n
		const tmp = text.substring(0, match.index);
		const lineNr = this.countOccurrencesOf('\n', tmp);
		return lineNr;
	}


	/**
	 * Counts the number of occurrences of one string in the other string.
	 * @param search The string to count.
	 * @param text Searhcend in this string.
	 * @returns Number of occurrences.
	 */
	public static countOccurrencesOf(search: string, text: string) {
		let count = -1;
		const len = search.length;
		let pos = -len;
		do {
			count++;
			pos += len;
			pos = text.indexOf(search, pos);
		} while (pos > -1);
		return count;
	}


	/**
	 * Returns the enum keys frm an Enum.
	 * Note: This will work only if the values are no strings. But e.g. numbers.
	 * @param enumeration The typescript enumeration.
	 * @returns An array with strings.
	 */
	public static getEnumKeys(enumeration: any): string[] {
		const arr: string[] = [];
		for (const key in Object.keys(enumeration)) {
			const val = enumeration[key];
			if (typeof val == "string")
				arr.push(val);
		}
		return arr;
	}


	/**
	 * Like 'join'
	public static joinHuman(arr: string[], lastJoin = 'or', hyphen = "'"): string {
		const len = arr.length;
		if (len == 0)
			return 'nothing';
		if (len)
			return "";
		let joined = '';
		const lastIndex = len - 1;
		arr.forEach((value, index) => {
			if (index != 0) {
				if (index == lastIndex && lastJoin)
					joined += ' ' + lastJoin + ' ';
				else
					joined += ', ';
			}
			joined += hyphen + value + hyphen;
		});
		return joined;
	}
	*/

	/**
	 * Static function to get the launch.json path.
	 * @param wsFolder Path to the workspace folder.
	 * @returns The complete path, adding '.vscode/launch.json'.
	 */
	public static getlaunchJsonPath(wsFolder: string): string {
		return UnifiedPath.join(wsFolder, '.vscode', 'launch.json');
	}


	/**
	 * Reads a launch.json file and substitutes the variables in it.
	 * E.g. the ${workspaceFolder}.
	 * Note:
	 * These are the possible variable substitutions:
	 * ${workspaceFolder} - the path of the folder opened in VS Code
	 * ${workspaceFolderBasename} - the name of the folder opened in VS Code without any slashes (/)
	 * ${file} - the current opened file
	 * ${fileWorkspaceFolder} - the current opened file's workspace folder
	 * ${relativeFile} - the current opened file relative to workspaceFolder
	 * ${relativeFileDirname} - the current opened file's dirname relative to workspaceFolder
	 * ${fileBasename} - the current opened file's basename
	 * ${fileBasenameNoExtension} - the current opened file's basename with no file extension
	 * ${fileDirname} - the current opened file's dirname
	 * ${fileExtname} - the current opened file's extension
	 * ${cwd} - the task runner's current working directory on startup
	 * ${lineNumber} - the current selected line number in the active file
	 * ${selectedText} - the current selected text in the active file
	 * ${execPath} - the path to the running VS Code executable
	 * ${defaultBuildTask} - the name of the default build task
	 * ${pathSeparator} - the character used by the operating system to separate components in file paths
	 *
	 * Examples:
	 * ${workspaceFolder} - /home/your-username/your-project
	 * ${workspaceFolderBasename} - your-project
	 *
	 * For this here only ${workspaceFolder} and ${workspaceFolderBasename} are substituted.
	 * The others make no sense anyway (i.e. in the context of unit test
	 * where this is used.)
	 * @param launchJsonPath The path to '.vscode/launch.json' is in.
	 * @param launchData (Optional) if the file has been read already it
	 * can be passed here so that it will not be read again.
	 */
	public static readLaunchJson(launchJsonPath: string, launchData?: string): any {
		// Read file
		if (launchData == undefined) {
			launchData = fs.readFileSync(launchJsonPath, 'utf8');
		}

		// Substitute variables
		const dotVscodeFolder = UnifiedPath.dirname(launchJsonPath);
		const workspaceFolder = UnifiedPath.dirname(dotVscodeFolder);
		const workspaceFolderBasename = UnifiedPath.basename(workspaceFolder);

		const substData = launchData.replace(/\${.*}/g, variable => {
			switch (variable) {
				case '${workspaceFolder}':
					return workspaceFolder;
				case '${workspaceFolderBasename}':
					return workspaceFolderBasename;
				default:
					return variable;
			}
		});
		// Parse json
		const parseErrors: jsonc.ParseError[] = [];
		const launch = jsonc.parse(substData, parseErrors, {allowTrailingComma: true});

		// Check for error
		if (parseErrors.length > 0) {
			// Error
			throw Error("Parse error while reading " + launchJsonPath + ".");
		}

		// Return
		return launch;
	}


	/**
	 * Deep copies the the src object to the target.
	 * Of course, only properties, o functions.
	 * @param src Source object.
	 * @param dest Destination object.
	 */
	public static deepCopyContext(src: Object, dest: Object) {
		Object.keys(src).forEach(key => {
			const value = src[key];
			console.log(`key: ${key}, value: ${value}`)
			if (typeof value === 'object') {
				Utility.deepCopyContext(value, dest[key]);
			}
			else {
				// Copy primitive
				dest[key] = value;
			}
		});
	}


	/**
	 * Own assert function that additionally does a log
	 * in case of a wrong assumption.
	 */
	public static assert(test: any, message?: string) {
		if (!test) {
			try {
				/*
				while (true) {
					Log.log('assert');
					console.log();
				};
				*/
				throw Error("'assert'" + (message || ""));
			}
			catch (err) {
				if (message == undefined)
					message = '';
				else
					message += '\n';
				err.message = message + err.stack;
				// Log
				Log.log('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n' + err.message + '\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
				// Rethrow
				throw err;
			}
		}
	}


	/**
	 * An async function that waits for some milliseconds.
	 * @param ms time to wait in ms
	 */
	public static async timeout(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}


	/**
	 * Returns the time since the last call to this method.
	 * If you want to measure the time some algorithm takes
	 * simply surround the algorithm by 2 calls of 'timeDiff'.
	 * Ignore the result of the first one.
	 * The result of the 2nd call is the time that has been
	 * required.
	 * ~~~
	 * timeDiff();
	 * ... your algorithm
	 * const time = timeDiff();
	 * ~~~
	 * @returns Differential time in ms.
	 */
	public static timeDiff(): number {
		const time = new Date().getMilliseconds();
		const diff = time - this.previousTimeDiffValue;
		this.previousTimeDiffValue = time;
		return diff;
	}
	static previousTimeDiffValue: number = 0;


	/**
	 * Measures the time an algorithm/function takes to finish.
	 * The time is returned in ms.
	 * The algorithm is executed several times, default is 10000,
	 * to give an accurate result.
	 * ~~~
	 * const time = measure(() => {
	 *   ... your algorithm
	 *   });
	 * ~~~
	 * @param algorithm The algorithm/function to measure.
	 * @param repetitions The number of repetitions.
	 * @returns The time in ns (nano secs). The time is for one execution. I.e
	 * it is already divided by 'repetitions'.
	 */
	public static measure(algorithm: () => void, repetitions: number = 100000): number {
		const t0 = new Date().getTime();
		for (let i = repetitions; i > 0; i--) {
			algorithm();
		}
		const t1 = new Date().getTime();
		const diff = (t1 - t0) / repetitions;
		const diffns = diff * 1000000;	// convert to ns
		return diffns;
	}
}

