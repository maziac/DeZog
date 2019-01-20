import { readFileSync } from 'fs';
import { Utility } from './utility';
import { Settings } from './settings';
import { Z80Registers } from './z80Registers';
//import { Log } from './log';
//import { AssertionError } from 'assert';
//import { start } from 'repl';


/**
 * For the association of the addresses to the files.
 */
interface SourceFileEntry {
	fileName: string;	/// The associated source filename
	lineNr: number;		/// The line number of the associated source file
	modulePrefix: string|undefined;	/// For sjasmplus: module is an optional module prefix that is added to all labels (e.g. "sprites.sw.").
	lastLabel: string|undefined;	/// For sjasmplus: lastLabel is the last non-local label that is used as prefix for local labels. modulePrefix and lastLabel are used for hovering.
}


/**
 * The representation of the list file.
 */
interface ListFileLine extends SourceFileEntry {
	addr: number;		/// The corresponding address from the list file
	line: string;		/// The text of the line of the list file
}

/**
 * Calculation of the labels from the input list and labels file.
 *
 * There is no association between labels/files and memory banks. I.e. it is not
 * possible to load 2 disassemblies for the same area, e.g. for ROM0 and ROM1.
 * The last one would win.
 *
 * This is because it is not clear/easy to distinguish the bank for a lable.
 * Several other problem areay would need to be taken into account:
 * - breakpoints for certain memory banks
 * - should a label be displayed even if another memory bank is currently selected (could be valid).
 * - ...
 * Also the benefit is low. So I decided to stack with a memory bank agnostic implementation:
 * All labels can cover all banks. It is not possible to load 2 disassemblies for the same area for different banks.
 *
 * This also implies that there is no automatic loading e.g. for the ROM. The user
 * has to supply the wanted list file e.g. for the ROM and needs to decide which ROM he wants to see.
 *
 * (Note: this applies only to the labels/list files, the disassembly shown in the VARIABLEs area is always the one from the current bank.)
 *
 *
 *
 */
class LabelsClass {

	/// Map that associates memory addresses (PC values) with line numbers
	/// and files.
	private fileLineNrs = new Map<number,SourceFileEntry>();

	/// Map of arrays of line numbers. The key of the map is the filename.
	/// The array contains the correspondent memory address for the line number.
	private lineArrays = new Map<string,Array<number>>();

	/// An element contains either the offset from the last
	/// entry with labels or an array of labels for that number.
	private labelsForNumber = new Array<any>();

	/// Map with all labels (from labels file) and corresponding values.
	private numberForLabel = new Map<string,number>();

	/// The top of the stack. Used to limit the call stack.
	public topOfStack : number;

	// Constructor.
	public constructor() {
	}


	/**
	 * Initializes the lists/arrays.
	 */
	public init() {
		// clear data
		this.fileLineNrs.clear();
		this.lineArrays.clear();
		this.labelsForNumber.length = 0;
		this.numberForLabel.clear();
	}


