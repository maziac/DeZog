import {Utility} from '../misc/utility';
import {MemoryModel} from '../remotes/Paging/memorymodel';
import {Remote} from '../remotes/remotefactory';
import {Z80Registers} from '../remotes/z80registers';
import {SjasmplusSldLabelParser} from './sjasmplussldlabelparser';
import {Z80asmLabelParser} from './z80asmlabelparser';
import {Z88dkLabelParser} from './z88dklabelparser';


/**
 * For the association of the addresses to the files.
 * modulePrefix and lastLabel are also put here. They are used mainly for hovering.
 * This is not optimal but too much effort to change.
 */
export interface SourceFileEntry {
	fileName: string;	/// The associated source filename
	lineNr: number;		/// The line number of the associated source file
	modulePrefix?: string;	/// For sjasmplus: module is an optional module prefix that is added to all labels (e.g. "sprites.sw.").
	lastLabel?: string;	/// For sjasmplus: lastLabel is the last non-local label that is used as prefix for local labels. modulePrefix and lastLabel are used for hovering.
}


/**
 * The representation of the list file.
 */
export interface ListFileLine extends SourceFileEntry {
	addr?: number;		/// The corresponding address from the list file
	size: number;		/// The size of bytes the line extends to. I.e. the line covers addresses [address;address+size-1]
	line: string;		/// The text of the line of the list file
}



/**
 * Calculation of the labels from the input list and labels file.
 *
 * For "normal" list files the labels are 64k addresses.
 * Special assemblers (e.g. sjasmplus) is also able to generate label
 * information that includes the used bank number as well.
 *
 * DeZog is capable of handling both. If banking information should be used as
 * well then the bankSize field is set to something different than 0.
 * This has to be set by the list file parser.
 * Furthermore the list file parser has to provide these 'long addresses'
 * in a special format.
 * Please look at SjasmplusSldLabelParser as an example.
 *
 */
export class LabelsClass {

	/// Map that associates memory addresses (PC values) with line numbers
	/// and files.
	/// Long addresses.
	protected fileLineNrs = new Map<number, SourceFileEntry>();

	/// Map of arrays of line numbers. The key of the map is the filename.
	/// The array contains the correspondent memory address for the line number.
	/// Long addresses.
	protected lineArrays = new Map<string, Array<number>>();

	/// An element contains either the offset from the last
	/// entry with labels or an array of labels for that number.
	/// Array contains a max 0x10000 entries. Thus it is for
	/// 64k addresses.
	protected labelsForNumber64k = new Array<any>();

	/// This map is used to associate long addresses with labels.
	/// E.g. used for the call stack.
	/// Long addresses.
	protected labelsForLongAddress = new Map<number, Array<string>>();


	/// Map with all labels (from labels file) and corresponding values.
	/// Long addresses.
	protected numberForLabel = new Map<string, number>();


	/// Map with a key with a label that contains other maps recursively.
	/// I.e. a dotted label like 'a.b.c.d' can be referenced through
	/// through 'a' which will contain another map which can be referneced by 'b'
	/// and so on.
	/// Used for displaying structs in the watches window.
	protected labelsHierachy = new Map<string, any>();


	/// Map with label / file location association.
	/// Used in sourcesModeFinish to create the file label association and
	/// used in unit tests to point to the unit tests.
	/// Direct relationship: The line number of the label is returned.
	/// Not the line number of the value of the label.
	/// Long addresses.
	protected labelLocations = new Map<string, {file: string, lineNr: number, address: number}>()

	/// Stores the address of the watchpoints together with the line contents.
	/// Long addresses.
	protected watchPointLines = new Array<{address: number, line: string}>();

	/// Stores the address of the assertions together with the line contents.
	/// Long addresses.
	protected assertionLines = new Array<{address: number, line: string}>();

	/// Stores the address of the logpoints together with the line contents.
	/// Long addresses.
	protected logPointLines = new Array<{address: number, line: string}>();


	/// From the Settings.
	protected smallValuesMaximum: number;


	/// The used bank size. Only set if the assembler+parser supports
	/// long addresses. Then it holds the used bank size (otherwise 0).
	/// Is used to tell if the Labels are long or not and for internal
	/// conversion if target has a different memory model.
	/// Typical value: 0, 8192 or 16384.
	protected bankSize: number;


	// Collects the warnings from the different parsers.
	protected warnings: string;


