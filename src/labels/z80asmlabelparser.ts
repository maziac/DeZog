//import {readFileSync} from 'fs';
import {Utility} from '../misc/utility';
//import {Settings} from '../settings';
//import * as path from 'path';
//import {Remote} from '../remotes/remotefactory';
//import {LabelsClass, ListFileLine} from './labels';
import {LabelParserBase} from './labelparserbase';
import {readFileSync} from 'fs';
import {ListFileLine} from './labels';


/**
 * This class parses sjasmplus list files.
 */
export class Z80asmLabelParser extends LabelParserBase {
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
		const sources: Array<string>=config.srcDirs;
		const addOffset: number=config.addOffset||0;
		const lineHandler=(address: number, line: string, lineNumber: number) => {};

		/// Array that contains the list file, the associated memory addresses
		/// for each line and the associated real filenames/line numbers, module and lastLabel prefixes.
		const listFile=new Array<ListFileLine>();


		// Regex to find labels
		// Require a ":"" after the label
		const labelRegex=new RegExp(/^[0-9a-f]+[\s0-9a-f]*\s+>?(@?)([^;\s0-9][^;\s]*):\s*(equ\s|macro\s)?\s*([^;\n]*)/i);

		// Read all lines and extract the PC value
		let listLines=readFileSync(fileName).toString().split('\n');
		let line;
		let lineNumber=0;
		let lastLabel;
		//let dbgLineNr = 0;
		for (let origLine of listLines) {
			//	dbgLineNr ++;
			let countBytes=1;
			line=origLine;

			// Extract address.
			const readAddress=parseInt(line.substr(0, 4), 16);
			let address=readAddress+addOffset;
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
					lastLabel=label;
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
					const entry ={fileName: '', lineNr: -1-k, addr: address+k, line: origLine, lastLabel};
					listFile.push(entry)
				}
			}
			else {
				// Store
				const entry={fileName: '', lineNr: -1, addr: address, line: origLine, lastLabel};
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

		// z80asm
		// Loop the list array reverse
		let index=-1;
		const stack=new Array<any>();

		for (var lineNr=listFile.length-1; lineNr>0; lineNr--) {
			const line=listFile[lineNr].line;
			// check for end macro
			const matchMacroEnd=/^# End of macro\s+(.*)/.exec(line);
			if (matchMacroEnd) {
				const macroName=matchMacroEnd[1];
				const startLine=this.searchStartOfMacro(macroName, lineNr, listFile);
				// skip all lines, i.e. all lines get same line number
				for (var i=startLine; i<lineNr; ++i) {
					listFile[i].fileName=stack[index].fileName;
					listFile[i].lineNr=stack[index].lineNr;
				}
				// skip
				lineNr=startLine;
				// next line
				stack[index].lineNr--;
				continue;
			}

			// check for end of file
			const matchFileEnd=/^# End of file\s+(.*)/.exec(line);
			if (matchFileEnd) {
				const fileName=matchFileEnd[1];
				const absFName=Utility.getAbsSourceFilePath(fileName, sources);
				const relFName=Utility.getRelFilePath(absFName);
				// put on top of stack
				++index;
				stack.push({fileName: fileName, relFileName: relFName, lineNr: 0});
			}

			// check for start of include file
			var matchInclStart=/^[0-9a-f]+\s+include\s+\"([^\s]*)\"/i.exec(line);
			if (matchInclStart) {
				// Note: Normally filenames match, but if they don't match then
				// it might be because the file hasn't been included. Maybe it was
				// #if-def'ed.
				if (index>=0) {	// This could be < 0 if the 'end of file' was not found
					const fileName=matchInclStart[1];
					if (fileName.valueOf()==stack[index].fileName.valueOf()) {
						// Remove from top of stack
						stack.pop();
						--index;
					}
				}
			}

			// associate line
			if (index>=0) {
				// Associate with right file
				const oldLineNr=listFile[lineNr].lineNr;
				listFile[lineNr].fileName=stack[index].relFileName;
				listFile[lineNr].lineNr=stack[index].lineNr;
				// next line
				if (oldLineNr==-1)
					stack[index].lineNr--;
			}
			else {
				// no association
				listFile[lineNr].fileName='';
				listFile[lineNr].lineNr=0;
			}
		}

		// Now correct all line numbers (so far the numbers are negative. All numbers need to be added with the max number of lines for that file.)
		let lastFileName='';
		let lastFileLength=0;
		const fileLength=new Map<string, number>();
		for (let i=0; i<listFile.length; ++i) {
			const entry=listFile[i];
			if (lastFileName.valueOf()!=entry.fileName.valueOf()) {
				lastFileName=entry.fileName;
				// change in file name, check if it has been used already
				if (!fileLength[lastFileName]) {
					fileLength[lastFileName]=-entry.lineNr;
				}
				// use length
				lastFileLength=fileLength[lastFileName];
			}
			// change line number
			listFile[i].lineNr+=lastFileLength;
		}


		// Create 2 maps.
		// a) fileLineNrs: a map with all addresses and the associated filename/lineNr
		// b) lineArrays: a map of arrays with key=filename+lineNr and value=address
		// c) labelLocations: A map with key=full label and value=filename/line number.
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
	 * Searches for the start of a macro.
	 * @param macroName The name of the macro to search for.
	 * @param startSearchLine Here the search begins. Search is done upwards.
	 * @param listFile Array with lines of the file.
	 * @return The found line number or startSearchLine if nothing found (should not happen).
	 */
	protected searchStartOfMacro(macroName: string, startSearchLine: number, listFile: Array<ListFileLine>): number {
		const macroRegex=new RegExp("[0-9a-fA-F]+\\s+"+macroName+"\\s+.*");
		var k=startSearchLine;
		for (; k>0; --k) {
			const line2=listFile[k].line;
			const matchMacroStart=macroRegex.exec(line2);
			if (matchMacroStart)
				return k;	// macro start found
		}
		// Nothing found (should not happen)
		return startSearchLine;
	}

}

