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
	protected sjasmRegex=/^ *[0-9]+[\s+]+/;

	// Regex to find labels
	// Allow labels without ":"
	protected labelRegex=/^.{18}(@?)([^;:\s0-9][^:;\s]*):?\s*(equ\s|macro\s)?\s*([^;\n]*)/i;

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


	// Constructor.
	//public constructor() {
	//	super();
	//}


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 */
	public loadAsmListFile(config: any) {
		//const fileName: string=Utility.getAbsFilePath(config.path);
		//const fileName: string=config.path;
		//const mainFileName: string|undefined=config.mainFile;
		const sources: Array<string>=config.srcDirs;
	//	const lineHandler=(address: number, line: string, lineNumber: number) => {};


		//const listFile=this.listFile;
		this.config=config;
		this.parseAllLabelsAndAddresses();

		/*
		/// Array that contains the list file, the associated memory addresses
		/// for each line and the associated real filenames/line numbers, module and lastLabel prefixes.
		const listFile=new Array<ListFileLine>();

		// sjasmplus: The format is line-number++ address opcode.
		// sjasmplus: The "+" indicate the include level, max 3 "+"s.
		// I.e. [0-9]+[\s+]+
		// E.g.
		//    5+ 0001                include "i2.inc"
		//	  1++0001
		//    2++0001              i2:
		//    3++0001 00               nop
		// sjasmplus changed the format. Note the spaces in front of the line numbers.
		const sjasmRegex=new RegExp(/^ *[0-9]+[\s+]+/);

		// Regex to find labels
		// Allow labels without ":"
		const labelRegex=new RegExp(/^.{18}(@?)([^;:\s0-9][^:;\s]*):?\s*(equ\s|macro\s)?\s*([^;\n]*)/i);

		// Read all lines and extract the PC value
		let listLines=readFileSync(fileName).toString().split('\n');
		let line;
		let lineNumber=0;
		let labelPrefix;	// Only used for sjasmplus
		let labelPrefixStack=new Array<string>();	// Only used for sjasmplus
		let lastLabel;		// Only used for sjasmplus for local labels (without labelPrefix)
		let sjasmplusLstlabSection=false;
		//let dbgLineNr = 0;
		for (let origLine of listLines) {
			//	dbgLineNr ++;
			let countBytes=1;
			line=origLine;

			// In sjasmplus labels section?
			if (sjasmplusLstlabSection) {
				// Format is (no tabs, only spaces, 'X'=used, without X the label is not used):
				// 0x60DA X TestSuite_ClearScreen.UT_clear_screen
				// 0x0008   BLUE
				if (!line.startsWith('0x'))
					continue;
				// Get hex value
				const valString=line.substr(2, 4);
				const value=parseInt(valString, 16);
				// Label
				const label=line.substr(9).trim();
				// Add label
				this.addLabelForNumber(value, label);
				continue;
			}
			else {
				// Check for sjasmplus "--lstlab" section
				if (line.startsWith("Value")) {
					// The end of the sjasmplus list file has been reached
					// where the labels start.
					sjasmplusLstlabSection=true;
					continue;
				}
			}

			// Replace line number with empty string.
			line=line.replace(sjasmRegex, '');

			// Check if valid line (not "~")
			// Search for "~". E.g. "8002 ~            Level   defw 4"
			const invalidMatch=/^[0-9a-f]+\s+\~/i.exec(line);
			if (invalidMatch)
				continue;	// Skip line.

			// Extract address.
			let address=parseInt(line.substr(0, 4), 16);
			if (!isNaN(address)) { // isNaN if e.g. the first line: "# File main.asm"
				// compare with previous to find wrap around (if any)

				// 17.2.2020: I disabled this check now because of issue "Debugging with source files is impossible when there are ORGs with non-increasing addresses", https://github.com/maziac/DeZog/issues/8.
				// I can't remember what the use of this was. Could be that it was not for sjasmplus.


				// Check for MODULE
				var matchModuleStart=/^[0-9a-f]+\s+module\s+([^\s]+)/i.exec(line);
				if (matchModuleStart) {
					const moduleName=matchModuleStart[1];
					labelPrefixStack.push(moduleName);
					labelPrefix=labelPrefixStack.join('.')+'.';
					// Init last label
					lastLabel=undefined;
				}
				else {
					// End
					var matchModuleEnd=/^[0-9a-f]+\s+endmodule\b/i.exec(line);
					if (matchModuleEnd) {
						// Remove last prefix
						labelPrefixStack.pop();
						if (labelPrefixStack.length>0)
							labelPrefix=labelPrefixStack.join('.')+'.';
						else
							labelPrefix=undefined;
						// Forget last label
						lastLabel=undefined;
					}
				}

				// Check for labels and "equ". It allows also for @/dot notation as used in sjasmplus.
				const match=labelRegex.exec(line);
				if (match) {
					let label=match[2];
					if (label.startsWith('.')) {
						// local label
						if (lastLabel) // Add Last label
							label=lastLabel+label;
					}
					else {
						// Remember last label (for local labels)
						lastLabel=label;
					}
					const global=match[1];
					if (global==''&&labelPrefix)
						label=labelPrefix+label;	// Add prefix if not global (only sjasmplus)
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
				//line = "80F1 D5 C5";
				const matchBytes=/^[0-9a-f]+((\s+[0-9a-f][0-9a-f])+)/i.exec(line);
				//const matchBytes = /^[0-9a-f]+\s+(([0-9a-f][0-9a-f]\s)+|([0-9a-f][0-9a-f])+)/i.exec(line);
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

				// Store address (or several addresses for one line)
				for (let k=0; k<countBytes; k++) {
					const entry={fileName: '', lineNr: -1-k, addr: address+k, line: origLine, modulePrefix: labelPrefix, lastLabel: lastLabel};
					listFile.push(entry)
				}
			}
			else {
				// Store
				const entry={fileName: '', lineNr: -1, addr: address, line: origLine, modulePrefix: labelPrefix, lastLabel: lastLabel};
				listFile.push(entry)
			}

			// Call line handler (if any)
			lineHandler(address, line, lineNumber);

			// next
			//prev = address
			lineNumber++;
		}  // for listLines
		*/

		// TODO: Try to separate the rest in different functions:

		/**
		 * Creates the list structures to reference files and lines in both directions:
		 * a) get file name and file line number from list-file line number
		 * b) get list-file line number from file name and file line number
		 */
		if (sources.length==0) {
		/*
			// Use list file directly instead of real filenames.
			const relFileName=Utility.getRelFilePath(fileName);
			const lineArray=new Array<number>();
			this.lineArrays.set(relFileName, lineArray);
			const listLength=listFile.length;
			let realLineNr=-1;	// z88dk sometimes suppresses line numbers
			for (var lineNr=0; lineNr<listLength; lineNr++) {
				const entry=listFile[lineNr];
				if (isNaN(entry.addr)) {
					realLineNr++;
					continue;
				}
				if (entry.lineNr==-1)
					realLineNr++;
				entry.fileName=relFileName;
				entry.lineNr=realLineNr;
				this.fileLineNrs.set(entry.addr, {fileName: relFileName, lineNr: realLineNr});

				// Set address
				if (!lineArray[realLineNr]) {	// without the check macros would lead to the last addr being stored.
					lineArray[realLineNr]=entry.addr;
					//console.log('filename='+entry.fileName+', lineNr='+realLineNr+', addr='+Utility.getHexString(entry.addr, 4));
				}
			}
		*/
			this.listFileModeFinish();
			return;
		}

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
		// a) the text "include" is used as indication that a new include
		// file started (can be used for both sjasmplus and z88dk).
		// b1) z88dk: the change of the line number is used as indicator that the
		// include file ended.
		// b2) sjasmplus: the text '# file closed' is used as indication that the
		// include file ended.

		this.parseAllFilesAndLineNumbers();
		/*
		let index=0;
		const stack=new Array<any>();
		const fName=mainFileName||fileName;
		const absFName=Utility.getAbsSourceFilePath(fName, sources);
		const relFileName=Utility.getRelFilePath(absFName);
		stack.push({fileName: relFileName, lineNr: 0});	// Unfortunately the name of the main asm file cannot be determined, so use the list file instead.
		let lineNr=-1;
		for (const entry of this.listFile) {
			lineNr++;
			const line=entry.line;

			// Check for text '# file closed'
			// Check for end of include file
			if (line.startsWith('# file closed:')) {
				// Include ended.
				stack.pop();
				index=stack.length-1;
				// Check for end of file
				if (index<0)
					break;
				// This line doesn't need to be associated with an address
				continue;
			}

			// Get line number
			const matchLineNumber=/^\s*([0-9]+)[\s\+]+(.*)/.exec(line);
			if (!matchLineNumber)
				continue;	// sjasmplus contains lines without line number.
			const lineNumber=parseInt(matchLineNumber[1]);

			// Check for start of include file (sjasmplus and z88dk)
			const remainingLine=matchLineNumber[2];
			const matchInclStart=/^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i.exec(remainingLine);
			if (matchInclStart) {
				const fName=matchInclStart[1];
				const parentFileName=stack[stack.length-1].fileName;
				const dirName=path.dirname(parentFileName);
				const relFName=Utility.getRelSourceFilePath(fName, [dirName, ...sources]);
				stack.push({fileName: relFName, lineNr: 0});
				index=stack.length-1;
			}

			// Associate with right file
			entry.fileName=stack[index].fileName;
			entry.lineNr=(index==0&&!mainFileName)? lineNr:lineNumber-1;
		}
*/

		// Create 2 maps.
		// a) fileLineNrs: a map with all addresses and the associated filename/lineNr
		// b) lineArrays: a map of arrays with key=filename+lineNr and value=address
		// c) labelLocations: A map with key=full label and value=filename/line number.

		this.sourcesModeFinish();
/*
		for (const entry of listFile) {
			if (entry.fileName.length==0)
				continue;	// Skip lines with no filename (e.g. '# End of file')

			// Create label -> file location association
			const lastLabel=entry.lastLabel;
			if (lastLabel) {
				const fullLabel=this.getFullLabel(entry.modulePrefix, lastLabel);
				let fileLoc=this.labelLocations.get(fullLabel);
				if (!fileLoc) {
					// Add new file location
					fileLoc={file: entry.fileName, lineNr: entry.lineNr};
					this.labelLocations.set(fullLabel, fileLoc);
				}
			}

			// last address entry wins:
			this.fileLineNrs.set(entry.addr, {fileName: entry.fileName, lineNr: entry.lineNr, modulePrefix: entry.modulePrefix, lastLabel: entry.lastLabel});

			// Check if a new array need to be created
			if (!this.lineArrays.get(entry.fileName)) {
				this.lineArrays.set(entry.fileName, new Array<number>());
			}

			// Get array
			const lineArray=this.lineArrays.get(entry.fileName)||[];

			// Set address
			if (!lineArray[entry.lineNr]) {	// without the check macros would lead to the last addr being stored.
				lineArray[entry.lineNr]=entry.addr;
				//console.log('filename='+entry.fileName+', lineNr='+entry.lineNr+', addr='+Utility.getHexString(entry.addr, 4));
			}
		}
*/

	}


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
		line=line.replace(this.sjasmRegex, '');

		// Check if valid line (not "~")
		// Search for "~". E.g. "8002 ~            Level   defw 4"
		const invalidMatch=this.invalidLineRegEx.exec(line);
		if (invalidMatch)
			return;	// Skip line.

		// Extract address.
		const address=parseInt(line.substr(0, 4), 16);
		if (!isNaN(address)) { // isNaN if e.g. the first line: "# File main.asm"
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
			const match=this.labelRegex.exec(line);
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
							// Add label
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
			//const matchBytes = /^[0-9a-f]+\s+(([0-9a-f][0-9a-f]\s)+|([0-9a-f][0-9a-f])+)/i.exec(line);
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
	 * The function calls.... TODO
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
		// a) the text "include" is used as indication that a new include
		// file started (can be used for both sjasmplus and z88dk).
		// b1) z88dk: the change of the line number is used as indicator that the
		// include file ended.
		// b2) sjasmplus: the text '# file closed' is used as indication that the
		// include file ended.

		// Check for start of include file
		if (line.startsWith('# file opened:')) {
			// Get file name
			const fname=line.substr(15);
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


