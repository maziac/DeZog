import { ListConfigBase, AsmConfigBase } from './../settings/settings';
import * as fs from 'fs';
import {Utility} from '../misc/utility';
import {UnifiedPath} from '../misc/unifiedpath';
import {SourceFileEntry, ListFileLine} from './labels';
import minimatch from 'minimatch';
import {MemoryModel} from '../remotes/MemoryModel/memorymodel';
import {MemoryModelAllRam, MemoryModelUnknown} from '../remotes/MemoryModel/genericmemorymodels';
import {MemoryModelZx128k, MemoryModelZx48k} from '../remotes/MemoryModel/zxspectrummemorymodels';
import {MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from '../remotes/MemoryModel/zxnextmemorymodels';



/**
 * An issue is an error or warning generated while parsing the list file.
 * As list files are computer generated this normally does not happen, except
 * for warnings.
 * But for the manually created reverse engineering list file errors can happen
 * quite easily.
 */
export interface Issue {
	// The parser human readable name
	parser: string;

	// The absolute file path where the problem occurred.
	filepath: string;

	// The line number, 0-based.
	lineNr: number;

	// The severity:
	severity: 'error' | 'warning';

	// The error or warning text.
	message: string;
}


/**
 * This class is the base class for the assembler list file parsers.
 */
export class LabelParserBase {
	// Overwrite with parser name (for errors) in derived classes.
	protected parserName: string;

	// Mainly for error reporting.
	public currentLineNr: number = 0;

	/// Map that associates memory addresses (PC values) with line numbers
	/// and files.
	/// Long addresses.
	protected fileLineNrs: Map<number, SourceFileEntry>;

	/// Map of arrays of line numbers. The key of the map is the filename.
	/// The array contains the correspondent memory address for the line number.
	/// Long addresses.
	protected lineArrays: Map<string, Array<number>>;

	/// An element contains either the offset from the last
	/// entry with labels or an array of labels for that number.
	/// Array contains a max 0x10000 entries. Thus it is for
	/// 64k addresses.
	protected labelsForNumber64k: Array<any>;

	/// This map is used to associate long addresses with labels.
	/// E.g. used for the call stack.
	/// Long addresses.
	protected labelsForLongAddress = new Map<number, Array<string>>();

	/// Map with all labels (from labels file) and corresponding values.
	/// Long addresses.
	protected numberForLabel = new Map<string, number>();

	/// Map with label / file location association.
	/// Does not store local labels.
	/// Is used only for unit tests.
	/// Long addresses.
	protected labelLocations: Map<string, {file: string, lineNr: number, address: number}>;


	/// Stores the address of the watchpoints together with the line contents.
	/// Long addresses.
	protected watchPointLines: Array<{address: number, line: string}>;

	/// Stores the address of the assertions together with the line contents.
	/// Long addresses.
	protected assertionLines: Array<{address: number, line: string}>;

	/// Stores the address of the logpoints together with the line contents.
	/// Long addresses.
	protected logPointLines: Array<{address: number, line: string}>;


	/// The config structure is stored here.
	protected config: ListConfigBase;

	/// Array used temporary. Holds the converted list file.
	protected listFile: Array<ListFileLine>;

	/// Several prefixes might be stacked (a MODULE can happen inside a MODULE)
	protected modulePrefixStack: Array<string>;	// Only used for sjasmplus
	/// Used for found MODULEs (Not used anymore?)
	protected modulePrefix: string;
	protected lastLabel: string;		// Only used for local labels (without modulePrefix)

	/// The separator used for local labels and modules.
	/// Normally a dot, but could also be defined otherwise.
	protected labelSeparator = '.';

	/// Holds the list file entry for the current line.
	protected currentFileEntry: ListFileLine;

	/// The stack of include files. For parsing filenames and line numbers.
	protected includeFileStack: Array<{fileName: string, lineNr: number}>;


	// Regexes to find WPMEM, ASSERTION and LOGPOINT in the comments
	protected wpmemRegEx = /.*(\bWPMEM([\s,]|$).*)/;
	protected assertionRegEx = /.*(\bASSERTION([\s,]|$).*)/;
	protected logpointRegEx = /.*(\bLOGPOINT([\s,]|$).*)/;


	/// Used to determine if current (included) files are used or excluded in the addr <-> file search.
	protected excludedFileStackIndex: number;

	/// The used memory model. E.g. if and how slots are used.
	/// Set during 'readListFiles'.
	public memoryModel: MemoryModel;

	/// Function to convert bank into different memory model bank.
	/// At start the target memory model is compared to the sld memory model.
	/// Some memory models can be converted into each other.
	/// E.g. ZX128K into ZXNext.
	// This is done here.
	protected funcConvertBank: (address: number, bank: number) => number;

	/// This function gets called when a problem arises, an error or warning.
	protected issueHandler: (issue: Issue) => void;


	/**
	 *  Constructor.
	 * @param issueHandler Gets called when an error or problem is found in the file.
	 */
	public constructor(	// NOSONAR
		memoryModel: MemoryModel,
		fileLineNrs: Map<number, SourceFileEntry>,
		lineArrays: Map<string, Array<number>>,
		labelsForNumber64k: Array<any>,
		labelsForLongAddress: Map<number, Array<string>>,
		numberForLabel: Map<string, number>,
		labelLocations: Map<string, {file: string, lineNr: number, address: number}>,
		watchPointLines: Array<{address: number, line: string}>,
		assertionLines: Array<{address: number, line: string}>,
		logPointLines: Array<{address: number, line: string}>,
		issueHandler: (issue: Issue) => void
	) {
		// Store variables
		this.memoryModel = memoryModel;
		this.fileLineNrs = fileLineNrs;
		this.lineArrays = lineArrays;
		this.labelsForNumber64k = labelsForNumber64k;
		this.labelsForLongAddress = labelsForLongAddress;
		this.numberForLabel = numberForLabel;
		this.labelLocations = labelLocations;
		this.watchPointLines = watchPointLines;
		this.assertionLines = assertionLines;
		this.logPointLines = logPointLines;
		this.issueHandler = issueHandler;
	}


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 * @param config The assembler configuration.
	 */
	public loadAsmListFile(cfg: ListConfigBase) {
		try {
			const config = cfg as AsmConfigBase;
			this.config = config;
			// Init (in case of several list files)
			this.excludedFileStackIndex = -1;
			this.includeFileStack = new Array<{fileName: string, lineNr: number}>();
			this.listFile = new Array<ListFileLine>();
			this.modulePrefixStack = new Array<string>();
			this.modulePrefix = undefined as any;
			this.lastLabel = undefined as any;

			// Check conversion to target memory model: This is done before parsing if the list file
			// does not contain any memory model.
			this.checkMappingToTargetMemoryModel();

			// Phase 1: Parse for labels and addresses
			this.parseAllLabelsAndAddresses();

			// Check if Listfile-Mode
			if (config.srcDirs == undefined || config.srcDirs.length == 0) {
				// Listfile-Mode
				this.listFileModeFinish();
				return;
			}

			// Phase 2: Parse for source files
			this.parseAllFilesAndLineNumbers();

			// Finish: Create fileLineNrs, lineArrays and labelLocations
			this.sourcesModeFinish();
		}
		catch (e) {
			this.throwError(e.message);
		}
	}


	/**
	 * Loops all lines of the list file and parses for labels and the addresses
	 * for each line.
	 */
	protected parseAllLabelsAndAddresses() {
		// Loop through all lines
		const fileName = Utility.getRelFilePath(this.config.path);
		const listLinesFull = fs.readFileSync(this.config.path).toString().split('\n');
		// Strip away windows line endings
		const listLines = listLinesFull.map(line => line.trimEnd());
		this.currentLineNr = 0;
		for (let line of listLines) {
			// Prepare an entry
			this.currentFileEntry = {fileName, lineNr: this.currentLineNr, longAddr: undefined, size: 0, line, modulePrefix: this.modulePrefix, lastLabel: this.lastLabel};
			this.listFile.push(this.currentFileEntry);

			// Parse
			this.parseLabelAndAddress(line);

			// Check for WPMEM, ASSERTION and LOGPOINT
			const address = this.currentFileEntry.longAddr;
			this.findWpmemAssertionLogpoint(address, line);

			// Next
			this.currentLineNr++;
		}
	}


	/**
	 * Loops all entries of the listFile array and parses for the (include) file
	 * names and line numbers.
	 * @param startLineNr The line number to start the loop with. I.e. sometimes the
	 * beginning of the list file contains information that is parsed differently.
	 */
	protected parseAllFilesAndLineNumbers(startLineNr = 0) {
		// Loop all lines
		const count = this.listFile.length;
		for (let listFileNumber = startLineNr; listFileNumber < count; listFileNumber++) {
			const entry = this.listFile[listFileNumber];
			const line = entry.line;
			if (line.length == 0)
				continue;
			// Let it parse
			this.currentFileEntry = entry;
			this.parseFileAndLineNumber(line);
			// Associate with right file
			const index = this.includeFileStack.length - 1;
			if (index < 0)
				continue;	// No main file found so far
			//throw Error("File parsing error: no main file.");
			// Associate with right file
			this.associateSourceFileName();
		}
	}


	/**
	 * Parses the line for comments with WPMEM, ASSERTION or LOGPOINT.
	 * Note: This only collect the lines. Parsing is done at a
	 * later state when all labels are known.
	 * @param address The address that correspondents to the line.
	 * @param fullLine The line of the list file as string.
	 */
	protected findWpmemAssertionLogpoint(address: number | undefined, fullLine: string) {
		// Extract just comment
		const comment = this.getComment(fullLine);

		// WPMEM
		let match =this.wpmemRegEx.exec(comment);
		if (match) {
			// Add watchpoint at this address
			/*
			if (this.currentFileEntry&&this.currentFileEntry.size==0)
				this.watchPointLines.push({address: undefined as any, line: match[1]}); // watchpoint inside a macro or without data -> Does not work: WPMEM could be on a separate line
			else
			*/
			this.watchPointLines.push({address: address!, line: match[1]});
		}

		if (address == undefined)
			return;

		// ASSERTION
		match = this.assertionRegEx.exec(comment);
		if (match) {
			// Add ASSERTION at this address
			this.assertionLines.push({address, line: match[1]});
		}

		// LOGPOINT
		match = this.logpointRegEx.exec(comment);
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
		const i = line.indexOf(";");
		if (i < 0)
			return "";	// No comment
		const comment = line.substring(i + 1);
		return comment;
	}


	/**
	 * Will check if the name is excluded (excludedFiles).
	 * If so the source filename is not set to the source file name so that it
	 * is "" and will be ignored.
	 */
	protected associateSourceFileName() {
		let fName = "";
		if (this.excludedFileStackIndex == -1) {
			// Not excluded
			const index = this.includeFileStack.length - 1;
			if (index >= 0)	// safety check
				fName = this.includeFileStack[index].fileName;
		}
		this.currentFileEntry.fileName = fName;
	}


	/**
	 * Finishes the list file mode.
	 * Puts filename (the list file name) and line numbers into the
	 * this.fileLineNrs and this.lineArrays structures.
	 */
	protected listFileModeFinish() {
		// Use list file directly instead of real filenames.
		const lineArray = new Array<number>();
		const fileName = Utility.getRelFilePath(this.config.path);
		this.lineArrays.set(fileName, lineArray);
		for (const entry of this.listFile) {
			// Create label -> file location association
			const lastLabel = entry.lastLabel;
			if (lastLabel) {
				const fullLabel = this.getFullLabel(entry.modulePrefix, lastLabel);
				let fileLoc = this.labelLocations.get(fullLabel);
				if (!fileLoc) {
					// Add new file location
					const address: number = entry.longAddr!;
					fileLoc = {file: entry.fileName, lineNr: entry.lineNr, address};
					this.labelLocations.set(fullLabel, fileLoc);
				}
			}

			// Check address
			if (entry.longAddr == undefined)
				continue;

			const countBytes = entry.size;
			if (countBytes > 0) {
				const longAddress = entry.longAddr;
				const adr64k = (entry.longAddr & 0xFFFF);
				const slotAssociation = this.memoryModel.slotAddress64kAssociation;
				const slot = slotAssociation[adr64k];
				for (let i = 0; i < entry.size; i++) {
					const slotPlus = slotAssociation[(adr64k + i) & 0xFFFF];
					if (slotPlus != slot)
						break;	// Reached the slot border
					// Add
					const longAddressPlus = longAddress + i;
					this.setFileLineNrForAddress(longAddressPlus, {fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel, size: 1});
				}
			}
			else {
				// Just for reverse engineering: to be able to define a breakpoint at a label with no associated bytes.
				const addr = entry.longAddr;
				this.setFileLineNrForAddress(addr, {fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel, size: 0});
			}

			// Set address
			if (!lineArray[entry.lineNr]) {	// without the check macros would lead to the last addr being stored.
				//				if(entry.size > 0)	// Only real code gets an address, e.g. not just a label without opcode
				lineArray[entry.lineNr] = entry.longAddr;
				//console.log('filename='+entry.fileName+', lineNr='+realLineNr+', addr='+Utility.getHexString(entry.addr, 4));
			}
		}
	}


	/**
	 * Associates the structure with file and lineNr to the address.
	 * Additionally uses the true-case-path for this.
	 * I.e. on windows and macos a path could have been used with a different capitalization.
	 * But for storage the correct path is used.
	 * This in turn also checks if the file is available at all.
	 * @param longAddress Long address
	 * @param entry Contains (relative) file name, lineNr, etc.
	 */
	protected setFileLineNrForAddress(longAddress: number, entry: SourceFileEntry) {
		this.fileLineNrs.set(longAddress, entry);
	}


	/**
	 * Finishes the sources mode.
	 * Puts filename (the list file name) and line numbers into the
	 * this.labelLocations, this.fileLineNrs and this.lineArrays structures.
	 */
	protected sourcesModeFinish() {
		for (const entry of this.listFile) {
			if (entry.fileName.length == 0)
				continue;	// Skip lines with no filename (e.g. '# End of file')

			// Create label -> file location association
			const lastLabel = entry.lastLabel;
			if (lastLabel) {
				const fullLabel = this.getFullLabel(entry.modulePrefix, lastLabel);
				let fileLoc = this.labelLocations.get(fullLabel);
				if (!fileLoc) {
					// Add new file location
					const address: number = entry.longAddr!;
					fileLoc = {file: entry.fileName, lineNr: entry.lineNr, address};
					this.labelLocations.set(fullLabel, fileLoc);
				}
			}

			// Check address
			if (entry.longAddr == undefined)
				continue;

			// last address entry wins:
			for (let i = 0; i < entry.size; i++) {
				const addr = (i == 0) ? entry.longAddr : (entry.longAddr + i) & 0xFFFF;	// Don't mask entry addr if size is 1, i.e. for sjasmplus sld allow higher addresses
				this.setFileLineNrForAddress(addr, {
					fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel, size: entry.size
				});
			}


			// Check if a new array need to be created
			if (!this.lineArrays.get(entry.fileName)) {
				this.lineArrays.set(entry.fileName, new Array<number>());
			}

			// Get array
			const lineArray = this.lineArrays.get(entry.fileName)!;

			// Set address
			if (!lineArray[entry.lineNr]) {	// without the check macros would lead to the last addr being stored.
				lineArray[entry.lineNr] = entry.longAddr;
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
	 * Furthermore it also determines the beginning and ending of include files.
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
		this.modulePrefix = this.modulePrefixStack.join(this.labelSeparator) + this.labelSeparator;
		this.currentFileEntry.modulePrefix = this.modulePrefix;
		// Init last label
		this.lastLabel = undefined as any;
		this.currentFileEntry.lastLabel = this.lastLabel;
	}


	/**
	 * Called by the parser if a module end is found.
	 */
	protected moduleEnd() {
		// Remove last prefix
		this.modulePrefixStack.pop();
		if (this.modulePrefixStack.length > 0)
			this.modulePrefix = this.modulePrefixStack.join(this.labelSeparator) + this.labelSeparator;
		else
			this.modulePrefix = undefined as any;
		this.currentFileEntry.modulePrefix = this.modulePrefix;
		// Forget last label
		this.lastLabel = undefined as any;
		this.currentFileEntry.lastLabel = this.lastLabel;
	}


	/**
	 * Adds a new label to the labelsForNumber64k array.
	 * Creates a new array if required.
	 * Adds the the label/value pair also to the numberForLabelMap.
	 * Don't use for EQUs > 64k.
	 * On the other hand long addresses can be passed.
	 * I.e. everything > 64k is interpreted as long address.
	 * Handles 64k and long addresses.
	 * @param value The value for which a new label is to be set. If a value > 64k it needs
	 * to be a long address.
	 * I.e. EQU values > 64k are not allowed here.
	 * @param label The label to add.
	 */
	protected addLabelForNumber(value: number, label: string,) {
		// Remember last label (for local labels)
		this.lastLabel = label;
		this.currentFileEntry.lastLabel = this.lastLabel;
		this.currentFileEntry.modulePrefix = undefined;
		this.addLabelForNumberRaw(value, label);
	}


	/**
	 * Adds a new label to the labelsForNumber64k array.
	 * Creates a new array if required.
	 * Adds the the label/value pair also to the numberForLabelMap.
	 * Don't use for EQUs > 64k.
	 * On the other hand long addresses can be passed.
	 * I.e. everything > 64k is interpreted as long address.
	 * Handles 64k and long addresses.
	 * @param value The value for which a new label is to be set. If a value > 64k it needs
	 * to be a long address.
	 * I.e. EQU values > 64k are not allowed here.
	 * @param label The label to add.
	 * @param labelType I.e. NORMAL, LOCAL or GLOBAL.
	 */
	protected addLabelForNumberRaw(value: number, label: string) {
		// Label: add to label array, long address
		this.numberForLabel.set(label, value);

		// Add label to labelsForNumber64k (just 64k address)
		const value64k = value & 0xFFFF;
		let labelsArray = this.labelsForNumber64k[value64k];
		//console.log("labelsArray", labelsArray, "value=", value);
		if (labelsArray === undefined) {
			// create a new array
			labelsArray = new Array<string>();
			this.labelsForNumber64k[value64k] = labelsArray;
		}
		// Check if label already exists
		if (labelsArray.indexOf(label) < 0)
			labelsArray.push(label);	// Add new label

		// Add label to labelsForLongAddress
		labelsArray = this.labelsForLongAddress.get(value);
		//console.log("labelsArray", labelsArray, "value=", value);
		if (labelsArray === undefined) {
			// create a new array
			labelsArray = new Array<string>();
			this.labelsForLongAddress.set(value, labelsArray);
		}
		// Check if label already exists
		if (labelsArray.indexOf(label) < 0)
			labelsArray.push(label);	// Add new label
	}


	/**
	 * Adds the address to the list file array.
	 * Call this even if size is 0. The addresses are also required for
	 * lines that may contain only a comment, e.g. LOGPOINT, WPMEM, ASSERTION:
	 * @param longAddress The address of the line. Could be undefined.
	 * @param size The size of the line. E.g. for a 2 byte instruction this is 2.
	 * Has to be 1 if address is undefined.
	 */
	protected addAddressLine(longAddress: number, size: number) {
		this.currentFileEntry.longAddr = longAddress;
		this.currentFileEntry.size = size;
	}


	/**
	 * Create complete label from module prefix and relative label
	 * @param modulePrefix The first part of the label, e.g. "math."
	 * @param label The last part of the label, e.g. "udiv_c_d"
	 */
	protected getFullLabel(modulePrefix: string | undefined, label: string) {
		let result = modulePrefix ?? '';
		if (result.length == 0)
			return label;
		result += label;
		return result;
	}


	/**
	 * Called by the parser if a new include file is found.
	 * Is also used to set the main file at the beginning of parsing or before parsing starts.
	 * @param includeFileName The name of the include file.
	 */
	protected includeStart(includeFileName: string) {
		const config = this.config as AsmConfigBase;
		Utility.assert(config.srcDirs);	// Check that config is not a ListConfigBase
		Utility.assert(config.excludeFiles);
		includeFileName = UnifiedPath.getUnifiedPath(includeFileName);
		const index = this.includeFileStack.length - 1;
		let fileName;
		if (index >= 0) {
			// Include the parent file dir in search
			const parentFileName = this.includeFileStack[this.includeFileStack.length - 1].fileName;
			const dirName = UnifiedPath.dirname(parentFileName);
			fileName = Utility.getRelSourceFilePath(includeFileName, [dirName, ...config.srcDirs]);
		}
		else {
			// Main file
			fileName = Utility.getRelSourceFilePath(includeFileName, config.srcDirs);
		}

		this.includeFileStack.push({fileName, lineNr: 0});

		// Now check if we need to exclude it from file/line <-> address relationship.
		if (this.excludedFileStackIndex == -1) {
			// Check if filename is one of the excluded file names.
			for (const exclGlob of config.excludeFiles) {
				const found = minimatch(fileName, exclGlob);
				if (found) {
					this.excludedFileStackIndex = index + 1;
					break;
				}
			}
		}
	}


	/**
	 * Called by the parser if the end of an include file is found.
	 */
	protected includeEnd() {
		if (this.includeFileStack.length == 0)
			throw Error("File parsing error: include file stacking.");
		// Remove last include file
		this.includeFileStack.pop();

		// Check if excluding files ended
		const index = this.includeFileStack.length;
		if (this.excludedFileStackIndex == index) {
			// Stop excluding
			this.excludedFileStackIndex = -1;
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
		this.currentFileEntry.lineNr = lineNr;
	}


	/**
	 * Checks conversion to target memory model.
	 * This implements a conversion from a 64k model with no banking into
	 * one of the defined memory models.
	 * E.g. ZX48, ZX128, ZXNext or Custom.
	 * Overwrite for parsers (assemblers) that support banking.
	 */
	protected checkMappingToTargetMemoryModel() {
		// Check for unknown, also used by the unit tests to just find the labels.
		if (this.memoryModel instanceof MemoryModelUnknown) {
			// Just pass through
			this.funcConvertBank = (address: number, bank: number) => {
				return bank;
			};
			return;
		}

		// Check for AllRam
		if (this.memoryModel instanceof MemoryModelAllRam) {
			// Just 1 bank
			this.funcConvertBank = (address: number, bank: number) => {
				return 0;
			};
			return;
		}

		// Check for ZX48K
		if (this.memoryModel instanceof MemoryModelZx48k) {
			this.funcConvertBank = (address: number, bank: number) => {
				if (address < 0x4000)
					return 0; // ROM
				return 1;	// RAM
			};
			return;
		}

		// Check for ZX128K
		if (this.memoryModel instanceof MemoryModelZx128k) {
			const permut128k = [9, 5, 2, 0];
			this.funcConvertBank = (address: number, bank: number) => {
				const index = address >>> 14;
				return permut128k[index];	// No conversion
			};
			return;
		}

		// Check for ZXNext
		if (this.memoryModel instanceof MemoryModelZxNextOneROM || this.memoryModel instanceof MemoryModelZxNextTwoRom) {
			const permutNext = [0xFE, 0xFF, 10, 11, 4, 5, 0, 1];
			this.funcConvertBank = (address: number, bank: number) => {
				const index = address >>> 13;
				return permutNext[index];	// No conversion
			};
			return;
		}

		//Unsupported target memory model
		throw Error("Unsupported target memory model: " + this.memoryModel.name + ".");
	}


	/**
	 * Creates a long address from the address and the bank info.
	 * It calls 'funcConvertBank' to convert the bank into the target memory model bank.
	 * This is setup at the beginning in 'checkMappingToTargetMemoryModel'.
	 * @param addr64k The 64k address.
	 * @param bank The bank the address is associated with.
	 * @returns addr64k+((bank+1)<<16)
	 */
	protected createLongAddress(addr64k: number, bank: number) {
		Utility.assert(bank >= 0);
		// Check banks
		const convBank = this.funcConvertBank(addr64k, bank);
		// Create long address
		const  result = addr64k + ((convBank + 1) << 16);
		return result;
	}


	/**
	 * Sends a warning to the Labels class to print out a PROBLEM.
	 * @param message The text to print.
	 */
	protected sendWarning(message: string, severity: "error" | "warning" = "warning", filepath?: string, lineNr?: number) {
		if (filepath == undefined)
			filepath = this.config.path;
		if (lineNr == undefined)
			lineNr = this.currentLineNr;
		const issue: Issue = {
			parser: this.parserName,
			severity,
			filepath,
			lineNr,
			message
		};
		this.issueHandler(issue);
	}


	/**
	 * Sends a warning to the Labels class to print out a PROBLEM.
	 * Throws an exception.
	 * @param message The text to print.
	 */
	protected throwError(message: string) {
		this.sendWarning(message, "error");
		// And throw an exception to stop
		//throw Error("Label parser error.");
		throw Error(message);
	}


	/** Returns any given skips for an address.
	 * Used to skip over bytes after a RST.
	 * Used only ba ReverseEngineeringLabelParser.
	 * @param longAddr The long address to get the skip for.
	 * @returns The skip. Normally undefined for no skip.
	 * If skip is given usually this is 1 or 2.
	 */
	public getSkipForAddress(longAddr: number): number | undefined {
		return undefined;
	}
}

