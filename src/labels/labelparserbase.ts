//import {readFileSync} from 'fs';
//import {Utility} from '../misc/utility';
//import {Settings} from '../settings';
//import * as path from 'path';
//import {Remote} from '../remotes/remotefactory';
//import {LabelsClass, ListFileLine, SourceFileEntry} from './labels';
import {SourceFileEntry /*, ListFileLine*/} from './labels';
import {Utility} from '../misc/utility';
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
	 * Fills listLines and listPCs.
	 */
	public loadAsmListFile(config: any) {
		Utility.assert(false, "Overwrite loadAsmListFile");
	}


	/**
	 * Adds a new label to the LabelsForNumber array.
	 * Creates a new array if required.
	 * @param value The value for which a new label is to be set.
	 * @param label The label to add.
	 */
	protected addLabelForNumber(value: number, label: string) {
		// Safety check
		if (value<0||value>=0x10000)
			return;

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


}

