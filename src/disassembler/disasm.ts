//import * as util from 'util';
import * as assert from 'assert';
import { DelayedLog } from './delayedlog';
import { MAX_MEM_SIZE } from './basememory';
import { Memory, MemAttribute } from './memory';
import { Opcode, OpcodeFlag } from './opcode';
import { NumberType, getNumberTypeAsString } from './numbertype'
import { DisLabel } from './dislabel';
import { Comment } from './comment';
import { SubroutineStatistics } from './statistics';
import { EventEmitter } from 'events';
import { Format } from './format';
import { readFileSync } from 'fs';



/**
 * The main Disassembler class.
 */
export class Disassembler extends EventEmitter {

	/// A function that can be set to assign other than the standard
	/// label names.
	public funcAssignLabels: (address: number) => string;

	/// The memory area to disassemble.
	public memory = new Memory();

	/// The labels.
	public labels: Map<number,DisLabel>;

	/// The reverted labels map. Created when a callgraph is output.
	protected revertedLabelMap: Map<string, number>;

	/// Temporarily offset labels. Just an offset number of the address of the real label.
	protected offsetLabels: Map<number,number>;

	/// Here the association from an address to it's parent, i.e. the subroutine it
	// belongs to is stored for each address.
	protected addressParents: Array<DisLabel>;

	/// Queue for start addresses only addresses of opcodes
	protected addressQueue = new Array<number>();

	// Used for (user) comments for labels (addresses).
	protected addressComments = new Map<number, Comment>();

	/// Map for statistics (size of subroutines, cyclomatic complexity)
	protected subroutineStatistics = new Map<DisLabel, SubroutineStatistics>();

	/// The statistics maximum
	protected statisticsMax: SubroutineStatistics = { sizeInBytes:0, countOfInstructions: 0, CyclomaticComplexity: 0 };

	/// The statistics minimum
	protected statisticsMin: SubroutineStatistics = { sizeInBytes:Number.MAX_SAFE_INTEGER, countOfInstructions: Number.MAX_SAFE_INTEGER, CyclomaticComplexity: Number.MAX_SAFE_INTEGER };

	/// Labels that should be marked (with a color) are put here. String contains the color of the label for the dot graphic.
	protected dotMarkedLabels = new Map<number|string, string>();

	// dot-color for warning-marks for labels.
	protected dotWarningMark = 'lightblue';

	/// Choose opcodes in lower or upper case.
	public opcodesLowerCase = true;

	/// Choose how many lines should separate code blocks in the disassembly listing
	public numberOfLinesBetweenBlocks = 2;

	/// Choose if references should be added to SUBs
	public addReferencesToSubroutines = true;

	/// Choose if references should be added to LBLs
	public addReferencesToAbsoluteLabels = true;

	/// Choose if references should be added to RST labels
	public addReferencesToRstLabels = true;

	/// Choose if references should be added to DATA labels
	public addReferencesToDataLabels = true;

	/// Choose to add the opcode bytes also, e.g. "CB 01" for "RLC C"
	public addOpcodeBytes = true;

	/// Label prefixes
	public labelSubPrefix = "SUB";
	public labelLblPrefix = "LBL";
	public labelRstPrefix = "RST";
	public labelDataLblPrefix = "DATA";
	public labelSelfModifyingPrefix = "SELF_MOD";	// I guess this is not used anymore if DATA_LBL priority is below CODE_LBLs
	public labelLocalLablePrefix = "_l";
	public labelLoopPrefix = "_loop";

	public labelIntrptPrefix = "INTRPT";


    /// If set the disassemble will automatically add address 0 or the SNA address to the labels.
	public automaticAddresses = true;


	/// Column areas. e.g. area for the bytes shown before each command
	public clmnsAddress = 5;		///< size for the address at the beginning of each line. If 0 no address is shown.
	public clmnsBytes = 4*3 + 1;	///< 4* length of hex-byte
	public clmnsOpcodeFirstPart = 4 + 1;	///< First part of the opcodes, e.g. "LD" in "LD A,7"
	public clmsnOpcodeTotal = 5 + 6 + 1;		///< Total length of the opcodes. After this an optional comment may start.


	// Dot format options for the node. E.g. "${label}\n${address}\nCC=${CC}\nSize=${size}\ninstr=${instructions}\n"
	public dotFormatString = "rankdir=TB;";	// Graph direction

	// Dot format options for the node. E.g. "${label}\n${address}\nCC=${CC}\nSize=${size}\ninstr=${instructions}\n"
	public nodeFormatString = "${label}\\n0x${address}\\nSize=${size}\\n";

	/// RST addresses that shouldn't be followed on a disassembly.
	/// Note: It can happen that code around ORG 0000h has to be disassembled.
	/// But at the same time the ESXDOS RST 8 is used for file handling.
	/// This is a hardwired RST. It does not exist in ROM.
	/// RST addresses that appear in this list will not be followed/disassembled.
	public rstDontFollowAddresses = new Array<number>();

	/// An array that either contains label names or addresses,
	/// but both as string. If defined only the labels inside this
	/// list are used for the dot graphics.
	public graphLabels = new Array<string|number>();

	/// The disassembled lines.
	protected disassembledLines: Array<string>;

	// The SNA start address.
	protected snaStartAddress = -1;

	/// Used to prohibit that empty lines are written more than once.
	protected emptyLinesWritten = false;

	/// For debugging:
	protected DBG_COLLECT_LABELS = false;	//true;

	/// Add decimal conversion to addresses (at beginning of line)
	protected DBG_ADD_DEC_ADDRESS = false; //true;

	// Warnings

	/// true = disable warning when trying to disassemble unassigned memory.
	/// will be set to true automatically if SNA has been selected.
	protected no_warning_disassemble_unassigned_memory = false;


	// For DeZog. Used to turn off any comments in the disassembled text.
	public disableCommentsInDisassembly=false;


	/**
	 * Initializes the Opcode formatting.
	 */
	constructor() {
		super();
		this.initLabels();
		Opcode.setConvertToLabelHandler(value => {
			let valueName;
			let label;
			let offsString = '';
			if(this.labels)
				label = this.labels.get(value);
			if(!label) {
				// Check for offset label
				const offs = this.offsetLabels.get(value);
				if(offs) {
					label = this.labels.get(value+offs);
					if(label)
						offsString = (offs > 0) ? ''+(-offs) : '+'+(-offs);
				}
			}
			if(label)
				valueName = label.name + offsString;
			return valueName;
		});
	}

	/**
	 * Adds address 0 to the labels if it has not been added already
	 * or the SNA address.
	 */
	public addAutomaticAddresses() {
		if(!this.automaticAddresses)
			return;

		// If a SNA address is already given, omit address 0
		if(this.snaStartAddress >= 0) {
			// Use sna address
			this.addressQueue.push(this.snaStartAddress);
		}
		else {
			// Use address 0.
			// Check for code label at address 0.
			if(this.memory.getAttributeAt(0) & MemAttribute.ASSIGNED) {
				// Check if label exists
				let label0 = this.labels.get(0);
				if(!label0) {
					this.setFixedCodeLabel(0, 'ORG_0000');
				}
				else {
					// Make sure it is a code label
					label0.type = NumberType.CODE_LBL;
				}
				this.addressQueue.push(0);	// Note: if address 0 was already previously pushed it is now pushed again. But it doesn't harm.
			}
		}
	}


	/**
	 * Returns the disassembled lines as an array of strings.
	 * Make sure to run 'disassemble' beforehand.
	 */
	public getDisassemblyLines(): string[] {
		if(!this.disassembledLines) {
			this.emit('warning', 'No disassembly was done.');
			return [''];
		}
		return this.disassembledLines;
	}


	/**
	 * Returns the disassembled lines as a string.
	 * Make sure to run 'disassemble' beforehand.
	 */
	public getDisassemblyText(): string {
		return this.getDisassemblyLines().join('\n');
	}


	/**
	 * Disassembles the  memory area.
	 * Disassembly is done in a few passes.
	 * Afterwards the disassembledLines are set:
	 * An array of strings with the disassembly.
	 */
	public disassemble() {
        // Add address 0
		this.addAutomaticAddresses();

		// Collect labels
		this.collectLabels();

		// Find interrupts
		this.findInterruptLabels();

		// Add special labels, e.g. the start of a ROM
		this.setSpecialLabels();

		// Sort all labels by address
		this.sortLabels();

		// Find self-modifying code
		this.adjustCodePointingLabels();

		// Add more references if e.g. a SUB flows through to another SUB.
		this.addFlowThroughReferences();

		// Check if labels "LBL" are subroutines
		this.turnLBLintoSUB();

		// Determine local labels inside subroutines
		this.findLocalLabelsInSubroutines();

		// Add parent references to each address and remove self referenced labels
		this.addParentReferences();

		// Add 'calls' list to subroutine labels
		this.addCallsListToLabels();

		// Count statistics (size of subroutines, cyclomatic complexity)
		this.countStatistics();

		// Assign label names
		this.assignLabelNames();

		// Add label comments
		if (!this.disableCommentsInDisassembly)
			this.addLabelComments();


		// Disassemble opcode with label names
		const disLines = this.disassembleMemory();

		// Add all EQU labels to the beginning of the disassembly
		this.disassembledLines = this.getEquLabelsDisassembly();

		// Add the real disassembly
		this.disassembledLines.push(...disLines);

		// Remove any preceeding empty lines
		while(this.disassembledLines.length) {
			if(this.disassembledLines[0].length > 0)
				break;
				this.disassembledLines.splice(0,1);
		}
	}


	/**
	 * Define the memory area to disassemble.
	 * @param origin The start address of the memory area.
	 * @param memory The memory area.
	 */
	public setMemory(origin:number, memory: Uint8Array) {
		this.memory.setMemory(origin, memory);
		// Set start label
		//this.setLabel(origin, 'BIN_START_'+origin, NumberType.DATA_LBL);
		//const size = memory.length;
		//this.setLabel(origin+size, 'BIN_END_'+origin, NumberType.DATA_LBL);
	}


	/**
	 * Reads a memory area as binary from a file.
	 * @param origin The start address of the memory area.
	 * @param path The file path to a binary file.
	 */
	public readBinFile(origin: number, path: string) {
		const bin = readFileSync(path);
		this.setMemory(origin, bin);
	}

	/**
	 * Reads a .sna (ZX snapshot) file directly. Takes the start address from the .sna file.
	 * @param path The file path to a binary file.
	 */
	public readSnaFile(path: string) {
		let sna = readFileSync(path);
		const header = sna.slice(0, 27);
		const bin = sna.slice(27);
		// Read start address
		const sp = header[23] + 256*header[24];	// Stackpointer
		const spIndex = sp-0x4000;
		const start = bin[spIndex] + 256*bin[spIndex+1];	// Get start address from stack
		this.setMemory(0x4000, bin);

		/* In most cases (snapshot) this is a random address, so it does not make sense to use it as a label:
		// Set start label
		this.setLabel(start, 'SNA_LBL_MAIN_START_'+start.toString(16).toUpperCase(), NumberType.CODE_LBL);
		*/
		this.snaStartAddress = start;
		// Disable warnings when trying to disassemble unassigned memory:
		// SNA files don't contain the Spectrum ROM, it is clear that this will result in  warnings.
		this.no_warning_disassemble_unassigned_memory = true;
	}


