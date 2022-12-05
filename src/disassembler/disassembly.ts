import {Format} from "./coredisassembler/format";
import {Opcode} from "./coredisassembler/opcode";
import {RenderHint, RenderText} from "./rendertext";
import {SmartDisassembler} from "./smartdisassembler";
import {Labels} from "../labels/labels";
import {Utility} from "../misc/utility";
import {Z80Registers} from "../remotes/z80registers";
import {Settings} from '../settings/settings';
import {MemAttribute} from './coredisassembler/memory';
import {Remote} from '../remotes/remotebase';


/// The filename used for the temporary disassembly. ('./.tmp/disasm.list')
const TmpDasmFileName = 'disasm.list';


/**
 * This class encapsulates a few disassembling functions.
 * Used in DeZog when no file is associated with code.
 *
 * The disassembly works on the complete 64k memory space.
 * At start the 64k memory is fetched from the remote and disassembled.
 * A new fetch is done if either the slots change, if the memory at the current PC
 * has changed or if the user presses the refresh button.
 * A new disassembly is done if the memory is refreshed or if there are new addresses to disassemble.
 * If the disassembly is not recent the refresh button is enabled for indication.
 *
 * The last PC values are stored because these values are known to be code locations and are used
 * for the disassembly.
 * A special handling is done for the callstack: The caller of the current subroutine cannot be
 * determined to 100%.
 * I.e. the stack might be misinterpreted.
 * Therefore the stack addresses are stored in a different array. This array is cleared when the refresh button is pressed.
 * I.e. if something looks strange the user can reload the disassembly.
 */
export class DisassemblyClass extends SmartDisassembler {