	/**
	 * This has to be set in the launchRequest.
	 * Finishes off the loading of list and labels files.
	 */
	public finish() {
		// Calculate the label offsets
		this.calculateLabelOffsets();
		// calculate top of stack in case it is a label
		const tos = Labels.getNumberForLabel(Settings.launch.topOfStack);
		if(tos)
			this.topOfStack = tos;
		else
			this.topOfStack = Utility.parseValue(Settings.launch.topOfStack);
		if(isNaN(this.topOfStack))
			this.topOfStack = 0x10000;
	}


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 * Fills listLines and listPCs.
	 * @param fileName The complete path of the file name.
	 * @param mainFileName The name of the main file that was used to produce the list file.
	 * For 'z80asm' the name is extracted automatically, for 'sjasmplus' and 'z88dk' you can provide the source file here.
	 * If undefined (and not z80asm) the list 'fileName' is used instead.
	 * @param sources The directories to search for the sources. (If include file names are used.)
	 * @param filter A regular expression string which is applied to each line. Used e.g. to filter the z88dk lines. The filter string is setup
	 * like a sed substitution, e.g. '/^[0-9]+\\s+//' to filter the line numbers of z88dk.
	 * @param asm The used compiler. "z80asm" (default) or "sjasmplus". Handles the way the include files ar decoded differently.
	 * @param addOffset To add an offset to each address in the .list file. Could be used if the addresses in the list file do not start at the ORG (as with z88dk).
	 * @param lineHandler(address, line, lineNumber) Every line of the list file is passed to this handler. Can be omitted.
	 */
	public loadAsmListFile(fileName: string, mainFileName: string|undefined, sources: Array<string>, filter: string|undefined, asm: string, addOffset: number, lineHandler = (address: number, line: string, lineNumber: number) => {}) {
		/// Array that contains the list file, the associated memory addresses
		/// for each line and the associated real filenames/line numbers, module and lastLAbel prefixes.
		const listFile = new Array<ListFileLine>();

		// Create regex
		let filterRegEx;
		let replace;
		if(filter) {
			// The filter is parsed for search and substitution string.
			const filterArr = filter.split('/');
			if(filterArr.length != 4) {
				throw SyntaxError('List file "filter" string is wrong: "' + filter + '"');
			}
			const search = filterArr[1];
			replace = filterArr[2];
			filterRegEx = new RegExp(search);
		}

		// Check for sjasmplus or z88dk.
		const sjasmplus = (asm == "sjasmplus");
		let sjasmZ88dkRegex;
		if(sjasmplus || asm == "z88dk") {
			// z88dk: The format is line-number address opcode.
			// sjasmplus: The format is line-number++ address opcode.
			// sjasmplus: The "+" indicate the include level, max 3 "+"s.
			// I.e. [0-9]+[\s+]+
			sjasmZ88dkRegex = new RegExp(/[0-9]+[\s+]+/);
		}

		// Regex to find labels
		//let labelRegex = new RegExp(/^[0-9a-f]+\s+([0-9a-f]+[\s0-9a-f]*\s)(@?)([^;\s0-9][^;\s]*):\s*(equ\s|macro\s)?\s*([^;\n]*)/i);
		let labelRegex = new RegExp(/^[0-9a-f]+\s+([\s0-9a-f]*)\s+(@?)([^;\s0-9][^;\s]*):\s*(equ\s|macro\s)?\s*([^;\n]*)/i);

		// Read all lines and extract the PC value
		let listLines = readFileSync(fileName).toString().split('\n');
		let base = 0;
		let prev = -1;
		let line;
		let lineNumber = 0;
		let labelPrefix;	// Only used for sjasmplus
		let labelPrefixStack = new Array<string>();	// Only used for sjasmplus
		let lastLabel;		// Only used for sjasmplus for local labels (without labelPrefix)
		//let dbgLineNr = 0;
		for( let origLine of listLines) {
		//	dbgLineNr ++;
			let countBytes = 1;
			line = origLine;
			// sjasmplus or z88dk
			if(sjasmZ88dkRegex) {
				// Replace line number with empty string.
				line = line.replace(sjasmZ88dkRegex, '');
			}
			// Filter line
			if(filterRegEx)
				line = line.replace(filterRegEx, replace);
			// Extract address.
			let address = parseInt(line.substr(0,4), 16) + base + addOffset;
			if(!isNaN(address))	{ // isNaN if e.g. the first line: "# File main.asm"
				// compare with previous to find wrap around (if any)
				if(address < prev) {
					base += 0x10000;
					address += 0x10000;
				}

				// Check for MODULE (sjasmplus)
				if(sjasmplus) {
					// Start
					var matchModuleStart = /^[0-9a-f]+\s+module\s+([^\s]+)/i.exec(line);
					if(matchModuleStart) {
						const moduleName = matchModuleStart[1];
						labelPrefixStack.push(moduleName);
						labelPrefix = labelPrefixStack.join('.') + '.';
						// Init last label
						lastLabel = undefined;
					}
					else {
						// End
						var matchModuleEnd = /^[0-9a-f]+\s+endmodule\b/i.exec(line);
						if(matchModuleEnd) {
							// Remove last prefix
							labelPrefixStack.pop();
							if(labelPrefixStack.length > 0)
								labelPrefix = labelPrefixStack.join('.') + '.';
							else
								labelPrefix = undefined;
							// Forget last label
							lastLabel = undefined;
						}
					}
				}

				// Check for labels and "equ". It allows also for @/dot notation as used in sjasmplus.
				const match = labelRegex.exec(line);
				if(match) {
					let label = match[3];
					if(label.startsWith('.')) {
						// local label
						if(lastLabel) // Add Last label
							label = lastLabel + label;
					}
					else {
						// Remember last label (for local labels)
						lastLabel = label;
					}
					const global = match[2];
					if(global == '' && labelPrefix)
						label = labelPrefix + label;	// Add prefix if not global (only sjasmplus)
					const equ = match[4];
					if(equ) {
						if(equ.toLowerCase().startsWith('equ')) {
							// EQU: add to label array
							const valueString = match[5];
							// Only try a simple number conversion, e.g. no label arithmetic (only already known labels)
							try {
								// Evaluate
								const value = Utility.evalExpression(valueString);
								this.numberForLabel.set(label, value);
								// Add label
								this.addLabelForNumber(value, label);
							}
							catch {};	// do nothing in case of an error
						}
					}
					else {
						// Label: add to label array
						this.numberForLabel.set(label, address);
						// Add label
						this.addLabelForNumber(address, label);
					}
				}

				// Search for bytes after the address:
				const matchBytes = /^[0-9a-f]+\s+(([0-9a-f][0-9a-f]\s)+|([0-9a-f][0-9a-f])+)/i.exec(line);
				// Count how many bytes are included in the line.
				if(matchBytes) {
					const bytes = matchBytes[1].trim();
					const lenBytes = bytes.length;
					countBytes = 0;
					for(let k=0; k<lenBytes;k++) {
						// Count all characters (chars are hex, so 2 characters equal to 1 byte)
						if(bytes.charCodeAt(k) > 32)
							countBytes ++;
					}
					// 2 characters = 1 byte
					countBytes /= 2;
				}

				// Store address (or several addresses for one line)
				for(let k=0; k<countBytes; k++) {
					const entry = {fileName: '', lineNr: -1, addr: address+k, line: origLine, modulePrefix: labelPrefix, lastLabel: lastLabel};
					listFile.push(entry)
				}
			}

			// Check if line is "OK":
			if(line.substr(4,1) != '~') {
				// Call line handler (if any)
				lineHandler(address, line, lineNumber);
			}

			// next
			prev = address
			lineNumber ++;
		}

		/**
		 * Creates the list structures to reference files and lines in both directions:
		 * a) get file name and file line number from list-file line number
		 * b) get list-file line number from file name and file line number
		 */

		 if(sources.length == 0) {
			// Use list file directly instead of real filenames
			const relFileName = Utility.getRelFilePath(fileName);
			const lineArray = new Array<number>();
			this.lineArrays.set(relFileName, lineArray);
			for(var lineNr=0; lineNr<listFile.length; lineNr++) {
				const entry = listFile[lineNr];
				entry.fileName = relFileName;
				entry.lineNr = lineNr;
				this.fileLineNrs.set(entry.addr, { fileName: relFileName, lineNr: lineNr, modulePrefix: undefined, lastLabel: undefined });

				// Set address
				if(!lineArray[lineNr])	// without the check macros would lead to the last addr being stored.
					lineArray[lineNr] = entry.addr;
			}
			return;
		}

		// z80asm
		if(asm == "z80asm") {
			// loop the list array reverse
			let index = -1;
			const stack = new Array<any>();

			for(var lineNr=listFile.length-1; lineNr>0; lineNr--) {
				const line = listFile[lineNr].line;
				// check for end macro
				const matchMacroEnd = /^# End of macro\s+(.*)/.exec(line);
				if(matchMacroEnd) {
					const macroName = matchMacroEnd[1];
					const startLine = this.searchStartOfMacro(macroName, lineNr, listFile);
					// skip all lines, i.e. all lines get same line number
					for(var i=startLine; i<lineNr; ++i) {
						listFile[i].fileName = stack[index].fileName;
						listFile[i].lineNr = stack[index].lineNr;
					}
					// skip
					lineNr = startLine;
					// next line
					stack[index].lineNr--;
					continue;
				}

				// check for end of file
				const matchFileEnd = /^# End of file\s+(.*)/.exec(line);
				if(matchFileEnd) {
					const fileName = matchFileEnd[1];
					const absFName = Utility.getAbsSourceFilePath(fileName, sources);
					const relFName = Utility.getRelFilePath(absFName);
					// put on top of stack
					++index;
					stack.push({fileName: fileName, relFileName: relFName, lineNr: 0});
				}

				// check for start of include file
				var matchInclStart = /^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i.exec(line);
				if(matchInclStart) {
					// Note: Normally filenames match, but if they don't match then
					// it might be because the file hasn't been included. Maybe it was
					// #if-def'ed.
					if(index >= 0) {	// This could be < 0 if the 'end of file' was not found
						const fileName = matchInclStart[1];
						if(fileName.valueOf() == stack[index].fileName.valueOf()) {
							// Remove from top of stack
							//stack.splice(index,1);
							stack.pop();
							--index;
						}
					}
				}

				// associate line
				if(index >= 0) {
					// Associate with right file
					listFile[lineNr].fileName = stack[index].relFileName;
					listFile[lineNr].lineNr = stack[index].lineNr;
					// next line
					stack[index].lineNr--;
				}
				else {
					// no association
					listFile[lineNr].fileName = '';
					listFile[lineNr].lineNr = 0;
				}
			}

			// Now correct all line numbers (so far the numbers are negative. All numbers need to be added with the max number of lines for that file.)
			let lastFileName = '';
			let lastFileLength = 0;
			const fileLength = new Map<string, number>();
			for(let i=0; i<listFile.length; ++i) {
				const entry = listFile[i];
				if(lastFileName.valueOf() != entry.fileName.valueOf()) {
					lastFileName = entry.fileName;
					// change in file name, check if it has been used already
					if(!fileLength[lastFileName]) {
						fileLength[lastFileName] = -entry.lineNr;
					}
					// use length
					lastFileLength = fileLength[lastFileName];
				}
				// change line number
				listFile[i].lineNr += lastFileLength;
			}
		}


		// sjasmplus or z88dk
		if(sjasmplus || asm == "z88dk") {
			// sjasmplus:
			// Starts with the line numbers (plus pluses) of the include file.
			// 06++ 8000
			// 07++ 8000                 include "zxnext.inc"
			// 01+++8000
			// 02+++8000
			// 03+++8000                 include "z2.asm"
			// 01+++8000
			//
			// z88dk:
			// Starts with the line numbers of the include file.
			// 3     0000
			// 4     0000              include "constants.inc"
			// 1     0000              ; Constant definitions.
			// 2     0000
			// 3     0000              ; Printing text
			//
			// Note:
			// a) the text "include" is used as indication that a new include
			// file started.
			// b) the change of the line number is used as indicator that the
			// include file ended.

			let index = 0;
			const stack = new Array<any>();
			const fName = mainFileName || fileName;
			const absFName = Utility.getAbsSourceFilePath(fName, sources);
			const relFileName = Utility.getRelFilePath(absFName);
			stack.push({fileName: relFileName, lineNr: 0});	// Unfortunately the name of the main asm file cannot be determined, so use the list file instead.
			let expectedPluses = '';	// Used to test if the include file ended
			for(var lineNr=0; lineNr<listFile.length; lineNr++) {
				const line = listFile[lineNr].line;
				if(line.length == 0)
					continue;

				// get line number with pluses
				var matchLineNumber = /^([0-9]+)(\+*)\s+(.*)/.exec(line);
				if(!matchLineNumber)
					continue;	// Not for sjasmplus, but z88dk contains lines without line number.
				const lineNumber = parseInt(matchLineNumber[1]);
				const pluses =  matchLineNumber[2];
				let lineNumberWithPluses = lineNumber + pluses;
				lineNumberWithPluses = lineNumberWithPluses.trim();
				const remainingLine = matchLineNumber[3];

				// Check for end of include file
				if(pluses.length < expectedPluses.length) {
					// End of include found
					// Note: this is not 100% error proof. sjasmplus is not showing more than 3 include levels (3 pluses). If there is a higher include level a warning is thrown.
					stack.pop();
					index = stack.length-1;
				}

				// Check for start of include file
				var matchInclStart = /^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i.exec(remainingLine);
				if(matchInclStart) {
					if(pluses.length >= 3) {
						// sjasmplus doesn't show more than 3 include levels.
						// So show a warning that the include file here is not taken into account.
						throw "Include nesting level too high. The sjasmplus list file output format does not indicate a nesting level higher than 3 'includes'. In order to use source level debugging you need to decrease the nesting level or you need to change to .list file debugging.";
					}
					const fName = matchInclStart[1];
					const absFName = Utility.getAbsSourceFilePath(fName, sources);
					const relFName = Utility.getRelFilePath(absFName);
					stack.push({fileName: relFName, lineNr: 0});
					index = stack.length-1;
				}

				// Associate with right file
				listFile[lineNr].fileName = stack[index].fileName;
				listFile[lineNr].lineNr = (index == 0 && !mainFileName) ? lineNr : lineNumber-1;

				// Next
				expectedPluses = pluses;
			}
		}


		// Create 2 maps.
		// a) fileLineNrs: a map with all addresses and the associated filename/lineNr
		// b) lineArrays: a map of arrays with key=filename+lineNr and value=address
		for(const entry of listFile) {
			if(entry.fileName.length == 0)
				continue;	// Skip lines with no filename (e.g. '# End of file')

			// last address entry wins:
			this.fileLineNrs.set(entry.addr, { fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel });

			// Check if a new array need to be created
			if(!this.lineArrays.get(entry.fileName)) {
				this.lineArrays.set(entry.fileName, new Array<number>());
			}

			// Get array
			const lineArray = this.lineArrays.get(entry.fileName) || [];

			// Set address
			if(!lineArray[entry.lineNr])	// without the check macros would lead to the last addr being stored.
				lineArray[entry.lineNr] = entry.addr;
		}
	}


