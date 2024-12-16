import {Utility} from "../utility";
import {Zx81Tokens} from "./zx81tokens";

/** Class to read and interpret the ZX81 BASIC variables. */
export class Zx81BasicVars {
	// The address of the VARS and E_LINE system variable.
	protected static readonly VARS = 16400;
	protected static readonly E_LINE = 16404;

	// New/current BASIC vars
	public basicVars: Map<string, number | string> = new Map();

	// Addresses of the BASIC vars
	protected basicVarsAddress: Map<string, number> = new Map();


	/** Reads the BASIC vars from the memory.
	 * @param readMemory The function to read memory. (addresses as 64k)
	 * @returns The BASIC vars buffer and the start address: [buffer, start].
	 */
	public async getBasicVars(readMemory: (addr64k: number, len: number) => Promise<Uint8Array>): Promise<[Uint8Array, number]> {
		// Get basic variables
		const varsBuf = await readMemory(Zx81BasicVars.VARS, 2);
		const vars = varsBuf[0] + varsBuf[1] * 256;
		const elineBuf = await readMemory(Zx81BasicVars.E_LINE, 2);
		const eline = elineBuf[0] + elineBuf[1] * 256;
		const size = eline - vars - 1;
		const basicVars = await readMemory(vars, size);
		return [basicVars, vars];
	}