	/**
	 * Clears all labels collected so far.
	 * Useful for dot generation of a particular subroutine.
	 */
	public clearLabels() {
		// get new arrays/maps.
		this.labels = new Map<number,DisLabel>();
		this.offsetLabels = new Map<number,number>();
		this.addressQueue = new Array<number>();
		// ? Maybe the address Parents are missing here.
	}


	/**
	 * Clears all labels.
	 * Is done at start of disassembly.
	 */
	public initLabels() {
		// get new arrays/maps.
		this.labels = new Map<number,DisLabel>();
		this.offsetLabels = new Map<number,number>();
		this.addressParents=new Array<DisLabel>();
		this.addressComments=new Map<number, Comment>();
	}


	/**
	 * You can set one (or more) initial labels here.
	 * At least one label should be set, so that the disassembly
	 * algorithm knows where to start from.
	 * More labels could be set e.g. to tell where the interrupt starts at.
	 * Optionally a name for the label can be given.
	 * @param address The address of the label.
	 * @param name An optional name for the label.
	 * @param type of the label. Default is CODE_LBL.
	 */
	public setLabel(address: number, name?: string, type = NumberType.CODE_LBL) {
		// Check if label already set.
		let label = this.labels.get(address);
		if(label) {
			// Exists already, just overwrite the name
			if(!label.name || !label.isFixed)	// Don't overwrite names given for fixed addresses.
				(label.name as any) = name;
			return;
		}

		// Create a new label
		label = new DisLabel(type);
		this.labels.set(address, label);
		(label.name as any) = name;	// allow undefined
		// Check if out of range
		const attr = this.memory.getAttributeAt(address);
		if(attr & MemAttribute.ASSIGNED) {
			if(type == NumberType.CODE_LBL
				|| type == NumberType.CODE_LOCAL_LBL
				|| type == NumberType.CODE_LOCAL_LOOP
				|| type == NumberType.CODE_RST
				|| type == NumberType.CODE_SUB
			)
				this.addressQueue.push(address);
		}
		else {
			// out of range -> EQU
			label.isEqu = true;
		}
	}


	/**
	 * Used to set a label as the user.
	 * I.e. those labels should be fixed, i.e. not changable by the algorithm.
	 * Note: this affects only the change of the type. The name is anyhow not changed if it
	 * has been set by the user.
	 * @param address
	 * @param name
	 */
	public setFixedCodeLabel(address: number, name?: string) {
		// Check if label already set.
		let label = this.labels.get(address);
		if(!label) {
			// Create new label
			label = new DisLabel(NumberType.CODE_LBL);
			this.labels.set(address, label);
		}

		// Set name
		if(name)
			(label.name as any) = name;
		// Check if out of range
		const attr = this.memory.getAttributeAt(address);
		if(attr & MemAttribute.ASSIGNED)
			this.addressQueue.push(address);
		else
			label.isEqu = true;	 // out of range -> EQU
		// Set as fixed
		label.isFixed = true;
	}


	/**
	 * Sets a new address queue.
	 * @param queue The new queue.
	 */
	public setAddressQueue(queue: number[]) {
		this.addressQueue = queue;
	}


	/**
	 * Adds the addresses from a call table (in memory) to the labels.
	 * @param address Address of the start of the call table.
	 * @param count The number of jmp addresses.
	 */
	public setJmpTable(address: number, count: number) {
		// Loop over all jmp addresses
		for(let i=0; i<count; i++) {
			// Get address
			let jmpAddress = this.memory.getWordValueAt(address);
			// Set label
			this.setFixedCodeLabel(jmpAddress);
			// Next
			address += 2;
		}
	}


	/**
	 * Reads a MAME .tr (trace) file.
	 * MAME trace files contain the opcode addresses of a run of the program.
	 * These are used as starting points for the disassembly.
	 * If a trace file is given it is normally not required to give additional
	 * label info like start of the program or start of the interrupt rsubroutine.
	 * @param path The file path to the trace (.tr) file. (An ASCII file).
	 * Trace files can become very big, a few seconds already result in MB of data.
	 */
	public useMameTraceFile(path: string) {
		const trace = readFileSync(path).toString();
		if(trace.length < 5)
			return;
	/* Doesn't make sense:
		// Use first address as start address
		const startAddress = trace.substr(0,5);
		this.setLabel(parseInt(startAddress, 16), 'TR_LBL_MAIN_START_'+ startAddress);
	*/
		// Loop over the complete trace file
		const buffer = new Array<boolean>(MAX_MEM_SIZE);	// initialized to undefined
		let k = 0;
		let jpHlRef;
		//let lineNr = 1;
		do {
			//const text = trace.substr(k,100);
			//console.log('log: "' + text + '"');
			const addressString = trace.substr(k,5);
			if(addressString.length == 5 && addressString[4] == ':') {
				// Use address
				const addr = parseInt(addressString, 16);
				buffer[addr] = true;
				k += 5;
				// Check if previous opcode was a 'jp (hl)'
				const memAttr = this.memory.getAttributeAt(addr);
				if(jpHlRef) {
					// If so: add a label with a reference
					this.setFoundLabel(addr, new Set([jpHlRef]), NumberType.CODE_LBL, memAttr);
					jpHlRef = undefined;
				}
				// check if opcode is a "jp (hl)"
				if(memAttr & MemAttribute.ASSIGNED) {
					const opcodeString = trace.substr(k,10);
					if(opcodeString == ' jp   (hl)') {
						// remember address
						jpHlRef = addr;
						k += 10;
					}
				}
			}
			// next
			k = trace.indexOf('\n', k) + 1;
			//lineNr ++;
		} while(k != 0);
		// Now add the addresses to the queue
		for(let addr=0; addr<MAX_MEM_SIZE; addr++) {
			if(buffer[addr])
				this.addressQueue.push(addr);
		}
	}


	/**
	 * Prints all labels to the console.
	 */
	/*
	public printLabels() {
		for(let [address, label] of this.labels) {
			// Label
			console.log('0x' + address.toString(16) + ': ' + label.name + ', ' +  label.getTypeAsString() + ', EQU=' + label.isEqu);
			// References
			const refArray = label.references.map(value => '0x'+value.toString(16));
			console.log('\tReferenced by: ' + refArray.toString() );
		}
	}
	*/

	/**
	 * Puts all EQU labels in an array of strings.
	 * @returns Array of strings.
	 */
	public getEquLabelsDisassembly(): Array<string> {
		let firstLabel = true;
		const lines = new Array<string>();
		for(let [address, label] of this.labels) {
			// Check if EQU
			if(label.isEqu) {
				if (firstLabel) {
					if (!this.disableCommentsInDisassembly) {
						// At the start of the EQU area print a comment.
						lines.push('; EQU:');
						lines.push('; Data addresses used by the opcodes that point to uninitialized memory areas.');
					}
					firstLabel = false;
				}
				// "Disassemble"
				const statement =  Format.addSpaces(label.name+':', this.clmnsBytes-1) + ' ' + this.rightCase('EQU ') + Format.fillDigits(Format.getHexString(address,4), ' ', 5) +'h';
				// Comment
				const comment = this.addressComments.get(address);
				const commentLines=Comment.getLines(comment, statement, this.disableCommentsInDisassembly);
				// Store
				lines.push(...commentLines);
			}
		}
		return lines;
	}


	/**
	 * Parses the memory area for opcodes with labels.
	 * Stores all labels with a categorization in an array.
	 * Priorization of labels:
	 * 1. "SUB"-labels: Everything called by "CALL nn" or "CALL cc,nn"
	 * 2. "LBL"-labels: Everything jumped to "JP nn" or "JP cc,nn"
	 * 3. "loop"-labels: Everything jumped to by "DJNZ"
	 * 4. "l"-labels: Everything jumped to by "JR n" or "JR cc,n"
	 * "loop" and "lbl" labels are prefixed by a previous "SUB"- or "LBL"-label with a prefix
	 * ".subNNN_" or ".lblNNN_". E.g. ".sub001_l5", ".sub001_loop1", ".lbl788_l89", ".lbl788_loop23".
	 * All labels are stored into this.labels. At the end the list is sorted by the address.
	 */
	protected collectLabels() {
		let address;
		let opcode;

		// get new address from queue
		while((address = this.addressQueue.shift()) != undefined) {
			//console.log('address=0x' + address.toString(16));
			// disassemble until stop-code
			//console.log('===');
			do {
				//console.log('addr=' + address.toString(16));
				// Check if memory has already been disassembled
				let attr = this.memory.getAttributeAt(address);
				if(attr & MemAttribute.CODE)
					break;	// Yes, already disassembled
				if(!(attr & MemAttribute.ASSIGNED)) {
					// Error: trying to disassemble unassigned memory areas
					if(!this.no_warning_disassemble_unassigned_memory)
						this.emit('warning', 'Trying to disassemble unassigned memory area at 0x' + address.toString(16) + '.');
					break;
				}

				// Read memory value
				opcode = Opcode.getOpcodeAt(this.memory, address);
				if(this.DBG_COLLECT_LABELS)
					console.log(Format.getHexString(address) + '\t' + opcode.disassemble().mnemonic);

				// Check if memory area has already been PARTLY disassembled
				const len = opcode.length;
				let memAddress = address;
				let quitDoWhile = false;
				for(let i=1; i<len; i++) {
					memAddress ++;
					attr = this.memory.getAttributeAt(memAddress);
					if(attr & MemAttribute.CODE) {
						// It has already been disassembled -> error.
						const otherOpcode = Opcode.getOpcodeAt(this.memory, memAddress);
						// emit warning
						this.emit('warning', 'Aborting disassembly: Ambiguous disassembly: Trying to disassemble opcode "' + opcode.name + '" at address 0x' + address.toString(16) + ' but address 0x' + memAddress.toString(16) + ' already contains opcode "' + otherOpcode.name + '".');

						//assert(attr & MemAttribute.CODE_FIRST, 'Internal error: Expected CODE_FIRST');
						//return;
						// Just quit current thread.
						quitDoWhile = true;
						break;
					}
				}
				if(quitDoWhile)
					break;

				// Mark memory area
				this.memory.addAttributeAt(address, 1, MemAttribute.CODE_FIRST);
				this.memory.addAttributeAt(address, opcode.length, MemAttribute.CODE);

				/*
				// Mark as stop code?
				if(opcode.flags & OpcodeFlag.STOP)
					this.memory.addAttributeAt(address, opcode.length, MemAttribute.CODE_STOP);
				*/

				// Check opcode for labels
				if(!this.disassembleForLabel(address, opcode)) {
					return;
				}

				// Check for stop code. (JP, JR, RET)
				if(opcode.flags & OpcodeFlag.STOP)
					break;

				// Next address
				address += opcode.length;

				// Check for end of disassembly (JP, RET)
			} while(!(opcode.flags & OpcodeFlag.STOP));

			if(this.DBG_COLLECT_LABELS)
				console.log('\n');
		}
	}