	/**
	 * Adds a new label to the LabelsForNumber array.
	 * Creates a new array if required.
	 * @param value The value for which a new label is to be set.
	 * @param label The label to add.
	 */
	protected addLabelForNumber(value: number, label: string) {
		// Add label
		let labelsArray = this.labelsForNumber[value];
		if(labelsArray === undefined) {
			// create a new array
			labelsArray = new Array<string>();
			this.labelsForNumber[value] = labelsArray;
		}
		// Check if label already exists
		for(let item of labelsArray) {
			if(item == label)
				return;	// already exists.
		}
		// Add new label
		labelsArray.push(label);
	}

	/**
	 * Calculates the offsets for all labels.
	 * I.e. for all addresses without a direct label entry.
	 */
	protected calculateLabelOffsets() {
		// Now fill the unset values with the offsets
		var offs = -1;
		for( var i=0; i<0x10000; i++) {
			const labels = this.labelsForNumber[i];
			if(labels === undefined) {
				if(offs >= 0) {
					this.labelsForNumber[i] = offs;
					++offs;
				}
			}
			else {
				// array
				offs = 1;
			}
		}
	}


	/**
	 * Returns all labels with the exact same address
	 * to the given address.
	 * @param number The address value to find. Ignores numbers/labels <= e.g. 'smallValuesMaximum' or > 65535.
	 * @param regsString If defined it also returns registers (from the regsString)which match the number. Can be omitted. Then no registers are returned.
	 * @returns An array of strings with (registers and) labels. Might return an empty array.
	 */
	public getLabelsForNumber(number: number, regsString: string = ''): Array<string> {
		if(number <= Settings.launch.smallValuesMaximum || number > 0xFFFF) {
			return [];	// E.g. ignore numbers/labels < e.g. 513 or > 65535
		}
		var names = Z80Registers.getRegistersEqualTo(number, regsString);
		var labels = this.labelsForNumber[number];

		if(labels && typeof labels !== 'number') {
			names.push(...labels);
		}
		return names;
	}


