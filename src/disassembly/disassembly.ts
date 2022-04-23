import {Opcode, Opcodes} from "../disassembler/opcode";
import {Disassembler} from "../disassembler/disasm";
import {Utility} from '../misc/utility';
import {Settings} from '../settings';
import {Z80Registers} from "../remotes/z80registers";
import {Labels} from "../labels/labels";
import {MemAttribute} from "../disassembler/memory";



/// The filename used for the temporary disassembly. ('./.tmp/disasm.list')
const TmpDasmFileName = 'disasm.list';



/**
 * This class encapsulates a few disassembling functions.
 */
export class DisassemblyClass extends Disassembler {

	/**
	 * Creates the singleton.
	 */
	public static createDisassemblyInstance() {
		Disassembly = new DisassemblyClass();

		// Use internal labels.
		Disassembly.funcAssignLabels = (addr: number) => {
			// Check if label already known
			const labels = Labels.getLabelsForNumber64k(addr);	// TODO: Check if this array also contains long addresses & 0xFFFF
			if (labels && labels.length > 0) {
				return labels.join(' or ');
			}
			// Otherwise simple hex string
			return 'L' + Utility.getHexString(addr, 4);
		};

		// Filter any address that is already present in the list file(s).
		Disassembly.funcFilterAddresses = (addr: number) => {
			return true;
			// Check if label has a file associated
			const entry = Labels.getSourceFileEntryForAddress(addr & 0xFFFF);	// TODO: The banking is not correct: Only the current bank should be used.
			if (entry)
				console.log('addr=', addr);
			return (entry == undefined);	// Filter only non-existing addresses
		};

		// Restore 'rst 8' opcode
		Opcodes[0xCF] = new Opcode(0xCF, "RST %s");

		// Setup configuration.
		if (Settings.launch.disassemblerArgs.esxdosRst) {
			// Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
		}
	}


	/**
	 * Returns the file path of the temporary disassembly file.
	 * @returns The relative file path, e.g. ".tmp/disasm.list".
	 * Or undefined if Settings.launch not yet created.
	 */
	public static getAbsFilePath(): string {
		if (!Settings.launch)
			return undefined as any;
		const relPath = Utility.getRelTmpFilePath(TmpDasmFileName);
		const absPath = Utility.getAbsFilePath(relPath);
		return absPath;
	}


	// Map with the address to line number relationship and vice versa.
	protected addrLineMap = new Map<number, number>();
	protected lineAddrArray = new Array<number | undefined>();


	/**
	 * Initializes the memory with the data at the given addresses.
	 * Additionally puts the addresses in the address queue.
	 */
	public initWithCodeAdresses(addresses: number[], mem: Array<{address: number, data: Uint8Array}>) {
		// Init
		this.initLabels();
		this.addrLineMap = new Map<number, number>();
		this.lineAddrArray = new Array<number | undefined>();
		// Write new memory
		this.memory.clrAssignedAttributesAt(0x0000, 0x10000);	// Clear all memory
		for (const block of mem)
			this.setMemory(block.address & 0xFFFF, block.data);
		this.setAddressQueue(addresses.map(addr => addr & 0xFFFF));
	}


	/**
	 * Adds new memory and (trace) addresses.
	 * @param mem An array with memory data.
	 * @param addresses An array with code addresses. (Only the 64k part will be used)
	 */
	public addMemAndAddresses(mem: Array<{address: number, data: Uint8Array}>, addresses: number[]) {
		// Write new memory
		//this.memory.clrAssignedAttributesAt(0x0000, 0x10000);	// Clear all memory
		for (const block of mem)
			this.setMemory(block.address & 0xFFFF, block.data);

		// Convert addresses to 64k
		const addresses64k = addresses.map(addr => addr & 0xFFFF);
		this.addressQueue.push(...addresses64k);
	}


	/**
	 * Disassembles the memory.
	 * Additionally keeps the address/line locations.
	 */
	public disassemble() {
		// No comments
		this.disableCommentsInDisassembly = true;
		// Disassemble
		super.disassemble();
		// Get address/line relationship.
		let lineNr = 0;
		this.addrLineMap.clear();
		this.lineAddrArray.length = 0;
		let slots;
		if (Labels.AreLongAddressesUsed())
			slots = Z80Registers.getSlots();
		for (const line of this.disassembledLines) {
			let address = parseInt(line, 16);
			if (!isNaN(address)) {
				// Convert to long address
				address = Z80Registers.createLongAddress(address, slots);
				// Add to arrays
				this.addrLineMap.set(address, lineNr);
				while (this.lineAddrArray.length <= lineNr)
					this.lineAddrArray.push(address);
			}
			lineNr++;
		}
	}


	/**
	 * Returns the line number for a given address.
	 * @param address The address.
	 * @returns The corresponding line number (beginning at 0) or undefined if no such line exists.
	 */
	public getLineForAddress(address: number): number | undefined {
		return this.addrLineMap.get(address);
	}


	/**
	 * Returns the line number for a given address.
	 * @param addresses An array with addresses.
	 * @returns An array with corresponding lines.
	 */
	public getLinesForAddresses(addresses: Set<number>): number[] {
		const lines = new Array<number>();
		const map = this.addrLineMap;
		// Check whichever has lower number of elements
		if (addresses.size > map.size) {
			// Loop over map
			map.forEach((value, key) => {
				if (addresses.has(key))
					lines.push(value);
			});
		}
		else {
			// Loop over addresses
			for (const address of addresses) {
				const line = map.get(address);
				if (line)
					lines.push(line);
			}
		}
		return lines;
	}


	/**
	 * Returns the address for a given line number.
	 * @param lineNr The line number starting at 0.
	 * @returns The address or -1 if none exists for the line.
	 */
	public getAddressForLine(lineNr: number): number {
		if (lineNr >= this.lineAddrArray.length)
			return -1;
		const line = this.lineAddrArray[lineNr];
		if (line == undefined)
			return -1;
		return line;
	}


	/**
	 * Checks that all addresses have attribute CODE_FIRST.
	 * @param addresses A list of addresses.
	 * @returns true if all addresses are of attribute CODE_FIRST.
	 */
	public checkCodeFirst(addresses: number[]) {
		for (const addr of addresses) {
			const memAttr = this.memory.getAttributeAt(addr & 0xFFFF);
			if (!(memAttr & MemAttribute.CODE_FIRST))
				return false;
		}
		// All are addresses have attribute CODE_FIRST.
		return true;
	}
}


export let Disassembly: DisassemblyClass;