	/**
	 * Sets or creates a label and sets its type.
	 * @param address The address for the label.
	 * @param referenceAddresses Set with addresses that reference the label. Usually only the opcode address.
	 * @param type The NumberType.
	 * @param attr The memory attribute at address.
	 */
	protected setFoundLabel(address: number, referenceAddresses: Set<number>, type: NumberType, attr: MemAttribute) {
		// Check if label already exists
		let label = this.labels.get(address);
		if(label) {
			// label already exists: prioritize
			if(label.type < type)
				label.type = type;
		}
		else {
			// Label does not exist yet, just add it
			label = new DisLabel(type);
			this.labels.set(address, label);
			// Check if out of range
			if(!(attr & MemAttribute.ASSIGNED))
				label.isEqu = true;
		}

		// Add reference(s). Do a union of both sets.
		//label.references = new Set([...label.references, ...referenceAddresses]);
		for(let ref of referenceAddresses) {
			if(ref != address) {
				label.references.add(ref);
			}
		}
	}


	/**
	 * Sets the label for a possibly SNA start address and
	 * labels that show where memory areas start if the memory area
	 * is not continuous.
	 */
	protected setSpecialLabels() {
		if(this.automaticAddresses) {
			// Do special SNA handling. I.e. check if the SNA start address is meaningful
			if(this.snaStartAddress >= 0) {
				const label = this.labels.get(this.snaStartAddress);
				if(!label)	// if not found by other means.
					this.setLabel(this.snaStartAddress, 'SNA_LBL_MAIN_START_'+this.snaStartAddress.toString(16).toUpperCase(), NumberType.CODE_LBL);
			}
		}

		// Check whole memory
		let prevAttr = 0;
		for(let addr=0; addr<MAX_MEM_SIZE; addr++) {
			const memAttr = this.memory.getAttributeAt(addr);
			if((prevAttr ^ memAttr) & MemAttribute.ASSIGNED) {
				// Assignment status changed
				if(memAttr & MemAttribute.ASSIGNED) {
					// Is assigned now, set a label (maybe)
					const label = this.labels.get(addr);
					if(!label) {
						this.setLabel(addr, 'BIN_START_'+Format.getHexString(addr).toUpperCase(), NumberType.DATA_LBL);
					}
				}
			}
			// Next
			prevAttr = memAttr;
		}

	}


	/**
	 * Finds interrupt labels. I.e. start of program code
	 * that doesn't have any lable yet.
	 * As z80dismblr uses CFG analysis this can normally not happen.
	 * But if you e.g. provide a trace (tr) file this also includes interrupt traces.
	 * So z80dismblr will also follow these paths, but since there
	 * is no label associated this code would be presented without 'Start' label.
	 * 'findInterruptLabels' finds these code parts and assigns a label.
	 * Several rules are used:
	 * - It is checked if a label exists at a change from data or unassigned to opcode area
	 * - For a transition from stop code to opcode and there is no associated label
	 *
	 * Note: Another strategy to find interrupts would be to examine the trace from the
	 * tr file. If an address change happens that is bigger than +/-128 it must be
	 * at least a JP/CALL label or an interrupt call. The label can be added here.
	 * Later the JP/CALL labels would be found anyway (most probably).
	 */
	protected findInterruptLabels() {
		const foundInterrupts = new Array<number>();
		// Check the whole memory
		let prevAttr = 0;
		let prevCodeAddr = -1;
		for(let address=0x0000; address<MAX_MEM_SIZE; address++) {
			// check memory attribute
			const memAttr = this.memory.getAttributeAt(address);

			// Only if not the SNA address
			if(address != this.snaStartAddress) {
				if(memAttr & MemAttribute.CODE_FIRST
				&& memAttr & MemAttribute.ASSIGNED) {
					// Check if label exists
					const label = this.labels.get(address);
					if(!label) {
						// Only if label not yet exists

						// Check for transition unassigned or data (= not CODE) to code
						if(!(prevAttr & MemAttribute.ASSIGNED)
						|| !(prevAttr & MemAttribute.CODE)) {
							// Only if not the SNA address
							if(address != this.snaStartAddress) {
								// Assign label
								this.setFixedCodeLabel(address, this.labelIntrptPrefix);
								foundInterrupts.push(address);
							}
						}
						// Check for transition from stop code
						else if(prevCodeAddr >= 0) {
							const opcode = Opcode.getOpcodeAt(this.memory, prevCodeAddr);
							if(opcode.flags & OpcodeFlag.STOP) {
								// Assign label
								this.setFixedCodeLabel(address, this.labelIntrptPrefix);
								foundInterrupts.push(address);
							}
						}
					}
				}
			}

			// Backup values
			prevAttr = memAttr;
			if(!(memAttr & MemAttribute.CODE))
				prevCodeAddr = -1;
			if(memAttr & MemAttribute.CODE_FIRST)
				prevCodeAddr = address;
		}

		// Add numbers
		const count = foundInterrupts.length;
		if(count > 1) {
			for(let index=0; index<count; index++) {
				const addr = foundInterrupts[index];
				const label = this.labels.get(addr);
				assert(label, 'findInterruptLabels');
				if(label)
					label.name += index+1;
			}
		}
	}


	/**
	 * Sorts all labels by address.
	 */
	protected sortLabels() {
		this.labels = new Map([...this.labels.entries()].sort(([a], [b]) => a-b ));
	}


	/**
	 * "Disassembles" one label. I.e. the opcode is disassembled and checked if it includes
	 * a label.
	 * If so, the label is stored together with the call information.
	 * @param opcode The opcode to search for a label.
	 * @param opcodeAddress The current address.
	 * @returns false if problem occurred.
	 */
	protected disassembleForLabel(opcodeAddress: number, opcode: Opcode): boolean {

		// Check for branching etc. (CALL, RST, JP, JR)
		if(opcode.flags & OpcodeFlag.BRANCH_ADDRESS) {
			// It is a label.

			// Get branching memory attribute
			const branchAddress = opcode.value;
			const attr = this.memory.getAttributeAt(branchAddress);

			// Create new label or prioritize if label already exists
			let vType = opcode.valueType;
			if(vType == NumberType.CODE_LOCAL_LBL) {
				// A relative jump backwards will become a "loop"
				if(branchAddress <= opcodeAddress)
					vType = NumberType.CODE_LOCAL_LOOP;
			}
			else if(vType == NumberType.CODE_LBL) {
				// Treat JP to unassigned memory area as a CALL.
				if(!(attr & MemAttribute.ASSIGNED))
					vType = NumberType.CODE_SUB;
			}

			// Set label with correct type
			this.setFoundLabel(branchAddress, new Set([opcodeAddress]), vType, attr);

			// Check if code from the branching address has already been disassembled
			if(!(attr & MemAttribute.CODE)) {
				// It has not been disassembled yet
				if(attr & MemAttribute.ASSIGNED) {
					// memory location exists, so queue it for disassembly
					if(vType != NumberType.CODE_RST || this.rstDontFollowAddresses.indexOf(branchAddress) < 0) {
						// But only if it is not a RST address which was banned by the user.
						this.addressQueue.push(branchAddress);
					}
				}
			}
		}
		else if(opcode.valueType == NumberType.DATA_LBL) {
			// It's a data label, like "LD A,(nn)"
			let address = opcode.value;
			// Check if it the top of stack
			if(opcode.flags & OpcodeFlag.LOAD_STACK_TOP) {
				// yes, top of stack i.e. "LD SP,nn".
				// In this case the data 2 byte below is shown as last stack element
				const offs = -2;
				// add offset label
				this.offsetLabels.set(address, offs);
				// change address
				address += offs;
				// add comment
				if(!this.addressComments.get(address)) {
					const comment = new Comment();
					comment.addBefore('; Last element of stack:');
					this.addressComments.set(address, comment);
				}
			}
			// "normal", e.g. "LD A,(nn)"
			const attr = this.memory.getAttributeAt(address);
			// Create new label or prioritize if label already exists
			this.setFoundLabel(address, new Set([opcodeAddress]), opcode.valueType, attr);
		}

		// Everything fine
		return true;
	}


	/**
	 * Finds data labels that point into code areas.
	 * If the pointer points to the start of the opcode nothing needs to be done here.
	 * Everything is handled by the assignLabelNames method.
	 * But if the pointer points into the middle of an instruction the label
	 * need to be adjusted:
	 * 1. The current label is exchanged with an offset label
	 * 2. Another label is created at the start of the opcode.
	 */
	protected adjustCodePointingLabels() {
		const changeMap = new Map<number,DisLabel>();

		// Loop through all labels
		for( let [address, label] of this.labels) {
			switch(label.type) {
				case NumberType.CODE_LBL:
				case NumberType.CODE_LOCAL_LBL:
				case NumberType.CODE_LOCAL_LOOP:
				case NumberType.CODE_RST:
				case NumberType.CODE_SUB:
				case NumberType.DATA_LBL:
					const memAttr = this.memory.getAttributeAt(address);
					if(memAttr & MemAttribute.CODE) {
						if(!(memAttr & MemAttribute.CODE_FIRST)) {
							// Hit in the middle of an opcode.
							// Remember to change:
							changeMap.set(address, label);
						}
					}
				break;
			}
		}

		// Now change labels in original map
		for( let [address, label] of changeMap) {
			// Search start of opcode.
			let addrStart = address;
			let attr;
			do {
				addrStart--;
				assert(address - addrStart <= 4, 'adjustSelfModifyingLabels');	// Opcode should be smaller than 5 bytes
				attr = this.memory.getAttributeAt(addrStart);
			} while(!(attr & MemAttribute.CODE_FIRST));
			// Use label and put it to the new address
			this.setFoundLabel(addrStart, label.references, label.type, attr);
			// Remove old label
			this.labels.delete(address);
			// Add offset label
			const offs = addrStart - address;	// negative
			this.offsetLabels.set(address, offs);
		}
	}


	/**
	 * Check if a LBL/SUB references another LBL/SUB just by flow-through.
	 * I.e in.
	 * 	SUB01:
	 * 		LD A,1
	 * 	SUB02:
	 * 		LD B,3
	 * SUB01 would otherwise not reference SUB02 although it flows through which
	 * is equivalent to a JP or CALL;RET.
	 * This "references" are added here.
	 * Note: This could add an address a reference to 2 different labels.
	 * Note: Also works in labels.
	 */
	protected addFlowThroughReferences() {
		// Loop through all labels
		for( let [address, label] of this.labels) {
			switch(label.type) {
				case NumberType.CODE_LBL:
				case NumberType.CODE_SUB:
				case NumberType.CODE_RST:

				// Find the next label that is reached not by a JP, JR or CALL
				const found = this.findNextFlowThroughLabel(address);
				if(found) {
					// add reference
					const foundLabel = found.label;
					if(label != foundLabel) {
						foundLabel.references.add(found.address);
					}
				}

			}
		}
	}