	/**
	 * Returns all labels with the same address that are nearest and lower-equal
	 * to the given address.
	 * If label is equal to given addr the label itself is returned.
	 * If label is not equal to given addr the label+offset is returned.
	 * @param number The address value to find. Ignores numbers/labels <= e.g. 'smallValuesMaximum' or > 65535.
	 * @param regsString If defined it also returns registers (from the regsString) which match the number exactly. Can be omitted. Then no registers are returned.
	 * @returns An array of strings with (registers and) labels + offset
	 */
	public getLabelsPlusIndexForNumber(number: number, regsString: string = ''): Array<string> {
		if(number <= Settings.launch.smallValuesMaximum || number > 0xFFFF) {
			return [];	// E.g. ignore numbers/labels < e.g. 513 or > 65535
		}
		var names = Z80Registers.getRegistersEqualTo(number, regsString);
		var labels = this.labelsForNumber[number];
		if(labels) {
			if(typeof labels !== 'number') {
				names.push(...labels);
			}
			else {
				const offs = labels;	// number
				number -= offs;
				const baseLabels = this.labelsForNumber[number];	// this is an array
				if(baseLabels !== undefined) {
					const labelsPlus = baseLabels.map(label => label+'+'+offs);
					names.push(...labelsPlus);
				}
			}
		}
		return names;
	}


