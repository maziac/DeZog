import * as assert from 'assert';
import { BaseMemory } from './basememory';


export class Format {

	/// Choose opcodes in lower or upper case.
	public static hexNumbersLowerCase = false;

	/**
	 * Returns a hex string with a fixed number of digits.
	 * @param value The value to convert.
	 * @param countDigits The number of digits.
	 * @returns a string, e.g. "04fd".
	 */
	public static getHexString(value:number, countDigits = 4): string {
		let s = value.toString(16);
		if(!Format.hexNumbersLowerCase)
			s = s.toUpperCase();
		return Format.fillDigits(s, '0', countDigits);
	}


	/**
	 * If string is smaller than countDigits the string is filled with 'fillCharacter'.
	 * Used to fill a number up with '0' or spaces.
	 */
	public static fillDigits(valueString:string, fillCharacter: string, countDigits: number): string {
		const repeat = countDigits-valueString.length;
		if(repeat <= 0)
			return valueString;
		const res = fillCharacter.repeat(repeat) + valueString;
		return res;
	}


	/**
	 * Adds spaces to the end of the string until the given total length
	 * is reached.
	 * @param s The string.
	 * @param totalLength The total filled length of the resulting string
	 * @returns s + ' ' (several spaces)
	 */
	public static addSpaces(s:string, totalLength: number): string {
		const countString = s.length;
		const repeat = totalLength - countString;
		if(repeat <= 0)
			return s;
		const res = s + ' '.repeat(repeat);
		return res;
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
		if(byteValue < 0)
			byteValue = 0x100 + byteValue;
		let result = byteValue.toString();
		// Negative?
		let convValue = byteValue;
		if(convValue >= 0x80) {
			convValue -= 0x100;
			result += ', ' + Format.fillDigits(convValue.toString(), ' ', 4);
		}
		// Check for ASCII
		if(byteValue >= 32 /*space*/ && byteValue <= 126 /*tilde*/)
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
		if(convValue >= 0x8000) {
			convValue -= 0x10000;
			result += ', ' + this.fillDigits(convValue.toString(), ' ', 6);
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
	 */
	public static formatDisassembly(memory: BaseMemory|undefined, opcodesLowerCase: boolean, clmnsAddress: number, clmnsBytes: number, clmnsOpcodeFirstPart: number, clmsnOpcodeTotal: number, address: number, size: number, mainString: string): string {
		let line = '';

		// Add address field?
		if(clmnsAddress > 0) {
			line = Format.addSpaces(Format.getHexString(address)+' ', clmnsAddress);
		}

		// Add bytes of opcode?
		let bytesString = '';
		if(memory) {
			for(let i=0; i<size; i++) {
				const memVal = memory.getValueAt(address+i);
				bytesString += Format.getHexString(memVal, 2) + ' ';
			}
		}
		line += Format.addSpaces(bytesString, clmnsBytes);

		// Add opcode (or defb)
		const arr = mainString.split(' ');
		assert(arr.length > 0, 'formatDisassembly');
		arr[0] = Format.addSpaces(arr[0], clmnsOpcodeFirstPart-1);	// 1 is added anyway when joining
		let resMainString = arr.join(' ');
		resMainString = Format.addSpaces(resMainString+' ', clmsnOpcodeTotal);

		line +=  resMainString;

		// return
		return line;
	}

}