	/**
	 * Finds the next label in the path.
	 * Uses the direct path, i.e. it doesnot follow any branch addresses.
	 * Returns at a STOP code.
	 * Is used to find "flow-through" references. I.e. references from a SUB
	 * to another that are creates because the program flow simply flows
	 * through to the other subroutine instead of jumping to it or calling
	 * it.
	 * @param address The start address of the path.
	 * @returns The found label or undefined if nothing found.
	 */
	protected findNextFlowThroughLabel(address: number,): {label: DisLabel, address: number}|undefined {
		// Check if memory exists
		let memAttr = this.memory.getAttributeAt(address);
		if(!(memAttr & MemAttribute.ASSIGNED)) {
			return undefined;
		}

		// Get opcode
		let opcode = Opcode.getOpcodeAt(this.memory, address);

		// Loop over addresses
		while(!(opcode.flags & OpcodeFlag.STOP)) {
			// Next address
			const prevAddress = address;
			address += opcode.length;

			// Check if label exists
			const foundLabel = this.labels.get(address);
			if(foundLabel) {
				// Check if it is LBL or SUB
				const type = foundLabel.type;
				switch(type) {
					case NumberType.CODE_LBL:
					case NumberType.CODE_SUB:
						return {label: foundLabel, address: prevAddress};
				}
			}

			// Check if memory exists
			const memAttr = this.memory.getAttributeAt(address);
			if(!(memAttr & MemAttribute.ASSIGNED)) {
				return undefined;
			}

			// Get opcode
			opcode = Opcode.getOpcodeAt(this.memory, address);
		}

		// nothing found
		return undefined;
	}


	/**
	 * Checks if LBLs are SUBs and if so turns them into SUBs.
	 * Therefore it iterates through all LBL labels.
	 * Then it walks through the LBL and stops if it finds a RET, RET cc or RETI.
	 * Note 1: It does not check necessarily all branches. Once it finds a
	 * RET it assumes that also the other branches will end with a RET.
	 * Note 2: When this function is done there should be only 2 LBL left:
	 * - the main program and
	 * - the interrupt.
	 */
	protected turnLBLintoSUB() {
		// Loop through all labels
		for( let [address, label] of this.labels) {
			if(label.type == NumberType.CODE_LBL) {
				// Log
				DelayedLog.startLog();
				// Find a "RET" on the path
				const addrsArray = new Array<number>();
				const retFound = this.findRET(address, addrsArray);
				if(retFound) {
					// Debug
					DelayedLog.logIf(address, () =>
					'Addresses: ' + addrsArray.map(addr => addr.toString(16)).join(' '));
					DelayedLog.logIf(address, () =>  'turnLBLintoSUB: Turned Label ' + getNumberTypeAsString(label.type) + ' into CODE_SUB.');

					// It is a subroutine, so turn the LBL into a SUB.
					label.type = NumberType.CODE_SUB;
				}
				DelayedLog.stopLog();
			}
		}
	}


	/**
	 * Tries to find a "RET(I)" in the path.
	 * @param address The start address of the path.
	 * @param addrsArray An empty array in the beginning that is filled with
	 * all addresses of the path.
	 * @returns true if an "RET(I)" was found otherwise false.
	 */
	protected findRET(address: number, addrsArray: Array<number>): boolean {
		let opcodeClone;

		do {

			// Check if memory exists
			const memAttr = this.memory.getAttributeAt(address);
			if(!(memAttr & MemAttribute.ASSIGNED)) {
				DelayedLog.log(() => 'findRET: address=' + DelayedLog.getNumber(address) + ': returns. memory not assigned.');
				return false;
			}
			// Unfortunately it needs to be checked if address has been checked already
			if(addrsArray.indexOf(address) >= 0) {
				DelayedLog.log(() => 'findRET: address=' + DelayedLog.getNumber(address) + ': returns. memory already checked.');
				return false;	// already checked
			}
			// Check if a label for address exists that already is a subroutine.
			const addrLabel = this.labels.get(address);
			if(addrLabel) {
				const type = addrLabel.type;
				if(type == NumberType.CODE_SUB
				|| type == NumberType.CODE_RST) {
					DelayedLog.log(() => 'findRET: address=' + DelayedLog.getNumber(address) + ': SUB FOUND. address belongs already to a SUB.');
					return true;
				}
			}

			// check opcode
			const opcode = Opcode.getOpcodeAt(this.memory, address);
			opcodeClone = {...opcode};	// Required otherwise opcode is overwritten on next call to 'getOpcodeAt' if it's the same opcode.

			// Check if RET
			if(opcodeClone.flags & OpcodeFlag.RET) {
				DelayedLog.log(() => 'findRET: address=' + DelayedLog.getNumber(address) + ': SUB FOUND. RET code = ' + opcodeClone.name + '.');
				return true;
			}

			// Add to array
			addrsArray.push(address);

			// And maybe branch address (but not a CALL)
			if(opcodeClone.flags & OpcodeFlag.BRANCH_ADDRESS) {
				if(!(opcodeClone.flags & OpcodeFlag.CALL)) {
					const branchAddress = opcodeClone.value;
					DelayedLog.log(() => 'findRET: address=' + DelayedLog.getNumber(address) + ': branching to ' + DelayedLog.getNumber(branchAddress) + '.');	DelayedLog.pushTab();
					const res = this.findRET(branchAddress, addrsArray);
					DelayedLog.popTab();
					if(res)
						return true;	// SUB found
				}
			}

			// Now check next address
			address += opcodeClone.length;

		} while(!(opcodeClone.flags & OpcodeFlag.STOP));

		// no RET
		return false;
	}


	/**
	 * After Labels have been assigned:
	 * Iterate through all subroutine labels.
	 * Walkthrough each subroutine and store the address belonging to the
	 * subroutine in an (temporary) array. The subroutine ends if each branch
	 * ends with a stop code (RET or JP).
	 * Then iterate the array.
	 * Each address with a Label of type CODE_LBL/SUB is checked. If it contains
	 * reference addresses outside the range of the array then it stays a CODE_LBL/SUB
	 * otherwise it is turned into a local label CODE_LOCAL_LBL or CODE_LOCAL_LOOP.
	 */
	protected findLocalLabelsInSubroutines() {
		// Loop through all labels
		for( let [address, label] of this.labels) {
			switch(label.type) {
				case NumberType.CODE_LBL:
				case NumberType.CODE_SUB:
				case NumberType.CODE_RST:
					// Log
					DelayedLog.startLog();
					// Get all addresses belonging to the subroutine
					const addrsArray = new Array<number>();
					this.getSubroutineAddresses(address, addrsArray);
					// Now reduce array. I.e. only a coherent block will be treated as a subroutine.
					this.reduceSubroutineAddresses(address, addrsArray);
					// Iterate array
					for(let addr of addrsArray) {
						// Don't check start address
						if(addr == address)
							continue;
						// get corresponding label
						const addrLabel = this.labels.get(addr);
						// Check label
						if(!addrLabel)
							continue;
						// Check label type (not for RST)
						if(addrLabel.type != NumberType.CODE_LBL
						&& addrLabel.type != NumberType.CODE_SUB)
							continue;
						if(addrLabel.isFixed)
							continue;
						// It is a CODE_LBL. Check references.
						const refs = addrLabel.references;
						let outsideFound = false;
						for(const ref of refs) {
							if(addrsArray.indexOf(ref) < 0) {
								// Found an address outside of the subroutine,
								// I.e. leave the label unchanged.
								outsideFound = true;
								break;
							}
						}
						if(!outsideFound) {
							// Debug
							DelayedLog.logIf(addr, () =>
								'Addresses: ' + addrsArray.map(addr => addr.toString(16)).join(' '));
							DelayedLog.logIf(addr, () => 'findLocalLabelsInSubroutines: Turned Label' + getNumberTypeAsString(addrLabel.type) + ' into CODE_LOCAL_LBL.');

							// No reference outside the subroutine found
							// -> turn CODE_LBL into local label
							addrLabel.type = NumberType.CODE_LOCAL_LBL;
							// If any reference addr is bigger than address use CODE_LOCAL_LOOP,
							// otherwise CODE_LOCAL_LBL
							for(const ref of refs) {
								const diff = ref - addr;
								if(diff >= 0 && diff <= 128) {
									// Use loop
									addrLabel.type = NumberType.CODE_LOCAL_LOOP;
									break;
								}
							}
						}
					}
					DelayedLog.stopLog();
			}
		}
	}


	/**
	 * Returns an array with all addresses used by the subroutine
	 * given at 'address'.
	 * Does NOT stop if it reaches a lable of another subroutine.
	 * Works recursively.
	 * @param address The start address of the subroutine.
	 * @param addrsArray An empty array in the beginning that is filled with
	 * all addresses of the subroutine.
	 */
	protected getSubroutineAddresses(address: number, addrsArray: Array<number>) {
		let opcodeClone;

		do {

			// Check if memory exists
			const memAttr = this.memory.getAttributeAt(address);
			if(!(memAttr & MemAttribute.ASSIGNED)) {
				DelayedLog.log(() => 'getSubroutineAddresses: address=' + DelayedLog.getNumber(address) + ': returns. memory not assigned.');
				break;
			}
			// Unfortunately it needs to be checked if address has been checked already
			if(addrsArray.indexOf(address) >= 0) {
				DelayedLog.log(() => 'getSubroutineAddresses: address=' + DelayedLog.getNumber(address) + ': returns. memory already checked.');
				break;	// already checked
			}

			// check opcode
			const opcode = Opcode.getOpcodeAt(this.memory, address);
			opcodeClone = {...opcode};	// Required otherwise opcode is overwritten on next call to 'getOpcodeAt' if it's the same opcode.

			// Add to array
			addrsArray.push(address);

			// And maybe branch address
			if(opcodeClone.flags & OpcodeFlag.BRANCH_ADDRESS) {
				if(!(opcodeClone.flags & OpcodeFlag.CALL)) {
					const branchAddress = opcodeClone.value;
					DelayedLog.log(() => 'getSubroutineAddresses: address=' + DelayedLog.getNumber(address) + ': branching to ' + DelayedLog.getNumber(branchAddress) + '.');	DelayedLog.pushTab();
					this.getSubroutineAddresses(branchAddress, addrsArray);
					DelayedLog.popTab();
				}
			}

			// Now check next address
			address += opcodeClone.length;

		} while(!(opcodeClone.flags & OpcodeFlag.STOP));
	}


