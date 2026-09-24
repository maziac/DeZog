import {HexNumber} from '../settings/settingscustommemory';
import {Utility} from './utility';


/**
 * Hex and number string conversion: formatting values as hex/bits/chars and parsing number strings.
 * Has no dependencies to other DeZog modules.
 */
export class HexFormat {

	/**
	 * Returns a hex string from a number with leading zeroes.
	 * @param value The number to convert
	 * @param size The number of digits for the resulting string.
	 * @returns E.g. "AF" or "0BC8"
	 */
	public static getHexString(value: number | undefined, size: number): string {
		if (value !== undefined) {
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
		const hex = HexFormat.getHexString(value, 4);
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
	 * Parses a hex string, but parses in little endian.
	 * I.e. '12FA' returns 0xFA12.
	 * @param hexString A string, e.g. '12FA'
	 * @param index Starts from this index. If omitted starts at 0.
	 * @returns The result, e.g. 0xFA12.
	 */
	public static parseHexWordLE(hexString: string, index = 0): number {
		const sub1 = hexString.substring(index, index + 2);
		const sub2 = hexString.substring(index + 2, index + 4);
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
		const res = (value == ' '.charCodeAt(0)) ? '&nbsp;' : HexFormat.getASCIIChar(value);
		return res;
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
	 * Converts a HexNumber into a number.
	 * A HexNumber can either be a number already or it is a (hex) string,
	 * like "0xFFFF" or "123Dh", but also decimal is allowed, e.g. "436".
	 * If it is a string it is converted.
	 * @param hexNumber "number" or "string". E.g. "123Dh". Or undefined: in that case undefined is also returned.
	 * @returns A number e.g. 65535.
	 */
	public static convertHexNumber(hexNumber: HexNumber | undefined): number | undefined {
		if (hexNumber === undefined)
			return undefined;
		if (typeof hexNumber === "string") {
			// Convert hex into number
			hexNumber = HexFormat.parseValue(hexNumber);
		}
		Utility.assert(typeof hexNumber === "number");
		return hexNumber;
	}
}
