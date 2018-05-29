import { readFileSync } from 'fs';
import { Utility } from './utility';
import { Settings } from './settings';
//import { Log } from './log';
//import { AssertionError } from 'assert';
//import { start } from 'repl';


/**
 * The representation of the list file.
 */
interface ListFileLine {
	fileName: string;	/// The associated source filename
	lineNr: number;		/// The line number of the associated source file
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
	private fileLineNrs = new Map<number,{fileName: string, lineNr: number}>();

	/// Map of arrays of line numbers. The key of the map is the filename.
	/// The array contains the correspondent memory address for the line number.
	private lineArrays = new Map<string,Array<number>>();

	/// An element contains either the offset from the last
	/// entry with labels or an array of labels for that number.
	private labelsForNumber = new Array();

	/// Map with all labels (from labels file) and corresponding values.
	private numberForLabel = new Map();

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
		this.topOfStack = Labels.getNumberforLabel(Settings.launch.topOfStack);
		if(!this.topOfStack)
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
	 * @param useIndirectFile Use the filenames in fileName.
	 * @param lineHandler Every line of the list file is passed to this handler. Can be omitted.
	 */
	public loadAsmListFile(fileName: string, useIndirectFile: boolean, lineHandler = (address: number, line: string) => {}) {
		/// Array that contains the list file, the associated memory addresses
		/// for each line and the associated real filenames/line numbers.
		const listFile = new Array<ListFileLine>();

		// Read all lines and extract the PC value
		var listLines = readFileSync(fileName).toString().split('\n');
		var base = 0;
		var prev = -1;
		for( var line of listLines) {
			// extract pc
			var address = parseInt(line.substr(0,4), 16) + base;
			// compare with previous to find wrap around (if any)
			if(address < prev) {
				base += 0x10000;
				address += 0x10000;
			}
			// store
			var entry = {fileName: '', lineNr: -1, addr: address, line: line};
			listFile.push(entry)

			// Call line handler (if any)
			lineHandler(address, line);

			// next
			prev = address
		}

		/**
		 * Creates the list structures to reference files and lines in both directions:
		 * a) get file name and file line number from list-file line number
		 * b) get list-file line number from file name and file line number
		 */
		var index = -1;
		const stack = new Array<any>();

		if(!useIndirectFile) {
			// Use list file directly instead of real filenames
			const relFileName = Utility.getRelFilePath(fileName);
			const lineArray = new Array<number>();
			this.lineArrays[relFileName] = lineArray;
			for(var lineNr=0; lineNr<listFile.length; lineNr++) {
				const entry = listFile[lineNr];
				entry.fileName = relFileName;
				entry.lineNr = lineNr;
				this.fileLineNrs[entry.addr] = { fileName: relFileName, lineNr: lineNr };

				// Set address
				if(!lineArray[lineNr])	// without the check macros would lead to the last addr being stored.
					lineArray[lineNr] = entry.addr;
			}
			return;
		}

		// loop the list array reverse
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
				// put on top of stack
				++index;
				stack.push({fileName: fileName, lineNr: 0});
			}

			// check for start of include file
			var matchInclStart = /^[0-9a-fA-F]+\s+include\s+\"([^\s]*)\"/.exec(line);
			if(matchInclStart) {
				// Note: Normally filenames match, but if they don't match then
				// it might be because the file hasn't been icluded. Maybe it was
				// #if-def'ed.
				const fileName = matchInclStart[1];
				if(fileName.valueOf() == stack[index].fileName.valueOf()) {
					// Remove from top of stack
					stack.splice(index,1);
					--index;
				}
			}

