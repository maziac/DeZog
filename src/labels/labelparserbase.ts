import {readFileSync} from 'fs';
import {Utility} from '../misc/utility';
//import {Settings} from '../settings';
//import * as path from 'path';
//import {Remote} from '../remotes/remotefactory';
//import {LabelsClass, ListFileLine, SourceFileEntry} from './labels';
import {SourceFileEntry, /*, ListFileLine*/
ListFileLine} from './labels';
//import {Utility} from '../misc/utility';
//import {readFileSync} from 'fs';


/**
 * This class is the base class for the assmebler list file parsers.
 */
export class LabelParserBase {
	/// Map that associates memory addresses (PC values) with line numbers
	/// and files.
	protected fileLineNrs: Map<number, SourceFileEntry>;

	/// Map of arrays of line numbers. The key of the map is the filename.
	/// The array contains the correspondent memory address for the line number.
	protected lineArrays: Map<string, Array<number>>;

	/// An element contains either the offset from the last
	/// entry with labels or an array of labels for that number.
	protected labelsForNumber: Array<any>;

	/// Map with all labels (from labels file) and corresponding values.
	protected numberForLabel: Map<string, number>;

	/// Map with label / file location association.
	protected labelLocations: Map<string, {file: string, lineNr: number}>;


	/// Stores the address of the watchpoints together with the line contents.
	protected watchPointLines: Array<{address: number, line: string}>;

	/// Stores the address of the asserts together with the line contents.
	protected assertLines: Array<{address: number, line: string}>;

	/// Stores the address of the logpoints together with the line contents.
	protected logPointLines: Array<{address: number, line: string}>;


	/// The config structure is stored here.
	protected config: any;

	/// Array used temporary. Holds the converted list file.
	protected listFile=new Array<ListFileLine>();


	// Constructor.
	public constructor(
		fileLineNrs: Map<number, SourceFileEntry>,
		lineArrays: Map<string, Array<number>>,
		labelsForNumber: Array<any>,
		numberForLabel: Map<string, number>,
		labelLocations: Map<string, {file: string, lineNr: number}>,
		watchPointLines: Array<{address: number, line: string}>,
		assertLines: Array<{address: number, line: string}>,
		logPointLines: Array<{address: number, line: string}>
	) {
		// Store variables
		this.fileLineNrs=fileLineNrs;
		this.lineArrays=lineArrays;
		this.labelsForNumber=labelsForNumber;
		this.numberForLabel=numberForLabel;
		this.labelLocations=labelLocations;
		this.watchPointLines=watchPointLines;
		this.assertLines=assertLines;
		this.logPointLines=logPointLines;
	}


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 */
	public loadAsmListFile(config: any) {
		this.config=config;
		//Utility.assert(false, "Override loadAsmListFile");

		// Phase 1: Parse for labels and addresses
		this.parseAllLabelsAndAddresses();

		// Check for watchpoints, asserts and logpoints
		// TODO: parse the this.listFile

		// Check if Listfile-Mode
		if (config.srcDirs.length==0) {
			// Listfile-Mode

		}

		// Phase 2: Parse for source files


		// Finish: Create fileLineNrs, lineArrays and labelLocations

	}


	/**
	 * Loops all lines of the ist file and parses for labels and the addresses
	 * for each line.
	 */
	protected parseAllLabelsAndAddresses() {
		const listLines=readFileSync(this.config.path).toString().split('\n');
		for (const line of listLines) {
			this.parseLabelAndAddress(line);
		}
	}


	/**
	 * Override.
	 * Parses one line for label and address.
	 * Finds labels at start of the line and labels as EQUs.
	 * Also finds the address of the line.
	 * The function calls addLabelForNumber to add a label or equ and
	 * addAddressLine to add the line and it's address.
	 * @param line The current analyzed line of the list file.
	 */
	protected parseLabelAndAddress(line: string) {
		Utility.assert(false, "Override parseLabelAndAddress");
	}


	/**
	 * Adds a new label to the LabelsForNumber array.
	 * Creates a new array if required.
	 * Adds the the label/value pair also to the numberForLabelMap.
	 * @param value The value for which a new label is to be set.
	 * @param label The label to add.
	 */
	protected addLabelForNumber(value: number, label: string) {
		// Safety check
		if (value<0||value>=0x10000)
			return;

		// Label: add to label array
		this.numberForLabel.set(label, value);

		// Add label
		let labelsArray=this.labelsForNumber[value];
		if (labelsArray===undefined) {
			// create a new array
			labelsArray=new Array<string>();
			this.labelsForNumber[value]=labelsArray;
		}
		// Check if label already exists
		for (let item of labelsArray) {
			if (item==label)
				return;	// already exists.
		}

		// Add new label
		labelsArray.push(label);
	}


	/**
	 * Adds the address to the list file array.
	 * Together with the line and the last label string.
	 * @param address The address of the line. Could be NaN (undefined?)
	 * @param size The size of the line. E.g. for a 2 byte instruction this is 2.
	 * @param line The original line contents.
	 * @param lastLabel Contains the last found label (of a previous line) or undefined
	 * @param modulePrefix The prefix for the label. If the assembler supports modules it can be
	 * added here to the label. Otherwise pass undefined.
	 */
	protected addAddressLine(address: number, size: number, line: string, lastLabel: string, modulePrefix?: string) {
		// Add whole size to list file array.
		for (let k=0; k<size; k++) {
			const entry={fileName: '', lineNr: -1-k, addr: address, line: line, modulePrefix: modulePrefix, lastLabel: lastLabel};
			if (address!=undefined)
				address++;
			this.listFile.push(entry)
		}
	}


	/**
	 * Create complete label from module prefix and relative label
	 * @param modulePrefix The first part of the label, e.g. "math."
	 * @param label The last part of the label, e.g. "udiv_c_d"
	 */
	protected getFullLabel(modulePrefix: string|undefined, label: string) {
		let result=modulePrefix||'';
		if (result.length==0)
			return label;
		result+=label;
		return result;
	}

}