	// Constructor.
	public constructor() {
	}


	/**
	 * Initializes the lists/arrays.
	 */
	public init(smallValuesMaximum: number) {
		// clear data
		this.fileLineNrs.clear();
		this.lineArrays.clear();
		this.labelsForNumber64k.length = 0;
		this.labelsForLongAddress.clear();
		this.numberForLabel.clear();
		this.labelLocations.clear();
		this.labelsHierachy.clear();
		this.watchPointLines.length = 0;
		this.assertionLines.length = 0;
		this.logPointLines.length = 0;
		this.smallValuesMaximum = smallValuesMaximum;
		this.bankSize = 0;
		this.warnings = undefined as any;
	}


	/**
	 * Returns true if long addresses have been used.
	 * I.e. if bankSize != 0.
	 */
	public AreLongAddressesUsed() {
		return this.bankSize != 0;
	}


	/**
	 * This has to be set in the launchRequest.
	 * Finishes off the loading of list and labels files.
	 * Can throw an exception if some values make no sense.
	 */
	public finish() {
		// Calculate the label offsets
		this.calculateLabelOffsets();
		// Create the hierarchy of labels
		this.createLabelHierarchy();
	}


	/**
	 * Reads all list files for all available assemblers.
	 * @param mainConfig Is a part of Settings. It contains e.g. the properties "sjasmplus",
	 * "z80asm" and "z88dk".
	 * Each property is an object which contains the specific parameters.
	 * Especially it contains the path to the list file.
	 */
	public readListFiles(mainConfig: any) {
		this.warnings = '';
		// sjasmplus
		if (mainConfig.sjasmplus) {
			// For sjasmplus it is checked if a list file should be parsed or an sld file
			for (const config of mainConfig.sjasmplus) {
				let parser;
				// Parse SLD file and list file
				parser = new SjasmplusSldLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber64k, this.labelsForLongAddress, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertionLines, this.logPointLines);
				parser.loadAsmListFile(config);
				this.bankSize = parser.bankSize;
				// Warnings
				const warnings = parser.getWarnings();
				if (warnings)
					this.warnings += 'sjasmplus sld parser warnings:\n' + warnings;
			}
		}

