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
 * Anyhow what the SLD file is missing is the WPMEM, ASSERT and LOGPOINT info.
 * For this we still need the list file.
 * That's why both files are required for parsing.
 * The list file does not require an --lstlab option.
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



	/**
	 * Reads the given sld file.
	 * As the SLD file is easy to read only one pass is required.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		this.config=config;
		const sldConfig=this.config as SjasmplusConfig;
		// Init (in case of several sld files)
		this.lastLabel=undefined as any;

		// Loop through all lines of the sld file
		const sldLines=readFileSync(sldConfig.sldPath!).toString().split('\n');
		for (const line of sldLines) {
			this.parseFileLabelAddress(line);
		}

		// Loop through all lines of the list file
		// TODO: Parse WPMEM etc.
		/*
		const listLines=readFileSync(this.config.path).toString().split('\n');
		for (const line of listLines) {
			this.parseFileLabelAddress(line);
		}
		*/
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
		const value=parseInt(fields[5]);
		// Get type
		const type=fields[6];

		// Get label
		const label=fields[7];

		// Change value and page info to address
		page;
		const address=value;	// TODO: change according page


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
				}
				break;
			case 'T':	// Instruction trace data
				{
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
						this.lineArrays.set(sourceFile, new Array<number>());
					}
					// Store
					lineArray[lineNr]=address;
				}
				break;
			case 'Z':	// Device model
				{
				}
				break;
		}
	}

}


