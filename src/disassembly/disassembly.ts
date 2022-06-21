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
	protected slots: number[];


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
	 * Sets the slots array.
	 * Used to set the slots that are active during disassembly.
	 * Used to compare if the slots (the banking) has changed.
	 * @param slots The new slot configuration.
	 */
	public setSlots(slots: number[]): void {
		this.slots = slots;
	}


	/**
	 * Compare if the slots (the banking) has changed.
	 * @param slots The other slot configuration.
	 * @returns true if the slots are different.
	 */
	public slotsChanged(slots: number[]): boolean {
		const len = this.slots.length;
		if (len != slots.length)
			return false;
		for (let i = 0; i < len; i++) {
			if (this.slots[i] != slots[i])
				return false;
		}
		return true;
	}

}


// Used for the singleton.
export let Disassembly: DisassemblyClass;
