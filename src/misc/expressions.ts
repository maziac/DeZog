import {Labels} from '../labels/labels';
import {Remote} from '../remotes/remotebase';
import {Z80RegistersClass} from '../remotes/z80registers';
import {Utility} from './utility';
import {HexFormat} from './hexformat';


/**
 * Evaluation of expressions (with labels and registers) and formatting of values
 * (e.g. for hovering, logpoints, variables).
 */
export class Expressions {

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
		const exprLabelled = expr.replace(/(0x[a-fA-F0-9]+\b|(?<![\w@])[@a-zA-Z_\.][a-zA-Z0-9_\.]*'?|[\$][0-9a-fA-F]+\b|[a-fA-F0-9]+h\b|[01]+b\b|\d+\b|'[\S ]+')/g, (match, p1) => {	// NOSONAR
			let res;
			if (evalRegisters) {
				// Check if it might be a register name.
				if (Z80RegistersClass.isRegister(p1)) {
					// Note: this is called synchronously because the cached register is available.
					// If (it should not but if) it would be called asynchronously the
					// addressString would simply be not decoded.
					try {
						const result = Remote.getRegisterValue(p1);
						if (!isNaN(result))
							res = result;
					}
					catch {}
				}
			}
			if (isNaN(res)) {
				// Assume it is a label or number
				let lbl = p1;
				// Remove @ if sjasmplus global label
				if (lbl.startsWith('@')) {
					lbl = lbl.substring(1);
				}

				// Local label?
				if (lastLabel && lbl.startsWith('.')) {
					lbl = lastLabel + lbl;
				}
				// module prefix?
				if (modulePrefix) {
					res = Labels.getNumberFromString64k(modulePrefix + lbl) || NaN;
				}

				// Check for "normal" number


				if (isNaN(res)) {
					// Check for "normal" label
					res = Labels.getNumberForLabel(lbl);
					if (isNaN(res)) {
						res = HexFormat.parseValue(lbl);
						if (isNaN(res))
							res = p1;	// Return unchanged substring
					}
					else {
						// It was a label, restrict it to 64k space
						res &= 0xFFFF;
					}
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
	 * Note: LogEval does something similar but async.
	 * 'evalExpression' is e.g. used by the breakpoint condition.
	  */
	public static evalExpression(expr: string, evalRegisters = true, modulePrefix?: string, lastLabel?: string): number {
		try {
			// Get all labels and registers replaced with numbers
			const exprLabelled = this.replaceVarsWithValues(expr, evalRegisters, modulePrefix, lastLabel);

			// Evaluate
			const result = (0, eval)(exprLabelled);	// Indirect call to eval.

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
		logString = logString.replace(regex, (match, statement /*p1*/, _p2, format /*p3*/, offset) => {
			// 'statement' contains the statement, e.g. "b@(HL)".
			// 'format' contains the formatting, e.g. "hex".
			let promise = new Promise<string>(resolve => {
				(async () => {
					let size = 1;
					try {
						let value;
						const reMatch = reAt.exec(statement);
						if (reMatch) {
							// Found something like "b@(HL)", "w@(LABEL)" or "(DE)".
							size = (reMatch[1]?.startsWith('w')) ? 2 : 1;
							// Get value of 'inner'
							const addrString = reMatch[2];
							const addr = Expressions.evalExpression(addrString);
							// Get memory contents
							const memValues = await Remote.readMemoryDump(addr, size);
							value = memValues[0];
							if (size > 1)
								value += memValues[1] << 8;
						}
						else {
							// It's a simple value, register or label.
							value = Expressions.evalExpression(statement, true);
							if (Z80RegistersClass.isRegister(statement) && statement.length > 1)
								size = 2;	// Two byte register, e.g. "DE"
						}

						// Now format value
						let formatString = format || 'unsigned';
						formatString = '${' + formatString + '}';
						const formattedNumber = await this.numberFormatted('', value, size, formatString, undefined);
						resolve(formattedNumber);
					}
					catch (e) {
						// Return the error in case of an error.
						resolve(e);
					}
				})();
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
			result += logString.substring(i, i + length);
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
		const result = format.replace(/\${([^}]*?:)?([^:]*?)(:[\s\S]*?)?}/g, (_match, p1, p2, _p3) => {
			let usedSize = size;
			// Check modifier p1
			const modifier = (p1 == null) ? '' : p1.substring(0, p1.length - 1);
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
		const valString = Expressions.numberFormattedSync(value, size, format, regsAsWell, name, memWord, tabSizeArr);

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
		const name = paramName ?? '';
		const wordAtAddress = paramWordAtAddress ?? 0;
		// Search for format string '${...}'
		// Note: [\s\S] is the same as . but also includes newlines.
		// First search for '${'
		let valString = format.replace(/\${([\s\S]*?)(?=\${|$)/g, (_match, p) => {
			// '${...' found now check for } from the left side.
			// This assures that } can also be used inside a ${...}
			const k = p.lastIndexOf('}');
			//const k=p.indexOf('}');
			if (k < 0) {
				// Not a ${...} -> continue
				return p;
			}
			const p1 = p.substring(0, k);
			const restP = p.substring(k + 1);
			// Complete '${...}' found. now check content
			const innerMatch = /^([^|]*?:)?([^|]*?)(\|[\s\S]*?)?(\|[\s\S]*?)?$/.exec(p1);
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
						return HexFormat.getHexString(usedValue >> 8, 2) + ' ' + HexFormat.getHexString(usedValue & 0xFF, 2) + restP;
					}
				// Otherwise just like 'hex'.
				// Flow through.
				case 'hex':
					return HexFormat.getHexString(usedValue, 2 * usedSize) + restP;
				case 'bits':
					return HexFormat.getBitsString(usedValue, usedSize * 8) + restP;
				case 'unsigned':
					return usedValue.toString() + restP;
				case 'signed':
					const maxValue = Math.pow(256, usedSize);
					const halfMaxValue = maxValue / 2;
					return ((usedValue >= halfMaxValue) ? usedValue - maxValue : usedValue).toString() + restP;
				case 'char':
					const s = HexFormat.getASCIIChar(usedValue);
					return s + restP
				case 'flags':
					// Interpret byte as Z80 flags:
					const res = HexFormat.getFlagsString(usedValue);
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
		//	tabSizeArr = Expressions.calculateTabSizes(format, size);
		if (tabSizeArr) {
			if (tabSizeArr.length == valString.split('\t').length) {
				let index = 0;
				valString += '\t';	// to replace also the last string
				valString = valString.replace(/(.*?)\t/g, (_match, p1, _offset) => {
					const tabSize = tabSizeArr[index].length;
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
		if (isNaN(value))
			return "?";

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

		const formattedRegister = await Expressions.numberFormatted(reg, value, rLen, format, undefined);
		return formattedRegister;
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
}
