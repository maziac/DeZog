import {match} from 'assert';
import {Utility} from '../misc/utility';
import {LabelParserBase} from './labelparserbase';


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
 * C000@0 or C000@1.
 * Unbanked addresses are simply e.g. 8000.
 *
 * Comments start with ;
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
 * E.g.:
 * C000@2 3E 05  LD A,5 ; load A with 5
 * MY_CONSTANT:  EQU   50
 */
export class ReverseEngineeringParser extends LabelParserBase {

	// Regex to parse the address
	protected regexEqu = /^\s*([\w_][\w_\d\.]*):\s*EQU\s+([^;]+)/;	// NOSONAR: sonar wrong

	// Regex to parse the address
	protected regexAddr = /^(([\da-f]+)(@\d+)?\s*)/i;

	// Regex to parse the bytes after the address
	protected regexByte = /^([\da-f][\da-f]?\s+)/i;

	// Regex to parse the label

	protected regexLabel = /^\s*((\.?)[\w_][\w_\d\.]*):/;	// NOSONAR: sonar wrong


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
	protected matchLineNumberRegEx=/^\s*(\d+)[\s\+]+(.*)/;

	// Matches the include file text
	protected matchIncludeFileRegEx=/^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i;

	/// Will be set to true when the Lstlab section in the list file is reached.
	protected sjasmplusLstlabSection=false;

	/// Regex to skip a commented SLDOPT, i.e. "; SLDOPT"
	protected regexSkipSldOptComment = /^[^;]*(;\s*sldopt)/i;


	/**
	 * Parses one line for label and address.
	 * Finds labels at start of the line and labels as EQUs.
	 * Also finds the address of the line.
	 * The function calls addLabelForNumber to add a label or equ and
	 * addAddressLine to add the line and it's address.
	 * @param line The current analyzed line of the list file.
	 */
	protected parseLabelAndAddress(line: string) {
		let workLine = line + '\n';	// For easier regex

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
			catch {}	// do nothing in case of an error
			return;
		}


		// Get address
		const matchAddr = this.regexAddr.exec(workLine);
		if (!matchAddr)
			return;	// Skip if no address found // TODO: Check that it only contains a comment
		const addr64kStr = matchAddr[2];
		const addr64k = parseInt(addr64kStr, 16);
		let bank = 0;	// 0 = no bank
		const bankStr = matchAddr[3];
		if (bankStr)
			bank = 1 + parseInt(bankStr);
		workLine = workLine.substring(matchAddr[1].length);

		// Create long address
		const longAddress = addr64k + bank * 0x10000;

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
			let label = match[1];
			// Check for local label
			if (label.startsWith('.'))
				this.addLocalLabelForNumber(longAddress, label);
			else
				this.addLabelForNumber(longAddress, label);
		}

		// Store address (or several addresses for one line).
		// This needs to be called even if address is undefined.
		this.addAddressLine(longAddress, countBytes);	// TODO: Most probably a long address here
	}


	/**
	 * Only difference to addLabelForNumber is that 'lastLabel' is not set.
	 * @param value The value for which a new label is to be set. If a value > 64k it needs
	 * to be a long address.
	 * @param label The label to add.
	 */
	protected addLocalLabelForNumber(value: number, label: string,) {
	// Remember last label (for local labels)
	this.currentFileEntry.lastLabel = this.lastLabel;	// The last non-local label
	this.currentFileEntry.modulePrefix = undefined;
	this.addLabelForNumberRaw(value, label);
}


	/**
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
			const fname=line.substring(15).trim();
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

}