	/**
	 * Reduces the given array to a coherent area. I.e. if there is a "hole"
	 * inside the subroutine the parts are treated as two separte subroutines.
	 * @param address The start address of the subroutine.
	 * @param addrsArray The array with addresses (was filled by this.getSubroutineAddresses).
	 */
	protected reduceSubroutineAddresses(address: number, addrsArray: Array<number>) {
		// sort array
		addrsArray.sort((a, b) => a - b);
		// Throw away all addresses smaller than the start address
		const array = addrsArray.filter(value => value >= address);

		// It's just required to disassemble the straight line of addresses, no branches.
		addrsArray.length = 0;	// clear array
		let nextAddress = address;
		for(const addr of array) {
			// Check for coherent block
			if(addr != nextAddress)
				break;

			// get opcode
			const opcode = Opcode.getOpcodeAt(this.memory, addr);

			// Add to array
			addrsArray.push(nextAddress);

			// Next
			nextAddress = addr + opcode.length;
		}
	}


	/**
	 * Iterates through all Labels.
	 * Fills the 'this.addressParents' array with the parent references for each address.
	 * Afterwards it removes all self-references in Labels.references.
	 */
	protected addParentReferences() {
		for( let [address, label] of this.labels) {
			// Get all addresses belonging to a subroutine and set the parent values of
			// the associated labels.
			const type = label.type;
			if(type == NumberType.CODE_SUB
				|| type == NumberType.CODE_RST
				|| type == NumberType.CODE_LBL) {
				// Collect all addresses belonging to a subroutine
				DelayedLog.startLog();
				this.setSubroutineParent(address, label);
				DelayedLog.logIf(address, () =>
					''+Format.getHexString(address,4)+' processed.'
				);
				DelayedLog.stopLog();
			}
		}

		// Remove self references, e.g. a subroutine that includes a loop that
		// jumps to itself.
		for( let [address, label] of this.labels) {
			const refs = label.references;
			let anyRefOutside = false;
			for(let ref of refs) {
				const addr = ref;
				const parentLabel = this.addressParents[addr];
				if(parentLabel == label) {
					// self-reference:
					// Check if reference is a call:
					const memAttr = this.memory.getAttributeAt(ref);
					assert(memAttr &  MemAttribute.ASSIGNED);
					assert(memAttr &  MemAttribute.CODE);
					assert(memAttr &  MemAttribute.CODE_FIRST);
					// Check opcode
					const opcode = Opcode.getOpcodeAt(this.memory, ref);
					if(!(opcode.flags & OpcodeFlag.CALL)) {
						// No, it was no call, so it must be a jump. Remove reference.
						refs.delete(ref);
					}
				}
				else {
					// There was at least one reference from outside the sub routine
					anyRefOutside = true;
				}
			}

			// Check if sub routine cannot be called from outside.
			if(!anyRefOutside &&
				(label.type == NumberType.CODE_SUB || label.type == NumberType.CODE_RST)
				&& refs.size > 0) {
				// If there is no call/jp from outside the subroutine itself and if label
				// is a subroutine then the CALL did only come from the subroutine
				// itself -> do a warning. Maybe this was a programming error in the assembler code.
				// Note: It is also checked if there is no ref at all to exclude the interrupts.
				this.emit('warning', 'Address: ' + Format.getHexString(address,4) + 'h. A subroutine was found that calls itself recursively but is not called from any other location.');
				this.dotMarkedLabels.set(address,this.dotWarningMark);
			}
		}
	}


	/**
	 * Collects an array with all addresses used by the subroutine
	 * given at 'address'.
	 * Does stop if it reaches a label of another subroutine.
	 * The array also contains the start address.
	 * Fills the 'this.addressParents' array.
	 * Works recursively.
	 * Note: does work also on CODE_LBL.
	 * @param addr The start address of the subroutine.
	 * @param parentLabel The label to associate the found addresses with.
	 */
	protected setSubroutineParent(addr: number, parentLabel: DisLabel) {
		let opcodeClone;
		let address = addr;

		do {

			// Check if memory exists
			const memAttr = this.memory.getAttributeAt(address);
			if(!(memAttr & MemAttribute.ASSIGNED)) {
				DelayedLog.log(() => 'setSubroutineParent: address=' + DelayedLog.getNumber(address) + ': returns. memory not assigned.');
				break;
			}

			// Check if parent already assigned
			const memLabel = this.addressParents[address];
			if(memLabel) {
				DelayedLog.log(() => 'setSubroutineParent: address=' + DelayedLog.getNumber(address) + ': returns. memory already checked.');
				break;	// already checked
			}

			// Check if label is sub routine
			const label = this.labels.get(address);
			if(label) {
				if(label != parentLabel) {	// Omit start address
					const type = label.type;
					if(type == NumberType.CODE_SUB
						|| type == NumberType.CODE_RST
						|| type == NumberType.CODE_LBL
					)
						break;	// Stop if label which is LBL, CALL or RST is reached
				}
			}

			// check opcode
			const opcode = Opcode.getOpcodeAt(this.memory, address);
			opcodeClone = {...opcode};	// Required otherwise opcode is overwritten on next call to 'getOpcodeAt' if it's the same opcode.

			// Add to array
			this.addressParents[address] = parentLabel;

			DelayedLog.log(() => 'setSubroutineParent: address=' + DelayedLog.getNumber(address) + ': added. ' + opcodeClone.name);

			// And maybe branch address
			if(opcodeClone.flags & OpcodeFlag.BRANCH_ADDRESS) {
//				if(!(opcodeClone.flags & OpcodeFlag.CALL)) {
				// Check if a label exists to either a subroutine or another absolute label.
				const branchAddress = opcodeClone.value;
				/*const branchLabel = this.labels.get(branchAddress);
				if(!branchLabel
					|| branchLabel.type == NumberType.CODE_LBL
					|| branchLabel.type == NumberType.CODE_SUB
					|| branchLabel.type == NumberType.CODE_RST)
					*/
					{
					DelayedLog.log(() => 'setSubroutineParent: address=' + DelayedLog.getNumber(address) + ': branching to ' + DelayedLog.getNumber(branchAddress) + '.\n');	DelayedLog.pushTab();
					this.setSubroutineParent(branchAddress, parentLabel);
					DelayedLog.popTab();
				}
			}

			// Now check next address
			address += opcodeClone.length;

		} while(!(opcodeClone.flags & OpcodeFlag.STOP));

		DelayedLog.log(() => 'setSubroutineParent: address=' + DelayedLog.getNumber(address) + ': stop.\n');
	}


	/**
	 * Adds the 'calls'-list to the subroutine labels.
	 * The reference list already includes the references (subroutines) who
	 * call the label.
	 * Now a list should be added to the label which contains all called
	 * subroutines.
	 * This is for call-graphs and for the comments in the listing.
	 */
	protected addCallsListToLabels() {
		for( let [, label] of this.labels) {
			switch(label.type) {
				case NumberType.CODE_SUB:
				case NumberType.CODE_RST:
				case NumberType.CODE_LBL:
					// go through references
					const refs = label.references;
					for(const ref of refs) {
						// Get parent
						const parent =  this.addressParents[ref];
						if(parent) {
							// add label to call list of parent
							parent.calls.push(label);
						}
					}
			}
		}
	}


	/**
	 * Calculates the statistics like size or cyclomatic complexity of all
	 * subroutines.
	 * Fills the 'subroutineStatistics' map.
	 */
	protected countStatistics() {
		// Loop through all labels
		for( let [address, label] of this.labels) {
			if(label.isEqu)
				continue;
			switch(label.type) {
				case NumberType.CODE_RST:
					// Check if rst is turned off
					if(this.rstDontFollowAddresses.indexOf(address) >= 0) {
						const statistics = {sizeInBytes:0, countOfInstructions:0, CyclomaticComplexity:0};
						this.subroutineStatistics.set(label, statistics);
						break;	// Don't count statistics.
					}

					// Otherwise flow through.
				case NumberType.CODE_SUB:
				case NumberType.CODE_LBL:
					// Get all addresses belonging to the subroutine
					const addresses = new Array<number>();
					const statistics = this.countAddressStatistic(address, addresses);
					statistics.CyclomaticComplexity ++;	// Add 1 as default
					this.subroutineStatistics.set(label, statistics);
					// Get max
					if(statistics.sizeInBytes > this.statisticsMax.sizeInBytes)
						this.statisticsMax.sizeInBytes = statistics.sizeInBytes;
					if(statistics.countOfInstructions > this.statisticsMax.countOfInstructions)
						this.statisticsMax.countOfInstructions = statistics.countOfInstructions;
					if(statistics.CyclomaticComplexity > this.statisticsMax.CyclomaticComplexity)
						this.statisticsMax.CyclomaticComplexity = statistics.CyclomaticComplexity;
					// Get min
					if(statistics.sizeInBytes < this.statisticsMin.sizeInBytes)
						this.statisticsMin.sizeInBytes = statistics.sizeInBytes;
					if(statistics.countOfInstructions < this.statisticsMin.countOfInstructions)
						this.statisticsMin.countOfInstructions = statistics.countOfInstructions;
					if(statistics.CyclomaticComplexity < this.statisticsMin.CyclomaticComplexity)
						this.statisticsMin.CyclomaticComplexity = statistics.CyclomaticComplexity;
			}
		}
	}


	/**
	 * Calculates statistics like size or cyclomatic complexity.
	 * Works recursively.
	 * @param address The start address of the subroutine.
	 * @param addresses An empty array in the beginning that is filled with
	 * all addresses of the subroutine. Used to escape from loops.
	 * @returns statistics: size so far, cyclomatic complexity.
	 */
	protected countAddressStatistic(address: number, addresses: Array<number>) : SubroutineStatistics {
		let statistics = {sizeInBytes:0, countOfInstructions:0, CyclomaticComplexity:0};

		let opcodeClone;
		do {
			// Check if memory exists
			const memAttr = this.memory.getAttributeAt(address);
			if(!(memAttr & MemAttribute.ASSIGNED)) {
				return statistics;
			}
			// Unfortunately it needs to be checked if address has been checked already
			if(addresses.indexOf(address) >= 0)
				return statistics;	// already checked
			// Add to array
			addresses.push(address);
			// check opcode
			const opcode = Opcode.getOpcodeAt(this.memory, address);
			opcodeClone = {...opcode};	// Required otherwise opcode is overwritten on next call to 'getOpcodeAt' if it's the same opcode.

			// Add statistics
			statistics.sizeInBytes += opcodeClone.length;
			statistics.countOfInstructions ++;
			// Cyclomatic complexity: add 1 for each conditional branch
			if(opcodeClone.flags & OpcodeFlag.BRANCH_ADDRESS) {
				// Now exclude unconditional CALLs, JPs and JRs
				if(opcode.name.indexOf(',') >= 0 )
					statistics.CyclomaticComplexity ++;
			}
			else if((opcodeClone.flags & OpcodeFlag.RET)
					&& (opcodeClone.flags & OpcodeFlag.CONDITIONAL)) {
				// It is a conditional return
				statistics.CyclomaticComplexity ++;
			}

			// And maybe branch address
			if(opcodeClone.flags & OpcodeFlag.BRANCH_ADDRESS) {
				if(!(opcodeClone.flags & OpcodeFlag.CALL)) {
					// Only branch if no CALL, but for conditional and conditional JP or JR.
					// At last check if the JP/JR might jump to a subroutine. This wouldn't be followed.
					const branchAddress = opcodeClone.value;
					const branchLabel = this.labels.get(branchAddress);
					let isSUB = false;
					if(branchLabel)
						if(branchLabel.type == NumberType.CODE_SUB
						|| branchLabel.type == NumberType.CODE_RST)
							isSUB = true;
					// Only if no subroutine
					if(!isSUB) {
						const addStat = this.countAddressStatistic(branchAddress, addresses);
						statistics.sizeInBytes += addStat.sizeInBytes;
						statistics.countOfInstructions += addStat.countOfInstructions;
						statistics.CyclomaticComplexity += addStat.CyclomaticComplexity;
					}
				}
			}

			// Next
			address += opcodeClone.length;

			// Stop at flow-through
			const nextLabel = this.labels.get(address);
			if(nextLabel) {
				const type = nextLabel.type;
				if(type == NumberType.CODE_SUB
				|| type == NumberType.CODE_RST)
					break;	// Stop when entering another subroutine.
			}

		} while(!(opcodeClone.flags & OpcodeFlag.STOP));

		// return
		return statistics;
	}


