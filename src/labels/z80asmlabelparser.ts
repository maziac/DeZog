import {Utility} from '../misc/utility';
import {LabelParserBase} from './labelparserbase';


/**
 * This class parses sjasmplus list files.
 */
export class Z80asmLabelParser extends LabelParserBase {


	// Regex to find labels
	// Allow labels without ":"
	protected labelRegEx=/^[0-9a-f]+[\s0-9a-f]*\s+>?([^;\s0-9][^;\s]*):\s*(equ\s|macro\s)?\s*([^;\n]*)/i;

	// Find the bytes after the address
	protected matchBytesRegEx=/^[0-9a-f]+((\s[\.0-9a-f]+)+)/i;

	// To check the keyword after the bytes above. I.e. to check for data or instruction (on a trimmed string).
	// Note: This would result in wrong decisions for the NEXTREG macros which are made out of defb.
	//protected matchDefbRegEx=/^(\w+:\s*)?(def[bmws]|d[bmws])/i;

	// RegEx to find the end of a macro
	protected matchMacroEndRegEx=/^# End of macro\s+(.*)/;

	// RegEx to find the end of a file
	protected matchFileEndRegEx=/^# End of file\s+(.*)/;

	// RegEx to find an include file
	protected matchInclStartRegEx=/^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i;


	// Current line number in reverse looping
	protected lineNr=0;


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

		// Extract address.
		const address=parseInt(line.substr(0, 4), 16);
		if (!isNaN(address)) { // isNaN if e.g. the first line: "# File main.asm"

			// Check for labels and "equ". It allows also for @/dot notation as used in sjasmplus.
			const match=this.labelRegEx.exec(line);
			if (match) {
				let label=match[1];
				const equ=match[2];
				if (equ) {
					if (equ.toLowerCase().startsWith('equ')) {
						// EQU: add to label array
						let valueString=match[3];
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
							let value = Utility.evalExpression(valueString, false);
							// Restrict label to 64k (Note: >64k is interpreted as long address)
							value &= 0xFFFF;
							// Add label
							this.addLabelForNumber(value, label);
						}
						catch {};	// do nothing in case of an error
					}
				}
				else {
					// Add label
					this.addLabelForNumber(address, label);
				}
			}

