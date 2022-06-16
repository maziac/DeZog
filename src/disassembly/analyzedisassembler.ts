import {Disassembler} from "../disassembler/disasm";
import {Opcode, Opcodes} from "../disassembler/opcode";
import {Labels} from "../labels/labels";
import {ReverseEngineeringLabelParser} from "../labels/reverseengineeringlabelparser";
import {Utility} from '../misc/utility';
import {Remote} from "../remotes/remotebase";
import {Z80Registers} from "../remotes/z80registers";
import {Settings} from '../settings/settings';



/**
 * This class is especially used to create call graphs and flow charts.
 */
export class AnalyzeDisassembler extends Disassembler {

	// The current slots in use.
	protected static slots: number[];


	/**
	 * Sets the slots array.
	 * Used to set the slots that are active during disassembly.
	 *
	 */
	public static setSlots(slots: number[]): void {
		this.slots = slots;
	}


	// Map with the long address to line number relationship and vice versa.
	protected addrLineMap = new Map<number, number>();
	protected lineAddrArray = new Array<number | undefined>();


	/**
	 * Constructor.
	 */
	constructor() {
		super();

		// Initialize for DeZog
		this.automaticAddresses = false;
		this.specialLabels = false;
		this.commentsInDisassembly = false;
		this.enableStatistics = false;
		this.equsInDisassembly = false;
		this.orgInDisassembly = false;
		this.numberOfLinesBetweenBlocks = 2;
		this.numberOfDefbBytes = 4;
		this.addDefbComments = true;
		this.ignoreIncompleteOpcodes = true;

		// Use internal labels.
		this.funcAssignLabels = (addr64k: number) => {
			// Convert to long address
			const longAddr = Z80Registers.createLongAddress(addr64k);
			// Check if label already known
			const labels = Labels.getLabelsForLongAddress(longAddr);
			if (labels && labels.length > 0) {
				return labels.join(' or ');
			}
			// Otherwise simple hex string, e.g. "C000"
			//return 'L' + Utility.getHexString(addr64k, 4);
			return undefined;
		};

		// No filtering for now.
		this.funcFilterAddresses = undefined as any;

		// Add bank info to the address.
		this.funcFormatAddress = (addr64k: number) => {
			// Convert to long address
			const longAddr = Z80Registers.createLongAddress(addr64k);
			// Formatting
			let addrString = Utility.getHexString(addr64k, 4);
			const shortName = Remote.memoryModel.getBankShortNameForAddress(longAddr);
			if (shortName)
				addrString += ReverseEngineeringLabelParser.bankSeparator + shortName;
			//addrString += '[' + shortName + ']';
			return addrString;
		};

		// Characters reserved for the address field
		this.clmnsAddress = 8;	// E.g. 0000:5

		// Do not find interrupt labels
		this.findInterrupts = false;

		// Restore 'rst 8' opcode
		Opcodes[0xCF] = new Opcode(0xCF, "RST %s");

		// Setup configuration.
		if (Settings.launch.disassemblerArgs.esxdosRst) {
			// Extend 'rst 8' opcode for esxdos
			Opcodes[0xCF].appendToOpcode(",#n");
		}
	}


	/**
	 * Initializes the memory with the data at the given addresses.
	 * Additionally puts the addresses in the address queue.
	 * All long addresses. Are converted to 64k.
	 */
	public initWithCodeAddresses(addresses: number[], mem: Array<{address: number, data: Uint8Array}>) {
		// Init
		this.initLabels();
		this.addrLineMap = new Map<number, number>();
		this.lineAddrArray = new Array<number | undefined>();
		// Write new memory
		this.memory.clearAttributes();	// Clear all memory
		for (const block of mem)
			this.setMemory(block.address & 0xFFFF, block.data);
		const addrs = addresses.map(addr => addr & 0xFFFF);
		this.setAddressQueue(addrs);
		this.setStartAddressesWithoutLabel(addrs);
	}


	/**
	 * Disassembles the memory.
	 * Additionally keeps the address/line locations.
	 */
	public disassemble() {
		// Disassemble
		super.disassemble();
		// Get address/line relationship.
		let lineNr = 0;
		this.addrLineMap.clear();
		this.lineAddrArray.length = 0;
		const slots = Z80Registers.getSlots();
		for (const line of this.disassembledLines) {
			let address = parseInt(line, 16);
			if (!isNaN(address)) {
				// Convert to long address
				address = Z80Registers.createLongAddress(address, slots);
				// Add to arrays;
				while (this.lineAddrArray.length <= lineNr)
					this.lineAddrArray.push(address);
				// Add all bytes
				this.addrLineMap.set(address, lineNr);
				const match = /\S+\s*(( [a-f\d][a-f\d])+)/i.exec(line);
				if (match) {
					const bytesCount = match[1].length / 3;
					const addr = address & 0xFFFF;
					const upperAddr = address & (~0xFFFF);
					for (let i = 1; i < bytesCount; i++) {
						const longAddr = upperAddr | ((addr + i) & 0xFFFF);
						this.addrLineMap.set(longAddr, lineNr);
					}
				}
			}
			lineNr++;
		}
	}


	/**
	 * Returns the line number for a given address.
	 * @param longAddress The long address.
	 * @returns The corresponding line number (beginning at 0) or undefined if no such line exists.
	 */
	public getLineForAddress(longAddress: number): number | undefined {
		return this.addrLineMap.get(longAddress);
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
	 * @returns The  long address or -1 if none exists for the line.
	 */
	public getAddressForLine(lineNr: number): number {
		if (lineNr >= this.lineAddrArray.length)
			return -1;
		const line = this.lineAddrArray[lineNr];
		if (line == undefined)
			return -1;
		return line;
	}

}
