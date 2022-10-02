import * as fs from 'fs';
import {MemoryDump} from '../misc/memorydump';
import {Utility} from "../misc/utility";
import {Remote} from "../remotes/remotebase";
import {Settings} from "../settings/settings";
import {MemoryDeltaView} from "../views/memorydeltaview";
import {MemoryDumpView} from "../views/memorydumpview";
import {MemoryDumpViewWord} from "../views/memorydumpviewword";
import {MemoryRegisterView} from "../views/memoryregisterview";


/** A static class that contains the debug console commands to evaluate the memory.
 */
export class MemoryCommands {

	/**
	 * Checks if the given string is 'little' or 'big' case insensitive.
	 * Throws an exception if string evaluates to something different.
	 * @param endiannessString The string to check.
	 * @returns true for 'little' or undefined and 'false for 'big'.
	 */
	protected static isLittleEndianString(endiannessString: string | undefined) {
		let littleEndian = true;
		if (endiannessString != undefined) {
			const s = endiannessString.toLowerCase();
			if (s != 'little' && s != 'big')
				throw Error("Endianness (" + endiannessString + ") unknown.");
			littleEndian = (s == 'little');
		}
		return littleEndian;
	}


	/**
	 * Does a delta string search on the given memory range
	 * and converts the range afterwards by the found offset.
	 * This is to find hiscore names in memory when the text is not
	 * ASCII encoded. In this case most probably at least the
	 * differences between teh characters can be found.
	 * If something is found the whole memory is printed with
	 * the given offset. Making it possible to see also the other
	 * hiscore names.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	public static async evalMemDelta(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 3) {
			// Error Handling: Too less arguments
			throw Error("Address, size and a search string expected.");
		}

		// Address
		const addressString = tokens[0];
		const startAddress = Utility.evalExpression(addressString);
		if (startAddress < 0 || startAddress > 0xFFFF)
			throw Error("Address (" + startAddress + ") out of range.");

		// Size
		const sizeString = tokens[1];
		const size = Utility.evalExpression(sizeString);
		if (size < 0 || size > 0xFFFF)
			throw Error("Size (" + size + ") out of range.");

		// Search string (without parenthesis)
		const searchString = tokens[2];
		if (!searchString)
			throw Error("No search string given.");
		if (searchString.length < 2)
			throw Error("Search string must contain of at least 2 characters.");


		// Get memory
		const md = new MemoryDump();
		md.addBlockWithoutBoundary(startAddress, size);
		const data = await Remote.readMemoryDump(startAddress, size);
		md.metaBlocks[0].data = data;

		// Delta search
		const searchInputData = md.parseSearchInput(searchString);
		const found = md.searchData(searchInputData, true, false, true);
		const addresses = found.addresses;

		// Check for errors
		if (!addresses)
			throw Error("Some problem occurred during search.");
		if (addresses.length)
			throw Error("Sequence not found.");

		// 'Print'
		let output = '';
		for (const addr64k of addresses) {
			// Calculate offset
			const index = addr64k - startAddress;
			const valOffset = searchInputData[0] - data[index];
			// Print complete range
			for (let i = 0; i < size;) {
				// Print address
				const addr = startAddress + i;
				const remainder = addr % 16;
				const addrShow = addr - remainder;
				const addrString = Utility.getHexString(addrShow, 4);
				output += addrString + ': ';

				// Print hex and ascii:
				// Print spaces
				output += '   '.repeat(remainder);
				let ascii = ' '.repeat(remainder);
				// Print values
				for (let k = remainder; k < 16; k++) {
					// Calculate value with offset
					const modValue = data[i++] + valOffset;
					output += Utility.getHexString(modValue, 2);
					ascii += Utility.getHTMLChar(modValue);
				}
				// Add ASCII
				output += ascii + '\n';
			}
		}

		// Send response
		return output;
	}


	/**
	 * Shows a view with a memory dump.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	public static async evalMemDump(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: Too less arguments
			throw Error("Address and size expected.");
		}

		// Address
		const addressString = tokens[0];
		const address = Utility.evalExpression(addressString);
		if (address < 0 || address > 0xFFFF)
			throw Error("Address (" + address + ") out of range.");

		// Size
		const sizeString = tokens[1];
		const size = Utility.evalExpression(sizeString);
		if (size < 0 || size > 0xFFFF)
			throw Error("Size (" + size + ") out of range.");

		// Byte or word
		let unitSize = 1; 	// Default=byte
		let bigEndian = false;
		// Hex/dec
		let hex = true;
		const typeString = tokens[2];
		if (typeString) {
			const typeStringLower = typeString.toLowerCase();
			if (typeStringLower != "hex" && typeStringLower != "dec" && typeStringLower != "word")
				throw Error("'hex', 'dec' or 'word' expected but got '" + typeString + "'.");
			let k = 2;
			// Check for hex or dec
			if (typeString == 'hex')
				k++;
			else if (typeString == 'dec') {
				hex = false;
				k++;
			}
			// Check for unit size (word)
			const unitSizeString = tokens[k];
			if (unitSizeString) {
				const unitSizeStringLower = unitSizeString.toLowerCase()
				if (unitSizeStringLower != "word")
					throw Error("'word' expected but got '" + unitSizeString + "'.");
				unitSize = 2;
				// Endianness
				const endianness = tokens[k + 1];
				if (endianness) {
					const endiannessLower = endianness.toLowerCase();
					if (endiannessLower == "big") {
						// Big endian
						bigEndian = true;
					}
					else if (endiannessLower != "little") {
						throw Error("'little' or 'big' expected but got '" + endianness + "'.");
					}
				}
			}
		}

		// Get memory
		const data = await Remote.readMemoryDump(address, size);

		// 'Print'
		let output = '';
		for (let i = 0; i < size; i += unitSize) {
			let value = data[i];
			if (unitSize == 2) {
				if (bigEndian)
					value = (value << 8) + data[i + 1];
				else
					value += data[i + 1] << 8;
			}
			if (hex)
				output += Utility.getHexString(value, 2 * unitSize) + ' ';
			else
				output += value + ' ';
		}

		// Send response
		return output;
	}


	/**
	 * Sets a memory location to some value.
	 * @param valSize 1 or 2 for byte or word.
	 * @param addressString A string with a label or hex/decimal number or an expression that is used as start address.
	 * @param valueString The value to set.
	 * @param repeatString How often the value gets repeated. Optional. Defaults to '1'.
	 * @param endiannessString The endianness. For valSize==2. 'little' or 'big'. Optional. defaults to 'little'.
	 */
	protected static async memSet(valSize: number, addressString: string, valueString: string, repeatString?: string, endiannessString?: string) {
		// Address
		const address = Utility.evalExpression(addressString);
		if (address < 0 || address > 0xFFFF)
			throw Error("Address (" + address + ") out of range.");

		// Value
		const value = Utility.evalExpression(valueString);
		const maxValue = 2 ** (valSize * 8);
		if (value >= maxValue || value < (-maxValue / 2))
			throw Error("Value (" + value + ") too big (or too small).");

		// Repeat
		const repeat = (repeatString != undefined) ? Utility.evalExpression(repeatString) : 1;
		const totalSize = valSize * repeat;
		if (totalSize <= 0 || totalSize > 0xFFFF)
			throw Error("Repetition (" + repeat + ") out of range.");

		// Endianness
		const littleEndian = this.isLittleEndianString(endiannessString);

		// Set (or fill) memory

		// Prepare data
		const data = new Uint8Array(totalSize);
		let index = 0;
		for (let r = 0; r < repeat; r++) {
			let val = value;
			for (let k = 0; k < valSize; k++) {
				if (littleEndian) {
					data[index + k] = val & 0xFF;
				}
				else {
					data[index + valSize - k - 1] = val & 0xFF;
				}
				// Next
				val = val >> 8;
			}
			// Next
			index += valSize;
		}

		// Write to remote
		await Remote.writeMemoryDump(address, data);
	}