	/**
	 * Create the disassembler singleton.
	 */
	public static createDisassemblySingleton() {
		Disassembly = new DisassemblyClass();
		Disassembly.funcGetLabel = (addr64k: number) => {
			// Convert to long address
			const longAddr = Z80Registers.createLongAddress(addr64k);
			// Check if label already known
			const labels = Labels.getLabelsForLongAddress(longAddr);
			if (labels.length == 0)
				return undefined;
			return labels[0];	// Just return first label
		};
		Format.hexFormat = 'h';	// For all disassemblers
		// Lower or upper case
		Opcode.InitOpcodes();
		if (Settings.launch.smartDisassemblerArgs.lowerCase)
			Opcode.makeLowerCase();
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


	/// An array of last PC addresses (long).
	protected longPcAddressesHistory: number[] = [];

	/// An array of (long) addresses from the callstack. The addresses might overlap with the longPcAddressesHistory array.
	protected longCallStackAddresses: number[] = [];

	/// Stores last disassembled text.
	protected disassemblyText: string = '';

	// Map with the long address to line number relationship and vice versa.
	protected addrLineMap = new Map<number, number>();
	protected lineAddrArray = new Array<number | undefined>();


	/** Adds the long address to this.longPcAddressesHistory
	 * if not existing already.
	 * @param pcLong The new long pc value.
	 */
	public pushLongPcAddress(pcLong: number) {
		if(!this.longPcAddressesHistory.includes(pcLong))
			this.longPcAddressesHistory.push(pcLong);
	}


	/** Returns the last disassembled text.
	 * @returns text from last call to RenderText.renderSync().
	 */
	public getDisassemblyText(): string {
		return this.disassemblyText;
	}


	/** Returns the line number for a given address.
	 * @param longAddress The long address.
	 * @returns The corresponding line number (beginning at 0) or undefined if no such line exists.
	 */
	public getLineForAddress(longAddress: number): number | undefined {
		return this.addrLineMap.get(longAddress);
	}


	/**
	 * Returns the line numbers for given addresses.
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
	 * @returns The long address or -1 if none exists for the line.
	 */
	public getAddressForLine(lineNr: number): number {
		if (lineNr >= this.lineAddrArray.length)
			return -1;
		const longAddr = this.lineAddrArray[lineNr];
		if (longAddr == undefined)
			return -1;
		return longAddr;
	}


	/** Fetches the complete 64k memory from the Remote.
	 * Note: Could maybe be optimized to fetch only changed slots.
	 * On the other hand: the disassembly that takes place afterwards
	 * is much slower.
	 */
	protected async fetch64kMemory(): Promise<void> {
		// Fetch memory
		const mem = await Remote.readMemoryDump(0, 0x10000);
		this.memory.clearAttributes();
		this.setMemory(0, mem);
	}


	/** Compare if the slots (the banking) has changed.
	 * @param slots The other slot configuration.
	 * @returns true if the slots are different.
	 */
	protected slotsChanged(slots: number[]): boolean {
		if (!this.slots)
			return true;	// No previous slots
		const len = this.slots.length;
		if (len != slots.length)
			return true;
		for (let i = 0; i < len; i++) {
			if (this.slots[i] != slots[i])
				return true;
		}
		// Everything is the same
		return false;
	}


	/** Clears the stored call stack addresses and
	 * clears the slots so that on next call to 'setNewAddresses'
	 * new memory is loaded and a new disassembly is done.
	 * Done on a manual refresh.
	 */
	public prepareRefresh() {
		this.longCallStackAddresses = [];
		this.slots = [];
	}


	/** Invalidates the current disassembly.
	 * This will trigger a new disassembly and a new memory fetch when setNewAddresses is called.
	 */
	public invalidateDisassembly() {
		this.slots = undefined as any;
	}


	/** Called when a stack trace request is done. Ie. when a new PC with call stack
	 * is available.
	 * The first call stack address is the current PC.
	 * If the slots have changed beforehand new memory is fetched from the Remote.
	 * @param longCallStackAddresses The call stack.
	 * @returns true if a new disassembly was done.
	 */
	public async setNewAddresses(longCallStackAddresses: number[]): Promise<boolean> {
		let disasmRequired = false;
		let pcAddr64k;

		// Check if addresses passed
		const len = longCallStackAddresses.length;
		if (len > 0) {
			// Note: the current PC address is for sure paged in.
			// The other call stack addresses most probably are but there is some chance
			// that they are in a different bank.
			// We need to check if they can be disassembled safely.
			// This is if the address is in a simple bank slot.
			// Even if PC is the same slot this does not 100% assure that caller was in same bank.
			// So e.g. for the ZXNext the whole call stack could not be used.
			pcAddr64k = longCallStackAddresses[0] & 0xFFFF;
		}

		// Check if slots changed
		const slots = Z80Registers.getSlots();
		if (this.slotsChanged(slots)) {
			this.setCurrentSlots(slots);
			disasmRequired = true;
		}
		else {
			// Check if memory at current PC has changed, e.g. because of self modifying code.
			if (pcAddr64k != undefined) {
				// Fetch one byte
				const pcData = await Remote.readMemoryDump(pcAddr64k, 1);
				// Compare
				const prevData = this.memory.getValueAt(pcAddr64k);
				if (pcData[0] != prevData)
					disasmRequired = true;
			}
		}
		// Fetch memory?
		if (disasmRequired) {
			await this.fetch64kMemory();	// Clears also attributes
		}

		// Check current pc
		if (pcAddr64k != undefined) {
			// Check if PC address needs to be added
			const attr = this.memory.getAttributeAt(pcAddr64k);
			if (!(attr & MemAttribute.CODE_FIRST)) {
				// Is an unknown address, add it
				this.pushLongPcAddress(longCallStackAddresses[0]);
				disasmRequired = true;
			}
		}

		// Check if call stack addresses need to be added
		for (let i = 1; i < len; i++) {
			const longAddr = longCallStackAddresses[i];
			const addr64k = longAddr & 0xFFFF;
			if (this.isSingleBankSlot(addr64k)) {
				const attr = this.memory.getAttributeAt(addr64k);
				if (!(attr & MemAttribute.CODE_FIRST)) {
					// Is an unknown address, add it
					this.longCallStackAddresses.push(longAddr);
					disasmRequired = true;
				}
			}
		}

		// Now a complex check:
		// If user just breaked manually the PC can be at a position where
		// no disassembly of the previous line(s) exist.
		// This is not so nice as we cannot see where the program flow came
		// from.
		// So we check if the address above the PC is already known to be
		// CODE.
		// If not we get a trace back from the Remote (only zsim) and add
		// that to the addresses that should be disassembled.
		let traceBackAddrs: number[] = [];
		if (pcAddr64k != undefined) {
			const attrPrev = this.memory.getAttributeAt((pcAddr64k-1) & 0xFFFF);
			if (!(attrPrev & MemAttribute.CODE)) {
				// No CODE yet
				traceBackAddrs = await Remote.getTraceBack();	// Long addresses
			}
		}

		// Check if disassembly is required
		if (disasmRequired) {
			const codeAddresses = Labels.getLongCodeAddresses();
			// Add all addresses
			const allAddrs = [
				...traceBackAddrs,
				...this.longPcAddressesHistory,
				...this.longCallStackAddresses,
				...codeAddresses, // Also add any CODE addresses, given by the user from the rev-eng.list file
			];
			// Convert to 64k addresses
			const addrs64k = this.getOnlyPagedInAddresses(allAddrs);

			// Get all skip addresses and convert to 64k
			const longSkipAddresses = Labels.getLongSkipAddresses();
			this.skipAddrs64k = this.getOnlyPagedInAddressesForMap(longSkipAddresses);

			// Collect all long address labels and convert to 64k
			const labels = this.get64kLabels();
			// Disassemble
			this.getFlowGraph(addrs64k, labels);
			this.disassembleNodes();

			// Convert to start nodes
			const startNodes = this.getNodesForAddresses(addrs64k);
			// Get max depth
			const {depth, } = this.getSubroutinesFor(startNodes);	// Only depth is required at this point.

			// Clear line arrays
			this.lineAddrArray = [];
			this.addrLineMap.clear();
			// Render text
			const renderer = new RenderText(this,
				(addr64k: number) => {
					// Convert to long address
					const longAddr = Z80Registers.createLongAddress(addr64k, this.slots);

					// Check if entry already exists (is filtered in this case
					const entry = Labels.getSourceFileEntryForAddress(longAddr);
					let render: RenderHint = RenderHint.RENDER_EVERYTHING;
					if (entry) {
						render = (entry.size) ? RenderHint.RENDER_NOTHING : RenderHint.RENDER_DATA_AND_DISASSEMBLY;
					}

					// Returns:
					// RENDER_EVERYTHING = Render label, data and disassembly
					// RENDER_DATA_AND_DISASSEMBLY = Render no label
					// RENDER_NOTHING = Do not render the current line at all
					return render;
				},
				(lineNr: number, addr64k: number, bytesCount: number) => {
					// Convert to long address
					const longAddr = Z80Registers.createLongAddress(addr64k, this.slots);
					// Add to arrays
					while (this.lineAddrArray.length <= lineNr)
						this.lineAddrArray.push(longAddr);
					// Add all bytes
					this.addrLineMap.set(longAddr, lineNr);
					for (let i = 1; i < bytesCount; i++) {
						addr64k++;
						if (addr64k > 0xFFFF)
							break;	// Overflow from 0xFFFF
						const longAddr = Z80Registers.createLongAddress(addr64k, this.slots);
						this.addrLineMap.set(longAddr, lineNr);
					}
				});
			this.disassemblyText = renderer.renderSync(startNodes, depth);
		}

		return disasmRequired;
	}


	/** Returns given addresses if they are currently paged in.
	 * @param src The source array with long addresses.
	 * are currently paged in.
	 * @returns An array with 64k addresses.
	 */
	protected getOnlyPagedInAddresses(src: number[]): number[] {
		const result: number[] = [];
		for (const longAddr of src) {
			// Create 64k address
			const addr64k = longAddr & 0xFFFF;
			// Check if longAddr is currently paged in
			const longCmpAddress = Z80Registers.createLongAddress(addr64k, this.slots);
			// Compare
			if (longAddr == longCmpAddress) {
				// Is paged in
				result.push(addr64k);
			}
		}
		return result;
	}


	/** Returns a new map but only with items that contain addresses which are currently paged in.
	 * @param src The source map with long addresses.
	 * @returns A map with 64k addresses.
	 */
	protected getOnlyPagedInAddressesForMap(src: Map<number, number>): Map<number, number> {
		const result = new Map<number, number>();
		for (const [longAddr, skip] of src) {
			// Create 64k address
			const addr64k = longAddr & 0xFFFF;
			// Check if longAddr is currently paged in
			const longCmpAddress = Z80Registers.createLongAddress(addr64k, this.slots);
			// Compare
			if (longAddr == longCmpAddress) {
				// Is paged in
				result.set(addr64k, skip);
			}
		}
		return result;
	}


	/** Checks if an address belongs to a single bank slot.
	 * @param addr64k A 64k address.
	 * @returns true: if single bank slot or unassigned, false: if multibank slot
	 */
	protected isSingleBankSlot(addr64k: number): boolean {
		const addressSlotBank = this.addressesSlotBankInfo[addr64k];
		if (!addressSlotBank)
			return true;	// Undefined = not multislot
		return addressSlotBank.singleBank;
	}
}


// Used for the singleton.
export let Disassembly: DisassemblyClass;
