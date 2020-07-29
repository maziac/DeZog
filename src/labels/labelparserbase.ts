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


/// Different label types.
export enum LabelType {
	NORMAL,	// The label might be preceded bya module name
	LOCAL,	// It's a local label. The name is concatenated with the lastLabel.
	GLOBAL	// The name is taken as is. Not concatenated with anything.
};


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


	/// Used for found MODULEs
	protected modulePrefix;

	/// Several prefixes might be stacked (a MODULE can happen inside a MODULE)
	protected modulePrefixStack=new Array<string>();	// Only used for sjasmplus
	protected lastLabel;		// Only used for sjasmplus for local labels (without labelPrefix)

	/// The separator used for local labels and modules.
	/// Normally a dot, but could also be defined otherwise.
	protected labelSeparator = '.';


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
			this.listFileModeFinish();
			return;
		}

		// Phase 2: Parse for source files
		this.parseAllFilesAndLineNumbers();

		// Finish: Create fileLineNrs, lineArrays and labelLocations
		this.sourcesModeFinish();
	}


	/**
	 * Loops all lines of the list file and parses for labels and the addresses
	 * for each line.
	 */
	protected parseAllLabelsAndAddresses() {
		const listLines=readFileSync(this.config.path).toString().split('\n');
		for (const line of listLines) {
			this.parseLabelAndAddress(line);
		}
	}


	/**
	 * Loops all entries of the listFile array and parses for the (include) file
	 * names and line numbers.
	 */
	protected parseAllFilesAndLineNumbers() {
		const count=this.listFile.length;
		for (var lineNr=0; lineNr<count; lineNr++) {
			const line=this.listFile[lineNr].line;
			if (line.length==0)
				continue;

			this.parseFileAndLineNumber(line);
		}
	}


	/**
	 * Finishes the list file mode.
	 * Puts filename (the list file name) and line numbers into the
	 * this.fileLineNrs and this.lineArrays structures.
	 */
	// TODO: misses labelLocations
	protected listFileModeFinish() {
		// Use list file directly instead of real filenames.
		const relFileName=Utility.getRelFilePath(this.config.path);
		const lineArray=new Array<number>();
		this.lineArrays.set(relFileName, lineArray);
		const listLength=this.listFile.length;
		let realLineNr=-1;	// z88dk/sjasmplus sometimes suppresses line numbers, therefore do own counting
		for (var lineNr=0; lineNr<listLength; lineNr++) {
			const entry=this.listFile[lineNr];
			if (isNaN(entry.addr)) {
				realLineNr++;
				continue;
			}
			if (entry.lineNr==-1)
				realLineNr++;
			entry.fileName=relFileName;
			entry.lineNr=realLineNr;
			this.fileLineNrs.set(entry.addr, {fileName: relFileName, lineNr: realLineNr});

			// Set address
			if (!lineArray[realLineNr]) {	// without the check macros would lead to the last addr being stored.
				lineArray[realLineNr]=entry.addr;
				//console.log('filename='+entry.fileName+', lineNr='+realLineNr+', addr='+Utility.getHexString(entry.addr, 4));
			}
		}
	}


	/**
	 * Finishes the sources mode.
	 * Puts filename (the list file name) and line numbers into the
	 * this.labelLocations, this.fileLineNrs and this.lineArrays structures.
	 */
	protected sourcesModeFinish() {
		for (const entry of this.listFile) {
			if (entry.fileName.length==0)
				continue;	// Skip lines with no filename (e.g. '# End of file')

			// Create label -> file location association
			const lastLabel=entry.lastLabel;
			if (lastLabel) {
				const fullLabel=this.getFullLabel(entry.modulePrefix, lastLabel);
				let fileLoc=this.labelLocations.get(fullLabel);
				if (!fileLoc) {
					// Add new file location
					fileLoc={file: entry.fileName, lineNr: entry.lineNr};
					this.labelLocations.set(fullLabel, fileLoc);
				}
			}

			// last address entry wins:
			this.fileLineNrs.set(entry.addr, {fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel});

			// Check if a new array need to be created
			if (!this.lineArrays.get(entry.fileName)) {
				this.lineArrays.set(entry.fileName, new Array<number>());
			}

			// Get array
			const lineArray=this.lineArrays.get(entry.fileName)||[];

			// Set address
			if (!lineArray[entry.lineNr]) {	// without the check macros would lead to the last addr being stored.
				lineArray[entry.lineNr]=entry.addr;
				//console.log('filename='+entry.fileName+', lineNr='+entry.lineNr+', addr='+Utility.getHexString(entry.addr, 4));
			}
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
	protected parseFileAndLineNumber(line: string) {
		Utility.assert(false, "Override parseFileAndLineNumber");
	}

	/**
	 * Override.
	 * Parses one line for current file name and line number in this file.
	 * The function calls.... TODO
	 * @param line The current analyzed line of the listFile array.
	 */
	protected parseLabelAndAddress(line: string) {
		Utility.assert(false, "Override parseLabelAndAddress");
	}


	/**
	 * Called by the parser if a new module is found.
	 * @param moduleName The name of the module.
	 */
	protected moduleStart(moduleName: string) {
		this.modulePrefixStack.push(moduleName);
		this.modulePrefix=this.modulePrefixStack.join(this.labelSeparator)+this.labelSeparator;
		// Init last label
		this.lastLabel=undefined;
	}


	/**
	 * Called by the parser if a module end is found.
	 */
	protected moduleEnd() {
		// Remove last prefix
		this.modulePrefixStack.pop();
		if (this.modulePrefixStack.length>0)
			this.modulePrefix=this.modulePrefixStack.join(this.labelSeparator)+this.labelSeparator;
		else
			this.modulePrefix=undefined;
		// Forget last label
		this.lastLabel=undefined;
	}


	/**
	 * Adds a new label to the LabelsForNumber array.
	 * Creates a new array if required.
	 * Adds the the label/value pair also to the numberForLabelMap.
	 * @param value The value for which a new label is to be set.
	 * @param label The label to add.
	 * @param labelType I.e. NORMAL, LOCAL or GLOBAL.
	 */
	protected addLabelForNumber(value: number, label: string, labelType = LabelType.GLOBAL) {
		// Safety check
		if (value<0||value>=0x10000)
			return;

		switch (labelType) {
			case LabelType.NORMAL:
				// Remember last label (for local labels)
				this.lastLabel=label;
				// Add prefix
				if (this.modulePrefix)
					label=this.modulePrefix+label;
				break;
			case LabelType.LOCAL:
				// local label
				if (this.lastLabel) // Add Last label
					label=this.lastLabel+label;
				break;
			case LabelType.GLOBAL:
				 // TODO: Test global label
				// Remember last label (for local labels)
				this.lastLabel=label;
				break;
		}

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
	 */
	protected addAddressLine(address: number, size: number, line: string) {
		// Add whole size to list file array.
		for (let k=0; k<size; k++) {
			const entry={fileName: '', lineNr: -1-k, addr: address, line: line, modulePrefix: this.modulePrefix, lastLabel: this.lastLabel};
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

