//import {readFileSync} from 'fs';
import {Utility} from '../misc/utility';
//import {Settings} from '../settings';
//import * as path from 'path';
//import {Remote} from '../remotes/remotefactory';
//import {LabelsClass, ListFileLine} from './labels';
import {LabelParserBase, LabelType} from './labelparserbase';
//import {ListFileLine} from './labels';
//import {readFileSync} from 'fs';


/**
 * This class parses sjasmplus list files.
 */
export class SjasmplusLabelParser extends LabelParserBase {

	// sjasmplus: The format is line-number++ address opcode.
	// sjasmplus: The "+" indicate the include level, max 3 "+"s.
	// I.e. [0-9]+[\s+]+
	// E.g.
	//    5+ 0001                include "i2.inc"
	//	  1++0001
	//    2++0001              i2:
	//    3++0001 00               nop
	// sjasmplus changed the format. Note the spaces in front of the line numbers.
	protected sjasmRegEx=/^ *[0-9]+[\s+]+/;

	// Regex to find labels
	// Allow labels without ":"
	protected labelRegEx=/^.{18}(@?)([^;:\s0-9][^:;\s]*):?\s*(equ\s|macro\s)?\s*([^;\n]*)/i;

	// Check if valid line (not "~")
	// Search for "~". E.g. "8002 ~            Level   defw 4"
	protected invalidLineRegEx=/^[0-9a-f]+\s+\~/i;

	// RegEx to find a module
	protected matchModuleStartRegEx=/^[0-9a-f]+\s+module\s+([^\s]+)/i;

	// RegEx to find module end
	protected matchModuleEndRegEx=/^[0-9a-f]+\s+endmodule\b/i;

	// Find the bytes after the address
	protected matchBytesRegEx=/^[0-9a-f]+((\s+[0-9a-f][0-9a-f])+)/i;

	// Matches the line number (of the included file(s))
	protected matchLineNumberRegEx=/^\s*([0-9]+)[\s\+]+(.*)/;

	// Matches the include file text
	protected matchIncludeFileRegEx=/^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i;

	/// Will be set to true when the Lstlab section in the list file is reached.
	protected sjasmplusLstlabSection=false;


