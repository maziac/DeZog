import {readFileSync} from 'fs';
import {Utility} from '../misc/utility';
import {MemoryModelUnknown, MemoryModelZx128k, MemoryModelZx48k, MemoryModelZxNext} from '../remotes/MemoryModel/predefinedmemorymodels';
import {AsmConfigBase, SjasmplusConfig} from '../settings';
import {LabelParserBase} from './labelparserbase';
import {SourceFileEntry} from './labels';


/**
 * This class parses sjasmplus sld file.
 * SLD stands for Source Level Debugging.
 * 'SLD data are extra "tracing" data produced during assembling for debuggers and IDEs,
 * similar to "map" files already supported by sjasmplus (LABELSLIST and CSPECTMAP).
 * The debugger can read these data, and with non-tricky source producing machine code
 * with correct device memory mapping, the debugger can trace the origins of every
 * instruction back to the original source code line, and display the source instead/along
 * the disassembly view (the "map" files mentioned above provide only list of labels which
 * is usually already super helpful, but can't track the source origins of each instruction).'
 * See https://z00m128.github.io/sjasmplus/documentation.html#idp10
 *
 * A few notes:
 * - numberForLabel and labelsForNumber will normally only get 64k
 *   addresses/values (unless an EQU is by itself bigger than 0xFFFF.
 * - fileLineNrs and lineArrays will get potentially long address.
 *   I.e. their value is either a normal 64k address or a long address
 *   with bank number.
 *
 */
export class SjasmplusSldLabelParser extends LabelParserBase {

	// <source file>|<src line>|<definition file>|<def line>|<page>|<value>|<type>|<data>
	// Format example:
	// |SLD.data.version|0
	// main.asm|5||0|-1|1|D|NEX
	// main.asm|10||0|-1|-1|Z|pages.size: 8192, pages.count: 224, slots.count: 8, slots.adr: 0, 8192, 16384, 24576, 32768, 40960, 49152, 57344
	// main.asm|15||0|11|24576|F|screen_top
	// utilities.asm|7||0|-1|500|D|PAUSE_TIME
	// src/breakpoints.asm|222||0|92|57577|F|enter_debugger.int_found
	// src/breakpoints.asm|222||0|92|57577|L|,enter_debugger,int_found,+used
	// src/breakpoints.asm|224||0|92|57577|T|
	// src/breakpoints.asm|225||0|92|57580|K|; LOGPOINT [INT] Saving interrupt state: ${A:hex}h
	// Note: F/D are not used (deprecated), instead L is used


	/// The used bank size. Only set if the assembler+parser supports
	/// long addresses. Then it holds the used bank size (otherwise 0).
	/// Is used to tell if the Labels are long or not and for internal
	/// conversion if target has a different memory model.
	/// Typical value: 0, 8192 or 16384.
	public bankSize: number = 0;


	/// Regex to skip a commented SLDOPT, i.e. "; SLDOPT"
	protected regexSkipSldOptComment = /^;\s*sldopt/i;

	/// Map that associates memory addresses (PC values) with line numbers
	/// and files.
	/// This contains estimated address to file/line associations.
	/// I.e. they only indirectly derive from the SLD file.
	/// All addresses belonging to an instruction (except the start address)
	/// are put in here.
	/// This is simply done by assuming each instruction is 4 byte.
	/// I.e. the remaining 3 byte are put in here.
	/// In post processing all addresses that are not present in the fileLineNrs
	/// map are also set in the fileLineNrs map.
	/// The problem that is solved is SMC (self modifying code). DeZog would switch to
	/// the disassembly file otherwise.
	/// Long addresses.
	protected estimatedFileLineNrs = new Map<number, SourceFileEntry>();

	/// Function to convert bank into different memory model bank.
	/// At start the target memory model is compared to the sld memory model.
	/// Some memory models can be converted into each other.
	/// E.g. ZX128K into ZXNext.
	// This is done here.
	protected funcConvertBank: (address: number, bank: number) => number;

	/// The slots used in the sld file.
	/// Set during parsing.
	protected slots: number[];