			// Search for bytes after the address:
			// line = "80F1 D5 C5";
			// or line = "80F1 .. D5 C5";
			const matchBytes=this.matchBytesRegEx.exec(line);
			// Count how many bytes are included in the line.
			if (matchBytes) {
				/*
				// Now check if the bytes have been data.
				const len=matchBytes[0].length;
				const remLine=line.substr(len).trimLeft();
				const matchDefb=this.matchDefbRegEx.exec(remLine);
				if (!matchDefb) {
					// If not data then assume that it is code
				*/

				const bytes=matchBytes[1].trim();
				const lenBytes=bytes.length;
				for (let k=0; k<lenBytes; k++) {
					// Count all characters (chars are hex, so 2 characters equal to 1 byte)
					if (bytes.charCodeAt(k)>32)
						countBytes++;
				}
				// 2 characters = 1 byte
				countBytes/=2;

				//}
			}


		}

		// Store address (or several addresses for one line).
		// This needs to be called even if address is undefined.
		this.addAddressLine(address, countBytes);
	}


	/**
	 * Parses one line for current file name and line number in this file.
	 * @param line The current analyzed line of the listFile array.
	 */
	protected parseFileAndLineNumber(line: string) {

		// Check for end of file (end of include)
		const matchFileEnd=this.matchFileEndRegEx.exec(line);
		if (matchFileEnd) {
			// Get file name
			const fileName=matchFileEnd[1];
			// Put on top of stack
			this.includeStart(fileName);
			return;
		}

		// Get index to last included file
		let index=this.includeFileStack.length-1;
		if (index<0)
			return;	// First valid line not yet found

		// Check for start of include file
		const matchInclStart=this.matchInclStartRegEx.exec(line);
		if (matchInclStart) {
			// Note: Normally filenames match, but if they don't match then
			// it might be because the file hasn't been included. Maybe it was
			// #ifdef'ed.
			// Compare filename
			const fileName=matchInclStart[1];
			if (fileName.valueOf()==this.includeFileStack[index].fileName.valueOf()) {
				this.includeEnd();	// Remove from top of stack
				index=this.includeFileStack.length-1;
			}
			//return;
		}

		// Check for macro (check for end of macro and search backward for the start of the macro)
		const matchMacroEnd=this.matchMacroEndRegEx.exec(line);
		if (matchMacroEnd) {
			const macroName=matchMacroEnd[1];
			const startLine=this.searchStartOfMacro(macroName);
			// Skip all lines, i.e. all lines get same line number
			const stackItem=this.includeFileStack[index];
			for (let i=startLine; i<this.lineNr; i++) {
				const entry=this.listFile[i];
				entry.fileName=stackItem.fileName;
				entry.lineNr=stackItem.lineNr;
			}
			// Skip lines
			this.lineNr=startLine;
			// Next line
			stackItem.lineNr--;
			return;
		}


		// Increase line number
		let sourceLineNr=this.includeFileStack[index].lineNr;
		this.setLineNumber(sourceLineNr);	// line numbers start at 0

		// next line
		//if (oldLineNr==-1)
		//	stack[index].lineNr--;

		// Next line
		this.includeFileStack[index].lineNr--;
	}


	/**
	 * Loops all entries of the listFile array REVERSE and parses for the (include) file
	 * names and line numbers and for the macros.
	 * Note: It is done reverse to safely find the include / macro occurrences.
	 * The include file end only exists if the file was really included and not just part
	 * of an if/def. The 'include'  would occur in any case. So we loop reverse and remember the file name
	 * and skipp all includes that do not have a correspondent #end of file.
	 * @param startLineNr The line number to start the loop with. I.e. sometimes the
	 * beginning of the list file contains information that is parsed differently.
	 */
	protected parseAllFilesAndLineNumbers(startLineNr=0) {
		// Loop all lines reverse
		this.lineNr=this.listFile.length-1;
		for (; this.lineNr>0; this.lineNr--) {	// Note: the first line is the name of the main file and skipped
			const entry=this.listFile[this.lineNr];
			const line=entry.line;
			// Let it parse
			this.currentFileEntry=entry;
			this.parseFileAndLineNumber(line);
			// Associate with right file
			this.associateSourceFileName();
		}

		// Now correct all line numbers (so far the numbers are negative. All numbers need to be added with the max number of lines for that file.)
		let lastFileName='';
		let lastFileLength=0;
		const fileLength=new Map<string, number>();
		for (const entry of this.listFile) {
			if (lastFileName.valueOf()!=entry.fileName.valueOf()) {
				lastFileName=entry.fileName;
				// Change in file name, check if it has been used already
				if (!fileLength[lastFileName]) {
					fileLength[lastFileName]=-entry.lineNr;
				}
				// Use length
				lastFileLength=fileLength[lastFileName];
			}
			// change line number
			entry.lineNr+=lastFileLength;
		}
	}


	/**
	 * Searches for the start of a macro.
	 * @param macroName The name of the macro to search for.
	 * @return The found line number or startSearchLine if nothing found (should not happen).
	 */
	protected searchStartOfMacro(macroName: string): number {
		const macroRegex=new RegExp("[0-9a-fA-F]+\\s+"+macroName+"\\s+.*");
		let k=this.lineNr;
		for (; k>0; --k) {
			const line2=this.listFile[k].line;
			const matchMacroStart=macroRegex.exec(line2);
			if (matchMacroStart)
				return k;	// macro start found
		}
		// Nothing found (should not happen)
		return this.lineNr;
	}

}

