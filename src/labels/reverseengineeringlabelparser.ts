import {Utility} from '../misc/utility';
import {MemoryModel} from '../remotes/MemoryModel/memorymodel';
import {MemoryModelAllRam, MemoryModelUnknown, MemoryModelZx48k} from '../remotes/MemoryModel/predefinedmemorymodels';
import {Z80RegistersClass} from '../remotes/z80registers';
import {ListConfigBase} from '../settings/settings';
import {Issue, LabelParserBase} from './labelparserbase';
import {ListFileLine, SourceFileEntry} from './labels';


/**
 * This class parses Reverse Engineered list file.
 *
 * The format is simple as it is mainly constructed from a disassembly it
 * does nto need to contain complicated functionality.
 * In particular it does not include
 * - macros
 * - include files
 *
 * It does support
 * - banking
 * - local labels
 * - EQU
 *
 * If an address is inside a banked area it is shown as
 * C000.0 or C000.1.
 * Unbanked addresses are simply e.g. 8000.
 *
 * Comments start with ; or //
 * Each line is either empty, contains a comment only or has to start with an address.
 * During parsing anything that does not start with an address is simply ignored.
 * After the address the decoded bytes follow, all separated by a space.
 * The last byte is followed by at least 2 spaces to distinguish it safely from the following
 * decoded instruction.
 *
 * Then the decoded instruction (if any) follows.
 * An instruction
 *
 * Afterwards a comment may follow.
 *
 * Comments are parsed for WPMEM, LOGPOINTs and ASSERTIONs by the parent class.
 *
 * Multiline comments with /* ...  are allowed. Anything inside a multiline comment is not parsed.
 *
 * E.g.:
 * C000.2 3E 05  LD A,5 ; load A with 5
 * MY_CONSTANT:  EQU   50
 */
export class ReverseEngineeringLabelParser extends LabelParserBase {
	// Overwrite parser name (for errors).
	protected parserName = "revEng";

	// The separator used to separate address and bank info.
	public static bankSeparator = '.';	// Note: need to be changed in regexAddr as well

	// Regex to parse the address
	protected regexEqu = /^\s*([a-z_][\w\.]*):\s*EQU\s+([^;]+)/i;

	// Regex to parse the address
	protected regexAddr = /^(([\da-f]+)(\.(\w+))?\s*)/i;

	// Regex to parse the bytes after the address
	protected regexByte = /^([\da-f][\da-f]\s)/i;

	// Regex to parse the label or the special commands (SKIP, SKIPWORD)
	protected regexLabel = /^\s*(\.?[a-z_][\w\.]*):/i;

	// Regex to parse for special commands like SKIP, SKIPWORD or CODE.
	protected regexSpecialCommand = /^\s*([a-z]+)/i;

	// Regex to parse for multiline comments "/* ... */"
	protected regexMultiline = /\/\*.*?\*\//g;
	protected multilineStart = '/*';
	protected multilineEnd = '*/';

	// A map with addresses for skips. I.e. addresses that the PC should simply skip.
	// E.g. for special RST commands followed by bytes.
	// Used only by the ReverseEngineeringLabelParser.
	protected addressSkips: Map<number, number>;

	// Array with (long) addresses for CODE. I.e. addresses that additionally should be disassembled.
	protected codeAddresses: Array<number>;

	// Is internally set if a multiline comment ("/*") starts
	protected multilineComment: boolean;


	/**
	 * Constructor.
	 * @param addressSkips Add addressSkips for SKIP and SKIPWORD.
	 * @param codeAddresses Array with (long) addresses for CODE.
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
		addressSkips: Map<number, number>,
		codeAddresses: Array<number>,
		issueHandler: (issue: Issue) => void
	) {
		super(memoryModel, fileLineNrs, lineArrays, labelsForNumber64k, labelsForLongAddress, numberForLabel, labelLocations, watchPointLines, assertionLines, logPointLines, issueHandler);
		this.addressSkips = addressSkips;
		this.codeAddresses = codeAddresses;
	}


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 */
	public loadAsmListFile(config: ListConfigBase) {
		try {
			this.config = config;
			// Init (in case of several list files)
			this.excludedFileStackIndex = -1;
			this.includeFileStack = new Array<{fileName: string, lineNr: number}>();
			this.listFile = new Array<ListFileLine>();
			this.modulePrefixStack = new Array<string>();
			this.modulePrefix = undefined as any;
			this.lastLabel = undefined as any;

			// Check conversion to target memory model.
			this.checkMappingToTargetMemoryModel();

			// Phase 1: Parse for labels and addresses
			this.parseAllLabelsAndAddresses();

			// Listfile-Mode (no other mode possible)
			this.listFileModeFinish();
		}
		catch (e) {
			this.throwError(e.message);
		}
	}


