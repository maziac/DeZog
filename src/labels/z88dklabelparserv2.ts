import {LabelParserBase} from './labelparserbase';
import {Utility} from '../misc/utility';
import {Expressions} from '../misc/expressions';
import {WorkspacePaths} from '../misc/workspacepaths';
import {existsSync, readFileSync} from 'fs';
import * as fglob from 'fast-glob';
import {minimatch} from 'minimatch';
import {AsmConfigBase, Z88dkConfig, Z88dkConfigV2} from '../settings/settings';
import {UnifiedPath} from '../misc/unifiedpath';
import {HexFormat} from '../misc/hexformat';
import {MemoryModelZx128k} from '../remotes/MemoryModel/zxspectrummemorymodels';
import {MemoryModelZxNextBase} from '../remotes/MemoryModel/zxnextmemorymodels';
import {C_LINE_PREFIX, Z88dkLineInfo, Z88dkMapSymbol, isDebugSymbol, parseLineLocation, parseMapLine, stripDebugFileName} from './z88dkmapfile';

/** The C source file of a .lis file. */
interface ListCFile {
	/// The module (MODULE directive), e.g. "test_c".
	module: string;
	/// The name as written in the .lis file, e.g. "menu/test.c".
	listName: string;
	/// The resolved file name, e.g. "src/menu/test.c".
	fileName: string;
	/// The address ranges (long addresses, end exclusive) of its code.
	code: Array<{start: number, end: number}>;
}


/**
 * This class parses z88dk asm list files.
 * In DeZog 3.0 this has been changed to the new lis file format.
 * Probably this was out already since 2020.
 * The new format has addresses only for lines with opcodes and makes
 * parsing the include files easier. E.g. > v2.2:
 *
main.asm:
     1
     2
     3                          label_equ1:		equ 100
     4
     5
     6                          ;m1:	MACRO
     7                          ;	ld c,9
     8                          ;.mlocal:
     9                          ;	dec a
    10                          ;	ENDM
    11
    12
    13                          	ORG 0x8000
    14
    15                          label1:
    16  0000  00                	nop
    17
    18  0001  3e05              label2:	ld a,5
    19
    20  0003  0608              _locala:	ld b,8
    21
    22                          _localb:
    23  0005  00                	nop		; ASSERTION
    24
    25                          label3:	;m1
    26                           ;m1
    27                          label4:
    28                           ;	m1
    29
    30                          label4_1:
    31                          	; m1	; LOGPOINT
    32
    33                          	IF 0
    34                          label5:	nop
    35                          	ld a,6
    36                          	ENDIF
    37
    38  0006  00                label6:	nop
    39
    40                          _local: ; local label not existing
    41  0007  00                	nop
    42  0008  3e05              	ld a,5
    43  000a  211600            	ld hl,22
    44
    45
    46
    47                          	;ORG 0x8200
    48                          data:
    49  000d  0102030405060708  	defb 1, 2, 3, 4, 5, 6, 7, 8, $FA		; WPMEM
    		  fa
    50  0016  fe02030405060708  data2:	defb $FE, 2, 3, 4, 5, 6, 7, 8, 9		; WPMEM
    		  09
    51
    52                          	;ORG 0x9000
    53
    54                          	include "filea.asm"
filea.asm:
     1
     2  001f  00                fa_label1:	nop
     3
     4
     5
     6                          fa_label2:
     7  0020  00                	nop
     8
     9  0021  00                fa_label3_mid:	nop
    10
    11                          	include "dir/filea b.asm"
dir/filea b.asm:
     1
     2
     3  0022  00                fab_label1:	nop
     4
     5
     6
     7  0023  00                fab_label2:	nop
     8
     9
    10                          global_label1:	; All labels are global
    11  0024  00                	nop
    12                          global_label2:	; All labels are global
    13  0025  00                	nop
    14
    15
    16                          fab_label3:
    17  0026  00                	nop
    18
    19
    20                          fab_label_equ1:		equ 70
    21
filea.asm:
    12
    13
    14
    15                          fa_label3:
    16  0027  00                	nop
    17
    18
main.asm:
    55
    56
    57
    58
 *
 * The address field of v2.2 is 6 bytes although it is 64k address range only.
 * It is changed afterwards to 4 bytes.
 *
 * The addresses in the .lis file are relative. The map file is used to
 * correct them: the address of the last label (from the map file) is used
 * as base for the following lines.
 * The map file addresses are the final (linked) addresses. Banked
 * addresses carry the bank/page in the bits above 0xFFFF, e.g. $14C000.
 * Addresses of bank/page 0 cannot be distinguished from non-banked
 * addresses, e.g. $C000.
 * The bank numbering depends on the z88dk target ('target' setting):
 * 16k banks for "zx" (bank 3 at 0x03C000) or 8k pages for "zxn" (page 20
 * at 0x14C000). It is converted into the banks of the memory model.
 * For "zxn" the code of an even page may span 16k, i.e. the upper 8k of
 * the 16k block belongs to the next (odd) page, e.g. 0x10E000 is in page 17.
 *
 * Debug information ("-debug"):
 * If the map file contains __C_LINE_ symbols (z88dk option "-debug", see
 * https://www.z88dk.org/forum/viewtopic.php?t=12139) these are used for the
 * C source line <-> address associations instead of the .lis file.
 * They contain the exact (linked and banked) addresses.
 * Everything else (labels, assembler lines, WPMEM, ASSERTION, LOGPOINT)
 * is still taken from the .lis files.
 * Without __C_LINE_ symbols the C lines are taken from the .lis file:
 * from the C_LINE directives if the .lis file contains any, otherwise from
 * the C line comments (requires "--c-code-in-asm").
 */