			// associate line
			if(index >= 0) {
				// Associate with right file
				listFile[lineNr].fileName = stack[index].fileName;
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
		var lastFileName = '';
		var lastFileLength = 0;
		const fileLength = new Map<string, number>();
		for(var i=0; i<listFile.length; ++i) {
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



		// Create 2 maps.
		// a) fileLineNrs: a map with all addresses and the associated filename/lineNr
		// b) lineArrays: a map of arrays with key=filename+lineNr and value=address
		for(var entry of listFile) {
			if(entry.fileName.length == 0)
				continue;	// Skip lines with no filename (e.g. '# End of file')

			// last address entry wins:
			this.fileLineNrs[entry.addr] = { fileName: entry.fileName, lineNr: entry.lineNr };

			// Check if a new array need to be created
			if(!this.lineArrays[entry.fileName]) {
				this.lineArrays[entry.fileName] = new Array<number>();
			}

			// Get array
			const lineArray = this.lineArrays[entry.fileName];

			// Set address
			if(!lineArray[entry.lineNr])	// without the check macros would lead to the last addr being stored.
				lineArray[entry.lineNr] = entry.addr;
		}
	}


	/**
	 * Reads the given file (an assembler .labels file) and creates a
	 * map with label <-> number associations.
	 * Created lists:
	 * - usedNumbers: sorted array with used addresses.
	 * - labelsForNumber: addr -> array of labels. Stores an array of labels for a given addr.
	 * - numberForLabel: label -> addr
	 * Note: addresses below 256 are not parsed. These are most likely mixed up with
	 * constants (equ), so they are simply skipped. I.e. single register values are not
	 * converted to labels.
	 * @param fileName The complete path of the file name.
	 */
	public loadAsmLabelsFile(fileName: string) {
		// Preset values
		//this.labelsForNumber.fill(-1,0,0x10000);

		// Read all labels
		const labels = readFileSync(fileName).toString().split('\n');
		for( let line of labels) {
			// extract label and number. E.g.
			// LBL_SAT_SPRITE_MASK_ARRAY:	equ $ce27
			const match = /^(.*):\s+equ\s+\$([0-9a-fA-F]+)/.exec(line);
			if(match == null || match.length != 3)
				continue;
			// Pattern found
			const number = parseInt(match[2],16);
			if(number < Settings.launch.disableLabelResolutionBelow || number > 0xFFFF) {
				continue;	// E.g. ignore numbers/labels < 256 or > 65535
			}
			const label = match[1];

			// add to label array
			this.numberForLabel[label] = number;

			// Add label
			var labelsArray = this.labelsForNumber[number];
			if(labelsArray === undefined) {
				// create a new array
				labelsArray = new Array<string>();
				this.labelsForNumber[number] = labelsArray;
			}
			// Add new label
			labelsArray.push(label);
		}
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
	 * @param number The address value to find
	 * @returns An array of strings with labels or undefined
	 */
	public getLabelsForNumber(number: number): Array<string> {
		var labels = this.labelsForNumber[number];
		return (typeof labels === 'number') ? undefined : labels;
	}


	/**
	 * Returns all labels with the same address that are nearest and lower-equal
	 * to the given address.
	 * If label is equal to given addr the label itself is returned.
	 * If label is not equal to given addr the label+offset is returned.
	 * @param number The address value to find
	 * @returns An array of strings with labels + offset
	 */
	public getLabelsPlusIndexForNumber(number: number): Array<string> {
		var labels = this.labelsForNumber[number];
		if(labels === undefined)
			return new Array<string>();	// Return empty string
		if(typeof labels === 'number') {
			const offs = labels;
			number -= offs;
			const baseLabels = this.labelsForNumber[number];	// this is an array
			if(baseLabels === undefined)
				return new Array<string>();	// Return empty string
			labels = baseLabels.map(label => label+'+'+offs);
		}
		return labels;
	}


	/**
	 * Returns the corresponding number of a label.
	 * @param label The label name.
	 * @returns It's value. undefined if label does not exist.
	 */
	public getNumberforLabel(label: string): number {
		return this.numberForLabel[label];
	}


/**
	 * Returns a number. If text is a label than the corresponding number for the label is returned.
	 * If text is not a label it is tried to convert text as string to a number.
	 * @param text The label name or a number in hex or decimal as string.
	 * @returns The correspondent number. May be undefined.
	 */
	public getNumberFromString(text: string): number {
		var result = this.getNumberforLabel(text);
		if(isNaN(result)) {
			// Try convert as string
			if(!text.startsWith('_'))
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
	 * @returns {fileName: string, lineNr: number} The associated filename and line number.
	 */
	public getFileAndLineForAddress(address: number): {fileName: string, lineNr: number} {
		const entry = this.fileLineNrs[address];
		if(!entry)
			return {fileName: '', lineNr: 0};

		var filePath = Utility.getAbsFilePath(entry.fileName);
		return {fileName: filePath, lineNr: entry.lineNr};
	}


	/**
	 * Returns the memory address associated with a certain file and line number.
	 * @param fileName The path to the file.
	 * @param lineNr The line number inside the file.
	 * @returns The associated address. -1 if file or line does not exist.
	 */
	public getAddrForFileAndLine(fileName: string, lineNr: number): number {
		var filePath = Utility.getRelFilePath(fileName);
		var addr = -1;
		const lineArray = this.lineArrays[filePath];
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