	/// Assign label names.
	/// Is done in 2 passes:
	/// 1. the major labels (e.g. "SUBnnn") are assigned and also the local label names without number.
	/// 2. Now the local label name numbers are assigned.
	/// Reason is that the count of digits for the local label numbers is not known upfront.
	protected assignLabelNames() {
		// Check if a custom function should be used.
		if(this.funcAssignLabels) {
			for(const [address,label] of this.labels) {
				label.name = this.funcAssignLabels(address);
			}
			return;
		}


		// Count labels ----------------

		// Count all local labels.
		const localLabels = new Map<DisLabel, Array<DisLabel>>();
		const localLoops = new Map<DisLabel, Array<DisLabel>>();


		// Count labels
		let labelSubCount = 0;
		let labelLblCount = 0;
		let labelDataLblCount = 0;
		let labelSelfModifyingCount = 0;

		// Loop through all labels
		for(const [address,label] of this.labels) {
			const type = label.type;
			switch(type) {
				// Count main labels
				case NumberType.CODE_SUB:
					labelSubCount++;
				break;
				case NumberType.CODE_LBL:
					labelLblCount++;
				break;
				case NumberType.DATA_LBL:
					const memAttr = this.memory.getAttributeAt(address);
					if(memAttr & MemAttribute.CODE) {
						labelSelfModifyingCount++;
					}
					else {
						labelDataLblCount++;
					}
				break;

				// Collect local labels
				case NumberType.CODE_LOCAL_LBL:
				case NumberType.CODE_LOCAL_LOOP:
					const parentLabel = this.addressParents[address];
					//assert(parentLabel, 'assignLabelNames 1');
					if(parentLabel) {
						// This might not be set if address was set by addAddressToQueue.
						const arr = (type == NumberType.CODE_LOCAL_LBL) ? localLabels : localLoops;
						let labelsArray = arr.get(parentLabel);
						if(!labelsArray) {
							labelsArray = new Array<DisLabel>();
							arr.set(parentLabel, labelsArray);
						}
						labelsArray.push(label);
					}
				break;
			}
		}

		// Calculate digit counts
		const labelSubCountDigits = labelSubCount.toString().length;
		const labelLblCountDigits = labelLblCount.toString().length;
		const labelDataLblCountDigits = labelDataLblCount.toString().length;
		const labelSelfModifyingCountDigits = labelSelfModifyingCount.toString().length;


		// Assign names. First the main labels.
		// Start indexes
		let subIndex = 1;	// CODE_SUB
		let lblIndex = 1;	// CODE_LBL
		let dataLblIndex = 1;	// DATA_LBL
		let dataSelfModifyingIndex = 1;	// SELF_MOD

		// Loop through all labels (labels is sorted by address)
		for(const [address,label] of this.labels) {
			// Check if label was already set (e.g. from commandline)
			if(label.name)
				continue;

			// Process label
			const type = label.type;
			switch(type) {
				case NumberType.CODE_SUB:
					// Set name
					label.name = (label.belongsToInterrupt) ? this.labelIntrptPrefix : '' + this.labelSubPrefix + this.getIndex(subIndex, labelSubCountDigits);
					// Next
					subIndex++;
				break;
				case NumberType.CODE_LBL:
					// Set name
					label.name = (label.belongsToInterrupt) ? this.labelIntrptPrefix : '' + this.labelLblPrefix + this.getIndex(lblIndex, labelLblCountDigits);
					// Next
					lblIndex++;
				break;
				case NumberType.CODE_RST:
					// Set name
					label.name = this.labelRstPrefix + Format.getHexString(address,2);
				break;
				case NumberType.DATA_LBL:
					// Check for self.modifying code
					const memAttr = this.memory.getAttributeAt(address);
					if(memAttr & MemAttribute.CODE) {
						assert(memAttr & MemAttribute.CODE_FIRST, 'assignLabelNames 2');
						// Yes, is self-modifying code.
						// Set name
						label.name = this.labelSelfModifyingPrefix + this.getIndex(dataSelfModifyingIndex, labelSelfModifyingCountDigits);
						// Next
						dataSelfModifyingIndex++;
					}
					else {
						// Normal data area.
						// Set name
						label.name = this.labelDataLblPrefix + this.getIndex(dataLblIndex, labelDataLblCountDigits);
						// Next
						dataLblIndex++;
					}
				break;
			}
		}

		// At the end the local labels ---

		// Loop through all labels (labels is sorted by address)
		// Local Labels:
		for(const [parentLabel, childLabels] of localLabels) {
			const localPrefix = parentLabel.name.toLowerCase();
			const count = childLabels.length;
			const digitCount = count.toString().length;
			// Set names
			let index = 1;
			for(let child of childLabels) {
				const indexString = this.getIndex(index, digitCount);
				child.name = '.' + localPrefix + this.labelLocalLablePrefix;
				if(count > 1)
					child.name += indexString;
				index ++;
			}
		}
		// Local Loops:
		for( let [parentLabel, childLabels] of localLoops) {
			const localPrefix = parentLabel.name.toLowerCase();
			const count = childLabels.length;
			const digitCount = count.toString().length;
			// Set names
			let index = 1;
			for(let child of childLabels) {
				const indexString = this.getIndex(index, digitCount);
				child.name = '.' + localPrefix + this.labelLoopPrefix;
				if(count > 1)
					child.name += indexString;
				index ++;
			}
		}
	}


	/**
	 * Add/create the comments for the labels.
	 * If a comment already exists (e.g. set by the user) it is not overwritten.
	 */
	protected addLabelComments() {
		// Loop through all labels (labels is sorted by address)
		for(const [address,label] of this.labels) {
			// Only for the main labels
			const type = label.type;
			if(type != NumberType.CODE_SUB
				&& type != NumberType.CODE_RST
				&& type != NumberType.CODE_LBL
				&& type != NumberType.DATA_LBL)
				continue;

			// Check if comment already exists
			let comment = this.addressComments.get(address);
			if(comment)
				continue;

			// Create comment
			comment = this.getAddressComment(address);
			if(comment)
				this.addressComments.set(address, comment);
		}
	}


	/**
	 * Returns the 3 comment lines for an address.
	 * It first searches if there is a label at that address.
	 * If label exists
	 * 	- if there is a comment in addressComments then this
	 * comment is returned.
	 *  - otherwise the comment for the label is generated.
	 * If label does not exist
	 *  - the comment from addressComments is returned.
	 * @param address The address.
	 */
	protected getAddressComment(address: number): Comment|undefined {
		if (this.disableCommentsInDisassembly)
			return undefined;
		let comments=this.addressComments.get(address);
		if(comments)
			return comments;
		return this.getLabelComments(address);
	}


	/**
	 * Creates a human readable string telling which locations reference this address
	 * and which locations are called (if it is a subroutine).
	 * @param address The address.
	 * @return The comment with statistics about the label. E.g. for
	 * subroutines is tells the size , cyclomatic complexity, all callers and all callees.
	 */
	protected getLabelComments(address: number): Comment|undefined {
		const addrLabel = this.labels.get(address);
		if(!addrLabel)
			return undefined;

		const lineArray = new Array<string>();
		const refCount = addrLabel.references.size;
		let line1;
		let line2;
		let line3;

		// Name
		const type = addrLabel.type;
		let name;
		switch(type) {
			case NumberType.CODE_SUB: name = 'Subroutine'; break;
			case NumberType.CODE_RST: name = 'Restart'; break;
			case NumberType.DATA_LBL: name = 'Data'; break;
			default: name = 'Label'; break;
		}

		// Aggregate output string
		switch(type) {
			case NumberType.CODE_SUB:
			case NumberType.CODE_RST:
			{
				// Line 2
				line2 = 'Called by: ';
				let first = true;
				let recursiveFunction = false;
				for(const ref of addrLabel.references) {
					if(!first)
						line2 += ', ';
					const s = Format.getHexString(ref, 4) + 'h';
					const parent = this.addressParents[ref];
					if(parent) {
						let parName;
						if(parent == addrLabel) {
							parName = 'self';
							recursiveFunction = true;
						}
						else
							parName = parent.name;
						line2 += parName + '[' + s +']';
					}
					else
						line2 += s;
					first = false;
				}
				// Check if anything has been output
				line2 += (addrLabel.references.size > 0) ? '.' : '-';

				// Line 1
				line1 = name;
				const stat = this.subroutineStatistics.get(addrLabel);
				if(stat)
					line1 += ': ' + ((recursiveFunction) ? 'Recursive, ' : '') + 'Size=' + stat.sizeInBytes + ', CC=' + stat.CyclomaticComplexity + '.';
				else
					line1 += '.';

				// Store lines
				lineArray.push(line1);
				lineArray.push(line2);

				// Only if "Calls:" line is wanted
				if(!addrLabel.isEqu) {
					// Line 3
					line3 = 'Calls: ';
					first = true;
					const callees = new Set<DisLabel>();
					for(const callee of addrLabel.calls) {
						callees.add(callee);
					}
					line3 += Array.from(callees).map(refLabel => refLabel.name).join(', ');
					// Check if anything has been output
					line3 += (callees.size > 0) ? '.' : '-';

					lineArray.push(line3);
				}
				break;
			}

			default:
			{
				line1 = name;
				line1 += (refCount > 0) ? ' accessed by:' : ' not accessed.';
				lineArray.push(line1);

				// 2nd line
				if(refCount > 0) {
					// Second line: The references
					const refArray = [...addrLabel.references].map(addr => {
						let s = Format.getHexString(addr, 4) + 'h';
						const parentLabel = this.addressParents[addr];
						if(parentLabel) {
							// Add e.g. start of subroutine
							s += '(in ' + parentLabel.name + ')';
						}
						return s;
					});
					const line2 = refArray.join(', ');
					lineArray.push(line2);
				}
				break;
			}
		}

		// For EQU labels return everything in one line.
		let comment = new Comment();
		if(addrLabel.isEqu) {
			comment.inlineComment = '; ' + address.toString() + '. ' + lineArray.join(' ');
		}
		else {
			// Put the lines in the comments structure
			comment.linesBefore = lineArray.map(s => '; ' + s);
		}

		// return
		return comment;
	}