	/**
	 * Returns the corresponding number of a label.
	 * @param label The label name.
	 * @returns It's value. undefined if label does not exist.
	 */
	public getNumberForLabel(label: string): number|undefined {
		return this.numberForLabel.get(label);
	}


	/**
	 * Returns all labels that match the regular expression string.
	 * @param labelRegEx Regular expression string.
	 * @returns An array with matching labels. If nothing found an empty array is returned.
	 */
	public getLabelsForRegEx(labelRegEx: string): Array<string> {
		const regex = new RegExp(labelRegEx, 'i');	// Ignore case
		const foundLabels = new Array<string>();
		for( let [k,] of this.numberForLabel) {
			const match = regex.exec(k);
			if(match)
				foundLabels.push(k);
		}
		// return array with labels
		return foundLabels;
	}

	/**
	 * Returns a number. If text is a label than the corresponding number for the label is returned.
	 * If text is not a label it is tried to convert text as string to a number.
	 * @param text The label name or a number in hex or decimal as string.
	 * @returns The correspondent number. May return NaN.
	 */
	public getNumberFromString(text: string): number {
		var result = this.getNumberForLabel(text);
		if(result == undefined) {
			// Try convert as string
			if(text.startsWith('_'))
				return NaN;
			result = Utility.parseValue(text);
		}
		return result;
	}