	/**
	 * Sets a memory location to some byte value.
	 * "-msetb address value repeat"
	 * "-msetb 8000h 74h""
	 * @param tokens The arguments. I.e. the address, value and (optional) repeat.
	 * @returns 'OK'
	 */
	public static async evalMemSetByte(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: Too less arguments
			throw Error("At least address and value expected.");
		}
		// Check count of arguments
		if (tokens.length > 3) {
			// Error Handling: Too many arguments
			throw Error("Too many arguments.");
		}

		await this.memSet(1, tokens[0] /*address*/, tokens[1] /*value*/, tokens[2] /*repeat*/);

		return 'OK';
	}


	/**
	 * Sets a memory location to some word value.
	 * "-msetw address value repeat endianness"
	 * "-msetw 8000h 7654h""
	 * @param tokens The arguments. I.e. the address, value, repeat and endianness. Only the first 2 are mandatory.
	 * @returns 'OK'
	 */
	public static async evalMemSetWord(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: Too less arguments
			throw Error("At least address and value expected.");
		}
		// Check count of arguments
		if (tokens.length > 4) {
			// Error Handling: Too many arguments
			throw Error("Too many arguments.");
		}

		await this.memSet(2, tokens[0] /*address*/, tokens[1] /*value*/, tokens[2] /*repeat*/, tokens[3] /*endianness*/);

		return 'OK';
	}


	/**
	 * Saves a memory dump to a file.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	public static async evalMemSave(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length < 2) {
			// Error Handling: No arguments
			throw Error("Address and size expected.");
		}

		// Address
		const addressString = tokens[0];
		const address = Utility.evalExpression(addressString);
		if (address < 0 || address > 0xFFFF)
			throw Error("Address (" + address + ") out of range.");

		// Size
		const sizeString = tokens[1];
		const size = Utility.evalExpression(sizeString);
		if (size < 0 || size > 0xFFFF)
			throw Error("Size (" + size + ") out of range.");

		// Get filename
		const filename = tokens[2];
		if (!filename)
			throw Error("No filename given.");

		// Get memory
		const data = await Remote.readMemoryDump(address, size);

		// Save to .tmp/filename
		const relPath = Utility.getRelTmpFilePath(filename);
		const absPath = Utility.getAbsFilePath(relPath);
		fs.writeFileSync(absPath, data);

		// Send response
		return 'OK';
	}


	/**
	 * Shows a view with a memory dump.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	public static async evalMemViewByte(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		if (tokens.length % 2 != 0) {
			// Error Handling: No size given
			throw new Error("No size given for address '" + tokens[tokens.length - 1] + "'.");
		}

		// Get all addresses/sizes.
		const addrSizes = new Array<number>();
		for (let k = 0; k < tokens.length; k += 2) {
			// Address
			const addressString = tokens[k];
			const address = Utility.evalExpression(addressString);
			addrSizes.push(address);

			// Size
			const sizeString = tokens[k + 1];
			const size = Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel = new MemoryDumpView();
		for (let k = 0; k < tokens.length; k += 2) {
			const start = addrSizes[k];
			const size = addrSizes[k + 1]
			panel.addBlock(start, size, Utility.getHexString(start & 0xFFFF, 4) + 'h-' + Utility.getHexString((start + size - 1) & 0xFFFF, 4) + 'h');
		}
		panel.mergeBlocks();
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Shows a view with a memory dump that can be used for comparison
	 * at different times.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	public static async evalMemViewDelta(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		if (tokens.length % 2 != 0) {
			// Error Handling: No size given
			throw new Error("No size given for address '" + tokens[tokens.length - 1] + "'.");
		}

		// Get all addresses/sizes.
		const addrSizes = new Array<number>();
		for (let k = 0; k < tokens.length; k += 2) {
			// Address
			const addressString = tokens[k];
			const address = Utility.evalExpression(addressString);
			addrSizes.push(address);

			// Size
			const sizeString = tokens[k + 1];
			const size = Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel = new MemoryDeltaView();
		for (let k = 0; k < tokens.length; k += 2) {
			const start = addrSizes[k];
			const size = addrSizes[k + 1]
			panel.addBlock(start, size, Utility.getHexString(start & 0xFFFF, 4) + 'h-' + Utility.getHexString((start + size - 1) & 0xFFFF, 4) + 'h');
		}
		panel.mergeBlocks();
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Shows a view with a memory dump. The memory is organized in
	 * words instead of bytes.
	 * One can choose little or big endian.
	 * @param tokens The arguments. I.e. the address, size and endianness.
	 * @returns A Promise with a text to print.
	 */
	public static async evalMemViewWord(tokens: Array<string>): Promise<string> {
		// Check for endianness
		let littleEndian = true;
		if (tokens.length % 2 != 0) {
			// Last one should be endianness
			const endiannessString = tokens.pop()
			littleEndian = this.isLittleEndianString(endiannessString);
		}

		// Check count of arguments
		if (tokens.length == 0) {
			// Error Handling: No arguments
			throw new Error("Address and size expected.");
		}

		// Get all addresses/sizes.
		const addrSizes = new Array<number>();
		for (let k = 0; k < tokens.length; k += 2) {
			// Address
			const addressString = tokens[k];
			const address = Utility.evalExpression(addressString);
			addrSizes.push(address);

			// Size
			const sizeString = tokens[k + 1];
			const size = Utility.evalExpression(sizeString);
			addrSizes.push(size);
		}

		// Create new view
		const panel = new MemoryDumpViewWord(littleEndian);
		for (let k = 0; k < tokens.length; k += 2) {
			const start = addrSizes[k];
			const size = addrSizes[k + 1]
			panel.addBlock(start, size, Utility.getHexString(start & 0xFFFF, 4) + 'h-' + Utility.getHexString((start + 2 * size - 1) & 0xFFFF, 4) + 'h');
		}
		panel.mergeBlocks();
		await panel.update();

		// Send response
		return 'OK';
	}


	/**
	 * Shows the register memory view.
	 * @returns A Promise with a text to print. I.e. "OK"
	 */
	public static async evalRegisterMemView(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length != 0) {
			// Error Handling: No arguments
			throw new Error("No parameters expected.");
		}

		// Create memory/register dump view
		const registerMemoryView = new MemoryRegisterView();
		const regs = Settings.launch.memoryViewer.registersMemoryView;
		registerMemoryView.addRegisters(regs);
		await registerMemoryView.update();

		// Send response
		return 'OK';
	}
}