	/**
	 * Parses one line for label and address.
	 * Finds labels at start of the line and labels as EQUs.
	 * Also finds the address of the line.
	 * The function calls addLabelForNumber to add a label or equ and
	 * addAddressLine to add the line and it's address.
	 * @param line The current analyzed line of the list file.
	 */
	protected parseLabelAndAddress(line: string) {
		let countBytes=0;

		// In sjasmplus labels section?
		if (this.sjasmplusLstlabSection) {
			// Format is (no tabs, only spaces, 'X'=used, without X the label is not used):
			// 0x60DA X TestSuite_ClearScreen.UT_clear_screen
			// 0x0008   BLUE
			if (!line.startsWith('0x'))
				return;
			// Get hex value
			const valString=line.substr(2, 4);
			const value=parseInt(valString, 16);
			// Label
			const label=line.substr(9).trim();
			// Add label
			this.addLabelForNumber(value, label, LabelType.GLOBAL);	// Full labels
			// Throw line away
			this.listFile.pop();
			return;
		}

		// Check for sjasmplus "--lstlab" section
		if (line.startsWith("Value")) {
			// The end of the sjasmplus list file has been reached
			// where the labels start.
			this.sjasmplusLstlabSection=true;
			// Throw line away
			this.listFile.pop();
			return;
		}

		// Replace line number with empty string.
		line=line.replace(this.sjasmRegEx, '');

		// Check if valid line (not "~")
		// Search for "~". E.g. "8002 ~            Level   defw 4"
		const invalidMatch=this.invalidLineRegEx.exec(line);
		if (invalidMatch)
			return;	// Skip line.

		// Extract address.
		let address=parseInt(line.substr(0, 4), 16);
		if (isNaN(address)) // isNaN if e.g. the first line: "# File main.asm"
			address=undefined!;
		if (address!=undefined) {
			// Check for MODULE
			var matchModuleStart=this.matchModuleStartRegEx.exec(line);
			if (matchModuleStart) {
				// Push module to stack
				const moduleName=matchModuleStart[1];
				this.moduleStart(moduleName);
			}
			else {
				// End
				var matchModuleEnd=this.matchModuleEndRegEx.exec(line);
				if (matchModuleEnd) {
					// Remove module from stack
					this.moduleEnd();
				}
			}

			// Check for labels and "equ". It allows also for @/dot notation as used in sjasmplus.
			const match=this.labelRegEx.exec(line);
			if (match) {
				let label=match[2];
				let labelType=LabelType.NORMAL;
				// Check for local label
				if (label.startsWith('.'))
					labelType=LabelType.LOCAL;
				// Check for global label
				const global=match[1];
				if (global!='')
					labelType=LabelType.GLOBAL;
				const equ=match[3];
				if (equ) {
					if (equ.toLowerCase().startsWith('equ')) {
						// EQU: add to label array
						let valueString=match[4];
						// Only try a simple number conversion, e.g. no label arithmetic (only already known labels)
						try {
							// Check for any '$', i.e. current address
							if (valueString.indexOf('$')>=0) {
								// Replace $ with current address
								const addressString=address.toString();
								const cAddrString=valueString.replace(/(?<![a-z_0-9\$])\$(?![a-z_0-9\$])/i, addressString);
								valueString=cAddrString;
							}
							// Evaluate
							const value=Utility.evalExpression(valueString, false);
							//const entry = { value, file: fileName, line: lineNr};
							// Add EQU
							this.addLabelForNumber(value, label, labelType);
						}
						catch {};	// do nothing in case of an error
					}
				}
				else {
					// Add label
					this.addLabelForNumber(address, label, labelType);
				}
			}

			// Search for bytes after the address:
			//line = "80F1 D5 C5";
			const matchBytes=this.matchBytesRegEx.exec(line);
			// Count how many bytes are included in the line.
			if (matchBytes) {
				const bytes=matchBytes[1].trim();
				const lenBytes=bytes.length;
				countBytes=0;
				for (let k=0; k<lenBytes; k++) {
					// Count all characters (chars are hex, so 2 characters equal to 1 byte)
					if (bytes.charCodeAt(k)>32)
						countBytes++;
				}
				// 2 characters = 1 byte
				countBytes/=2;
			}
		}

		// Store address (or several addresses for one line).
		// This needs to be called even if address is undefined.
		this.addAddressLine(address, countBytes);
	}


	/**
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
		// sjasmplus:
		// Starts with spaces and the line numbers (plus pluses) of the include file.
		// Indicates start and end of include.
		//   38  004B
		//   39  004B                  include "zxnext/zxnext_regs.inc"
		// # file opened: src//zxnext/zxnext_regs.inc
		//    1+ 004B              ;=================
		//  ...
		//  331+ 004B              DMA_LOAD:       equ 11001111b
		//  332+ 004B              ZXN_DMA_PORT:   equ 0x6b
		//  333+ 004B
		//  # file closed: src//zxnext/zxnext_regs.inc
		//   40  004B
		//
		// Note:
		// sjasmplus: the text '# file closed' is used as indication that the
		// include file ended.

		// Check for start of include file
		if (line.startsWith('# file opened:')) {
			// Get file name
			const fname=line.substr(15).trim();
			// Include file
			this.includeStart(fname);
			return;
		}

		// Check for end of include file
		if (line.startsWith('# file closed:')) {
			// Include ended.
			this.includeEnd();
			return;
		}

		// Get line number
		const matchLineNumber=this.matchLineNumberRegEx.exec(line);
		if (!matchLineNumber)
			return;	// sjasmplus contains lines without line number.
		const lineNumber=parseInt(matchLineNumber[1]);

		// Associate with line number
		this.setLineNumber(lineNumber-1);	// line numbers start at 0
	}

}