	/*
	// Constructor.
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
		logPointLines: Array<{address: number, line: string}>
	) {
		super(memoryModel, fileLineNrs, lineArrays, labelsForNumber64k, labelsForLongAddress, numberForLabel, labelLocations, watchPointLines, assertionLines, logPointLines);

		// Map memory models

	}
	*/


	/**
	 * Reads the given sld file.
	 * As the SLD file is easy to read only one pass is required.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		this.config = config;
		const sldConfig = this.config as SjasmplusConfig;

		// Check that excludeFiles and srcDirs is not used.
		if (sldConfig.excludeFiles.length > 0)
			throw Error("You cannot use 'excludeFiles' in a sjasmplus configuration.");

		// Init (in case of several sld files)
		this.lastLabel = undefined as any;

		// Strip away windows line ending
		const sldLinesFull = readFileSync(sldConfig.path).toString().split('\n');
		const sldLines = sldLinesFull.map(line => line.trimEnd());
		this.checkSldVersion(sldLines);

		// Get bank size and slots
		this.parseForBankSizeAndSldOpt(sldLines);
		// Check conversion to target memory model
		this.checkMappingToTargetMemoryModel();

		// Check for setting to ignore the banking
		if ((config as SjasmplusConfig).disableBanking)
			this.bankSize = 0;	// Ignore banking

		// Loop through all lines of the sld file
		for (const line of sldLines) {
			this.parseFileLabelAddress(line);
		}

		// Now put all estimated file/line addresses into the main file
		for (let [address, entry] of this.estimatedFileLineNrs) {
			if (!this.fileLineNrs.get(address)) {
				// Only if address not yet exists
				this.fileLineNrs.set(address, entry);
			}
		}
	}

	/**
	 * Checks the SLD file version and throws an exception if too old.
	 */
	protected checkSldVersion(lines: Array<string>) {
		// Check only first line
		if (lines.length < 1)
			throw Error("'" + this.config.path + "' is empty.");
		// First line
		const fields = lines[0].split('|');
		if (fields[1] != 'SLD.data.version')
			throw Error("'" + this.config.path + "': SLD data version not found.");
		const version = fields[2] || '0';
		const requiredVersion = 1;
		if (parseInt(version) < requiredVersion)
			throw Error("'" + this.config.path + "': SLD data version " + version + " is too old. Need SLD version " + requiredVersion + ". Please update sjasmplus to at least version 1.18.0.");
	}


	/**
	 * Parses the complete file to get the bank size.
	 */
	protected parseForBankSizeAndSldOpt(lines: Array<string>) {
		let keywords: string[] = [];
		let bankSize;
		let slots;
		for (const line of lines) {
			// Split the fields, e.g. "main.asm|3||0|-1|-1|Z|pages.size: 16384, pages.count: 8, slots.count: 4, slots.adr: 0, 16384, 32768, 49152"
			const fields = line.split('|');

			// Check for right type
			const type = fields[6];
			if (type == 'Z') {
				// Parse bank size
				const data = fields[7];
				// Find bank size
				const matchBankSize = /pages\.size:(\d+)/i.exec(data);
				if (!matchBankSize)
					throw Error("No 'pages.size' found in sld file.");
				bankSize = parseInt(matchBankSize[1]);
				// Find slots
				const matchSlots = /slots\.adr:([\d,]+)/i.exec(data);
				if (!matchSlots)
					throw Error("No 'slots.adr' found in sld file.");
				const slotsString = matchSlots[1];
				slots = slotsString.split(',').map(addrString => parseInt(addrString));
			}

			// Check for SLD OPT
			if (line.startsWith('||K|KEYWORDS|')) {
				// The SLD OPT options, e.g.
				// "||K|KEYWORDS|WPMEM,LOGPOINT,ASSERTION"
				keywords = fields[4].split(','); // "WPMEM,LOGPOINT,ASSERTION"
			}
			if (bankSize != undefined && keywords != undefined)
				break;
		}

		// Check
		if (bankSize == undefined) {
			throw Error("Could not find bank size in SLD file. Did you forget to set the 'DEVICE' in your assembler file? If you use a non ZX Spectrum device you need to choose NOSLOT64K.");
		}
		this.bankSize = bankSize;
		if (slots == undefined) {
			throw Error("Could not find slots in SLD file. Did you forget to set the 'DEVICE' in your assembler file? If you use a non ZX Spectrum device you need to choose NOSLOT64K.");
		}
		this.slots = slots;

		// Check for keywords
		const kws = ["WPMEM", "LOGPOINT", "ASSERTION"];
		let missing: string[] = [];
		for (const kw of kws) {
			if (keywords.indexOf(kw) < 0)
				missing.push(kw);
		}
		if (missing.length > 0) {
			const missingStr = missing.join(', ');
			this.warnings += "The assembler file is missing the 'SLDOPT COMMENT " + missingStr + "' statement. Use of " + missingStr + " is not possible.";
		}
	}