export class Z88dkLabelParserV2 extends LabelParserBase {
	// Overwrite parser name (for errors).
	protected parserName = "z88dkv2";

	/// Map with the z88dk labels/symbols (from the map file).
	/// The value contains the bank/page in the upper bits.
	protected z88dkMappings = new Map<string, Z88dkMapSymbol>();

	/// The local symbols of the map file, key is "module:name".
	/// Local labels (e.g. "i_2" of sccz80) may exist in several modules.
	protected z88dkLocalMappings = new Map<string, Z88dkMapSymbol>();

	/// The module of the current .lis file (MODULE directive).
	protected currentModule = '';

	/// The C source files of all .lis files of the current configuration:
	/// the module, the name as written in the .lis file (e.g. "menu/test.c")
	/// and the resolved file name (e.g. "src/menu/test.c").
	/// Used for the C lines of the map file, whose file names have no
	/// directory with the current z88dk ("test.c"). Collected over all .lis
	/// files because the map file contains the C lines of all modules.
	protected listCFiles: ListCFile[] = [];

	/// The C file of the .lis file being parsed.
	protected currentListCFile: ListCFile | undefined;

	/// True if the C lines of the map file still need to be associated
	/// (done once, after all .lis files, see finishListFiles).
	protected cLineDebugInfoPending = false;

	/// The ambiguous C file names already warned about (once each).
	protected warnedAmbiguousFiles = new Set<string>();

	/// The file names of C lines that match several files of their module,
	/// e.g. "test.c" for "src/test.c" and "src/menu/test.c" (module "test_c").
	/// Key: module + ':' + name.
	protected ambiguousCFiles = new Map<string, ListCFile[]>();

	/// All __C_LINE_ symbols of the map file. Empty if not compiled with "-debug".
	protected cLineSymbols: Z88dkMapSymbol[] = [];

	/// All address symbols (no debug symbols) of the map file.
	/// Used to find the end of a C line.
	protected addressSymbols: Z88dkMapSymbol[] = [];

	// z88dk: The format is line-number address opcode.
	// Used to remove the line number.
	protected z88dkRegEx = /^\s*\d+\s+/;

	// For stripping the comment.
	protected commentRegEx = /;.*/;

	// Regex to find the file name, e.g. "main.asm:". Can include spaces and / and \. also at the start.
	protected fileNameRegEx = /^(\S.*):/;

	// Regex to find the address, e.g. "08FA  CD0F34" (address/bytes)
	protected addressRegEx = /^([0-9a-f]{4,6})\s+((?:[0-9a-f]{2})+)\s/i;

	// Regex to find labels (ignore local labels, e.g. '@label')
	protected labelRegEx = /(?<!@)([a-z_]\w*):/i;

	// Regex to find labels in the ".label" syntax (used by sccz80), e.g. "._main"
	protected dotLabelRegEx = /^\s*\.([a-z_]\w*)/i;

	// Regex to find the module, e.g. "MODULE main_c"
	protected moduleRegEx = /^\s*(?:\d+\s+)?MODULE\s+(\w+)/i;

	// Regex to find EQUs with labels
	protected equRegEx = /([a-z_]\w*):\s*equ\s+(.*)/i;

	// Regex for the C_LINE/LINE directives (which contain ':' in the file name)
	protected lineDirectiveRegEx = /^\s*(C_LINE|LINE)\b/i;

	// RegEx to extract the line number for Sources-mode.
	protected lineNumberRegEx = /^(\s*\d+\s*)/;

