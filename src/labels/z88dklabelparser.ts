//import {readFileSync} from 'fs';
//import {Utility} from '../misc/utility';
//import {Settings} from '../settings';
import * as path from 'path';
//import {Remote} from '../remotes/remotefactory';
//import {LabelsClass, ListFileLine} from './labels';
import {LabelParserBase} from './labelparserbase';
import {Utility} from '../misc/utility';
import {readFileSync} from 'fs';
import {ListFileLine} from './labels';


/**
 * This class parses sjasmplus list files.
 */
export class Z88dkLabelParser extends LabelParserBase {

	/// Map with the z88dk labels/symbols.
	protected z88dkMappings=new Map<string, number>();


	// Constructor.
	//public constructor() {
	//}


	/**
	 * Reads the given file (an assembler .list file) and extracts all PC
	 * values (the first 4 digits), so that each line can be associated with a
	 * PC value.
	 */
	public loadAsmListFile(config: any) {
		//const fileName: string=Utility.getAbsFilePath(config.path);
		const fileName: string=config.path;
		const mainFileName: string|undefined=config.mainFile;
		const sources: Array<string>=config.srcDirs;
		const addOffset: number=config.addOffset||0;
		const z88dkMapFile: string|undefined=config.z88dkMapFile;
		const lineHandler=(address: number, line: string, lineNumber: number) => {};

		/// Array that contains the list file, the associated memory addresses
		/// for each line and the associated real filenames/line numbers, module and lastLabel prefixes.
		const listFile=new Array<ListFileLine>();

		// Read the z88dk map file
		this.readZ88dkMapFile(z88dkMapFile);

		// z88dk: The format is line-number address opcode.
		// I.e. [0-9]+[\s+]+	Note: the + is not required, but I leave it in so I don't have to test it.
		const z88dkRegex=new RegExp(/^[0-9]+[\s+]+/);

		// Regex to find labels
		// Require a ":"" after the label
		const labelRegex=new RegExp(/^[0-9a-f]+[\s0-9a-f]*\s+>?(@?)([^;\s0-9][^;\s]*):\s*(equ\s|macro\s)?\s*([^;\n]*)/i);

		// Read all lines and extract the PC value
		let listLines=readFileSync(fileName).toString().split('\n');
		let line;
		let lineNumber=0;
		let z88dkMapOffset=0;
		//let dbgLineNr = 0;
		for (let origLine of listLines) {
			//	dbgLineNr ++;
			let countBytes=1;
			line=origLine;

			// Replace line number with empty string.
			line=line.replace(z88dkRegex, '');

			// Extract address.
			const readAddress=parseInt(line.substr(0, 4), 16);
			let address=readAddress+addOffset+z88dkMapOffset;
			if (!isNaN(address)) { // isNaN if e.g. the first line: "# File main.asm"
				// compare with previous to find wrap around (if any)

				// 17.2.2020: I disabled this check now because of issue "Debugging with source files is impossible when there are ORGs with non-increasing addresses", https://github.com/maziac/DeZog/issues/8.
				// I can't remember what the use of this was. Could be that it was not for sjasmplus.
				/*
				if(address < prev) {
					base += 0x10000;
					address += 0x10000;
				}
				*/

				// Check for labels and "equ". It allows also for @/dot notation as used in sjasmplus.
				const match=labelRegex.exec(line);
				if (match) {
					let label=match[2];
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
								this.numberForLabel.set(label, value);
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
							z88dkMapOffset=realAddress-readAddress;
							address=realAddress;
						}
						// Label: add to label array
						this.numberForLabel.set(label, address);
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
					const entry={fileName: '', lineNr: -1-k, addr: address+k, line: origLine};
					listFile.push(entry)
				}
			}
			else {
				// Store
				const entry={fileName: '', lineNr: -1, addr: address, line: origLine};
				listFile.push(entry)
			}

			// Call line handler (if any)
			lineHandler(address, line, lineNumber);

			// Next
			lineNumber++;
		}  // for listLines

		/**
		 * Creates the list structures to reference files and lines in both directions:
		 * a) get file name and file line number from list-file line number
		 * b) get list-file line number from file name and file line number
		 */

		if (sources.length==0) {
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
			return;
		}

		// z88dk:
		// Starts with the line numbers of the include file.
		// 3     0000
		// 4     0000              include "constants.inc"
		// 1     0000              ; Constant definitions.
		// 2     0000
		// 3     0000              ; Printing text
		//
		// Note:
		// a) the text "include" is used as indication that a new include
		// file started (can be used for both sjasmplus and z88dk).
		// b1) z88dk: the change of the line number is used as indicator that the
		// include file ended.
		// b2) sjasmplus: the text '# file closed' is used as indication that the
		// include file ended.

		let index=0;
		const stack=new Array<any>();
		const fName=mainFileName||fileName;
		const absFName=Utility.getAbsSourceFilePath(fName, sources);
		const relFileName=Utility.getRelFilePath(absFName);
		stack.push({fileName: relFileName, lineNr: 0});	// Unfortunately the name of the main asm file cannot be determined, so use the list file instead.
		let expectedLine;	// The current line and the next lines are tested. for macros the line number does not increase.
		for (var lineNr=0; lineNr<listFile.length; lineNr++) {
			const line=listFile[lineNr].line;
			if (line.length==0)
				continue;

			// Get line number
			const matchLineNumber=/^\s*([0-9]+)[\s\+]+(.*)/.exec(line);
			if (!matchLineNumber)
				continue;	// z88dk contains lines without line number.
			lineNumber=parseInt(matchLineNumber[1]);

			// z88dk: Check for end of include file
			if (expectedLine
				&&lineNumber!=expectedLine
				&&lineNumber!=expectedLine+1) {
				// End of include found
				// Note: this is not 100% error proof.
				// E.g. if modules are used (speccytron) this happesn also after the MODULE lines:
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
				if (stack.length>1) {
					stack.pop();
					index=stack.length-1;
				}
			}

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
				expectedLine=undefined;
			}
			else {
				expectedLine=lineNumber;	// Is only of interest for z88dk
			}

			// Associate with right file
			listFile[lineNr].fileName=stack[index].fileName;
			listFile[lineNr].lineNr=(index==0&&!mainFileName)? lineNr:lineNumber-1;
		}

		// Create 2 maps.
		// a) fileLineNrs: a map with all addresses and the associated filename/lineNr
		// b) lineArrays: a map of arrays with key=filename+lineNr and value=address
		// c) labelLocations: A map with key=full label and value=filename/line number.
		for (const entry of listFile) {
			if (entry.fileName.length==0)
				continue;	// Skip lines with no filename (e.g. '# End of file')

			// last address entry wins:
			this.fileLineNrs.set(entry.addr, {fileName: entry.fileName, lineNr: entry.lineNr});

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

	}


	/**
	 * As all addresses in a
	 * z88dk list file are relative/starting at 0, the map file
	 * is necessary to obtain right addresses.
	 * The z88dk map file looks like this:
	 * print_number_address            = $1A1B ; const, local, , , , constants.inc:5
	 * AT                              = $0016 ; const, local, , , , constants.inc:6
	 * @param z88dkMapFile The relative path to the map file.
	 */
	protected readZ88dkMapFile(z88dkMapFile) {
		if (!z88dkMapFile)
			return;
		// Get absolute path
		z88dkMapFile=Utility.getAbsFilePath(z88dkMapFile);

		// Iterate over map file
		const regex=new RegExp(/^(\w*)\b\s*=\s*\$([0-9a-f]+)/i);
		let lines=readFileSync(z88dkMapFile).toString().split('\n');
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

