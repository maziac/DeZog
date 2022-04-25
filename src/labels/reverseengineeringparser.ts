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
	protected regexEqu = /^\s*([\w_][\w_\d\.]*):\s*EQU\s+([^;]+)/i;	// NOSONAR: sonar wrong

	// Regex to parse the address
	protected regexAddr = /^(([\da-f]+)(@\d+)?\s*)/i;

	// Regex to parse the bytes after the address
	protected regexByte = /^([\da-f][\da-f]\s)/i;

	// Regex to parse the label

	protected regexLabel = /^\s*((\.?)[\w_][\w_\d\.]*):/;	// NOSONAR: sonar wrong


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
				this.warnings += "Could not evaluate expression '" + valueString + "' in line: '" + line + "'\n";
			}
			return;
		}


		// Get address
		const matchAddr = this.regexAddr.exec(workLine);
		if (!matchAddr) {
			// Skip if no address found
			// Check that max. contains a comment otherwise show a warning
			const trimmed = workLine.trim();
			if (trimmed && !trimmed.startsWith(';')) {
				// Line contains something and it is not a comment:
				// Add a warning
				this.warnings += "Line ignored: '" + line + "'\n";
			}
			return;
		}
		const addr64kStr = matchAddr[2];
		const addr64k = parseInt(addr64kStr, 16);
		let bank = 0;	// 0 = no bank
		const bankStr = matchAddr[3];
		if (bankStr)
			bank = 1 + parseInt(bankStr.substring(1));
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
			let label = matchLabel[1];
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
		this.addLabelForNumberRaw(value, this.lastLabel + label);
	}


	/**
	 * Overwritten to check for same labels.
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
			this.warnings += "Label '" + label + "' defined more than once.\n";
			return;
		}

		// Otherwise the same
		super.addLabelForNumberRaw(value, label);
	}

}