		// z80asm
		if (mainConfig.z80asm) {
			const parser = new Z80asmLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber64k, this.labelsForLongAddress, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertionLines, this.logPointLines);
			for (const config of mainConfig.z80asm)
				parser.loadAsmListFile(config);
		}

		// z88dk
		if (mainConfig.z88dk) {
			const parser = new Z88dkLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber64k, this.labelsForLongAddress, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertionLines, this.logPointLines);
			for (const config of mainConfig.z88dk)
				parser.loadAsmListFile(config);
		}

		// Add new assemblers here ...


		// Check warnings
		if (this.warnings == '')
			this.warnings = undefined as any;
		// Finish
		this.finish();
	}


	/**
	 * Returns the warnings.
	 * undefined if no warnings.
	 */
	public getWarnings() {
		return this.warnings;
	}


	/**
	 * Accessor for the watchpoint lines.
	 * Long addresses.
	 */
	public getWatchPointLines() {
		return this.watchPointLines;
	}


	/**
	 * Accessor for the assertion lines.
	 * Long addresses.
	 */
	public getAssertionLines() {
		return this.assertionLines;
	}


	/**
	 * Accessor for the logpoint lines.
	 * Long addresses.
	 */
	public getLogPointLines() {
		return this.logPointLines;
	}


	/**
	 * Calculates the offsets for all labels.
	 * I.e. for all addresses without a direct label entry.
	 * Deals with 64k addresses only.
	 */
	protected calculateLabelOffsets() {
		// Now fill the unset values with the offsets
		let offs = -1;
		for (let i = 0; i < 0x10000; i++) {
			const labels = this.labelsForNumber64k[i];
			if (labels === undefined) {
				if (offs >= 0) {
					this.labelsForNumber64k[i] = offs;
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
	 * Returns all labels with the exact same address to the given address.
	 * Long addresses.
	 * @param longAddress The address value to find.
	 * @returns An array of strings with labels. Might return an empty array.
	 */
	public getLabelsForLongAddress(longAddress: number): Array<string> {
		const labels = this.labelsForLongAddress.get(longAddress);
		return labels || [];
	}


	/**
	 * Returns all labels with the exact same address to the given address.
	 * 64k addresses.
	 * @param number The address value to find. Ignores numbers/labels <= e.g. 'smallValuesMaximum'.
	 * Bits >= bit 16 are ignored.
	 * @param regsAsWell If true it also returns registers which match the number. If false (default) then no registers are returned.
	 * @returns An array of strings with (registers and) labels. Might return an empty array.
	 */
	public getLabelsForNumber64k(number: number, regsAsWell = false): Array<string> {
		// Make sure it is not a long address.
		number &= 0xFFFF;

		if (number <= this.smallValuesMaximum) {
			return [];	// E.g. ignore numbers/labels < e.g. 513
		}

		let names;
		if (regsAsWell)
			names = Remote.getRegistersEqualTo(number);
		else
			names = new Array<string>();

		const labels = this.labelsForNumber64k[number];

		if (labels && typeof labels !== 'number') {
			names.push(...labels);
		}
		return names;
	}


	/**
	 * Returns all labels with the same address that are nearest and lower-equal
	 * to the given address.
	 * If label is equal to given addr the label itself is returned.
	 * If label is not equal to given addr the label+offset is returned.
	 * 64k addresses.
	 * @param number The address value to find. Ignores numbers/labels <= e.g. 'smallValuesMaximum' or > 65535.
	 * @param regsAsWell If true it also returns registers which match the number. If false (default) then no registers are returned.
	 * @returns An array of strings with (registers and) labels + offset
	 */
	public getLabelsPlusIndexForNumber64k(number: number, regsAsWell = false): Array<string> {
		if (number <= this.smallValuesMaximum || number > 0xFFFF) {
			return [];	// E.g. ignore numbers/labels < e.g. 513 or > 65535
		}

		let names;
		if (regsAsWell)
			names = Remote.getRegistersEqualTo(number);
		else
			names = new Array<string>();

		let labels = this.labelsForNumber64k[number];
		if (labels) {
			if (typeof labels !== 'number') {
				names.push(...labels);
			}
			else {
				const offs = labels;	// number
				number -= offs;
				const baseLabels = this.labelsForNumber64k[number];	// this is an array
				if (baseLabels !== undefined) {
					const labelsPlus = baseLabels.map(label => label + '+' + offs);
					names.push(...labelsPlus);
				}
			}
		}
		return names;
	}


	/**
	 * Returns the corresponding number of a label.
	 * Long addresses.
	 * Used by:
	 * - debugAdapter.evalLabel
	 * - zesarux.convertCondition
	 * - z80unittests.labels.getNumberForLabel("UNITTEST_TEST_WRAPPER");
	 * @param label The label name.
	 * @returns It's value. undefined if label does not exist.
	 */
	public getNumberForLabel(label: string): number | undefined {
		return this.numberForLabel.get(label);
	}


	/**
	 * Returns the location (file/line number) of a label.
	 * Long addresses.
	 * @param label The label. E.g. "math.div_c_d"
	 * @returns {file, lineNr, address}: The absolute filepath, the line number and the (long) address.
	 * undefined if label does not exist.
	 */
	public getLocationOfLabel(label: string): {file: string, lineNr: number, address: number} | undefined {
		return this.labelLocations.get(label);
	}


	/**
	 * Returns all labels that match the regular expression string.
	 * @param labelRegEx Regular expression string.
	 * @param options E.g. 'g'
	 * @returns An array with matching labels. If nothing found an empty array is returned.
	 */
	public getLabelsForRegEx(labelRegEx: string, options = 'i'): Array<string> {
		const regex = new RegExp(labelRegEx, options);
		const foundLabels = new Array<string>();
		for (let [k,] of this.numberForLabel) {
			const match = regex.exec(k);
			if (match)
				foundLabels.push(k);
		}
		// return array with labels
		return foundLabels;
	}


	/**
	 * Create the hierarchy of labels.
	 */
	protected createLabelHierarchy() {
		for (let [label,] of this.numberForLabel) {
			// Get all parts of the label
			const parts = label.split('.');
			let map = this.labelsHierachy;
			for (const part of parts) {
				// Check if already existing
				let subMap = map.get(part);
				if (!subMap) {
					// Create one
					subMap = new Map<string, any>();
					map.set(part, subMap);
				}
				// Next
				map = subMap;
			}
		}
	}


	/**
	 * Returns the direct sub labels.
	 * @param label E.g. "Invader" or "Invader.hitbox"
	 * @returns An array of direct sub lables. E.g. for "Invader" it returns "Invader.x" or "Invader.hitbox" but not "Invader.hitbox.x"
	 */
	public getSubLabels(label: string): Array<string> {
		// Get all parts of the label
		const parts = label.split('.');
		let map = this.labelsHierachy;
		for (const part of parts) {
			// Check if already existing
			let subMap = map.get(part);
			if (!subMap) {
				// Create one
				subMap = new Map<string, any>();
				map.set(part, subMap);
			}
			// Next
			map = subMap;
		}
		return Array.from(map.keys());
	}


	/**
	 * Returns a number. If text is a label than the corresponding number for the label is returned.
	 * If text is not a label it is tried to convert text as string to a number.
	 * 64k addresses.
	 * @param text The label name or a number in hex or decimal as string.
	 * @returns The correspondent number. May return NaN.
	 */
	public getNumberFromString64k(text: string): number {
		if (text == undefined)
			return NaN;
		let result = this.getNumberForLabel(text);
		if (result == undefined) {
			// Try convert as string
			if (text.startsWith('_'))
				return NaN;
			result = Utility.parseValue(text);
		}
		if (isNaN(result))
			return result;
		return result & 0xFFFF;
	}


	/**
	 * Returns file name and line number associated with a certain memory address.
	 * Used e.g. for the call stack.
	 * Long addresses.
	 * @param address The memory address to search for.
	 * @returns The associated filename and line number (and for sjasmplus the modulePrefix and the lastLabel).
	 */
	public getFileAndLineForAddress(address: number): SourceFileEntry {
		// Address file conversion
		const entry = this.fileLineNrs.get(address);
		if (!entry)
			return {fileName: '', lineNr: 0, modulePrefix: undefined, lastLabel: undefined};

		const filePath = Utility.getAbsFilePath(entry.fileName);
		return {fileName: filePath, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel};
	}


	/**
	 * Returns the memory address associated with a certain file and line number.
	 * Long addresses.
	 * @param fileName The path to the file. Can be an absolute path.
	 * @param lineNr The line number inside the file.
	 * @returns The associated (long) address. -1 if file or line does not exist.
	 */
	public getModuleAndLastLabelForFileAndLine(fileName: string, lineNr: number): {modulePrefix: string, lastLabel: string} {
		// The available structures are not ideal:
		// First find an address for lineNr.
		// Then use the address to get modulePrefix and lastLabel.
		const filePath = Utility.getRelFilePath(fileName);
		const result = {modulePrefix: '', lastLabel: ''};
		let longAddr;
		const lineArray = this.lineArrays.get(filePath);
		if (!lineArray)
			return result;
		// Search backward for an address
		while (true) {
			if (lineNr < 0)
				return {modulePrefix: '', lastLabel: ''};
			longAddr = lineArray[lineNr];
			if (longAddr != undefined)
				break;
			// Previous
			lineNr--;
		}

		// Now with the address get the modulePrefix and the lastLabel
		const entry = Labels.getFileAndLineForAddress(longAddr);
		result.modulePrefix = entry.modulePrefix!;
		result.lastLabel = entry.lastLabel!;

		return result;
	}


	/**
	 * Returns the memory address associated with a certain file and line number.
	 * Long addresses.
	 * @param fileName The path to the file. Can be an absolute path.
	 * @param lineNr The line number inside the file.
	 * @returns The associated (long) address. -1 if file or line does not exist.
	 */
	public getAddrForFileAndLine(fileName: string, lineNr: number): number {
		const filePath = Utility.getRelFilePath(fileName);
		let addr = -1;
		const lineArray = this.lineArrays.get(filePath);
		if (lineArray) {
			addr = lineArray[lineNr];
			if (addr == undefined)
				addr = -1;
		}
		return addr;
	}


	/**
	 * Checks if the target's memory model matches the model used during parsing.
	 */
	public convertLabelsTo(memModel: MemoryModel) {
		// Adjust labels to target model (if necessary at all)

		// Is a conversion necessary / possible
		/*
		|             | Target 64k | Target long |
		|-------------|------------|-------------|
		| Labels 64k  |    OK      |    OK       |
		| Labels long | Not OK 1)  | Depends 2)  |
		*/
		if (this.bankSize == 0)
			return;	// No long labels used

		/*
		1) Eg. Load a ZXNext or ZX128 program to a ZX48 target.
		In most cases makes no sense. But if it is a small program, e.g. one that fits into a ZX48, it could be done.
		Conclusion: Either throw an error or change all label addresses to 64k addresses. => Convert all to 64k.

		2)
		a) If bank size is the same for target and labels then this is OK.
		b) If not equal e.g. a program assembled for ZX128 (bank size 16k) would not work with a ZXNext (bank size 8k).
		Solution: Throw exception or change all labels from one model to the other. ZX128 to ZXNext would be possible, vice versa not.
		=> Change all labels.
		*/


		// Note: If bank size is 0 no banking is used and labels are converted to 64k.
		const targetBankSize = memModel.getBankSize();
		this.convertLabelsToBankSize(targetBankSize);
	}


	/**
	 * Convert all file/line <-> address association to a new bank size.
	 * The main use case is to convert ZX128 banking into ZXNext banking.
	 * @param bankSize If bank size is 0 no banking is used and labels are converted to 64k. Otherwise the labels are
	 * converted from the old bank size to the new one.
	 */
	protected convertLabelsToBankSize(targetBankSize: number) {
		/*
		 Need to adjust the 2 structures:
		 - Associate address with file/line:
		   this.fileLineNrs=new Map<number, SourceFileEntry>();
		 - Associate file/line with an address:
		   this.lineArrays=new Map<string, Array<number>>();
		*/

		// Address with file/line:
		const newFileLines = new Map<number, SourceFileEntry>();
		for (let [addr, sourceEntry] of this.fileLineNrs) {
			// Convert
			addr = this.convertAddressToBankSize(addr, targetBankSize);
			// Store
			newFileLines.set(addr, sourceEntry);
		}
		// Exchange old with new
		this.fileLineNrs = newFileLines;

		// File/line with address:
		for (const [, lineArray] of this.lineArrays) {
			const count = lineArray.length;
			for (let i = 0; i < count; i++) {
				let addr = lineArray[i];
				if (addr == undefined)
					continue;
				// Convert
				addr = this.convertAddressToBankSize(addr, targetBankSize);
				// Store
				lineArray[i] = addr;
			}
		}

		// labelsForLongAddress
		const newLabelsForLongAddress = new Map<number, string[]>();
		for (let [addr, labels] of this.labelsForLongAddress) {
			// Convert
			addr = this.convertAddressToBankSize(addr, targetBankSize);
			// Store
			newLabelsForLongAddress.set(addr, labels);
		}
		this.labelsForLongAddress = newLabelsForLongAddress;

		// numberForLabel
		const newNumberForLabel = new Map<string, number>();
		for (let [label, addr] of this.numberForLabel) {
			// Convert
			addr = this.convertAddressToBankSize(addr, targetBankSize);
			// Store
			newNumberForLabel.set(label, addr);
		}
		this.numberForLabel = newNumberForLabel;

		// labelLocations
		const newLabelLocations = new Map<string, {file: string; lineNr: number; address: number}>();
		for (let [label, location] of this.labelLocations) {
			// Convert
			location.address = this.convertAddressToBankSize(location.address, targetBankSize);
			// Store
			newLabelLocations.set(label, location);
		}
		this.labelLocations = newLabelLocations;

		// watchPointLines
		for (const line of this.watchPointLines) {
			line.address = this.convertAddressToBankSize(line.address, targetBankSize);
		}

		// assertionLines
		for (const line of this.assertionLines) {
			line.address = this.convertAddressToBankSize(line.address, targetBankSize);
		}

		// logPointLines
		for (const line of this.logPointLines) {
			line.address = this.convertAddressToBankSize(line.address, targetBankSize);
		}
	}


	/**
	 * Converts 1 address to the target bank size.
	 * @param address a long address.
	 * @param targetBankSize target banks size. If 0 then convert to 64k address.
	 * @returns The converted address (long address or 64k address)
	 */
	protected convertAddressToBankSize(address: number, targetBankSize: number): number {
		// Check if no bank used
		if (targetBankSize == 0) {
			address &= 0xFFFF;
		}
		else {
			// Change banks
			const origBank = Z80Registers.getBankFromAddress(address);
			const newBank = origBank * this.bankSize / targetBankSize;
			address = Z80Registers.getLongAddressWithBank(address & 0xFFFF, newBank);
		}
		return address;
	}
}


/// Labels is the singleton object that should be accessed.
export const Labels = new LabelsClass();
