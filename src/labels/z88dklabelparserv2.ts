import {LabelParserBase} from './labelparserbase';
import {Utility} from '../misc/utility';
import {readFileSync} from 'fs';
import {AsmConfigBase, Z88dkConfig} from '../settings/settings';
import {UnifiedPath} from '../misc/unifiedpath';

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
 */
export class Z88dkLabelParserV2 extends LabelParserBase {
	// Overwrite parser name (for errors).
	protected parserName = "z88dkv2";

	/// Map with the z88dk labels/symbols.
	protected z88dkMappings = new Map<string, number>();

	// z88dk: The format is line-number address opcode.
	// Used to remove the line number.
	protected z88dkRegEx = /^\s*\d+\s+/;

	// For stripping the comment.
	protected commentRegEx = /;.*/;

	// Regex to find the file name, e.g. "main.asm:". Can include spaces and / and \. also at the start.
	protected fileNameRegEx = /^(\S.*):/;

	// Regex to find the address, e.g. "08FA  CD0F34" (address/bytes)
	protected addressRegEx = /^([0-9a-f]{4,6})\s+((?:[0-9a-f]{2})+)\s/i;

	// Regex to find labels
	protected labelRegEx = /([a-z_]\w*):/i;

	// Regex to find EQUs with labels
	protected equRegEx = /([a-z_]\w*):\s*equ\s+(.*)/i;

	// Regex to iterate over the map file.
	protected mapFileRegEx = /^(\w*)\b\s*=\s*\$([0-9a-f]+)/i;

	// RegEx to extract the line number for Sources-mode.
	protected lineNumberRegEx = /^(\s*\d+\s*)/;

	// RegEx to distinguish C source files
	protected cFileRegEx = /(.*\.[cC])$/;

	// RegEx to parse comment lines with reference to c source line
	protected cFileReference = /^\s*\d+\s+;(.*?):(\d+):/;

	// To correct address by the values given in the map file.
	protected z88dkMapOffset: number | undefined;

	// The last (known) label address in the list file.
	protected lastLabelAddress: number;

	// The last used address in the list file.
	protected lastAddr64k: number;

	// In sources mode with C files, it tracks the current C line
	protected currentCLine: number;

	// If current source is a C file, returns the filename (with no path)
	protected currentCSourceFile(): string | undefined {
		Utility.assert(this.includeFileStack.length);
		const currentSource = this.includeFileStack[this.includeFileStack.length - 1].includeFileName;
		const matchCSource = this.cFileRegEx.exec(currentSource);
		return matchCSource?.[1];
	}

	// Parses the line number corresponding to the C file
	// If the file has just a line number followed by a comment with the c file and the file number
	// sets the file number. Otherwise, reuses the previous one
	protected parseCSourceFileLine(line: string, fileName: string): number {
		const match = this.cFileReference.exec(line);
		if (match) {
			const matchFileName = match[1];
			const unifiedFileName = UnifiedPath.getUnifiedPath(matchFileName);
			if (unifiedFileName === fileName) {
				this.currentCLine = parseInt(match[2]);
			}
		}
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
			super.loadAsmListFile(config);

			// Check for "topOfStack" (for z88dk C-compiler)
			const __register_sp = this.z88dkMappings.get('__register_sp');
			// Add label
			if (__register_sp !== undefined) {
				const longAddr = this.createLongAddress(__register_sp & 0xFFFF, 0);
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
				let value = Utility.evalExpression(valueString, false);
				// Restrict label to 64k (Note: >64k is interpreted as long address)
				value &= 0xFFFF;
				// Add label
				this.addLabelForNumber(value, label);
			}
			catch {}	// do nothing in case of an error
		}
		else {
			// Check if there is a label (no equ)
			const matchLabel = this.labelRegEx.exec(line);
			if (matchLabel) {
				const label = matchLabel[1];
				// Special handling for z88dk to overcome the relative addresses (note: the map is empty if no z88dk is used/no map file given)
				const realAddress = this.z88dkMappings.get(label);
				if (realAddress !== undefined) {	// Is e.g. undefined if in an IF/ENDIF
					//console.log('z88dk: label=' + label + ', realAddress=' + Utility.getHexString(realAddress, 4));
					// Use label address
					this.lastLabelAddress = realAddress;
					this.lastAddr64k = realAddress;
					this.z88dkMapOffset = undefined;
					// Add label
					const longAddr = this.createLongAddress(realAddress, 0);
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
			//console.log('z88dk: lastAddr64k=' + Utility.getHexString(this.lastAddr64k, 4) + ', addr64k=' + Utility.getHexString(addr64k, 4) + ', offset=' + Utility.getHexString(this.z88dkMapOffset, 4));

			// Search for bytes after the address:
			// E.g. "80F1  d5c6";
			const bytes = matchAddress[2];
			countBytes = bytes.length / 2;	// 2 hex digits
			// Note: for long data z88dk-z80asm may split the data over several lines. This is ignored.
		}

		// Store address (or several addresses for one line).
		const longAddr = this.createLongAddress(this.lastAddr64k, 0);
		this.addAddressLine(longAddr, countBytes);
		this.lastAddr64k += countBytes;
	}


	/**
	 * Parses one line for current file name and line number in this file.
	 * @param line The current analyzed line of the listFile array.
	 */
	protected parseFileAndLineNumber(line: string) {
		// Check for the file name
		const matchFileName = this.fileNameRegEx.exec(line);
		if (matchFileName) {
			// Stop any previous "include"
			this.includeFileStack.length = 0;
			// Filename has been found, use it
			const fileName = matchFileName[1];
			this.includeStart(fileName);
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


	/**
	 * As all addresses in a
	 * z88dk list file are relative/starting at 0, the map file
	 * is necessary to obtain right addresses.
	 * The z88dk map file looks like this:
	 * print_number_address            = $1A1B ; const, local, , , , constants.inc:5
	 * AT                              = $0016 ; const, local, , , , constants.inc:6
	 * @param mapFile The absolute path to the map file.
	 */
	protected readmapFile(mapFile) {
		this.z88dkMapOffset = 0;
		this.lastLabelAddress = 0;
		this.lastAddr64k = 0;
		Utility.assert(mapFile);	// mapFile is already absolute path.

		// Iterate over map file
		let lines = readFileSync(mapFile).toString().split('\n');
		for (const line of lines) {
			const match = this.mapFileRegEx.exec(line);
			if (match) {
				const label = match[1];
				const addr64k = parseInt(match[2], 16);
				this.z88dkMappings.set(label, addr64k);
			}
		}
	}
}