	/**
	 * Searches for the start of a macro.
	 * @param macroName The name of the macro to search for.
	 * @param startSearchLine Here the search begins. Search is done upwards.
	 * @param listFile Array with lines of the file.
	 * @return The found line number or startSearchLine if nothing found (should not happen).
	 */
	private searchStartOfMacro(macroName: string, startSearchLine: number, listFile: Array<ListFileLine>): number {
		const macroRegex = new RegExp("[0-9a-fA-F]+\\s+" + macroName + "\\s+.*");
		var k=startSearchLine;
		for(; k>0; --k) {
			const line2 = listFile[k].line;
			const matchMacroStart = macroRegex.exec(line2);
			if(matchMacroStart)
				return k;	// macro start found
		}
		// Nothing found (should not happen)
		return startSearchLine;
	}


	/**
	 * Returns file name and line number associated with a certain memory address.
	 * Used e.g. for the call stack.
	 * @param address The memory address to search for.
	 * @returns The associated filename and line number (and for sjasmplus the modulePrefix and the lastLabel).
	 */
	public getFileAndLineForAddress(address: number): SourceFileEntry {
		const entry = this.fileLineNrs.get(address);
		if(!entry)
			return {fileName: '', lineNr: 0, modulePrefix: undefined, lastLabel: undefined};

		var filePath = Utility.getAbsFilePath(entry.fileName);
		return {fileName: filePath, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel};
	}


	/**
	 * Returns the memory address associated with a certain file and line number.
	 * @param fileName The path to the file. Can be an absolute path.
	 * @param lineNr The line number inside the file.
	 * @returns The associated address. -1 if file or line does not exist.
	 */
	public getAddrForFileAndLine(fileName: string, lineNr: number): number {
		var filePath = Utility.getRelFilePath(fileName);
		var addr = -1;
		const lineArray = this.lineArrays.get(filePath);
		if(lineArray) {
			addr = lineArray[lineNr];
			if(!addr)
				addr = -1;
		}
		return addr;
	}

}


/// Labels is the singleton object that should be accessed.
export var Labels = new LabelsClass();
