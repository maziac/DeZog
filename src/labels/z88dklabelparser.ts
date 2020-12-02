import {LabelParserBase} from './labelparserbase';
import {Utility} from '../misc/utility';
import {readFileSync} from 'fs';
import {AsmConfigBase, Z88dkConfig} from '../settings';

/**
 * This class parses sjasmplus list files.
 */
export class Z88dkLabelParser extends LabelParserBase {

	/// Map with the z88dk labels/symbols.
	protected z88dkMappings=new Map<string, number>();

	// z88dk: The format is line-number address opcode.
	// Used to remove the line number.
	protected z88dkRegEx=/^[0-9]+\s+/;

	// Regex to find labels
	// Require a ":"" after the label
	protected labelRegEx=/^[0-9a-f]+[\s0-9a-f]*\s+>?([^;\s0-9][^;\s]*):\s*(equ\s|macro\s)?\s*([^;\n]*)/i;

	// Search for bytes after the address:
	// E.g. "80F1 D5 C5"
	protected matchBytesRegEx=/[0-9a-f]{4}\s\s(([0-9a-f][0-9a-f]\s)+)/i;

	// RegEx to extract the line number for Sources-mode.
	protected matchLineNumberRegEx=/^\s*([0-9]+)[\s\+]+(.*)/;

	// Checks for "include".
	protected matchInclStartRegEx=/^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i;

	// To correct address by the values given in the map file.
	protected z88dkMapOffset: number;

	// The current line and the next lines are tested to find the end of an include file-
	protected expectedLineNr: number;


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		const mapFile: string=(config as Z88dkConfig).mapFile;
		this.readmapFile(mapFile);
		super.loadAsmListFile(config);
	}


	/**
	 * Loops all entries of the listFile array and parses for the (include) file
	 * names and line numbers.
	 * @param startLineNr The line number to start the loop with. I.e. sometimes the
	 * beginning of the list file contains onformation that is parsed differently.
	 */
	protected parseAllFilesAndLineNumbers(startLineNr=0) {
		// Check if there is a main file given in the config
		const config=this.config as Z88dkConfig;
		if (config.mainFile) {
			// Set main file
			const fileName=Utility.getRelFilePath(config.mainFile);
			this.includeStart(fileName);
		}
		// Call super
		this.expectedLineNr=1;
		super.parseAllFilesAndLineNumbers(startLineNr);
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
		let countBytes=0;

		// Replace line number with empty string.
		line=line.replace(this.z88dkRegEx, '');

		// Extract address.
		let address=parseInt(line.substr(0, 4), 16);
		if (isNaN(address))
			address=undefined!;	// Should not happen
		if (address!=undefined) {
			const readAddress=address;
			address+=this.z88dkMapOffset;
			// Check for labels and "equ".
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
					// Special handling for z88dk to overcome the relative addresses (note: the map is empty if no z88dk is used/no map file given)
					const realAddress=this.z88dkMappings.get(label);
					if (realAddress!=undefined) {
						//console.log('z88dk: label='+label+', '+Utility.getHexString(realAddress, 4));
						// Label/symbol found
						this.z88dkMapOffset=realAddress-readAddress;
						address=realAddress;
					}
					// Add label
					this.addLabelForNumber(address, label);
				}
			}

			// Search for bytes after the address:
			// E.g. "80F1  D5 C5";
			const matchBytes=this.matchBytesRegEx.exec(line);
			// Count how many bytes are included in the line.
			if (matchBytes) {
				countBytes=matchBytes[1].length/3;	// 2 hex digits plus 1 space
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
		// Note:
		// a) the text "include" is used as indication that a new include
		// file started
		// b) the change of the line number is used as indicator that the
		// include file ended.

		// Get line number
		const matchLineNumber=this.matchLineNumberRegEx.exec(line);
		if (!matchLineNumber)
			return;	// sjasmplus contains lines without line number.
		const lineNumber=parseInt(matchLineNumber[1]);

		// z88dk: Check for end of include file
		if (lineNumber!=this.expectedLineNr
			&&lineNumber!=this.expectedLineNr+1) {
			// End of include found
			// Note: this is not 100% error proof.
			// E.g. if modules are used (speccytron) this happens also after the MODULE lines:
			/*
			1     0000              MODULE efd_c
			2     0000              LINE 0, "efd.c"
			0     0000
			*/
			// To correctly fix this a MODULE would be need to put on the stack as well.
			// But this requires 'state' as it spreads over several lines.
			// The fix here (if(stack.length>0)) just makes sure
			// that the stack does not get cleared which leads to an
			// undefined access later.
			// See https://github.com/maziac/DeZog/issues/17
			this.includeEnd();
		}


		// Check for start of include file
		const remainingLine=matchLineNumber[2];
		const matchInclStart=this.matchInclStartRegEx.exec(remainingLine);
		if (matchInclStart) {
			const fName=matchInclStart[1];
			this.includeStart(fName);
			this.expectedLineNr=1;
			return;
		}
		this.expectedLineNr=lineNumber;

		// Associate with line number
		this.setLineNumber(lineNumber-1);	// line numbers start at 0
	}


	/**
	 * Called by the parser if the end of an include file is found.
	 * Does not produce an error because of speccytron MODULE problem (see above).
	 */
	protected includeEnd() {
		// Remove last include file
		if (this.includeFileStack.length>1)
			this.includeFileStack.pop();
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
		this.z88dkMapOffset=0;
		Utility.assert(mapFile);	// mapFile is already absolute path.

		// Iterate over map file
		const regex=new RegExp(/^(\w*)\b\s*=\s*\$([0-9a-f]+)/i);
		let lines=readFileSync(mapFile).toString().split('\n');
		for (const line of lines) {
			const match=regex.exec(line);
			if (match) {
				const label=match[1];
				const addr=parseInt(match[2], 16);
				this.z88dkMappings.set(label, addr);
			}
		}
	}

}

