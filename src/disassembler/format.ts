import * as assert from 'assert';
import {BaseMemory} from './basememory';


export class Format {

	/// Choose opcodes in lower or upper case.
	public static hexNumbersLowerCase = false;

	// The used hex format in the disassembly (not used in the starting addresses).
	public static hexFormat: '$' | '0x' | 'h' = 'h';


	/**
	 * Returns the value as string digits are filled to match countDigits.
	 * @param value The value to convert.
	 * @param countDigits The number of digits to use.
	 * @returns E.g. "003"
	 */
	public static getPaddedValue(value: number, countDigits: number): string {
		const str = value.toString();
		return str.padStart(countDigits, '0');
	}


	/** Formats a string to be exactly of 'len' size.
	 * If the string is longer then '...' is set at the end.
	 * If the string is smaller then the rest is padded with ' '.
	 * @param s The string. E.g. "abcdefgh".
	 * @param len The len for formatting. E.g. 7, 9 or 6.
	 * @returns Eg. "abcdefgh", "abcdefgh  ", "abc..."
	 */
	public static getLimitedString(s: string, len: number): string {
		const sLen = s.length;
		if (sLen > len) {
			// Show '...' at the end
			let appendString = '...';
			let appendLen = appendString.length;
			let i = len - appendLen;
			if (i < 0) {
				appendLen += i;	// Shorten
				appendString = appendString.substring(0, appendLen);
				i = 0;
			}
			s = s.substring(0, i) + appendString;
		}
		else {
			// Pad string
			s = s.padEnd(len);
		}
		return s;
	}


	/**
	 * Returns a hex string with a fixed number of digits.
	 * @param value The value to convert.
	 * @param countDigits The number of digits.
	 * @returns a string, e.g. "04fd".
	 */
	public static getHexString(value: number, countDigits = 4): string {
		let s = value.toString(16);
		if (!Format.hexNumbersLowerCase)
			s = s.toUpperCase();
		return s.padStart(countDigits, '0');
	}


	/**
	 * Returns a hex string with a fixed number of digits.
	 * @param value The value to convert.
	 * @param countDigits The number of digits.
	 * @returns a string, e.g. "0x04fd".
	 */
	public static getHexFormattedString(value: number, countDigits = 4): string {
		let s = this.getHexString(value, countDigits);
		if (this.hexFormat == '$')
			s = '$' + s;
		else if (this.hexFormat == 'h')
			s += 'h';
		else
			s = '0x' + s;
		return s;
	}


	/**
	 * Puts together a few common conversions for a byte value.
	 * E.g. decimal and ASCII.
	 * Used to create the comment for an opcode or a data label.
	 * @param byteValue The value to convert. [-128;255]
	 * @returns A string with all conversions, e.g. "20h, 32, ' '"
	 */
	public static getVariousConversionsForByte(byteValue: number): string {
		// byte
		if (byteValue < 0)
			byteValue = 0x100 + byteValue;
		let result = byteValue.toString();
		// Negative?
		let convValue = byteValue;
		if (convValue >= 0x80) {
			convValue -= 0x100;
			result += ', ' + convValue.toString().padStart(4, ' ');
		}
		// Check for ASCII
		if (byteValue >= 32 /*space*/ && byteValue <= 126 /*tilde*/)
			result += ", '" + String.fromCharCode(byteValue) + "'";
		// return
		return result;
	}


	/**
	 * Converts value to a hex address.
	 * @param value The value to convert.
	 * @returns A string with hex conversion, e.g. "FA20h"
	 */
	public static getConversionForAddress(value: number): string {
		// word
		let result = Format.getHexString(value) + 'h';
		// return
		return result;
	}


	/**
	 * Puts together a few common conversions for a word value.
	 * E.g. decimal.
	 * Used to create the comment for an EQU label.
	 * @param wordValue The value to convert.
	 * @returns A string with all conversions, e.g. "62333, -3212"
	 */
	public static getVariousConversionsForWord(wordValue: number): string {
		// word
		let result = wordValue.toString();
		// Negative?
		let convValue = wordValue;
		if (convValue >= 0x8000) {
			convValue -= 0x10000;
			result += ', ' + convValue.toString().padStart(6, ' ');
		}
		// return
		return result;
	}


	/**
	 * Formats a disassembly string for output.
	 * @param memory The Memory to disassemble. For the opcodes. If undefined no opcodes will be printed.
	 * @param opcodesLowerCase true if opcodes should be printed lower case.
	 * @param clmnsAddress Number of digits used for the address. If 0 no address is printed.
	 * @param clmnsBytes Minimal number of characters used to display the opcodes.
	 * @param clmnsOpcodeFirstPart Minimal number of digits used to display the first of the opcode, e.g. "LD"
	 * @param clmsnOpcodeTotal Minimal number of digits used to display the first total opcode, e.g. "LD A,(HL)"
	 * @param address The address of the opcode. Only used if 'memory' is available (to retrieve opcodes) or if 'clmsnAddress' is not 0.
	 * @param size The size of the opcode. Only used to display the opcode byte values and only used if memory is defined.
	 * @param mainString The opcode string, e.g. "LD HL,35152"
	 * @param addrString If not undefined this string is printed instead of the 'address'. Used to add bank information.
	 */
	public static formatDisassembly(memory: BaseMemory | undefined, opcodesLowerCase: boolean, clmnsAddress: number, clmnsBytes: number, clmnsOpcodeFirstPart: number, clmsnOpcodeTotal: number, address: number, size: number, mainString: string, addrString: string|undefined): string {	// NOSONAR
		let line = '';

		// Add address field?
		if (clmnsAddress > 0) {
			if (!addrString)
				addrString = Format.getHexString(address);
			line = addrString.padEnd(clmnsAddress - 1) + ' ';
		}

		// Add bytes of opcode?
		let bytesString = '';
		if (memory) {
			for (let i = 0; i < size; i++) {
				const memVal = memory.getValueAt(address + i);
				bytesString += Format.getHexString(memVal, 2) + ' ';
			}
		}
		line += bytesString.padEnd(clmnsBytes) + ' ';	// Should end with 2 spaces

		// Add opcode (or defb)
		const arr = mainString.split(' ');
		assert(arr.length > 0, 'formatDisassembly');
		arr[0] = arr[0].padEnd(clmnsOpcodeFirstPart - 1);	// 1 is added anyway when joining
		let resMainString = arr.join(' ') + ' ';
		resMainString = resMainString.padEnd(clmsnOpcodeTotal);

		line += resMainString;

		// return
		return line;
	}

}