	/**
	 * Reads in a file from the user that sets address labels and the comments to show in the disassembly.
	 * @param commentsFile The file to read. Format:
	 * ; comment1
	 * address: label ; comment2
	 * ; comments 3
	 * newline(s)
	 */
	public setAddressComments(commentsFile: string) {
		enum State {
			LinesBefore, lineOn, LinesAfter,
		};
		const commentsLines = readFileSync(commentsFile).toString().split('\n');
		commentsLines.push('');	// Add empty line to make sure the last comment is processed.
		let state = State.LinesBefore;
		let comment = new Comment();
		let commentAddr;
		let commentLabelName;
		let lineNr = 0;
		for(const line of commentsLines) {
			lineNr ++;
			// Read in comments "before"
			const match = /^\s*([^;]+)?(;.*)?(\S+)?/.exec(line)!;
			assert(match);
			const addressPart = match[1];
			const commentPart = match[2];
			const misc = match[3];
			if(misc)  {
				// Unexpected line
				throw Error('Unexpected line: "' + line + '", ' + commentsFile + ':' + lineNr + '.');
			}
			if(!addressPart && !commentPart) {
				// Comment finished, line empty
				if(commentAddr != undefined) {
					// Set comment
					this.addressComments.set(commentAddr, comment);
					// Set label
					if(commentLabelName) {
						this.setLabel(commentAddr,commentLabelName, NumberType.DATA_LBL);	// Data label might be changed to something else.
					}
				}
				// Next state
				state = State.LinesBefore;
				comment = new Comment();
				commentAddr = undefined;
				commentLabelName = undefined;
				continue;
			}
			// check for state change
			if(addressPart) {
				if(state == State.LinesBefore) {
					// Next state
					state = State.lineOn;
				}

			}

			// add lines
			switch(state) {
				case State.LinesBefore:
					comment.addBefore(commentPart);
					break;
				case State.lineOn:
					comment.inlineComment = commentPart;
					// Determine address and label
					const match2 = /^(0x)?([0-9a-f]+)(\s+([\w\.]+))?/i.exec(addressPart);
					if(match2) {
						const addrString = match2[2];
						commentAddr = parseInt(addrString,16);
						commentLabelName = match2[4];
						// Next state
						state = State.LinesAfter;
					}
					else  {
						throw Error('Expected an address: "' + line + '", ' + commentsFile + ':' + lineNr + '.');
					}
					break;
				case State.LinesAfter:
					if(addressPart) {
						throw Error('Expected "after"-comment or newline: "' + line + '", ' + commentsFile + ':' + lineNr + '.');
					}
					comment.addAfter(match[2]);
					break;

			}

		}

	}


	/**
	 * Returns all (main) labels with address and comments.
	 */
    public getMainLabels(): string {
		let text = '';

		for(let [address, label] of this.labels) {

			const type = label.type;
			if(type != NumberType.CODE_SUB
				&& type != NumberType.CODE_LBL
				&& type != NumberType.CODE_RST
				&& type != NumberType.DATA_LBL)
				continue;

			// Store address, label and comments
			const addrLabelLine = Format.getHexString(address, 4) + '\t' + label.name;
			const comment = this.getAddressComment(address);
			const commentLines=Comment.getLines(comment, addrLabelLine, this.disableCommentsInDisassembly);

			text += commentLines.join('\n');

			// Next
			text += '\n\n';

		}

		// Return
		return text;
	}


	/**
	 * Disassemble opcodes together with label names.
	 * Returns an array of strings which contains the disassembly.
	 * @returns The disassembly.
	 */
	protected disassembleMemory(): Array<string> {
		let lines = new Array<string>();

		// Check if anything to disassemble
		if(this.labels.size == 0)
			return lines;

		// Loop over all labels
		let address = -1;
		for(const [addr, label] of this.labels) {
			if(label.isEqu)
				continue;	// Skip EQUs

			// If first line, print ORG
			if(address == -1) {
				// First line
				// Print "ORG"
				this.addEmptyLines(lines);
				let orgLine=' '.repeat(this.clmnsBytes)+this.rightCase('ORG ')+Format.getHexString(addr)+'h';
				if (!this.disableCommentsInDisassembly)
					orgLine+='; '+Format.getConversionForAddress(addr);
				lines.push(orgLine);
			}
			else {
				// Normal case. All other lines but first line.
				const unassignedSize = addr - address;
				if(unassignedSize < 0)
					continue;

				// Print new "ORG"
				this.addEmptyLines(lines);
				let orgLine=' '.repeat(this.clmnsBytes)+this.rightCase('ORG ')+Format.getHexString(addr)+'h';
				if (!this.disableCommentsInDisassembly)
					orgLine+='; '+Format.getConversionForAddress(addr);
				lines.push(orgLine);
			}

			// Use address
			address = addr;
			let prevMemoryAttribute = MemAttribute.DATA;

			let prevParent;

			// disassemble until unassigned memory found
			while(true) {
				//console.log('disMem: address=0x' + address.toString(16))
				// Check if memory has already been disassembled
				let attr = this.memory.getAttributeAt(address);
				if(!(attr & MemAttribute.ASSIGNED)) {
					break;	// E.g. an EQU label
				}

				// Get association of address
				this.resetAddEmptyLine();
				const parent = this.addressParents[address];
				if(parent != prevParent) {
					this.addEmptyLines(lines);
					prevParent = parent;
				}

				// Check if label needs to be added to line (print label on own line)
				const addrLabel = this.labels.get(address);
				const comment = this.addressComments.get(address);

				if(addrLabel) {
					// Add empty lines in case this is a SUB, LBL or DATA label
					const type = addrLabel.type;
					if(type == NumberType.CODE_SUB || type == NumberType.CODE_LBL || type == NumberType.DATA_LBL || type == NumberType.CODE_RST) {
						this.addEmptyLines(lines);
					}
					// Add label on separate line
					let labelLine = addrLabel.name + ':';
					if(this.clmnsAddress > 0) {
						labelLine = Format.addSpaces(Format.getHexString(address), this.clmnsAddress) + labelLine;
						if(this.DBG_ADD_DEC_ADDRESS) {
							labelLine = Format.addSpaces(address.toString(), 5) + ' ' + labelLine;
						}
					}

					// Add comments
					const commentLines=Comment.getLines(comment, labelLine, this.disableCommentsInDisassembly);
					lines.push(...commentLines);
				}

				// Check if code or data should be disassembled
				let addAddress;
				let line;
				let commentText;
				if(attr & MemAttribute.CODE) {
					// CODE

					// Read opcode at address
					const opcode = Opcode.getOpcodeAt(this.memory, address);

					// Disassemble the single opcode
					const opCodeDescription = opcode.disassemble(this.memory);
					line = this.formatDisassembly(address, opcode.length, opCodeDescription.mnemonic);
					commentText = opCodeDescription.comment;
					addAddress = opcode.length;
				}

				else {
					// DATA
					if(!(prevMemoryAttribute & MemAttribute.DATA))
						this.addEmptyLines(lines);

					// Turn memory to data memory
					attr |= MemAttribute.DATA;

					// Read memory value at address
					let memValue = this.memory.getValueAt(address);

					// Disassemble the data line
					let mainString = this.rightCase('DEFB ') +  Format.getHexString(memValue, 2) + 'h';
					commentText = Format.getVariousConversionsForByte(memValue);
					line = this.formatDisassembly(address, 1, mainString);

					// Next address
					addAddress = 1;
				}

				// Debug
				if(this.DBG_ADD_DEC_ADDRESS) {
					line = Format.addSpaces(address.toString(), 5) + ' ' + line;
				}

				// If not done before, add comments
				if(!comment || addrLabel) {
					// main comment already added or no comment present
					if (!this.disableCommentsInDisassembly && commentText && commentText.length > 0)
						line += '\t; ' + commentText;
					lines.push(line);
				}
				else {
					// Add comments
					const commentLines=Comment.getLines(comment, line, this.disableCommentsInDisassembly);
					lines.push(...commentLines);
				}

				// Next address
				address += addAddress;

				// Check if the next address is not assigned and put out a comment
				let attrEnd = this.memory.getAttributeAt(address);
				if(address < 0x10000) {
					if (!this.disableCommentsInDisassembly && !(attrEnd & MemAttribute.ASSIGNED)) {
						lines.push('; ...');
						lines.push('; ...');
						lines.push('; ...');
					}
				}

				prevMemoryAttribute = attr;
				// Log
//				console.log('DISASSEMBLY: ' + lines[lines.length-1]);
			}
		}

		// Return
		return lines;
	}


	/**
	 * Formats a disassembly string for output.
	 * @param address The address (for conditional output of the opcode byte values)
	 * @param size The size of the opcode.
	 * @param mainString The opcode string, e.g. "LD HL,35152"
	 */
	protected formatDisassembly(address: number, size: number, mainString: string): string {
		const memory = (this.addOpcodeBytes) ? this.memory : undefined;
		return Format.formatDisassembly(memory, this.opcodesLowerCase, this.clmnsAddress, this.clmnsBytes, this.clmnsOpcodeFirstPart, this.clmsnOpcodeTotal, address, size, mainString);
	}


	/**
	 * Returns the index as string digits are filled to match countDigits.
	 * @param index The index to convert.
	 * @param countDigits The number of digits to use.
	 */
	protected getIndex(index: number, countDigits: number) {
		const str = index.toString();
		return '0'.repeat(countDigits-str.length) + str;
	}


	/**
	 * Adds empty lines to the given array.
	 * The count depends on 'numberOfLinesBetweenBlocks'.
	 * @param lines Array to add the empty lines.
	 */
	protected addEmptyLines(lines: Array<string>) {
		if(this.emptyLinesWritten)
			return;	// Already written
		for(let i=0; i<this.numberOfLinesBetweenBlocks; i++) {
			lines.push('');
		}
		this.emptyLinesWritten = true;
	}


	/**
	 * Enables writing empyty lines.
	 * Used to prohibit that empty lines are written more than once.
	 */
	protected resetAddEmptyLine() {
		this.emptyLinesWritten = false;
	}


	/**
	 * Depending on 'opcodesLowerCase' the given string will be changed to lowercase.
	 * @param s The string to convert. Must be in upper case.
	 * @returns The same string or the lowercased string.
	 */
	protected rightCase(s: string): string {
		// Lowercase?
		if(this.opcodesLowerCase)
			return s.toLowerCase();
		return s;
	}


