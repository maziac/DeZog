import {Utility} from '../misc/utility';
import {Remote} from '../remotes/remotefactory';
import {SjasmplusLabelParser} from './sjasmpluslabelparser';
import {SjasmplusSldLabelParser} from './sjasmplussldlabelparser';
import {Z80asmLabelParser} from './z80asmlabelparser';
import {Z88dkLabelParser} from './z88dklabelparser';


/**
 * For the association of the addresses to the files.
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
 * well then the longAddressesUsed public boolean is set to true.
 * This has to be set by the list file parser.
 * Furthermore the list file parser has to provide these 'long addresses'
 * in a special format.
 * Please look at SjasmplusSldLabelParser as an example.
 *
 */
export class LabelsClass {

	/// Map that associates memory addresses (PC values) with line numbers
	/// and files.
	protected fileLineNrs=new Map<number, SourceFileEntry>();

	/// Map of arrays of line numbers. The key of the map is the filename.
	/// The array contains the correspondent memory address for the line number.
	protected lineArrays=new Map<string, Array<number>>();

	/// An element contains either the offset from the last
	/// entry with labels or an array of labels for that number.
	protected labelsForNumber=new Array<any>();

	/// Map with all labels (from labels file) and corresponding values.
	protected numberForLabel=new Map<string, number>();//ValueLocation>();

	/// Map with label / file location association. Only used in unit tests to
	/// point to the unit tests. Direct relationship: The line number of the label is returned.
	/// Not the line number of the value of the label.
	protected labelLocations=new Map<string, {file: string, lineNr: number}>()

	/// Stores the address of the watchpoints together with the line contents.
	protected watchPointLines=new Array<{address: number, line: string}>();

	/// Stores the address of the asserts together with the line contents.
	protected assertLines=new Array<{address: number, line: string}>();

	/// Stores the address of the logpoints together with the line contents.
	protected logPointLines=new Array<{address: number, line: string}>();


	/// From the Settings.
	protected smallValuesMaximum: number;