	/**
	 * Parses one line for label and address.
	 * Finds labels at start of the line and labels as EQUs.
	 * Also finds the address of the line.
	 * The function calls addLabelForNumber to add a label or equ and
	 * addAddressLine to add the line and it's address.
	 * @param line The current analyzed line of the list file.
	 */
	protected parseLabelAndAddress(line: string) {
		let workLine = line + ' ';	// For easier regex
		//console.log(workLine);

		// Check if in multiline comment mode
		if (this.multilineComment) {
			// Only check for end of comments "*/"
			const k = workLine.indexOf(this.multilineEnd);
			if (k < 0) {
				// Multiline continues
				return;
			}
			// Multiline ended, process the remaining characters
			this.multilineComment = false;
			workLine = workLine.substring(k + this.multilineEnd.length);
		}

		// Remove any multiline comment signs within one line
		workLine = workLine.replace(this.regexMultiline, '');

		// Check for start of multiline
		if (!this.multilineComment) {
			const k = workLine.indexOf(this.multilineStart);
			if (k >= 0) {
				// Multiline started, but process the previous characters
				this.multilineComment = true;
				workLine = workLine.substring(0, k);
			}
		}

		// Check first for EQU format:
		// E.g. "MY_CONSTANT:  EQU 50"
		const matchEqu = this.regexEqu.exec(workLine);
		if (matchEqu) {
			// EQU: add to label array
			const label = matchEqu[1];
			const valueString = matchEqu[2];
			// Only try a simple number conversion, e.g. no label arithmetic (only already known labels)
			try {
				// Evaluate
				let value = Utility.evalExpression(valueString, false);
				// Restrict label to 64k (Note: >64k is interpreted as long address)
				value &= 0xFFFF;
				// Add EQU
				this.addLabelForNumber(value, label);
			}
			catch {
				// Show a warning but go on
				this.sendWarning("Could not evaluate expression '" + valueString + "' in line: '" + line + "'");
			}
			return;
		}


		// Get address
		const matchAddr = this.regexAddr.exec(workLine);
		if (!matchAddr) {
			// Skip if no address found
			// Check that max. contains a comment otherwise show a warning
			const trimmed = workLine.trim();
			if (trimmed && !(trimmed.startsWith(';') || trimmed.startsWith('//'))) {
				// Line contains something and it is not a comment:
				// Add a warning
				this.sendWarning("Line ignored: '" + line + "'");
			}
			return;
		}
		const addr64kStr = matchAddr[2];
		const addr64k = parseInt(addr64kStr, 16);
		let bank = -1;	// 0 = no bank
		const bankStr = matchAddr[4];
		bank = this.memoryModel.parseBank(addr64k, bankStr);
		workLine = workLine.substring(matchAddr[1].length);

		// Create long address
		const longAddress = Z80RegistersClass.getLongAddressWithBank(addr64k, bank);

		// Bytes
		// E.g. "05 FC ..."
		let countBytes = 0;
		while (true) {
			const matchByte = this.regexByte.exec(workLine);
			if (!matchByte)
				break;
			// Next
			workLine = workLine.substring(matchByte[1].length);
			countBytes++;
		}

		// Check if there is a label (with colon), also .local label
		const matchLabel = this.regexLabel.exec(workLine);
		if (matchLabel) {
			// Label found
			let label = matchLabel[1];
			// Check for local label
			if (label.startsWith('.'))
				this.addLocalLabelForNumber(longAddress, label);
			else
				this.addLabelForNumber(longAddress, label);
			// Subtract label from string
			workLine = workLine.substring(matchLabel[0].length);
		}

		// Check for special commands
		const matchCmd = this.regexSpecialCommand.exec(workLine);
		if (matchCmd) {
			// Label found
			const specialCmd = matchCmd[1].toLowerCase();
			switch (specialCmd) {
				case 'skip':		// Skip 1 byte
					this.addressSkips.set(longAddress, 1);
					break;
				case 'skipword':	// Skip 2 bytes
					this.addressSkips.set(longAddress, 2);
					break;
				case 'code':	// CODE area starts (e.g. interrupt)
					this.codeAddresses.push(longAddress);
					break;
				default:
					// No special command but e.g. a normal instruction.
					// If there haven't been any bytes
					if (countBytes == 0) {
						// This is to work with (faulty) list files like the rom48.list.
						// Otherwise all of the lines would still be disassembled because
						// they wouldn't have any associated code.
						// Assume at least one byte
						countBytes = 1;
					}
					break;
			}
		}

		// Store address (or several addresses for one line).
		// This needs to be called even if address is undefined.
		this.addAddressLine(longAddress, countBytes);
	}


	/** Only difference to addLabelForNumber is that 'lastLabel' is not set.
	 * @param value The value for which a new label is to be set. If a value > 64k it needs
	 * to be a long address.
	 * @param label The label to add.
	 */
	protected addLocalLabelForNumber(value: number, label: string,) {
		// Remember last label (for local labels)
		this.currentFileEntry.lastLabel = this.lastLabel;	// The last non-local label
		this.currentFileEntry.modulePrefix = undefined;
		this.addLabelForNumberRaw(value, this.lastLabel + label);
	}


	/** Overwritten to check for same labels.
	 * @param value The value for which a new label is to be set. If a value > 64k it needs
	 * to be a long address.
	 * I.e. EQU values > 64k are not allowed here.
	 * @param label The label to add.
	 * @param labelType I.e. NORMAL, LOCAL or GLOBAL.
	 */
	protected addLabelForNumberRaw(value: number, label: string) {
		// Check if label already exists
		if (this.numberForLabel.get(label) != undefined) {
			// Yes, warn
			this.sendWarning("Label '" + label + "' already defined. Definition skipped.");
			return;
		}

		// Otherwise the same
		super.addLabelForNumberRaw(value, label);
	}




	/**
	 * Checks conversion to target memory model.
	 * This implements a conversion from a rev-eng memory model with banking into
	 * one of the defined memory models.
	 * E.g. ZX48, ZX128, ZXNext or Custom.
	 * The rev-eng does not assume any particular memory model.
	 * In fact it assumes that the right target memory model is chosen.
	 * Nevertheless it can happen that certain banks are not available in the target
	 * which produces an error.
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

		// All others, e.g. ZX128K, ZXNext, Custom
		this.funcConvertBank = (address: number, bank: number) => {
			// Check bank
			if (this.memoryModel.banks[bank] == undefined)
				this.throwError("Bank " + bank + " not available in '" + this.memoryModel.name + "'.");
			return bank;	// No conversion
		};
	}
}
