import { MemAttribute } from './../disassembler/memory';
import { Remote } from './../remotes/remotebase';
import {Format} from "../disassembler/format";
import {Labels} from "../labels/labels";
import {Utility} from '../misc/utility';
import {Z80Registers} from "../remotes/z80registers";
import {Settings} from '../settings/settings';
import {AnalyzeDisassembler} from './analyzedisassembler';


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
export class DisassemblyClass extends AnalyzeDisassembler {

	/**
	 * Create the disassembler singleton.
	 */
	public static createDisassemblySingleton() {
		Disassembly = new DisassemblyClass();
		Format.hexFormat = 'h';	// For all disassemblers
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


	// The current slots in use.
	protected slots: number[] = [];


	/// An array of last PC addresses (long).
	protected longPcAddressesHistory: number[] = [];

	/// An array of (long) addresses from the callstack. The addresses might overlap with the longPcAddressesHistory array.
	protected longCallStackAddresses: number[] = [];


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

		// Filter any address that is already present in the list file(s).
		this.funcFilterAddresses = (addr64k: number) => {
			// Convert to long address
			const longAddr = Z80Registers.createLongAddress(addr64k);
			// Check if label has a file associated
			const entry = Labels.getSourceFileEntryForAddress(longAddr);
			return (entry == undefined || entry.size == 0);	// Filter only non-existing addresses or addresses with no code
		};
	}


	/**
	 * Fetches the complete 64k memory from the Remote.
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


	/**
	 * Sets the slots array.
	 * Used to set the slots that are active during disassembly.
	 * Used to compare if the slots (the banking) has changed.
	 * @param slots The new slot configuration.
	 */
	protected setSlots(slots: number[]): void {
		this.slots = slots;
	}


	/**
	 * Compare if the slots (the banking) has changed.
	 * @param slots The other slot configuration.
	 * @returns true if the slots are different.
	 */
	protected slotsChanged(slots: number[]): boolean {
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


	/**
	 * Clears the stored call stack addresses and
	 * clears the slots so that on next call to 'setNewAddresses'
	 * new memory is loaded and a new disassembly is done.
	 * Done on a manual refresh.
	 */
	public prepareRefresh() {
		this.longCallStackAddresses = [];
		this.slots = [];
	}


	/**
	 * Called when a stack trace request is done. Ie. when a new PC with call stack
	 * is available.
	 * The first call stack address is the current PC.
	 * IF the slots have changed beforehand new memory is fetched from the Remote.
	 * @param longCallStackAddresses The call stack.
	 * @returns true if a new disassembly was done.
	 */
	public async setNewAddresses(longCallStackAddresses: number[]): Promise<boolean> {
		let disasmRequired = false;
		let pcAddr64k;

		// Check if addresses passed
		const len = longCallStackAddresses.length;
		if (len > 0) {
			// Note: the current PC address (and the call stack addresses) are for sure paged in, i.e. the conversion to a bank is not necessary.
			pcAddr64k = longCallStackAddresses[0] & 0xFFFF;
		}

		// Check if slots changed
		const slots = Z80Registers.getSlots();
		if (this.slotsChanged(slots)) {
			this.setSlots(slots);
			await this.fetch64kMemory();
			disasmRequired = true;
		}
		else {
			// Check if memory at current PC has changed, e.g. because of self modifying code.
			if (pcAddr64k != undefined) {
				// Fetch one byte
				const pcData = await Remote.readMemoryDump(pcAddr64k, 1);
				// Compare
				const prevData = this.memory.getValueAt(pcAddr64k);
				if (pcData[0] != prevData) {
					await this.fetch64kMemory();
					disasmRequired = true;
				}
			}
		}

		// Check current pc
		if (pcAddr64k != undefined) {
			// Check if PC address needs to be added
			const attr = this.memory.getAttributeAt(pcAddr64k);
			if (!(attr & MemAttribute.CODE_FIRST)) {
				// Is an unknown address, add it
				this.longPcAddressesHistory.push(longCallStackAddresses[0]);
				disasmRequired = true;
			}
		}

		// Check if call stack addresses need to be added
		for (let i = 1; i < len; i++) {
			const longAddr = longCallStackAddresses[i];
			const addr = longAddr & 0xFFFF;
			const attr = this.memory.getAttributeAt(addr);
			if (!(attr & MemAttribute.CODE_FIRST)) {
				// Is an unknown address, add it
				this.longCallStackAddresses.push(longAddr);
				disasmRequired = true;
			}
		}

		// Check if disassembly is required
		if(disasmRequired) {
			// Get all addresses
			const addrs64k = this.getOnlyPagedInAddresses(this.longPcAddressesHistory);
			const csAddrs64k = this.getOnlyPagedInAddresses(this.longCallStackAddresses);
			addrs64k.push(...csAddrs64k);

			// Set addresses for the memory
			this.setAddressQueue(addrs64k);
			this.setStartAddressesWithoutLabel(addrs64k);

			// Disassemble
			Disassembly.disassemble();
		}

		return disasmRequired;
	}



	/**
	 * Adds addresses of the PC history if they are currently paged in.
	 * @param src The source array with long addresses. Only addresses are added to target that
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
				result.push(longAddr & 0xFFFF);
			}
		}
		return result;
	}

}


// Used for the singleton.
export let Disassembly: DisassemblyClass;