	/**
	 * Creates a reverted map from the this.labels map (<address, DisLabel>).
	 * The created map consists of key-value pairs <name,address>
	 * and is stored in this.revertedLabelMap.
	 */
	public createRevertedLabelMap() {
		this.revertedLabelMap = new Map<string, number>();
		for(const [address, label] of this.labels) {
			this.revertedLabelMap.set(label.getName(), address);
		}
	}


	/**
	 * Returns a map of chosen addresses, labels for creating the
	 * dot graph.
	 */
	public getGraphLabels(addrString: number|string, chosenLabels?: Map<number, DisLabel>): Map<number, DisLabel> {
		// Crete new map
		if(!chosenLabels)
			 chosenLabels = new Map<number, DisLabel>();

		// Convert to number
		let addr;
		if(typeof(addrString) == 'string') {
			addr = this.revertedLabelMap.get(addrString);
			if(!addr)
				throw Error('Could not find "' + addrString + '" while creating graph.');
		}
		else {
			// Number
			addr = addrString;
		}
		// Now get label
		const label = this.labels.get(addr);
		if(!label)
			throw Error('Could not find address for "' + addrString + '" while creating graph.');

        // Check if already in map
        if(!chosenLabels.get(addr)) {
			// Save in new map
			chosenLabels.set(addr, label);
			// Also add the called sub routines
			for(const called of label.calls) {
				// Recursive
				const callee = called.getName();
				this.getGraphLabels(callee, chosenLabels);
			}
		}

		// Return
		return chosenLabels;
	}


	/**
	 * Returns the labels call graph in dot syntax.
	 * Every main labels represents a bubble.
	 * Arrows from one bubble to the other represents
	 * calling the function.
	 * Call 'createRevertedLabelMap' before calling this function.
	 * @param labels The labels to print.
	 * @param name The name of the graph.
	 * @returns The dot graphic as text.
	 */
	public getCallGraph(labels: Map<number,DisLabel>): string {
		const rankSame1 = new Array<string>();
		const rankSame2 = new Array<string>();

		// header
		let text = 'digraph Callgraph {\n\n';
		text += this.dotFormatString + '\n';

		// Calculate size (font size) max and min
		const fontSizeMin = 13;
		const fontSizeMax = 40;
		//const min = this.statisticsMin.sizeInBytes;
		//const fontSizeFactor = (fontSizeMax-fontSizeMin) / (this.statisticsMax.sizeInBytes-min);
		const min = this.statisticsMin.CyclomaticComplexity;
		const complDiff = this.statisticsMax.CyclomaticComplexity-min
		const fontSizeFactor = (fontSizeMax-fontSizeMin) / ((complDiff < 8) ? 8 : complDiff);

		// Loop
		for(const [address, label] of labels) {
			const type = label.type;
			if(type != NumberType.CODE_SUB
				&& type != NumberType.CODE_LBL
				&& type != NumberType.CODE_RST)
				continue;
			//console.log(label.name + '(' + Format.getHexString(address) + '):')

			// Handle fill color (highlights)
			let colorString = this.dotMarkedLabels.get(address);
			if(!colorString) {
				// Now try also the label name
				colorString = this.dotMarkedLabels.get(label.getName());
			}

			// Skip other labels
			if(label.isEqu) {
				// output gray label to indicate an EQU label
				if(!colorString)
					colorString = 'lightgray';
				text += label.name + ' [fontsize="' + fontSizeMin + '"];\n';
				const nodeName = this.nodeFormat(label.name, label.id, address, undefined, undefined, undefined);
				text += label.name + ' [label="' + nodeName + '"];\n';
			}
			else {
				// A normal label.
				// Size
				const stats = this.subroutineStatistics.get(label)!;
				assert(stats);
				const fontSize = fontSizeMin + fontSizeFactor*(stats.CyclomaticComplexity-min);

				// Output
				text += '"' + label.name + '" [fontsize="' + Math.round(fontSize) + '"];\n';
				const nodeName = this.nodeFormat(label.name, label.id, address, stats.CyclomaticComplexity, stats.sizeInBytes, stats.countOfInstructions);
				text += '"' + label.name + '" [label="' + nodeName + '"];\n';
				//text += '"' + label.name + '" [label="' + label.name + '\\nID=' + label.id + '\\nCC=' + stats.CyclomaticComplexity + '\\n"];\n';

				// List each callee only once
				const callees = new Set<DisLabel>();
				for(const callee of label.calls) {
					callees.add(callee);
				}
				// Output all called labels in different color:
				if(label.references.size == 0 || label.type == NumberType.CODE_LBL) {
					//const callers = this.getCallersOf(label);
					if(!colorString)
						colorString = 'lightyellow';
					if(label.references.size == 0)
						rankSame1.push(label.name);
					else
						rankSame2.push(label.name);
				}

				if(callees.size > 0)
					text += '"' + label.name + '" -> { ' + Array.from(callees).map(refLabel => '"'+refLabel.name+'"').join(' ') + ' };\n';
			}

			// Color
			if(colorString)
				text += '"' + label.name + '" [fillcolor=' + colorString + ', style=filled];\n';
		}

		// Do some ranking.
		// All labels without callers are ranked at the same level.
		if(rankSame1.length > 0)
			text += '\n{ rank=same; "' + rankSame1.join('", "') + '" };\n\n';
		if(rankSame2.length > 0)
			text += '\n{ rank=same; "' + rankSame2.join('", "') + '" };\n\n';

		// ending
		text += '}\n';

		// return
		return text;
	}


	/**
	 * Does the formatting for the node in the dot file.
	 * @param labelName E.g. "SUB33"
	 * @param labelId The unique number of each label.
	 * @param address E.g. F7A9
	 * @param cc Cyclomatic Complexity, e.g. 3
	 * @param size Size in bytes.
	 * @param instructions Number of instructions.
	 */
	protected nodeFormat(labelName: string, labelId: number, address: number, cc?: number, size?: number, instructions?: number): string {
		// Check if formatting is correct
		let text = this.nodeFormatString;
		try {
			text = text.replace(/\${label}/g, labelName);
			text = text.replace(/\${id}/g, labelId.toString());
			text = text.replace(/\${address}/g, Format.getHexString(address,4));
			text = text.replace(/\${CC}/g, (cc) ? cc.toString() : '?');
			text = text.replace(/\${size}/g, (size) ? size.toString() : '?');
			text = text.replace(/\${instructions}/g, (instructions) ? instructions.toString() : '?');
		}
		catch(e) {
			throw Error('Dot format string wrong: ' + e);
		}
		return text;
	}


	/**
	 * Highlights a node (bubble) in the dot graphics.
	 * @param addr The address (node) to highlight.
	 * @param colorString The color used for highlighting. E.g. "yellow".
	 */
	public setDotHighlightAddress(addr: number|string, colorString: string) {
		this.dotMarkedLabels.set(addr, colorString);
	}


	/**
	 * Returns a Flow-Chart for the given addresses.
	 * Output can be used as input to graphviz.
	 * @param startAddresses An array with the start address of the subroutines.
	 */
	public getFlowChart(startAddresses: Array<number>): string {
		// header
		let text = 'digraph FlowChart {\n\n';

		// appearance
		text += 'node [shape=box];\n';

		for(const startAddress of startAddresses) {
			// Start
			const label = this.labels.get(startAddress);
			const addressString = Format.getHexString(startAddress,4);
			let name;
			if(label)
				name = label.name;
			if(!name)
				name += '0x' + addressString;
			const start = 'b' + addressString + 'start';
			text += start + ' [label="' + name + '", fillcolor=lightgray, style=filled, shape=tab];\n';
			text += start + ' -> b' + Format.getHexString(startAddress,4) + ';\n';
			const end = 'b' + addressString + 'end';
			text += end + ' [label="end", shape=doublecircle];\n';

			// Get all addresses belonging to the subroutine
			const addrsArray = new Array<number>();
			this.getSubroutineAddresses(startAddress, addrsArray);
			// Now reduce array. I.e. only a coherent block will be treated as a subroutine.
			this.reduceSubroutineAddresses(startAddress, addrsArray);

			// get the text for all branches
			const processedAddrsArray = new Array<number>();
			const bText = this.getBranchForAddress(startAddress, addrsArray, processedAddrsArray);
			text += bText;
		}

		// ending
		text += '\n}\n';

		// return
		return text;
	}


	/**
	 * Returns the text of one branch (or recursively more branches)
	 * of the flowchart of one subroutine.
	 * @param address The start address of the branch.
	 * @param addrsArray The array that contains all addresses belonging to the subroutine.
	 * @param processedAddrsArray At the start an empty array. Is filled with all processed addresses.
	 */
	protected getBranchForAddress(address: number, addrsArray: Array<number>, processedAddrsArray: Array<number>): string {
		const branch = 'b' + Format.getHexString(address,4);
		let text = branch + ' [label="';
		let disTexts: Array<string> = [];
		let opcode;

		do {
			// Add to new array
			processedAddrsArray.push(address);

			// check opcode
			opcode = Opcode.getOpcodeAt(this.memory, address);

			// Add disassembly to label text
			const disText = opcode.disassemble();
			disTexts.push(disText.mnemonic);

			// Next
			address += opcode.length;

			// stop if a label is found
			if(this.labels.get(address))
				break;

		} while(!(opcode.flags & OpcodeFlag.BRANCH_ADDRESS) // branch-address includes a CALL
			&& !(opcode.flags & OpcodeFlag.RET)
			&& !(opcode.flags & OpcodeFlag.STOP));

		// finish text
		text += disTexts.join('\\l') + '\\l';
		text += '"];\n'

		// Maybe branch
		if(opcode.flags & OpcodeFlag.BRANCH_ADDRESS) {
			const branchAddress = opcode.value;
			// Check if outside
			if(addrsArray.indexOf(branchAddress) >= 0) {
				// Inside
				text += branch + ' -> b' + Format.getHexString(branchAddress,4) + ' [headport="n", tailport="e"];\n';
				// Check if already disassembled
				if(processedAddrsArray.indexOf(branchAddress) < 0) {
					// No, so disassemble
					const textBranch = this.getBranchForAddress(branchAddress, addrsArray, processedAddrsArray);
					text += textBranch;
				}
			}
		}


		// Check if we need to call another branch
		if(!(opcode.flags & OpcodeFlag.STOP)) {
			// Call another branch.
			// Check if outside
			if(addrsArray.indexOf(address) >= 0) {
				// Inside
				text += branch + ' -> b' + Format.getHexString(address,4) + ';\n';
				// Check if already disassembled
				if(processedAddrsArray.indexOf(address) < 0) {
					// No, so disassemble
					const textBranch = this.getBranchForAddress(address, addrsArray, processedAddrsArray);
					text += textBranch;
				}
			}
		}

		// Check if subroutine ends here (RET or JP)
		if(opcode.flags & (OpcodeFlag.STOP|OpcodeFlag.RET)) {
			// Subroutine ends
			assert(addrsArray.length > 0);
			text += branch + ' -> b' + Format.getHexString(addrsArray[0],4) + 'end;\n';
		}

		// Return
		return text;
	}

}

