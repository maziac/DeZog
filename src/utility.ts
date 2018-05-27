//import { Settings } from './settings';
import { Labels } from './labels';
import { zSocket } from './zesaruxSocket';
import { CallSerializer } from './callserializer';
import { Settings } from './settings';
import * as fs from 'fs';
import * as path from 'path';


export class Utility {
	/**
	 * Returns a hex string from a number with leading zeroes.
	 * @param value The number to convert
	 * @param size The number of digits for the resulting string.
	 */
	public static getHexString(value: number, size: number) {
		var s = value.toString(16);
		return "0".repeat(size - s.length) + s.toUpperCase();
	}


	/**
	 * Returns a binary string from a number with leading zeroes.
	 * @param value The number to convert
	 * @param size The number of digits for the resulting string.
	 */
	public static getBitsString(value: number, size: number) {
		var s = value.toString(2);
		return "0".repeat(size - s.length) + s;
	}


	/**
	 * Strips the assembler ';' comment from the line.
	 * @param line The line to strip.
	 * @returns The line without any comment.
	 */
	public static stripComment(line: string): string {
		// find comment character
		const k = line.indexOf(';');
		if(k < 0)
			return line;	// no comment
		// Return anything but the comment
		return line.substr(0,k);
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
		const lowerString = valueString.toLowerCase();
		//const match = /\s*(0x|\$|_)?([\-0-9a-fszhpnc]+)(h?)/.exec(lowerString);
		const match = /^\s*((0x|\$)([0-9a-f]+)([^0-9a-f]*))?(([0-9a-f]+)h(.*))?(([01]+)b(.*))?(_([szhnpc]+)([^szhnpc])*)?((-?[0-9]+)([^0-9]*))?/.exec(lowerString);
		if(!match)
			return NaN;	// Error during parsing

		const ghex = match[3];	// 0x or $
		const ghex_empty = match[4];	// should be empty

		const ghexh = match[6];	// h
		const ghexh_empty = match[7];	// should be empty

		const gbit = match[9];	// b
		const gbit_empty = match[10];	// should be empty

		const gflags = match[12];	// _
		const gflags_empty = match[13];	// should be empty

		const gdec = match[15];	// decimal
		const gdec_empty = match[16];	// should be empty

		// Hex
		if(ghex) {
			if(ghex_empty)
				return NaN;
				return parseInt(ghex, 16);
			}
		if(ghexh) {
			if(ghexh_empty)
				return NaN;
			return parseInt(ghexh, 16);
		}

		// Decimal
		if(gdec) {
			if(gdec_empty)
				return NaN;
			return parseInt(gdec, 10);;
		}
		// Bits
		if(gbit) {
			if(gbit_empty)
				return NaN;
			return parseInt(gbit, 2);
		}

		// Check if status flag value
		if(gflags) {
			if(gflags_empty)
				return NaN;
			var flags = 0;
			if(gflags.includes('s')) flags |= 0x80;
			if(gflags.includes('z')) flags |= 0x40;
			if(gflags.includes('h')) flags |= 0x10;
			if(gflags.includes('p')) flags |= 0x04;
			if(gflags.includes('n')) flags |= 0x02;
			if(gflags.includes('c')) flags |= 0x01;
			return flags;
		}

		// Unknown
		return NaN;
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
		if(!format.includes('\t'))
			return null;	// no tabs
		// Replace every formatting with maximum size replacement
		var result = format.replace(/\${([^}]*?:)?([^:]*?)(:[\s\S]*?)?}/g, (match, p1, p2, p3) => {
			var usedSize = size;
			// Check modifier p1
			const modifier = (p1 == null) ? '' : p1.substr(0, p1.length-1);
			switch(modifier) {
				case 'b@':
					usedSize = 1;
					break;
				case 'w@':
					usedSize = 2;
					break;
				}
			// Check formatting
			switch(p2) {
				case 'name':
					return "nn";
				case 'hex':
					return "h".repeat(2*usedSize);
				case 'bits':
					return "b".repeat(8*usedSize);
				case 'unsigned':
					return (Math.pow(256, usedSize)-1).toString();
				case 'signed':
					return '-' + (Math.pow(256, usedSize)/2).toString();
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
	 * ${unsigned} = value as unsigned, e.g. 1234
	 * $(signed) = value as signed, e.g. -59
	 * $(bits) = value as bits , e.g. 10011011
	 * $(flags) = value interpreted as status flags (only useful for Fand F#), e.g. ZNC
	 * ${labels} = value as label (or several labels)"
	 * @param tabSizeArr An array of strings each string contains the max number of characters for each tab. Or null. If null the tab sizes are calculated on the fly.
	 * @param handler A function that is called with the formatted string as argument.
	 * It is required because it might be that for formatting it is required to
	 * get more data from the socket.
	 */
	public static numberFormattedBy(name: string, value: number, size: number, format: string, tabSizeArr?: Array<string>, handler: {(formattedString: string)} = (data) => {}) {
		// Variables
		var memByte = 0;
		var memWord = 0;

		// Serialize calls
		CallSerializer.execAll(

			// Memory dump retrieving
			(cs) => {
				// Check first if we need to retrieve address values
				const matchAddr = /(\${b@:|\${w@:)/.exec(format);
				if(matchAddr) {
					// Retrieve memory values
					zSocket.send( 'read-memory ' + value + ' 2', data => {
						const b1 = data.substr(0,2);
						const b2 = data.substr(2,2);
						memByte = parseInt(b1,16);
						memWord = memByte + (parseInt(b2,16)<<8);
						cs.endExec();
					});
				}
				else {
					// End directly
					cs.endExec();
				}
			},

			// Formatting
			(cs) => {
				// Search for format string '${...}'
				// Note: [\s\S] is the same as . but also includes newlines.
				var valString = format.replace(/\${([\s\S]*?)}/g, (match, p1) => {
					// '${...}' found now check content
					const innerMatch = /^([^\|]*?:)?([^\|]*?)(\|[\s\S]*?)?(\|[\s\S]*?)?$/.exec(p1);
					if(innerMatch == undefined)
						return '${'+p1+'???}';
					// Modifier
					var usedValue;
					var usedSize;
					var modifier = innerMatch[1];	// e.g. 'b@:' or 'w@:'
					modifier = (modifier == null) ? '' : modifier.substr(0, modifier.length-1);
					switch(modifier) {
						case 'b@':
							usedValue = memByte;	// use byte at address
							usedSize = 1;
							break;
						case 'w@':
							usedValue = memWord;	// use word at address
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
					var innerLabelSeparator = innerMatch[3];	// e.g. ', '
					innerLabelSeparator = (innerLabelSeparator == null) ? '' : innerLabelSeparator.substr(1);
					var endLabelSeparator = innerMatch[4];	// e.g. ', '
					endLabelSeparator = (endLabelSeparator == null) ? '' : endLabelSeparator.substr(1);
					switch(formatting) {
						case 'name':
							return name;
						case 'hex':
							return Utility.getHexString(usedValue,2*usedSize);
						case 'bits':
							return Utility.getBitsString(usedValue,usedSize*8);
						case 'unsigned':
							return usedValue.toString();
						case 'signed':
							const maxValue = Math.pow(256,usedSize);
							const halfMaxValue = maxValue/2;
							return ((usedValue >=  halfMaxValue) ? usedValue-maxValue : usedValue).toString();
						case 'char':
							return (usedValue >= 32 && usedValue < 127) ? String.fromCharCode(usedValue) : '';
						case 'flags':
							// interprete byte as Z80 flags:
							// Zesarux: (e.g. "SZ5H3PNC")
							// S Z X H X P/V N C
							var res = (usedValue&0x80)? 'S' : '';	// S=sign
							res += (usedValue&0x40)? 'Z' : '';	// Z=zero
							res += (usedValue&0x10)? 'H' : '';	// H=Half Carry
							res += (usedValue&0x04)? 'P' : '';	// P/V=Parity/Overflow
							res += (usedValue&0x02)? 'N' : '';	// N=Add/Subtract
							res += (usedValue&0x01)? 'C' : '';	// C=carry
							return res;

						case 'labels':
						{
							// calculate labels
							const labels = Labels.getLabelsForNumber(value);
							// format
							if(labels && labels.length > 0)
								return modifier + labels.join(innerLabelSeparator) + endLabelSeparator;
							// No label
							return '';
						}

						case 'labelsplus':
						{
							// calculate labels
							const labels = Labels.getLabelsPlusIndexForNumber(value);
							// format
							if(labels && labels.length > 0)
								return modifier + labels.join(innerLabelSeparator) + endLabelSeparator;
							// No label
							return '';
						}

						default:
							// unknown formatting
							return '${'+1+'???}';
					}
				});

				// Format on tabs
				if(!tabSizeArr)
					tabSizeArr = Utility.calculateTabSizes(format, size);
				if(tabSizeArr)
					if(tabSizeArr.length == valString.split('\t').length) {
						var index = 0;
						valString += '\t';	// to replace also the last string
						valString = valString.replace(/(.*?)\t/g, (match, p1, offset) => {
							if(!tabSizeArr) return p1;	// should not happen, only here to calm the compiler
							var tabSize = tabSizeArr[index].length;
							//if(index == 0)
							//	--tabSize;	// First line missing the space in front
							++index;
							var result = p1 + " ";
							// right adjusted
							const repeatLen = tabSize-p1.length;
							if(repeatLen > 0)
								result = " ".repeat(repeatLen) + result;
							return result;
						});
				}

				// Call handler with the result string
				handler(valString);
				// End
				cs.endExec();
			}
		);

	}


	/**
	 * If absFilePath starts with Settings.launchRootFolder
	 * this part is removed.
	 * @param absFilePath An absolute path
	 * @returns A relative path
	 */
	public static getRelFilePath(absFilePath: string): string {
		const filePath = path.relative(Settings.launch.rootFolder, absFilePath);
		return filePath;
	}


	/**
	 * If relFilePath is a relative path the Settings.launchRootFolder
	 * path is added.
	 * @param relFilePath A relative path
	 * @returns An absolute path
	 */
	public static getAbsFilePath(relFilePath: string, rootPath?: string): string {
		if(path.isAbsolute(relFilePath))
			return relFilePath;
		// Change from relative to absolute
		const usedRootPath = (rootPath) ? rootPath : Settings.launch.rootFolder;
		const filePath = path.join(usedRootPath, relFilePath);
		return filePath;
	}


	/**
	 * Writes data to a temporary file. E.g. used to write a disassembly to a file
	 * that vscode can display.
	 * The tmp directory is created if it does not exist.
	 * @param fileName The file name (in the tmp directory)
	 * @param data The data to write.
	 * @returns The used file path.
	 */
	public static writeTmpFile(fileName: string, data: any): string {
		// Create dir if not existing
		if(!fs.existsSync(Settings.launch.tmpDir))
			fs.mkdirSync(Settings.launch.tmpDir);
		// write data to file
		const absFilePath = Utility.getAbsFilePath(fileName, Settings.launch.tmpDir);
		fs.writeFileSync(absFilePath, data);
		// return the file path
		return absFilePath;
	}


	/**
	 * Removes all files in tmpDir that start with "TMP_".
	 */
	public static removeAllTmpFiles() {
		const dir = Settings.launch.tmpDir;
		// Check if dir exists
		if(!fs.existsSync(dir))
			return;
		// Loop through all files
		const fileNames = fs.readdirSync(dir);
		for(let fName of fileNames) {
			// Check that filename starts with "TMP_"
			if(fName.startsWith("TMP_")) {
				// Remove file
				const absFName = Utility.getAbsFilePath(fName,dir);
				fs.unlink(absFName);
			}
		}

	}
}
