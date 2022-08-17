import {readFileSync} from 'fs';
import {Utility} from '../misc/utility';
import {MemoryModelAllRam, MemoryModelUnknown, MemoryModelZx128k, MemoryModelZx48k, MemoryModelZxNext} from '../remotes/MemoryModel/predefinedmemorymodels';
import {AsmConfigBase, SjasmplusConfig} from '../settings/settings';
import {LabelParserBase} from './labelparserbase';
import {SourceFileEntry} from './labels';


/**
 * The different memory models used by sjasmplus.
 * Exported for unit tests.
 */
export enum SjasmplusMemoryModel {
	NONE = 0, // Nothing found in sld file (e.g. also ZX48K). Could also be NONE selected in sjasmplus file.
	NOSLOT64K,
	//ZX16K,	// not used, no sld file is generated in this mode
	ZX48K,
	ZX128K,
	ZXNEXT,
	// All others are not used at the moment.
}


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
	// Overwrite parser name (for errors).
	protected parserName = "sjasmplus";

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


	/// The used bank size found in the sld file.
	/// Used to determine the memory model used by sjasmplus. See checkMappingToTargetMemoryModel.
	/// Typical value: 8192 or 16384.
	protected bankSize: number = 0;

	// The number from the pages.count from the sld file.
	//  Also used in checkMappingToTargetMemoryModel.
	protected bankCount: number = 0;

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
	 * @param config The assembler configuration.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		this.config = config;
		const sldConfig = this.config as SjasmplusConfig;

		// Check that excludeFiles and srcDirs is not used.
		if (sldConfig.excludeFiles.length > 0)
			this.throwError("You cannot use 'excludeFiles' in a sjasmplus configuration.");

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

		// Loop through all lines of the sld file
		for (const line of sldLines) {
			this.parseFileLabelAddress(line);
		}

		// Now put all estimated file/line addresses into the main file
		for (let [address, entry] of this.estimatedFileLineNrs) {
			if (!this.fileLineNrs.get(address)) {
				// Only if address not yet exists
				this.setFileLineNrForAddress(address, entry);
			}
		}
	}

	/**
	 * Checks the SLD file version and throws an exception if too old.
	 */
	protected checkSldVersion(lines: Array<string>) {
		// Check only first line
		if (lines.length < 1)
			this.throwError("'" + this.config.path + "' is empty.");	// throws
		// First line
		const fields = lines[0].split('|');
		if (fields[1] != 'SLD.data.version')
			this.throwError("'" + this.config.path + "': SLD data version not found.");
		const version = fields[2] || '0';
		const requiredVersion = 1;
		if (parseInt(version) < requiredVersion)
			this.throwError("'" + this.config.path + "': SLD data version " + version + " is too old. Need SLD version " + requiredVersion + ". Please update sjasmplus to at least version 1.18.0.");
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
					this.throwError("No 'pages.size' found in sld file.");
				bankSize = parseInt(matchBankSize![1]);
				// Find bank count
				const matchBankCount = /pages\.count:(\d+)/i.exec(data);
				if (!matchBankCount)
					this.throwError("No 'pages.count' found in sld file.");
				this.bankCount = parseInt(matchBankCount![1]);
				// Find slots
				const matchSlots = /slots\.adr:([\d,]+)/i.exec(data);
				if (!matchSlots)
					this.throwError("No 'slots.adr' found in sld file.");
				const slotsString = matchSlots![1];
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
			this.throwError("Could not find bank size in SLD file. Did you forget to set the 'DEVICE' in your assembler file? If you use a non ZX Spectrum device you need to choose NOSLOT64K.");
		}
		this.bankSize = bankSize;
		if (slots == undefined) {
			this.throwError("Could not find slots in SLD file. Did you forget to set the 'DEVICE' in your assembler file? If you use a non ZX Spectrum device you need to choose NOSLOT64K.");
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
			this.sendWarning("The assembler file is missing the 'SLDOPT COMMENT " + missingStr + "' statement. Use of " + missingStr + " is not possible.");
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
		const config = this.config as AsmConfigBase;
		Utility.assert(config.srcDirs);
		sourceFile = Utility.getRelSourceFilePath(sourceFile, config.srcDirs);

		// Definition file/line not required

		// Get bank (-1 if not a memory address)
		const bank = parseInt(fields[4]);
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
				// 0: module name
				// 1: main label
				// 2: local label
				// 3: optional usage traits, i.e. +equ, +macro, +reloc, +reloc_high, +used, +module, +endmod, +struct_def, +struct_data
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
						let value64kOrLong = value;
						if (bank >= 0)
							value64kOrLong = this.createLongAddress(value, bank);
						this.addLabelForNumberRaw(value64kOrLong, fullLabel);

						// Add (full) label to labelLocations for unit tests
						const lineNr = parseInt(fields[1]) - 1;	// Get line number
						this.labelLocations.set(fullLabel, {file: sourceFile, lineNr, address: value64kOrLong});
					}
				}
				break;
			case 'T':	// Instruction trace data
				{
					// Change value to contain page info
					const longAddress = this.createLongAddress(value, bank);

					// Get line number
					const lineNr = parseInt(fields[1]) - 1;

					// Store values to associate address with line number and (last) label.
					this.setFileLineNrForAddress(longAddress, {
						fileName: sourceFile,
						lineNr: lineNr,
						modulePrefix: this.modulePrefix,
						lastLabel: this.lastLabel,
						size: 1	// size is used in the disassembly at the moment for reverse engineering only and it is only important if 0 or not 0. We don't know the instruction size in sld, so we assume 1 here.
					});
					// Also assume for max. instruction size and associate the following
					// 3 bytes as well (but only to "estimated")
					const adr64k = (value & 0xFFFF);
					const slotAssociation = this.memoryModel.slotAddress64kAssociation;
					const slot = slotAssociation[adr64k];
					for (let i = 1; i < 4; i++) {
						const slotPlus = slotAssociation[(adr64k + i) & 0xFFFF];
						if (slotPlus != slot)
							break;	// Reached the slot border
						// Add
						const longAddressPlus = longAddress + i;
						this.estimatedFileLineNrs.set(longAddressPlus, {
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
						lineArray[lineNr] = longAddress;
					}
				}
				break;
			case 'K':	// A comment, e.g. WPMEM, ASSERTION and LOGPOINT
				{
					// Check for WPMEM etc.
					const comment = fields[7];
					const address = this.createLongAddress(value, bank);
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
	 * Get sjasmplus memory model.
	 */
	protected sourceMemoryModel(): SjasmplusMemoryModel {
		if (this.slots.length == 1 && this.bankSize == 0x10000 && this.bankCount == 32)
			return SjasmplusMemoryModel.NOSLOT64K;
		if (this.slots.length == 4 && this.bankSize == 0x4000 && this.bankCount == 4)
			return SjasmplusMemoryModel.ZX48K;
		if (this.slots.length == 4 && this.bankSize == 0x4000 && this.bankCount == 8)
			return SjasmplusMemoryModel.ZX128K;
		if (this.slots.length == 8 && this.bankSize == 0x2000 && this.bankCount >= 100)
			return SjasmplusMemoryModel.ZXNEXT;
		return SjasmplusMemoryModel.NONE;
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
		// Get type
		const srcMemModel = this.sourceMemoryModel();
		if (srcMemModel == SjasmplusMemoryModel.NONE)
			this.throwError("Unsupported sjasmplus memory model (DEVICE).");

		// Check for unknown, also used by the unit tests to just find the labels.
		const destMemModel = this.memoryModel;
		if (destMemModel instanceof MemoryModelUnknown) {
			// Just pass through
			this.funcConvertBank = (address: number, bank: number) => {
				return bank;
			};
			return;
		}

		// Check for AllRam
		if (destMemModel instanceof MemoryModelAllRam) {
			// Just 1 bank
			this.funcConvertBank = (address: number, bank: number) => {
				return 0;
			};
			return;
		}

		// Check for unbanked modes: sjasmplus NOSLOT64K and ZX48K
		if (srcMemModel == SjasmplusMemoryModel.NOSLOT64K
			|| srcMemModel == SjasmplusMemoryModel.ZX48K) {
			if (destMemModel instanceof MemoryModelZx128k) {
				const permut128k = [9, 5, 2, 0];
				this.funcConvertBank = (address: number, bank: number) => {
					const slot = address >>> 14;
					return permut128k[slot];
				};
				return;
			}
			if (destMemModel instanceof MemoryModelZxNext) {
				const permutNext = [0xFE, 0xFF, 10, 11, 4, 5, 0, 1];
				this.funcConvertBank = (address: number, bank: number) => {
					const index = (address >>> 13);
					return permutNext[index];	// No conversion
				};
				return;
			}
		}

		// Check for ZX48K
		if (destMemModel instanceof MemoryModelZx48k) {
			this.funcConvertBank = (address: number, bank: number) => {
				if (address < 0x4000)
					return 0; // ROM
				return 1;	// RAM
			};
			return;
		}

		// Check for sjasmplus ZX48K
		if (srcMemModel == SjasmplusMemoryModel.ZX48K) {
			// sjasmplus was compiled for ZX48K
			if (destMemModel instanceof MemoryModelZxNext) {
				const permutNext = [0xFE, 0xFF, 10, 11, 4, 5, 0, 1];
				this.funcConvertBank = (address: number, bank: number) => {
					let index = 2 * bank;
					index += (address >>> 13) & 0x01;
					return permutNext[index];	// No conversion
				};
				return;
			}
			if (destMemModel instanceof MemoryModelZx128k) {
				const permut128k = [9, 5, 2, 0];
				this.funcConvertBank = (address: number, bank: number) => {
					return permut128k[bank];	// No conversion
				};
				return;
			}
		}

		// Check for sjasmplus ZX128K
		else if (srcMemModel == SjasmplusMemoryModel.ZX128K) {
			// sjasmplus was compiled for ZX128K
			if (destMemModel instanceof MemoryModelZxNext) {
				this.funcConvertBank = (address: number, bank: number) => {
					if (bank > 7)
						this.throwError("Bank " + bank + " of ZXNext memory model cannot be converted to target ZX128K memory model.");
					let convBank = 2 * bank;
					convBank += (address >>> 13) & 0x01;
					return convBank;
				};
				return;
			}
			if (destMemModel instanceof MemoryModelZx128k) {
				this.funcConvertBank = (address: number, bank: number) => {
					return bank;	// No conversion
				};
				return;
			}
		}

		// Check for sjasmplus ZXNEXT
		else if (srcMemModel == SjasmplusMemoryModel.ZXNEXT) {
			// sjasmplus was compiled for ZXNEXT
			if (destMemModel instanceof MemoryModelZxNext) {
				this.funcConvertBank = (address: number, bank: number) => {
					return bank;	// No conversion
				};
				return;
			}
			if (destMemModel instanceof MemoryModelZx128k) {
				this.funcConvertBank = (address: number, bank: number) => {
					let error = (bank > 15);
					const convBank = bank >>> 1;
					if ((bank & 0x01) != ((address >>> 13) & 0x01))
						error = true;
					if(error)
						this.throwError("Bank " + bank + " of ZXNext memory model cannot be converted to target ZX128K memory model.");
					return convBank;
				};
				return;
			}
		}

		// Not a known memory model conversion
		this.sendWarning("Unsupported memory model mapping, sjasmplus '" + SjasmplusMemoryModel[srcMemModel] + "' to target '" + destMemModel.name + "'. slots/banks might not be associated correctly.");
		// Simply map all addresses (regardless of the bank) of the assembler onto the
		// initial banks of the memory model.
		this.funcConvertBank = (address: number /*, bank: number*/) => {
			// Get slot
			const slot = destMemModel.slotAddress64kAssociation[address];
			const bank = destMemModel.initialSlots[slot];
			return bank;
		};
	}
}