	// Is set to true if addresses+page/bank number is used
	public longAddressesUsed: boolean;


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
		this.labelsForNumber.length=0;
		this.numberForLabel.clear();
		this.labelLocations.clear();
		this.watchPointLines.length=0;
		this.assertLines.length=0;
		this.logPointLines.length=0;
		this.smallValuesMaximum=smallValuesMaximum;
		this.longAddressesUsed=false;
	}


	/**
	 * This has to be set in the launchRequest.
	 * Finishes off the loading of list and labels files.
	 * Can throw an exception if some values make no sense.
	 */
	public finish() {
		// Calculate the label offsets
		this.calculateLabelOffsets();
	}


	/**
	 * Reads all list files for all available assemblers.
	 * @param mainConfig Is a part of Settings. It contains e.g. the properties "sjasmplus",
	 * "z80asm" and "z88dk".
	 * Each property is an object which contains the specific parameters.
	 * Especially it contains the path to the list file.
	 */
	public readListFiles(mainConfig: any) {
		// sjasmplus
		if (mainConfig.sjasmplus) {
			// For sjasmplus it is checked if a list file should be parsed or an sld file
			for (const config of mainConfig.sjasmplus) {
				let parser;
				if(SjasmplusSldLabelParser.IsSldFile(config.path)) {
					// Parse SLD file and list file
					parser=new SjasmplusSldLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertLines, this.logPointLines);
				}
				else {
					// Parse just list file
					parser=new SjasmplusLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertLines, this.logPointLines);
				}
				parser.loadAsmListFile(config);
				this.longAddressesUsed=parser.longAddressesUsed;
			}
		}

		// z80asm
		if (mainConfig.z80asm) {
			const parser=new Z80asmLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertLines, this.logPointLines);
			for (const config of mainConfig.z80asm)
				parser.loadAsmListFile(config);
		}

		// z88dk
		if (mainConfig.z88dk) {
			const parser=new Z88dkLabelParser(this.fileLineNrs, this.lineArrays, this.labelsForNumber, this.numberForLabel, this.labelLocations, this.watchPointLines, this.assertLines, this.logPointLines);
			for (const config of mainConfig.z88dk)
				parser.loadAsmListFile(config);
		}

		// Add new assemblers here ...


		// Finish
		this.finish();
	}


	/**
	 * Accessor for the watchpoint lines.
	 */
	public getWatchPointLines() {
		return this.watchPointLines;
	}


	/**
	 * Accessor for the assert lines.
	 */
	public getAssertLines() {
		return this.assertLines;
	}


	/**
	 * Accessor for the logpoint lines.
	 */
	public getLogPointLines() {
		return this.logPointLines;
	}


	/**
	 * Calculates the offsets for all labels.
	 * I.e. for all addresses without a direct label entry.
	 */
	protected calculateLabelOffsets() {
		// Now fill the unset values with the offsets
		var offs=-1;
		for (var i=0; i<0x10000; i++) {
			const labels=this.labelsForNumber[i];
			if (labels===undefined) {
				if (offs>=0) {
					this.labelsForNumber[i]=offs;
					++offs;
				}
			}
			else {
				// array
				offs=1;
			}
		}
	}


	/**
	 * Returns all labels with the exact same address
	 * to the given address.
	 * @param number The address value to find. Ignores numbers/labels <= e.g. 'smallValuesMaximum' or > 65535.
	 * @param regsAsWell If true it also returns registers which match the number. If false (default) then no registers are returned.
	 * @returns An array of strings with (registers and) labels. Might return an empty array.
	 */
	public getLabelsForNumber(number: number, regsAsWell=false): Array<string> {
		/*
		if (number<=this.smallValuesMaximum||number>0xFFFF) {
			return [];	// E.g. ignore numbers/labels < e.g. 513 or > 65535
		}
		*/
		if (number<=this.smallValuesMaximum) {
			return [];	// E.g. ignore numbers/labels < e.g. 513
		}

		let names;
		if (regsAsWell)
			names=Remote.getRegistersEqualTo(number);
		else
			names=new Array<string>();

		let labels=this.labelsForNumber[number];

		if (labels&&typeof labels!=='number') {
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
	 * @param regsAsWell If true it also returns registers which match the number. If false (default) then no registers are returned.
	 * @returns An array of strings with (registers and) labels + offset
	 */
	public getLabelsPlusIndexForNumber(number: number, regsAsWell=false): Array<string> {
		if (number<=this.smallValuesMaximum||number>0xFFFF) {
			return [];	// E.g. ignore numbers/labels < e.g. 513 or > 65535
		}

		let names;
		if (regsAsWell)
			names=Remote.getRegistersEqualTo(number);
		else
			names=new Array<string>();

		let labels=this.labelsForNumber[number];
		if (labels) {
			if (typeof labels!=='number') {
				names.push(...labels);
			}
			else {
				const offs=labels;	// number
				number-=offs;
				const baseLabels=this.labelsForNumber[number];	// this is an array
				if (baseLabels!==undefined) {
					const labelsPlus=baseLabels.map(label => label+'+'+offs);
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
	 * Returns the location (file/line number) of a label.
	 * @param label The label. E.g. "math.div_c_d"
	 * @returns {file, lineNr}: The absolute filepath and the line number.
	 * undefined if label does not exist.
	 */
	public getLocationOfLabel(label: string): {file: string, lineNr: number}|undefined {
		return this.labelLocations.get(label);
	}


	/**
	 * Returns all labels that match the regular expression string.
	 * @param labelRegEx Regular expression string.
	 * @param options E.g. 'g'
	 * @returns An array with matching labels. If nothing found an empty array is returned.
	 */
	public getLabelsForRegEx(labelRegEx: string, options='i'): Array<string> {
		const regex=new RegExp(labelRegEx, options);
		const foundLabels=new Array<string>();
		for (let [k,] of this.numberForLabel) {
			const match=regex.exec(k);
			if (match)
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
		if (text==undefined)
			return NaN;
		var result=this.getNumberForLabel(text);
		if (result==undefined) {
			// Try convert as string
			if (text.startsWith('_'))
				return NaN;
			result=Utility.parseValue(text);
		}
		return result;
	}


	/**
	 * Returns file name and line number associated with a certain memory address.
	 * Used e.g. for the call stack.
	 * @param address The memory address to search for.
	 * @returns The associated filename and line number (and for sjasmplus the modulePrefix and the lastLabel).
	 */
	// TODO: Ist wahrscheinlich doch besser ausserhalb die Addresse zu konverten.
	public getFileAndLineForAddress(address: number): SourceFileEntry {
		// Address file conversion
		const entry=this.fileLineNrs.get(address);
		if (!entry)
			return {fileName: '', lineNr: 0, modulePrefix: undefined, lastLabel: undefined};

		const filePath=Utility.getAbsFilePath(entry.fileName);
		return {fileName: filePath, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel};
	}


	/**
	 * Returns the memory address associated with a certain file and line number.
	 * @param fileName The path to the file. Can be an absolute path.
	 * @param lineNr The line number inside the file.
	 * @returns The associated address. -1 if file or line does not exist.
	 */
	public getAddrForFileAndLine(fileName: string, lineNr: number): number {
		var filePath=Utility.getRelFilePath(fileName);
		var addr=-1;
		const lineArray=this.lineArrays.get(filePath);
		if (lineArray) {
			addr=lineArray[lineNr];
			if (addr==undefined)
				addr=-1;
		}
		return addr;
	}

}


/// Labels is the singleton object that should be accessed.
export const Labels = new LabelsClass();