	/** Creates a map of variables and values from the BASIC vars buffer.
	 * Stores it in this.basicVars. The map is cleared before.
	 * The previous buffer (this.basicVars) is stored in this.lastBasicVars.
	 * @param basicVars The BASIC vars buffer.
	 * @param address The start address of the BASIC vars.
	 */
	public parseBasicVars(basicVars: Uint8Array, address: number): void {
		// Clear new BASIC vars
		this.basicVars = new Map<string, number | string>();
		this.basicVarsAddress.clear();

		// Parse the BASIC vars
		let i = 0; const len = basicVars.length;
		while (i < len) {
			// Check for type
			const firstByte = basicVars[i++];
			address++;
			let firstLetter = (firstByte & 0b0001_1111) + 0x20;
			const type = firstByte & 0b1110_0000;
			switch (type) {
				case 0b0110_0000:	// One letter number
				case 0b1110_0000:	// Variable in FOR-NEXT loop
					{
						// Letter, 5 byte value
						if (firstLetter < 0x26 || firstLetter > 0x3F)
							throw Error('Invalid BASIC variable.');
						const varName = Zx81Tokens.tokens[firstLetter];
						// Read value
						const valueBuf = basicVars.slice(i, i + 5);
						const value = Zx81Tokens.convertBufToZx81Float(valueBuf);
						// Store the variable
						this.basicVars.set(varName, value);
						// Store the address
						this.basicVarsAddress.set(varName, address);
						// Next
						i += 5;
						address += 5;

						// Now check if it is FOR-NEXT
						if (type === 0b1110_0000) {
							// Skip limit, step and line number
							i += 5 + 5 + 2;
						}
					}
					break;

				case 0b1010_0000:	// Multi-character number
					{
						// Letter, +characters, 5 byte value
						if (firstLetter < 0x26 || firstLetter > 0x3F)
							throw Error('Invalid BASIC variable.');
						let varName = Zx81Tokens.tokens[firstLetter];
						// Now find more characters
						while (true) {
							const byte = basicVars[i++];
							address++;
							const end = byte & 0b1100_0000;
							if (end !== 0 && end !== 0b1000_0000)
								throw Error('Corrupted BASIC variable.');
							const char = byte & 0b0011_1111;
							if (char < 0x1C || char > 0x3F)
								throw Error('Invalid BASIC variable.');
							varName += Zx81Tokens.tokens[char];
							if(end === 0b1000_0000)
								break;
						}
						// Read value
						const valueBuf = basicVars.slice(i, i + 5);
						const value = Zx81Tokens.convertBufToZx81Float(valueBuf);
						// Store the variable
						this.basicVars.set(varName, value);
						// Store the address
						this.basicVarsAddress.set(varName, address);
						// Next
						i += 5;
						address += 5;
					}
					break;

				case 0b1000_0000:	// Array of numbers (one letter only)
					{
						// Letter
						if (firstLetter < 0x26 || firstLetter > 0x3F)
							throw Error('Invalid BASIC variable.');
						const varName = Zx81Tokens.tokens[firstLetter];
						// Read array total length
						const arrayLength = basicVars[i++] + 256 * basicVars[i++];
						// Number of dimensions
						const dimensions = basicVars[i++];
						const floatsLength = arrayLength - 1 - 2 * dimensions;
						// Read size of each dimension
						const dimSizes: number[] = [];
						const dimIndex: number[] = [];
						for (let j = 0; j < dimensions; j++) {
							const dimSize = basicVars[i++] + 256 * basicVars[i++];
							dimSizes.push(dimSize);
							dimIndex.push(1);
						}
						// Read values
						let k = 0;
						address += 3 + 2 * dimensions;
						while (k < floatsLength) {
							const valueBuf = basicVars.slice(i, i + 5);
							const value = Zx81Tokens.convertBufToZx81Float(valueBuf);
							// Store the variable
							const varNameWithIndex = varName + '(' + dimIndex.join(',') + ')';
							this.basicVars.set(varNameWithIndex, value);
							// Store the address
							this.basicVarsAddress.set(varNameWithIndex, address);
							// Next
							let j = dimensions - 1;
							while (j >= 0) {
								dimIndex[j]++;
								if (dimIndex[j] <= dimSizes[j])
									break;
								dimIndex[j] = 1;
								j--;
							}
							i += 5;
							k += 5;
							address += 5;
						}
					}
					break;

				case 0b0100_0000:	// String (one letter only)
					{
						// Letter, number of chars, chars
						if (firstLetter < 0x26 || firstLetter > 0x3F)
							throw Error('Invalid BASIC variable.');
						const varName = Zx81Tokens.tokens[firstLetter] + '$';
						// Read length
						const length = basicVars[i++] + 256 * basicVars[i++];
						address += 2;
						// Read chars
						let str = '"';
						for (let j = 0; j < length; j++) {
							const char = basicVars[i++];
							str += Zx81Tokens.tokens[char];
						}
						str += '"';
						// Store the variable
						this.basicVars.set(varName, str);
						// Store the address
						this.basicVarsAddress.set(varName, address);
						address += length;
					}
					break;

				case 0b1100_0000:	// Array of chars (one letter only)
					{
						// Letter
						if (firstLetter < 0x26 || firstLetter > 0x3F)
							throw Error('Invalid BASIC variable.');
						const varName = Zx81Tokens.tokens[firstLetter] + '$';
						// Read array total length
						const arrayLength = basicVars[i++] + 256 * basicVars[i++];
						// Number of dimensions
						const dimensions = basicVars[i++];
						const charsLength = arrayLength - 1 - 2 * dimensions;
						address += 3 + 2 * dimensions;
						// Read size of each dimension
						const dimSizes: number[] = [];
						const dimIndex: number[] = [];
						for (let j = 0; j < dimensions; j++) {
							const dimSize = basicVars[i++] + 256 * basicVars[i++];
							dimSizes.push(dimSize);
							dimIndex.push(1);
						}
						// Read values
						let k = 0;
						while (k < charsLength) {
							const char = basicVars[i++];
							const value = Zx81Tokens.tokens[char];
							k++;
							// Store the variable
							const varNameWithIndex = varName + '(' + dimIndex.join(',') + ')';
							this.basicVars.set(varNameWithIndex, '"' + value + '"');
							// Store the address
							this.basicVarsAddress.set(varNameWithIndex, address);
							address++;
							// Next
							let j = dimensions - 1;
							while (j >= 0) {
								dimIndex[j]++;
								if (dimIndex[j] <= dimSizes[j])
									break;
								dimIndex[j] = 1;
								j--;
							}
						}
					}
					break;
			}
		}
	}


	/** Returns all values for the given list of strings.
	 * @param varNames The list of variable names.
	 * @returns A string with variable names and values.
	 * Note: Not used.
	*/
	public getVariableValues(varNames: string[]): string {
		const results: string[] = [];
		for (let varName of varNames) {
			const value = this.basicVars.get(varName);
			results.push(varName + '=' + (value === undefined ? 'undefined' : value));
		}
		const result = results.join(', ');
		return result;
	}


	/** Returns all variables with values.
	 * @returns A string with all variables and values.
	 */
	public getAllVariablesWithValues(): string[] {
		const results: string[] = [];
		for (let [varName, value] of this.basicVars) {
			let txt = varName + '=';
			if (value === undefined)
				txt += 'undefined';
			else {
				txt += value;
				const address = this.basicVarsAddress.get(varName)!;
				txt += ' @0x' + Utility.getHexString(address, 4);
			}
			results.push(txt);
		}
		return results;
	}
}