	/**
	 * Parses one line for label, address, file and line number.
	 * Parses one line of the SLD file.
	 * @param line The current analyzed line of the SLD file.
	 */
	protected parseFileLabelAddress(line: string) {
		// Split the fields, e.g. "main.asm|15||0|11|24576|F|screen_top"
		const fields = line.split('|');

		// Get filename
		let sourceFile = fields[0];
		// Check for comment or SLD.data.version
		if (sourceFile == '')
			return;
		// Convert (also use srcDirs)
		sourceFile = Utility.getRelSourceFilePath(sourceFile, this.config.srcDirs);

		// Definition file/line not required

		// Get page (bank) (-1 if not a memory address)
		const page = parseInt(fields[4]);
		// Get value
		let value = parseInt(fields[5]);
		// Note: An EQU could have a value bigger than 0xFFFF

		// Get type
		const type = fields[6];

		// Get label
		const label = fields[7];

		// Check data type
		switch (type) {
			case 'L': // Address labels or EQU
				// A label looks like this: "module@1.main.2.local.2,module@1,main.2,local.2"
				// First: Full label name.
				// 2nd: Module.
				// 3rd: The label without the local label(if any)
				// 4th: The local label (if there is).
				{
					// Split
					const lbls = label.split(',');
					const trait = lbls[3];	// E.g. "+equ", "+module", "+endmod"
					this.modulePrefix = lbls[0];
					// Check for ENDMODULE
					if (trait == "+endmod") {
						// Remove the last module (note: modules names cannot include a dot)
						const modArr = this.modulePrefix.split('.');
						modArr.pop();	// Remove last element
						this.modulePrefix = modArr.join('.');
					}
					if (this.modulePrefix)
						this.modulePrefix += '.';
					// Label
					const mainLabel = lbls[1];
					if (!mainLabel)
						break;
					this.lastLabel = mainLabel;
					const localLabel = lbls[2];	// without the '.'
					let fullLabel = mainLabel;
					if (this.modulePrefix)
						fullLabel = this.modulePrefix + mainLabel;
					if (localLabel)
						fullLabel += '.' + localLabel;

					// If some label exists
					if (fullLabel) {
						// Label: add to label array
						const longValue = this.createLongAddress(value, page);
						this.addLabelForNumberRaw(longValue, fullLabel);

						// Add (full) label to labelLocations for unit tests
						const lineNr = parseInt(fields[1]) - 1;	// Get line number
						this.labelLocations.set(fullLabel, {file: sourceFile, lineNr, address: longValue});
					}
				}
				break;
			case 'T':	// Instruction trace data
				{
					// Change value to contain page info
					const address = this.createLongAddress(value, page);

					// Get line number
					const lineNr = parseInt(fields[1]) - 1;

					// Store values to associate address with line number and (last) label.
					this.fileLineNrs.set(address, {
						fileName: sourceFile,
						lineNr: lineNr,
						modulePrefix: this.modulePrefix,
						lastLabel: this.lastLabel,
						size: 1	// size is used in the disassembly at the moment for reverse engineering only and it is only important if 0 or not 0. We don't know the instruction size in sld, so we assume 1 here.
					});
					// Also assume for max. instruction size and associate the following
					// 3 bytes as well (but only to "estimated")
					const endAddress = this.addressAdd4(address);
					for (let addrInside = address + 1; addrInside < endAddress; addrInside++) {
						// Note: addrInside is >= address.
						this.estimatedFileLineNrs.set(addrInside, {
							fileName: sourceFile,
							lineNr: lineNr,
							modulePrefix: this.modulePrefix,
							lastLabel: this.lastLabel,
							size: 1
						});
					}


					/*
					// Note: not only the start address is stored but also the size
					// of the instruction is estimated and all of the covered addresses
					// are associated to the file, too.
					if (this.prevLineAddress != undefined) {
						// Check if same bank
						if ((address & ~0xFFFF) == (this.prevLineAddress & ~0xFFFF)) {
							// Check if distance is smaller/equal 4 (=max instruction size)
							const dist = (address - this.prevLineAddress) & 0xFFFF;
							if (dist <= 4) {

							}
						}
					}
					*/

					// Check if a new array need to be created
					let lineArray = this.lineArrays.get(sourceFile);
					if (!lineArray) {
						lineArray = new Array<number>();
						this.lineArrays.set(sourceFile, lineArray);
					}
					// Store long address
					if (lineArray[lineNr] == undefined) {
						// Store only the first. Otherwise a breakpoint on a multi instruction
						// line would be on the last instruction and not the first.
						lineArray[lineNr] = address;
					}
				}
				break;
			case 'K':	// A comment, e.g. WPMEM, ASSERTION and LOGPOINT
				{
					// Check for WPMEM etc.
					const comment = fields[7];
					const address = this.createLongAddress(value, page);
					this.findWpmemAssertionLogpoint(address, comment);
				}
				break;

		}
	}