	// RegEx to distinguish C source files
	protected cFileRegEx = /(.*\.[cC])$/;

	// RegEx to parse comment lines with reference to c source line
	protected cFileReference = /^\s*\d+\s+;(.*?):(\d+):/;

	// RegEx to parse the C_LINE directives in the .lis file, e.g.
	// '    7                          	C_LINE	5,"main.c::x::0::0"'
	protected cLineMarkerRegEx = /^\s*\d*\s+C_LINE\s+(\d+)\s*,\s*"([^"]*)"/i;

	// True if the current .lis file contains C_LINE directives.
	// These are used instead of the (less accurate) C line comments.
	protected listFileHasCLineMarkers: boolean;

	// The max. number of bytes a C line may cover. Safety measure in case
	// a line is followed by code without debug info.
	protected static readonly MAX_C_LINE_SIZE = 0x400;

	// To correct address by the values given in the map file.
	protected z88dkMapOffset: number | undefined;

	// The last (known) label address in the list file (incl. bank).
	protected lastLabelAddress: number;

	// The last used address in the list file (incl. bank).
	protected lastAddr64k: number;

	// In sources mode with C files, it tracks the current C line
	protected currentCLine: number;

	/// Function to convert the z88dk (banked) address into a DeZog long address.
	/// Set in checkMappingToTargetMemoryModel.
	protected funcConvertAddress: (value: number) => number;

	/// The banked address warnings already given. To warn only once.
	protected warnedBanks = new Set<string>();


	/** Returns true if the map file contains the "-debug" C line information. */
	protected hasCLineDebugInfo(): boolean {
		return this.cLineSymbols.length > 0;
	}


	// If current source is a C file, returns the filename (with no path)
	protected currentCSourceFile(): string | undefined {
		Utility.assert(this.includeFileStack.length);
		const currentSource = this.includeFileStack[this.includeFileStack.length - 1].includeFileName;
		const matchCSource = this.cFileRegEx.exec(currentSource);
		return matchCSource?.[1];
	}

	/** Returns true if the file name (e.g. from a C_LINE directive) refers to
	 * the given file. C_LINE contains only the file name, e.g. "game_loop.c"
	 * for "game/game_loop.c".
	 */
	protected isSameFile(name: string, filePath: string): boolean {
		name = UnifiedPath.getUnifiedPath(name);
		return name === filePath || filePath.endsWith('/' + name);
	}

	// Parses the line number corresponding to the C file.
	// If the .lis file contains C_LINE directives they are used, e.g. 'C_LINE 5,"main.c::x::0::0"'.
	// Otherwise the comments with the c file and line number are used, e.g. ';main.c:5: int main() {'
	// (requires --c-code-in-asm).
	// If the line contains no such information the previous line number is reused.
	protected parseCSourceFileLine(line: string, fileName: string): number {
		let ref: {file: string, lineNr: string} | undefined;
		if (this.listFileHasCLineMarkers) {
			const match = this.cLineMarkerRegEx.exec(line);
			if (match)
				ref = {file: stripDebugFileName(match[2]), lineNr: match[1]};
		}
		else {
			const match = this.cFileReference.exec(line);
			if (match)
				ref = {file: match[1], lineNr: match[2]};
		}
		if (ref && this.isSameFile(ref.file, fileName))
			this.currentCLine = parseInt(ref.lineNr);
		return this.currentCLine;
	}



	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		try {
			const mapFile: string = (config as Z88dkConfig).mapFile;
			this.readmapFile(mapFile);
			this.currentListCFile = undefined;
			super.loadAsmListFile(config);

			// Check for "topOfStack" (for z88dk C-compiler)
			const __register_sp = this.z88dkMappings.get('__register_sp');
			// Add label
			if (__register_sp !== undefined) {
				const longAddr = this.createLongAddress(__register_sp.value & 0xFFFF, 0);
				this.addLabelForNumber(longAddr, "__register_sp");
				// I.e. Now in lauch.json "topOfStack": "__register_sp" can be used
			}
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
		if (!line.startsWith(' '))
			return;	// Assumes that filename does not start with a space and that not all possible line numbers are used.

		// Replace line number with empty string.
		line = line.replace(this.z88dkRegEx, '');

		// Remove any comment
		line = line.replace(this.commentRegEx, '');

		// Check if there is a label
		const matchEquLabel = this.equRegEx.exec(line);
		if (matchEquLabel) {
			// Note: EQUs are not in the map file.
			const label = matchEquLabel[1];
			// EQU: add to label array
			let valueString = matchEquLabel[2];
			// Only try a simple number conversion, e.g. no label arithmetic (only already known labels)
			try {
				// Evaluate
				let value = Expressions.evalExpression(valueString, false);
				// Restrict label to 64k (Note: >64k is interpreted as long address)
				value &= 0xFFFF;
				// Add label
				this.addLabelForNumber(value, label);
			}
			catch {}	// do nothing in case of an error
		}
		else if (!this.lineDirectiveRegEx.test(line)) {
			const matchModule = this.moduleRegEx.exec(line);
			if (matchModule)
				this.currentModule = matchModule[1];
			// Check if there is a label (no equ)
			const matchLabel = this.labelRegEx.exec(line) ?? this.dotLabelRegEx.exec(line);
			if (matchLabel) {
				const label = matchLabel[1];
				// Special handling for z88dk to overcome the relative addresses (note: the map is empty if no z88dk is used/no map file given)
				const sym = this.z88dkLocalMappings.get(this.currentModule + ':' + label) ?? this.z88dkMappings.get(label);
				if (sym !== undefined) {	// Is e.g. undefined if in an IF/ENDIF
					//console.log('z88dk: label=' + label + ', realAddress=' + HexFormat.getHexString(sym.value, 4));
					// Use label address
					this.lastLabelAddress = sym.value;
					this.lastAddr64k = sym.value;
					this.z88dkMapOffset = undefined;
					// Add label
					const longAddr = this.funcConvertAddress(sym.value);
					this.addLabelForNumber(longAddr, label);
				}
			}
		}

		// Check if there is an address
		const matchAddress = this.addressRegEx.exec(line);
		let countBytes = 0;
		if (matchAddress) {
			const addr64k = parseInt(matchAddress[1], 16);
			if (this.z88dkMapOffset == undefined) {
				// Previous line was a label. Calculate the offset.
				this.z88dkMapOffset = this.lastLabelAddress - addr64k;
			}
			this.lastAddr64k = addr64k + this.z88dkMapOffset;
			//console.log('z88dk: lastAddr64k=' + HexFormat.getHexString(this.lastAddr64k, 4) + ', addr64k=' + HexFormat.getHexString(addr64k, 4) + ', offset=' + HexFormat.getHexString(this.z88dkMapOffset, 4));

			// Search for bytes after the address:
			// E.g. "80F1  d5c6";
			const bytes = matchAddress[2];
			countBytes = bytes.length / 2;	// 2 hex digits
			// Note: for long data z88dk-z80asm may split the data over several lines. This is ignored.
		}

		// Store address (or several addresses for one line).
		const longAddr = this.funcConvertAddress(this.lastAddr64k);
		this.addAddressLine(longAddr, countBytes);
		this.lastAddr64k += countBytes;
	}


	/**
	 * Parses one line for current file name and line number in this file.
	 * @param line The current analyzed line of the listFile array.
	 */
	protected parseFileAndLineNumber(line: string) {
		const matchModule = this.moduleRegEx.exec(line);
		if (matchModule)
			this.currentModule = matchModule[1];

		// Check for the file name
		const matchFileName = this.fileNameRegEx.exec(line);
		if (matchFileName) {
			// Filename has been found, use it.
			// Note: with "-debug" the C_LINE directive appends debug info to the file name, e.g. "main.c::x::10000::1"
			const fileName = stripDebugFileName(matchFileName[1]);
			const prevFileName = this.includeFileStack[this.includeFileStack.length - 1]?.includeFileName;
			if (prevFileName && this.isSameFile(fileName, prevFileName))
				return;	// Same file (e.g. C_LINE), keep the current C line
			// Stop any previous "include"
			this.includeFileStack.length = 0;
			this.includeStart(fileName);
			if (this.currentCSourceFile()) {
				const resolved = this.includeFileStack[0].fileName;
				let cFile = this.listCFiles.find(f => f.module === this.currentModule && f.fileName === resolved);
				if (!cFile) {
					cFile = {module: this.currentModule, listName: UnifiedPath.getUnifiedPath(fileName), fileName: resolved, code: []};
					this.listCFiles.push(cFile);
				}
				this.currentListCFile = cFile;
			}
			// Resets current C line
			this.currentCLine = 0;
			return;
		}

		// Get line number
		const cSourceFile = this.currentCSourceFile();
		if (cSourceFile) {
			const lineNumber = this.parseCSourceFileLine(line, cSourceFile);
			// Associate with line number
			this.setLineNumber(lineNumber - 1);	// line numbers start at 0
		}
		else {
			const matchLineNumber = this.lineNumberRegEx.exec(line);
			if (!matchLineNumber)
				return;	// Should not happen
			const lineNumber = parseInt(matchLineNumber[1])

			// Associate with line number
			this.setLineNumber(lineNumber - 1);	// line numbers start at 0
		}
	}


	/** Checks if the .lis file contains C_LINE directives before
	 * parsing the file names and line numbers.
	 */
	protected parseAllFilesAndLineNumbers(startLineNr = 0) {
		this.listFileHasCLineMarkers = this.listFile.some(entry => this.cLineMarkerRegEx.test(entry.line));
		super.parseAllFilesAndLineNumbers(startLineNr);
	}


	/** If the map file contains the C line debug info the C lines of
	 * the .lis file are not associated with addresses (they are taken from
	 * the map file instead).
	 */
	protected associateSourceFileName() {
		super.associateSourceFileName();
		if (this.hasCLineDebugInfo() && this.includeFileStack.length > 0 && this.currentCSourceFile())
			this.currentFileEntry.fileName = '';
	}


	/** Without C line information in the map file the C lines of the .lis
	 * file are corrected. With it they are taken from the map file, after
	 * all .lis files have been processed (see finishListFiles).
	 */
	protected sourcesModeFinish() {
		super.sourcesModeFinish();
		if (this.hasCLineDebugInfo()) {
			this.cLineDebugInfoPending = true;
			this.rememberCode();
		}
		else {
			this.correctCLineAddresses();
		}
	}


	/** Remembers the addresses of the code of the current .lis file's C file.
	 * Used to assign the C lines of the map file if two C files have the same
	 * file name and module (see findCLineFile).
	 */
	protected rememberCode() {
		const cFile = this.currentListCFile;
		if (!cFile)
			return;
		const ranges = this.listFile
			.filter(entry => entry.longAddr !== undefined && entry.size > 0)
			.map(entry => ({start: entry.longAddr!, end: entry.longAddr! + entry.size}))
			.sort((a, b) => a.start - b.start);
		for (const range of ranges) {
			const last = cFile.code[cFile.code.length - 1];
			if (last && range.start <= last.end)
				last.end = Math.max(last.end, range.end);
			else
				cFile.code.push(range);
		}
	}


	/** Adds the C line associations from the map file, once all .lis files
	 * of the configuration are known: the map file contains the C lines of
	 * all modules, and a C line is assigned to its source file with the help
	 * of the .lis files.
	 */
	public finishListFiles() {
		if (this.cLineDebugInfoPending)
			this.addCLineDebugInfo();
		this.cLineDebugInfoPending = false;
		this.listCFiles = [];
		this.ambiguousCFiles.clear();
	}


	/** Corrects the line -> address association of the C lines of the .lis file.
	 * The base class uses the address of the first .lis line of a C line, even
	 * if it contains no code. E.g. the C_LINE directive of a function is located
	 * before the label of the function and still has the address of the previous
	 * section. Therefore only lines with code are used.
	 * A C line without code gets no address.
	 */
	protected correctCLineAddresses() {
		// First address (with or without code) per file and line, as set by the base class
		const firstAddrs = new Map<string, Map<number, number>>();
		// First address with code
		const codeAddrs = new Map<string, Map<number, number>>();
		for (const entry of this.listFile) {
			if (entry.longAddr === undefined || !this.cFileRegEx.test(entry.fileName))
				continue;
			let first = firstAddrs.get(entry.fileName);
			if (!first) {
				first = new Map<number, number>();
				firstAddrs.set(entry.fileName, first);
				codeAddrs.set(entry.fileName, new Map<number, number>());
			}
			if (!first.has(entry.lineNr))
				first.set(entry.lineNr, entry.longAddr);
			const code = codeAddrs.get(entry.fileName)!;
			if (entry.size > 0 && !code.has(entry.lineNr))
				code.set(entry.lineNr, entry.longAddr);
		}
		for (const [fileName, first] of firstAddrs) {
			const lineArray = this.lineArrays.get(fileName);
			if (!lineArray)
				continue;
			const code = codeAddrs.get(fileName)!;
			for (const [lineNr, firstAddr] of first) {
				if (lineArray[lineNr] !== firstAddr)
					continue;	// Set by another list file
				const codeAddr = code.get(lineNr);
				if (codeAddr === undefined)
					delete lineArray[lineNr];
				else
					lineArray[lineNr] = codeAddr;
			}
		}
	}


	/** Adds the file/line <-> address associations from the
	 * __C_LINE_ symbols of the map file.
	 * The map file contains only the start address of a line.
	 * The end of a line is assumed at the start of the next C line, at the
	 * next label of a different module or at the next slot boundary.
	 */
	protected addCLineDebugInfo() {
		const config = this.config as AsmConfigBase;

		// Parse the locations
		const located: Array<{sym: Z88dkMapSymbol, info: Z88dkLineInfo}> = [];
		for (const sym of this.cLineSymbols) {
			const info = parseLineLocation(sym.location);
			if (!info) {
				this.sendWarning("Could not parse location '" + sym.location + "' of '" + sym.name + "'.", "warning", (config as Z88dkConfig).mapFile);
				continue;
			}
			located.push({sym, info});
		}
		// The current z88dk writes the file name only ("test.c"). If a z88dk
		// version writes the directory as well ("menu/test.c") the names are
		// unique and are matched exactly.
		const withDirectories = located.some(({info}) => /[\/\\]/.test(info.fileName));

		// Collect line entries
		const lineEntries: Array<{longAddr: number, module: string, fileName: string, lineNr: number}> = [];
		const relFileCache = new Map<string, string | undefined>();
		for (const {sym, info} of located) {
			// Get relative file name, check for excluded files
			const cacheKey = sym.module + ':' + info.fileName;
			let fileName = relFileCache.get(cacheKey);
			if (!relFileCache.has(cacheKey)) {
				fileName = this.findCLineFile(UnifiedPath.getUnifiedPath(info.fileName), sym.module, withDirectories);
				relFileCache.set(cacheKey, fileName);
			}
			const longAddr = this.funcConvertAddress(sym.value);
			const ambiguous = this.ambiguousCFiles.get(cacheKey);
			if (ambiguous) {
				// Same name and module: the file whose code contains the address
				const owners = ambiguous.filter(f => f.code.some(r => longAddr >= r.start && longAddr < r.end));
				fileName = (owners.length === 1) ? owners[0].fileName : undefined;
			}
			if (fileName !== undefined && config.excludeFiles.some(glob => minimatch(fileName!, glob)))
				fileName = undefined;
			if (fileName === undefined)
				continue;	// Excluded or not assignable
			const lineNr = info.lineNr - 1;	// 0-based
			lineEntries.push({longAddr, module: sym.module, fileName, lineNr});

			// Line -> address. If a line has several addresses the lowest one is used.
			let lineArray = this.lineArrays.get(fileName);
			if (!lineArray) {
				lineArray = new Array<number>();
				this.lineArrays.set(fileName, lineArray);
			}
			const prevAddr = lineArray[lineNr];
			if (prevAddr === undefined || longAddr < prevAddr)
				lineArray[lineNr] = longAddr;
		}

		// Boundaries: C lines and labels
		const boundaries = [
			...lineEntries.map(e => ({longAddr: e.longAddr, module: e.module})),
			...this.addressSymbols.map(sym => ({longAddr: this.funcConvertAddress(sym.value), module: sym.module}))
		];
		// Lines without code (e.g. a function header) share the address with the
		// following line. The address belongs to the last of them, i.e. the highest
		// line number, which is processed last.
		lineEntries.sort((a, b) => a.longAddr - b.longAddr || a.lineNr - b.lineNr);
		boundaries.sort((a, b) => a.longAddr - b.longAddr);
		const lineStarts = new Set<number>(lineEntries.map(e => e.longAddr));
		const slotAssociation = this.memoryModel.slotAddress64kAssociation;

		// Address -> line
		let k = 0;
		for (const lineEntry of lineEntries) {
			const start = lineEntry.longAddr;
			// Find the end: the next line or a label of a different module
			while (k < boundaries.length && boundaries[k].longAddr <= start)
				k++;
			let end = start + Z88dkLabelParserV2.MAX_C_LINE_SIZE;
			for (let j = k; j < boundaries.length; j++) {
				const b = boundaries[j];
				if (b.longAddr >= end)
					break;
				if (lineStarts.has(b.longAddr) || b.module !== lineEntry.module) {
					end = b.longAddr;
					break;
				}
			}
			// Stay inside the slot
			const addr64k = start & 0xFFFF;
			const slot = slotAssociation[addr64k];
			let size = 0;
			while (size < end - start && addr64k + size <= 0xFFFF && slotAssociation[addr64k + size] === slot)
				size++;
			for (let i = 0; i < size; i++) {
				this.setFileLineNrForAddress(start + i, {
					fileName: lineEntry.fileName,
					lineNr: lineEntry.lineNr,
					modulePrefix: undefined,
					lastLabel: undefined,
					size
				});
			}
		}
	}


	/** Returns the source file of a C line of the map file.
	 * 1. If the map file contains directories: the C file of a .lis file with
	 *    exactly this name (unique, even for "test.c" and "menu/test.c").
	 * 2. The C file of the module's .lis file. The current z88dk writes no
	 *    directory, so "test.c" matches "src/menu/test.c". Two such files in the
	 *    same module (both "test.c" give module "test_c") are told apart by
	 *    address (see addCLineDebugInfo); a warning is shown because the map
	 *    file lacks the C lines that have the same name in both files.
	 * 3. The file itself, if it exists in a source directory.
	 * 4. A unique file of that name in the subdirectories of the source
	 *    directories (for modules without .lis file).
	 * @param name The file name of the C line, e.g. "test.c" or "menu/test.c".
	 * @param module The module of the C line.
	 * @param withDirectories True if the map file's C lines contain directories.
	 * @returns The file name (as for the .lis files) or undefined if ambiguous.
	 */
	protected findCLineFile(name: string, module: string, withDirectories: boolean): string | undefined {
		const config = this.config as AsmConfigBase;
		const resolved = WorkspacePaths.getRelSourceFilePath(name, config.srcDirs);
		const unique = (files: string[]) => [...new Set(files)];

		// 1. Exact name of a .lis file
		if (withDirectories) {
			const exact = unique(this.listCFiles.filter(f => f.listName === name || f.fileName === resolved).map(f => f.fileName));
			if (exact.length === 1)
				return exact[0];
		}

		// 2. The module's .lis file
		const ofModule = this.listCFiles.filter(f => f.module === module && this.isSameFile(name, f.fileName));
		if (ofModule.length === 1)
			return ofModule[0].fileName;
		if (ofModule.length > 1) {
			this.ambiguousCFiles.set(module + ':' + name, ofModule);
			this.warnSameName(name, module, ofModule.map(f => f.fileName));
			return undefined;	// Decided per address
		}

		// 3. The file itself
		if (existsSync(WorkspacePaths.getAbsFilePath(resolved)))
			return resolved;

		// 4. Search the subdirectories
		const base = UnifiedPath.basename(name);
		const found: string[] = [];
		for (const srcDir of config.srcDirs) {
			const absDir = WorkspacePaths.getAbsFilePath(srcDir);
			for (const rel of fglob.sync('**/' + fglob.escapePath(base), {cwd: absDir, onlyFiles: true})) {
				const fileName = UnifiedPath.join(srcDir, rel);
				if (this.isSameFile(name, fileName))
					found.push(fileName);
			}
		}
		const foundUnique = unique(found);
		if (foundUnique.length === 1)
			return foundUnique[0];
		if (foundUnique.length > 1) {
			// No .lis file to tell them apart
			this.warnSameName(name, module, foundUnique);
			return undefined;
		}
		return resolved;
	}


	/** Warns (once per name and module) about C files with the same file name.
	 * The current z88dk names a module after the file name only, and its C
	 * line symbols contain no directory: lines with the same number (and
	 * scope) in both files get the same symbol name and only one of them is
	 * kept in the map file.
	 */
	protected warnSameName(name: string, module: string, files: string[]) {
		const key = module + ':' + name;
		if (this.warnedAmbiguousFiles.has(key))
			return;
		this.warnedAmbiguousFiles.add(key);
		this.sendWarning("The C files " + files.join(', ') + " have the same name ('" + name + "', module '" + module
			+ "'). The map file contains no directories, so some of their C lines are missing and cannot be debugged. Rename one of the files.",
			"warning", (this.config as Z88dkConfig).mapFile);
	}


	/**
	 * As all addresses in a
	 * z88dk list file are relative/starting at 0, the map file
	 * is necessary to obtain right addresses.
	 * The z88dk map file looks like this:
	 * print_number_address            = $1A1B ; const, local, , , , constants.inc:5
	 * AT                              = $0016 ; const, local, , , , constants.inc:6
	 * With "-debug" it additionally contains __C_LINE_, __ASM_LINE_ and __CDBINFO__ symbols.
	 * @param mapFile The absolute path to the map file.
	 */
	protected readmapFile(mapFile) {
		this.z88dkMapOffset = 0;
		this.lastLabelAddress = 0;
		this.lastAddr64k = 0;
		this.z88dkMappings.clear();
		this.z88dkLocalMappings.clear();
		this.currentModule = '';
		this.cLineSymbols = [];
		this.addressSymbols = [];
		Utility.assert(mapFile);	// mapFile is already absolute path.

		// Iterate over map file
		const lines = readFileSync(mapFile).toString().split('\n');
		for (const line of lines) {
			const sym = parseMapLine(line);
			if (!sym)
				continue;
			if (sym.name.startsWith(C_LINE_PREFIX)) {
				// sccz80 also creates symbols for lines without code (e.g. declarations,
				// header files). These are not in any section and have the value 0.
				if (sym.section)
					this.cLineSymbols.push(sym);
				continue;
			}
			if (isDebugSymbol(sym.name))
				continue;	// __ASM_LINE_ (the .lis file is more precise) and __CDBINFO__ (not used yet)
			this.z88dkMappings.set(sym.name, sym);
			if (sym.scope === 'local' && sym.module)
				this.z88dkLocalMappings.set(sym.module + ':' + sym.name, sym);
			if (sym.type !== 'const')
				this.addressSymbols.push(sym);
		}
	}


	/** Sets up the conversion of z88dk (banked) addresses into DeZog
	 * long addresses.
	 * - Addresses <= 0xFFFF: The bank is taken from the initial slot
	 *   configuration of the memory model.
	 * - Otherwise bits 16-23 are the bank. z88dk does not tell which
	 *   target was used, so it is taken from the 'target' setting:
	 *   "zx" uses 16k banks, "zxn" 8k pages. The bank is converted
	 *   into the banks of the target memory model (ZX Next or ZX128K).
	 *   An even 8k page may span 16k, i.e. the upper 8k belongs to the
	 *   next page.
	 *   If 'target' is not set or the bank cannot be converted, the
	 *   bank info is ignored and a warning is given.
	 */
	protected checkMappingToTargetMemoryModel() {
		super.checkMappingToTargetMemoryModel();	// Sets funcConvertBank for 64k
		const memModel = this.memoryModel;
		const target = (this.config as Z88dkConfigV2).target;

		// Conversion of the bank into the bank of the target memory model.
		// Returns undefined if not possible.
		let convertBank: ((bank: number, addr64k: number) => number | undefined) | undefined;
		if (memModel instanceof MemoryModelZxNextBase) {
			if (target === 'zxn')
				convertBank = (page, addr64k) => page | ((addr64k >>> 13) & 0x01);	// Upper 8k of an even page
			else if (target === 'zx')
				convertBank = (bank, addr64k) => 2 * bank + ((addr64k >>> 13) & 0x01);
		}
		else if (memModel instanceof MemoryModelZx128k) {
			if (target === 'zxn') {
				convertBank = (page, addr64k) => {
					const half = (addr64k >>> 13) & 0x01;
					page |= half;	// Upper 8k of an even page
					if ((page & 0x01) !== half)
						return undefined;	// Odd page in the lower 8k of a 16k bank
					return page >>> 1;
				};
			}
			else if (target === 'zx')
				convertBank = (bank) => bank;
		}

		this.funcConvertAddress = (value: number) => {
			const addr64k = value & 0xFFFF;
			if (value <= 0xFFFF)
				return this.createLongAddress(addr64k, 0);
			const bank = value >>> 16;
			const hexValue = '$' + HexFormat.getHexString(value, 6);
			if (target === undefined) {
				this.warnBank('no target', "The map file contains banked addresses (e.g. " + hexValue + ") but 'target' is not set. The bank information is ignored.");
				return this.createLongAddress(addr64k, 0);
			}
			if (!convertBank) {
				this.warnBank('memory model', "Banked addresses (e.g. " + hexValue + ") are only supported for the ZX128K and ZX Next memory models. The bank information is ignored.");
				return this.createLongAddress(addr64k, 0);
			}
			const convBank = convertBank(bank, addr64k);
			const slot = memModel.slotRanges[memModel.slotAddress64kAssociation[addr64k]];
			if (convBank === undefined || !slot.banks.has(convBank)) {
				this.warnBank('bank ' + bank, "Bank " + bank + " (target '" + target + "') of address " + hexValue + " cannot be converted to a bank of the memory model at that address. The bank information is ignored.");
				return this.createLongAddress(addr64k, 0);
			}
			return addr64k + ((convBank + 1) << 16);
		};
	}


	/** Warns about a banked address that cannot be converted.
	 * Each warning (key) is given only once.
	 * @param key Identifies the warning.
	 * @param message The warning text.
	 */
	protected warnBank(key: string, message: string) {
		const mapFile = (this.config as Z88dkConfigV2).mapFile;
		key = mapFile + ':' + key;
		if (this.warnedBanks.has(key))
			return;
		this.warnedBanks.add(key);
		this.sendWarning(message, "warning", mapFile);
	}
}
