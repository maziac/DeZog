import {readFileSync} from 'fs';
import {AsmConfigBase, SjasmplusConfig} from '../settings';
import {LabelParserBase} from './labelparserbase';


/**
 * This class parses sjasmplus sld file.
 * SLD stands for Source Level Debugging.
 * 'SLD data are extra "tracing" data produced during assembling for debuggers and IDEs,
 * similar to "map" files already supported by sjasmplus (LABELSLIST and CSPECTMAP).
 * The debugger can read these data, and with non-tricky source producing machine code
 * with correct device memory mapping, the debugger can trace the origins of every
 * instruction back to the original source code line, and display the source instead/along
 * the disassembly view (the "map" files mentioned above provide only list of labels which
 * is usually already super helpful, but can't track the source origins of each instruction).'
 * See https://z00m128.github.io/sjasmplus/documentation.html#idp10
 *
 * A few notes:
 * - numberForLabel and labelsForNumber will normally only get 64k
 *   addresses/values (unless an EQU is by itself bigger than 0xFFFF.
 * - fileLineNrs and lineArrays will get potentially long address.
 *   I.e. their value is either a normal 64k address or a long address
 *   with bank number.
 *
 */
export class SjasmplusSldLabelParser extends LabelParserBase {

	// <source file>|<src line>|<definition file>|<def line>|<page>|<value>|<type>|<data>
	// Format example:
	// |SLD.data.version|0
	// main.asm|5||0|-1|1|D|NEX
	// main.asm|10||0|-1|-1|Z|pages.size: 8192, pages.count: 224, slots.count: 8, slots.adr: 0, 8192, 16384, 24576, 32768, 40960, 49152, 57344
	// main.asm|15||0|11|24576|F|screen_top
	// utilities.asm|7||0|-1|500|D|PAUSE_TIME
	// utilities.asm|11||0|11|24577|F|pause

	// The number of used slots.
	//protected shiftBits=3;

	// The used bank size.
	protected bankSize: number;	// will be overwritten

	// The number of bits to shift to get the slot number from the address.
	//protected shiftBits: number;	// will be overwritten

	/**
	 * Tests if the given file is an SLD file.
	 * Is used only to distinguish between parsing of a list file or parsing of an SLD file.
	 * @param path Absolute path.
	 */
	public static IsSldFile(path: string) {
		const content=readFileSync(path);
		// Check only if it starts with a '|' for an sld file.
		const firstChar=content[0];
		const sld=(firstChar=='|'.charCodeAt(0));
		return sld;
	}


	/**
	 * Reads the given sld file.
	 * As the SLD file is easy to read only one pass is required.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		this.config=config;
		const sldConfig=this.config as SjasmplusConfig;
		// Init (in case of several sld files)
		this.lastLabel=undefined as any;
		this.bankSize=0x10000;	// will be overwritten
		//this.shiftBits=0;	// will be overwritten

		// Get bank size
		const sldLines=readFileSync(sldConfig.path).toString().split('\n');
		this.parseForBankSize(sldLines);

		// Loop through all lines of the sld file
		for (const line of sldLines) {
			this.parseFileLabelAddress(line);
		}
	}


	/**
	 * Parses the complete file to get the bank size.
	 */
	protected parseForBankSize(lines: Array<string>) {
		for (const line of lines) {
			// Split the fields, e.g. "main.asm|3||0|-1|-1|Z|pages.size: 16384, pages.count: 8, slots.count: 4, slots.adr: 0, 16384, 32768, 49152"
			const fields=line.split('|');

			// Check for right type
			const type=fields[6];
			if (type=='Z') {
				// Parse bank size
				const data=fields[7];
				// Delete anything not a number or ,
				const numberString=data.replace(/[^0-9,]/g, '');
				// Interprete only the first number
				this.bankSize=parseInt(numberString);
				//const count=0x10000/this.bankSize;
				//this.shiftBits=
				// No need to seek any further
				break;
			}
		}
	}


	/**
	 * Parses one line for label, address, file and line number.
	 * Parses one line of the SLD file.
	 * @param line The current analyzed line of the SLD file.
	 */
	protected parseFileLabelAddress(line: string) {
		// Split the fields, e.g. "main.asm|15||0|11|24576|F|screen_top"
		const fields=line.split('|');

		// Get filename
		const sourceFile=fields[0];
		// Check for comment or SLD.data.version
		if (sourceFile=='')
			return;

		// Definition file/line not required

		// Get page (bank) (-1 if not a memory address)
		const page=parseInt(fields[4]);
		// Get value
		let value=parseInt(fields[5]);
		// Note: An EQU could have a value bigger than 0xFFFF

		// Get type
		const type=fields[6];

		// Get label
		const label=fields[7];

		// Check data type
		switch (type) {
			case 'F': // Address labels (functions)
				// Check if not local label
				if(!label.startsWith((this.lastLabel||'')+'.'))
					this.lastLabel=label;
			case 'D': // EQU
				{
					// Label: add to label array
					this.numberForLabel.set(label, value);
					// Add label
					let labelsArray=this.labelsForNumber[value];
					//console.log("labelsArray", labelsArray, "value=", value);
					if (labelsArray==undefined) {
						// create a new array
						labelsArray=new Array<string>();
						this.labelsForNumber[value]=labelsArray;
					}
					// Add new label
					labelsArray.push(label);

					// Add label a 2nd time with the long address.
					// This is used to get the label from the call stack value.
					const longValue=this.createLongAddress(value, page);
					// Add label
					let labelsArrayLong=this.labelsForNumber[longValue];
					//console.log("labelsArray", labelsArray, "value=", value);
					if (labelsArrayLong==undefined) {
						// create a new array
						labelsArrayLong=new Array<string>();
						this.labelsForNumber[longValue]=labelsArrayLong;
					}
					// Add new label
					labelsArrayLong.push(label);
				}
				break;
			case 'T':	// Instruction trace data
				{
					// Change value to contain page info
					const address=this.createLongAddress(value, page);

					// Get line number
					const lineNr=parseInt(fields[1])-1;

					// Store values to associate address with line number
					this.fileLineNrs.set(address, {
						fileName: sourceFile,
						lineNr: lineNr,
						modulePrefix: undefined,
						lastLabel: this.lastLabel
					});

					// Check if a new array need to be created
					let lineArray=this.lineArrays.get(sourceFile);
					if (!lineArray) {
						lineArray=new Array<number>();
						this.lineArrays.set(sourceFile, lineArray);
					}
					// Store
					lineArray[lineNr]=address;
				}
				break;
			case 'K':	// A comment, e.g. WPMEM, ASSERTION and LOGPOINT
				{
					// Get address
					const address=this.createLongAddress(value, page);
					this.findWpmemAssertionLogpoint(address, line);
				}
				break;

		}
	}


	/**
	 * Creates a long address from the address and the page info.
	 * If page == -1 address is returned unchanged.
	 * @param address The 64k address, i.e. the upper bits are the slot index.
	 * @param page The page the address is associated with.
	 * @returns if bankSize: address+((page+1)<<16)
	 * else: address.
	 */
	protected createLongAddress(address: number, page: number) {
		let result=address;
		if (this.bankSize!=0)
			result+=(page+1)<<16;
		return result;
	}

}


