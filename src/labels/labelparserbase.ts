import {readFileSync} from 'fs';
import {Utility} from '../misc/utility';
import {UnifiedPath} from '../misc/unifiedpath';
import {SourceFileEntry, ListFileLine} from './labels';
import {AsmConfigBase} from '../settings';
import * as minimatch from 'minimatch';


/// Different label types.
export enum LabelType {
	NORMAL,	// The label might be preceded by a module name
	LOCAL,	// It's a local label. The name is concatenated with the lastLabel.
	GLOBAL	// The name is taken as is. Not concatenated with anything.
};


/**
 * This class is the base class for the assembler list file parsers.
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
	/// Does not store local labels.
	/// Is used only for unit tests.
	protected labelLocations: Map<string, {file: string, lineNr: number}>;


	/// Stores the address of the watchpoints together with the line contents.
	protected watchPointLines: Array<{address: number, line: string}>;

	/// Stores the address of the asserts together with the line contents.
	protected assertLines: Array<{address: number, line: string}>;

	/// Stores the address of the logpoints together with the line contents.
	protected logPointLines: Array<{address: number, line: string}>;


	/// The config structure is stored here.
	protected config: AsmConfigBase;

	/// Array used temporary. Holds the converted list file.
	protected listFile: Array<ListFileLine>;

	/// Several prefixes might be stacked (a MODULE can happen inside a MODULE)
	protected modulePrefixStack: Array<string>;	// Only used for sjasmplus
	/// Used for found MODULEs
	protected modulePrefix: string;
	protected lastLabel: string;		// Only used for sjasmplus for local labels (without modulePrefix)

	/// The separator used for local labels and modules.
	/// Normally a dot, but could also be defined otherwise.
	protected labelSeparator = '.';

	/// Holds the list file entry for the current line.
	protected currentFileEntry: ListFileLine;

	/// The stack of include files. For parsing filenames and line numbers.
	protected includeFileStack: Array<{fileName: string, lineNr: number}>;

	/// Used to determine if current (included) files are used or excluded in the addr <-> file search.
	protected excludedFileStackIndex: number;

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
	public loadAsmListFile(config: AsmConfigBase) {
		this.config=config;
		// Init (in case of several list files)
		this.excludedFileStackIndex=-1;
		this.includeFileStack=new Array<{fileName: string, lineNr: number}>();
		this.listFile=new Array<ListFileLine>();
		this.modulePrefixStack=new Array<string>();
		this.modulePrefix=undefined as any;
		this.lastLabel=undefined as any;

		// Phase 1: Parse for labels and addresses
		this.parseAllLabelsAndAddresses();

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
		const fileName=Utility.getRelFilePath(this.config.path);
		const listLines=readFileSync(this.config.path).toString().split('\n');
		let lineNr=0;
		for (const line of listLines) {
			// Prepare an entry
			this.currentFileEntry={fileName, lineNr, addr: undefined, size: 0, line, modulePrefix: this.modulePrefix, lastLabel: this.lastLabel};
			this.listFile.push(this.currentFileEntry);

			// Parse
			this.parseLabelAndAddress(line);

			// Check for WPMEM, ASSERT and LOGPOINT
			const address=this.currentFileEntry.addr;
			this.parseWpmemAssertLogpoint(address, line);

			// Next
			lineNr++;
		}
	}


	/**
	 * Parses the line for comments with WPMEM, ASSERT or LOGPOINT.
	 * @param address The address that correspondents to the line.
	 * @param fullLine The line of the list file as string.
	 */
	protected parseWpmemAssertLogpoint(address:number|undefined, fullLine: string) {
		// Extract just comment
		const comment=this.getComment(fullLine);

		// WPMEM
		let match=/.*(\bWPMEM\b.*)/.exec(comment);
		if (match) {
			// Add watchpoint at this address
			if (this.currentFileEntry.size==0)
				this.watchPointLines.push({address: undefined as any, line: match[1]}); // watchpoint inside a macro or without data
			else
				this.watchPointLines.push({address: address!, line: match[1]});
		}

		if (address==undefined)
			return;

		// ASSERT
		match=/.*(\bASSERT\b.*)/.exec(comment);
		if (match) {
			// Add ASSERT at this address
			this.assertLines.push({address, line: match[1]});
		}

		// LOGPOINT
		match=/.*(\bLOGPOINT\b.*)/.exec(comment);
		if (match) {
			// Add logpoint at this address
			this.logPointLines.push({address, line: match[1]});
		}
	}


	/**
	 * Check the list file line for a comment and returns just the comment.
	 * Only override if you allow other line comment identifiers than ";".
	 * @param line The line of the list file as string. E.g. "5    A010 00 00 00...  	defs 0x10		; WPMEM, 5, w"
	 * @returns Just the comment, e.g. the text after ";". E.g. " WPMEM, 5, w"
	 */
	protected getComment(line: string): string {
		const i=line.indexOf(";");
		if (i<0)
			return "";	// No comment
		const comment=line.substr(i+1);
		return comment;
	}


	/**
	 * Loops all entries of the listFile array and parses for the (include) file
	 * names and line numbers.
	 * @param startLineNr The line number to start the loop with. I.e. sometimes the
	 * beginning of the list file contains information that is parsed differently.
	 */
	protected parseAllFilesAndLineNumbers(startLineNr = 0) {
		// Loop all lines
		const count=this.listFile.length;
		for (let listFileNumber=startLineNr; listFileNumber<count; listFileNumber++) {
			const entry=this.listFile[listFileNumber];
			const line=entry.line;
			if (line.length==0)
				continue;
			// Let it parse
			this.currentFileEntry=entry;
			this.parseFileAndLineNumber(line);
			// Associate with right file
			const index=this.includeFileStack.length-1;
			if (index<0)
				continue;	// No main file found so far
				//throw Error("File parsing error: no main file.");
			// Associate with right file
			this.associateSourceFileName();
		}
	}


	/**
	 * Will check if the name is excluded (excludedFiles).
	 * If so the source filename is not set to the source file name so that it
	 * is "" and will be ignored.
	 */
	protected associateSourceFileName() {
		let fName="";
		if (this.excludedFileStackIndex==-1) {
			// Not excluded
			const index=this.includeFileStack.length-1;
			if(index>=0)	// safety check
				fName=this.includeFileStack[index].fileName;
		}
		this.currentFileEntry.fileName=fName;
	}


	/**
	 * Finishes the list file mode.
	 * Puts filename (the list file name) and line numbers into the
	 * this.fileLineNrs and this.lineArrays structures.
	 */
	protected listFileModeFinish() {
		// Use list file directly instead of real filenames.
		const lineArray=new Array<number>();
		const fileName=Utility.getRelFilePath(this.config.path);
		this.lineArrays.set(fileName, lineArray);
		for (const entry of this.listFile) {
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

			// Check address
			if (!entry.addr)
				continue;

			this.fileLineNrs.set(entry.addr, {fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel});

			// Set address
			if (!lineArray[entry.lineNr]) {	// without the check macros would lead to the last addr being stored.
				lineArray[entry.lineNr]=entry.addr;
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

			// Check address
			if (!entry.addr)
				continue;

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
	protected parseLabelAndAddress(line: string) {
		Utility.assert(false, "Override parseLabelAndAddress");
	}


	/**
	 * Override.
	 * Parses one line for current file name and line number in this file.
	 * The function determines the line number from the list file.
	 * The line number is the line number in the correspondent source file.
	 * Note: this is not the line number of the list file.
	 * The list file may include other files. It's the line number of those files we are after.
	 * Call 'setLineNumber' with the line number to set it. Note that source file numbers start at 0.
	 * Furthermore it also determines teh beginning and ending of include files.
	 * Call 'includeStart(fname)' and 'includeEnd()'.
	 * @param line The current analyzed line of the listFile array.
	 */
	protected parseFileAndLineNumber(line: string) {
		Utility.assert(false, "Override parseFileAndLineNumber");
	}


	/**
	 * Called by the parser if a new module is found.
	 * @param moduleName The name of the module.
	 */
	protected moduleStart(moduleName: string) {
		this.modulePrefixStack.push(moduleName);
		this.modulePrefix=this.modulePrefixStack.join(this.labelSeparator)+this.labelSeparator;
		this.currentFileEntry.modulePrefix=this.modulePrefix;
		// Init last label
		this.lastLabel=undefined as any;
		this.currentFileEntry.lastLabel=this.lastLabel;
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
			this.modulePrefix=undefined as any;
		this.currentFileEntry.modulePrefix=this.modulePrefix;
		// Forget last label
		this.lastLabel=undefined as any;
		this.currentFileEntry.lastLabel=this.lastLabel;
	}


	/**
	 * Adds a new label to the LabelsForNumber array.
	 * Creates a new array if required.
	 * Adds the the label/value pair also to the numberForLabelMap.
	 * @param value The value for which a new label is to be set.
	 * @param label The label to add.
	 * @param labelType I.e. NORMAL, LOCAL or GLOBAL.
	 */
	protected addLabelForNumber(value: number, label: string, labelType=LabelType.GLOBAL) {
		// Safety check
		if (value<0||value>=0x10000)
			return;

		switch (labelType) {
			case LabelType.NORMAL:
				// Remember last label (for local labels)
				this.lastLabel=label;
				this.currentFileEntry.lastLabel=this.lastLabel;
				// Add prefix
				if (this.modulePrefix)
					label=this.modulePrefix+label;
				break;
			case LabelType.LOCAL:
				// local label
				if (this.lastLabel) // Add Last label
					label=this.lastLabel+label;
				// Add prefix
				if (this.modulePrefix)
					label=this.modulePrefix+label;
				break;
			case LabelType.GLOBAL:
				// Remember last label (for local labels)
				this.lastLabel=label;
				this.currentFileEntry.lastLabel=this.lastLabel;
				this.currentFileEntry.modulePrefix=undefined;
				break;
		}

		// Label: add to label array
		this.numberForLabel.set(label, value);

		// Add label
		let labelsArray=this.labelsForNumber[value];
		//console.log("labelsArray", labelsArray, "value=", value);
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
	 * Call this even if size is 0. The addresses are also required for
	 * lines that may contain only a comment, e.g. LOGPOINT, WPMEM, ASSERT:
	 * @param address The address of the line. Could be undefined.
	 * @param size The size of the line. E.g. for a 2 byte instruction this is 2.
	 * Has to be 1 if address is undefined.
	 */
	protected addAddressLine(address: number, size: number) {
		this.currentFileEntry.addr=address;
		this.currentFileEntry.size=size;
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


	/**
	 * Called by the parser if a new include file is found.
	 * Is also used to set the main file at the beginning of parsing or before parsing starts.
	 * @param includeFileName The name of the include file.
	 */
	protected includeStart(includeFileName: string) {
		includeFileName=UnifiedPath.getUnifiedPath(includeFileName);
		const index=this.includeFileStack.length-1;
		let fileName;
		if (index>=0) {
			// Include the parent file dir in search
			const parentFileName=this.includeFileStack[this.includeFileStack.length-1].fileName;
			const dirName=UnifiedPath.dirname(parentFileName);
			fileName=Utility.getRelSourceFilePath(includeFileName, [dirName, ...this.config.srcDirs]);
		}
		else {
			// Main file
			fileName=Utility.getRelSourceFilePath(includeFileName, this.config.srcDirs);
		}

		this.includeFileStack.push({fileName, lineNr: 0});

		// Now check if we need to exclude it from file/line <-> address relationship.
		if (this.excludedFileStackIndex==-1) {
			// Check if filename is one of the excluded file names.
			for (const exclGlob of this.config.excludeFiles) {
				const found=minimatch(fileName, exclGlob);
				if (found) {
					this.excludedFileStackIndex=index+1;
					break;
				}
			}
		}
	}


	/**
	 * Called by the parser if the end of an include file is found.
	 */
	protected includeEnd() {
		if (this.includeFileStack.length==0)
			throw Error("File parsing error: include file stacking.");
		// Remove last include file
		this.includeFileStack.pop();

		// Check if excluding files ended
		const index=this.includeFileStack.length;
		if (this.excludedFileStackIndex==index) {
			// Stop excluding
			this.excludedFileStackIndex=-1;
		}
	}


	/**
	 * Called by the parser to set the line number parsed from the list file.
	 * This is the line number inside an include file.
	 * Should be called before 'includeStart' and 'includeEnd'.
	 * But is not so important as there is no assembler code in these lines.
	 * @param lineNr The parsed line number. Note this line number has to start at 0.
	 */
	protected setLineNumber(lineNr: number) {
		this.currentFileEntry.lineNr=lineNr;
	}

}