	/**
	 * Calls super, but only if the line does not start with ";SLDOPT".
	 * I.e. it filters any commented SLDOPT line.
	 */
	protected findWpmemAssertionLogpoint(address: number | undefined, line: string) {
		// Skip line that starts with "; SLDOPT"
		const match = this.regexSkipSldOptComment.exec(line);
		if (match)
			return;
		// Otherwise call super normally
		super.findWpmemAssertionLogpoint(address, line);
	}


	/**
	 * Increments the address.
	 * Can work with long and 64k addresses.
	 * @param address Long address or 64k address.
	 * @returns address + 4 but bound to the bank. long or 64k address.
	 */
	protected addressAdd4(address: number): number {
		// Check for long address
		if (address & ~0xFFFF) {
			// Long address
			const mask = this.bankSize - 1;
			let addrBank = address & mask;
			addrBank += 4;
			if (addrBank > mask)
				addrBank = mask;
			// Reconstruct bank/slot
			addrBank += address & ~mask;
			return addrBank;
		}
		else {
			// 64k address
			let addr2 = address + 4;
			if (addr2 > 0xFFFF)
				addr2 = 0xFFFF;
			return addr2;
		}
	}


	/**
	 * Checks conversion to target memory model.
	 * ZXNEXT: pages.size:8192,pages.count:224,slots.count:8,slots.adr:0,8192,16384,24576,32768,40960,49152,57344
	 * ZX128K: pages.size:16384,pages.count:8,slots.count:4,slots.adr:0,16384,32768,49152
	 * ZX48K:  pages.size:16384,pages.count:4,slots.count:4,slots.adr:0,16384,32768,49152
	 * ZX16K:  -
	 * NOSLOT64K: pages.size:65536,pages.count:32,slots.count:1,slots.adr:0
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

		// Check for sjasmplus ZX48K
		if (this.slots.length == 4 && this.bankSize == 0x4000) {
			// sjasmplus was compiled for ZX48K
			if (this.memoryModel instanceof MemoryModelZxNext) {
				const permutNext = [0xFE, 0xFF, 10, 11, 4, 5, 0, 1];	// TODO: Before loading nex into a ZXNext the memory slots need to be initialized this way.
				this.funcConvertBank = (address: number, bank: number) => {
					let index = 2 * bank;
					index += (address >>> 13) & 0x01;
					return permutNext[index];	// No conversion
				};
				return;
			}
			if (this.memoryModel instanceof MemoryModelZx128k) {
				const permut128k = [9, 5, 2, 0];	// TODO: Before loading sna into a 128K the memory slots need to be initialized this way.
				this.funcConvertBank = (address: number, bank: number) => {
					return permut128k[bank];	// No conversion
				};
				return;
			}
			if (this.memoryModel instanceof MemoryModelZx48k) {
				this.funcConvertBank = (address: number, bank: number) => {
					if (address < 0x4000)
						return 0; // ROM
					return 1;	// RAM
				};
				return;
			}
			throw Error("Could not convert labels to Memory Model: '" + this.memoryModel.name + "' .");
		}


		let targetSlotSize;
		if (this.memoryModel instanceof MemoryModelZxNext) {
			targetSlotSize = 0x2000;
		}
		else if (this.memoryModel instanceof MemoryModelZx128k || this.memoryModel instanceof MemoryModelZx48k) {
			targetSlotSize = 0x4000;
		}
		else {
			throw Error("Could not convert labels to Memory Model: '" + this.memoryModel.name + "'.");
		/*	this.funcConvertBank = (address: number, bank: number) => {
				return bank;
			}; */
		}

		// Convert into Next or 128K.
		// Note: Zx256 and above are not taken into account yet.

		// Check that all slots have right size
		const slotSize = 0x10000 / this.slots.length;
		// Check that slots are equidistant
		let addr = 0;
		for (const slot of this.slots) {
			if (slot != addr)
				throw Error("Slots in sld file are not equidistant, so not compatible with the target '" + this.memoryModel.name + "' memory model.");
			addr += slotSize;
		}
		// Different behavior if slotSize is bigger or lower the targetSlotSize
		if (targetSlotSize == slotSize) {
			// Same model, simply pass through
			this.funcConvertBank = (address: number, bank: number) => {
				return bank;
			};
		}
		else if (targetSlotSize < slotSize) {
			// E.g. ZX128K -> ZXNEXT or same model
			const remainder = slotSize % targetSlotSize;
			if (remainder != 0)
				throw Error("Slots in sld file are not compatible with the target '" + this.memoryModel.name + "' memory model.");
			const bankMultiplier = slotSize / targetSlotSize;

			// Create conversion function
			this.funcConvertBank = (address: number, bank: number) => {
				let convBank = bankMultiplier * bank;
				convBank += (address >>> 13) & 0x01;
				// Note 1: No check for max bank is required since in sld there are
				// much less than in target.
				// Note 2: No check for ROM is required since there is no ROM in sld file.
				return convBank;
			};
		}
		else {
			// E.g. ZXNEXT -> ZX128K
			// Check that all slots have right size
			const remainder = targetSlotSize % slotSize;
			if (remainder != 0)
				throw Error("Slots in sld file are not compatible with the target '" + this.memoryModel.name + "' memory model.");
			const bankDivider = targetSlotSize / slotSize;

			// Create conversion function
			this.funcConvertBank = (address: number, bank: number) => {
				let convBank = (bank & 0xFFFE) / bankDivider;
				if (convBank > 7) {
					// Bank does not exist in ZX128K
					throw Error("Banks cannot be converted to target '" + this.memoryModel.name + "' memory model.");
				}
				// Note 1: No check for max bank is required since in sld there are
				// much less than in target.
				// Note 2: No check for ROM is required since there is no ROM in sld file.
				return convBank;
			};
		}
	}


	/**
	 * Creates a long address from the address and the page info.
	 * If page == -1 address is returned unchanged.
	 * @param address The 64k address, i.e. the upper bits are the slot index.
	 * @param bank The bank the address is associated with.
	 * @returns if bankSize: address+((page+1)<<16)
	 * else: address.
	 */
	protected createLongAddress(address: number, bank: number) {
		if (bank < 0)
			return address;
		// Check banks
		const convBank = this.funcConvertBank(address, bank);
		// Create long address
		let result = address;
	//	if (this.bankSize != 0)
		result += (convBank + 1) << 16;
		return result;
	}

}


