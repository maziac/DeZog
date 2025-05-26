import {Settings} from './../../settings/settings';
import {MemBuffer, Serializable} from '../../misc/membuffer';
import {BankType, MemoryModel, SlotRange} from '../MemoryModel/memorymodel';
import * as fs from "fs";
import * as path from 'path';
import * as intelHex from 'intel-hex';
import {Z80Ports} from './z80ports';
import {Utility} from '../../misc/utility';



/** Watchpoint class used by 'watchPointMemory'.
 */
interface SimWatchpoint {
	// read/write are counters. They are reference counts and count how many
	// read/write access points have been set. If 0 then no watchpoint is set.
	read: number;
	write: number;
}


/** Holds the slot name and the corresponding index.
 */
interface SlotName {
	// The index of the slot.
	index: number;

	// The name of the slot
	name: string;
}


/** Represents the simulated memory.
 * It is a base class to allow memory paging etc.
 * The simulated memory always works with slots although they might not be visible
 * to the outside.
 * The bank/slot association is taken from the MemoryModel.
 */
export class SimulatedMemory implements Serializable {
	// Function used to add an error to the diagnostics.
	public static addDiagnosticsErrorFunc: ((message: string, severity: 'error' | 'warning', filepath: string, line: number, column: number) => void) | undefined;


	// The memory separated in banks.
	protected memoryBanks: Uint8Array[];

	// The memory model used for this memory.
	protected memoryModel: MemoryModel;

	// Points to this.memoryModel.slotAddress64kAssociation
	protected slotAddress64kAssociation;

	// Derived from this.memoryModel.slotAddress64kAssociation.
	// Holds only the start address of the slot.
	//protected slotRangesStart: number[];

	// Holds only the size of the slot range.
	//protected slotRangesSize: number[];

	// Holds all slot ranges.
	public slotRanges: SlotRange[] = [];


	// Holds the slot assignments to the banks.
	protected slots: number[];

	// For each bank this array tells if it is ROM or read-only (e.g. not populated).
	// For each bank this array tells if it is writable or not.
	// RAM is writable.
	// ROM and unpopulated areas (see ZX16K) are  not writable.
	protected bankTypes: BankType[];

	// The number of bits to shift to get the slot from the address
	protected shiftCount: number;

	// Visual memory: shows the access as an image.
	// The image is just 1 pixel high.
	protected visualMemory: Array<number>;

	// The size of the visual memory.
	protected VISUAL_MEM_SIZE_SHIFT = 8;

	// Colors:
	protected VISUAL_MEM_COL_READ = 1;
	protected VISUAL_MEM_COL_WRITE = 2;
	protected VISUAL_MEM_COL_PROG = 3;


	// Flag that is set if a watchpoint was hot.
	// Has to be reset manually before the next turn.
	public watchpointHit: boolean;

	// If watchpointHit was set the address where the hit occurred.
	// -1 if no hit.
	public hitAddress: number;

	// The kind of access, 'r'ead or 'w'rite.
	public hitAccess: string;

	// An array of 0-0xFFFF entries, one for each address.
	// If an address has no watchpoint it is undefined.
	// If it has it points to a SimWatchpoint.
	// Note: as watchpoints are areas, several addresses might share the same SimWatchpoint.
	protected watchPointMemory: Array<SimWatchpoint>;


	// The context used to pass to the ioMmu script.
	// Note: it is persistent between calls, i.e. it can also be used to store state.
	protected bankSwitchingContext: any;

	// Holds the slot indices and the names.
	protected slotNames: SlotName[];


	/** Constructor.
	 * Configures the slot and bank count.
	 * @param memModel The memory model to use. Includes all slots definition and banks.
	 * @param ports The port instance for registering the IO MMU handlers.
	 */
	constructor(memModel: MemoryModel, ports: Z80Ports) {
		// Store
		this.memoryModel = memModel;
		this.slotAddress64kAssociation = memModel.slotAddress64kAssociation;
		//this.slotRangesStart = memModel.slotRanges.map(slotRange => slotRange.start);
		//this.slotRangesSize = memModel.slotRanges.map(slotRange => slotRange.end + 1 - slotRange.start);
		this.slotRanges = memModel.slotRanges;

		// m1read8 (opcode fetch) is normally the same as a normal read.
		// The zx81 ula will manipulate this.
		this.m1Read8 = this.read8.bind(this);

		// Create visual memory
		this.visualMemory = new Array<number>(1 << (16 - this.VISUAL_MEM_SIZE_SHIFT));	// E.g. 256
		this.clearVisualMemory();

		// Memory is organized in banks.
		const bankCount = memModel.banks.length;
		this.memoryBanks = new Array<Uint8Array>(bankCount);
		this.bankTypes = new Array<BankType>(bankCount);
		// Allocate
		for (let i = 0; i < bankCount; i++) {
			const bank = memModel.banks[i];
			if (bank) {
				const memBank = new Uint8Array(bank.size);
				this.memoryBanks[i] = memBank;
				this.bankTypes[i] = bank.bankType;
				// Fill memory with default value
				memBank.fill(bank.defaultFill);
				// Check for rom
				let rom = bank.rom;
				if (rom) {
					if (typeof rom === 'string') {
						// Read file
						const romData = this.readRomFile(rom);	// Note: is already a unified path
						// Use data
						const offs = bank.romOffset ?? 0;
						memBank.set(romData.slice(offs, offs + memBank.length));
					}
				}
			}
		}

		// Associate banks with slots
		this.slots = [...memModel.initialSlots];	// Copy

		// And install the port handlers
		this.slotNames = [];
		for (let i = 0; i < this.memoryModel.slotRanges.length; i++) {
			const slotRange = this.memoryModel.slotRanges[i];
			if (slotRange.name)
				this.slotNames.push({index: i, name: slotRange.name});
		}
		this.installIoMmuHandlers(ports);

		// Check the ioMmu
		this.bankSwitchingContext = {};
		this.checkIoMmu();
		this.bankSwitchingContext = {};

		// Breakpoints
		this.clearHit();
		// Create watchpoint area
		this.watchPointMemory = Array.from({length: 0x10000}, () => ({read: 0, write: 0}));
	}


	/** Registers the IO MMU handlers for switching the banks through writing
	 * to an IO port.
	 * @param ports The instance to register the functions.
	 */
	protected installIoMmuHandlers(ports: Z80Ports) {
		// Install handler
		ports.registerGenericOutPortFunction((port: number, value: number) => {
			const prevSlots = [...this.slots];
			this.setSlotsInContext();
			// Calculate bank
			this.evaluateIoMmu(this.memoryModel.ioMmu, port, value);
			this.getSlotsFromContext();
			// Check for error
			try {
				this.checkSlots();
			}
			catch (e) {
				// Restore previous slots
				this.slots = [...prevSlots];
				// Adjust message
				e.message = "ioMmu: " + e.message;
				throw e;
			}
		});
	}


	/** Sets the named slots into the 'bankSwitchingContext'.
	 */
	protected setSlotsInContext() {
		for (const slotName of this.slotNames) {
			this.bankSwitchingContext[slotName.name] = this.slots[slotName.index];
		}
	}


	/** Retrieves the named slots from the 'bankSwitchingContext'.
	 */
	protected getSlotsFromContext() {
		for (const slotName of this.slotNames) {
			this.slots[slotName.index] = this.bankSwitchingContext[slotName.name];
		}
	}


	/** Checks that all slots are pointing to valid banks.
	 */
	protected checkSlots() {
		const len = this.slots.length;
		for (let i = 0; i < len; i++) {
			const bankNr = this.slots[i];
			// Check if bank exists at all
			if (!this.memoryBanks[bankNr])
				throw Error("Trying to switch to non-existing bank " + bankNr + ".");
			// Check if bank belongs to slot
			const banks = this.slotRanges[i].banks;
			if (!banks.has(bankNr)) {
				const slotName = this.slotRanges[i].name || i.toString;	// NOSONAR
				throw Error("Trying to switch to bank " + bankNr + " which is not available for slot " + slotName + ".");
			}
		}
	}


	/** Calculates the bank number from the 'portValue'.
	 * @param ioMmu A string that is evaluated with 'eval'.
	 * It should evaluate 'portValue' and calculate the bank number from it.
	 * E.g. this could involve masking some bits of 'portValue' and maybe adding
	 * an offset.
	 * E.g. 'portValue & 0x07' would mask all other than the last 3 bits
	 * which form the bank number.
	 * @param portAddress The port address.
	 * @param portValue The value that was written to the port.
	 */
	protected evaluateIoMmu(ioMmu: string, portAddress: number, portValue: number) {
		try {
			// Run with a timeout of 1000ms.
			this.bankSwitchingContext.portAddress = portAddress;
			this.bankSwitchingContext.portValue = portValue;
			this.bankSwitchingContext.slots = this.slots;	// Note: slots can be either changed by name or by index.
			Utility.runInContext(ioMmu, this.bankSwitchingContext, 1000);
		}
		catch (e) {
			// In case of an error try to find where it occurred
			e.message = this.memoryModel.name + ' Memory Model: ' + e.message;
			// Re-throw
			throw e;
		}
	}


	/** Check if ioMmu is a valid js script.
	 * throws if ioMmu is wrong.
	 * @param ioMmu The java script in a string.
	 */
	protected checkIoMmu() {
		let ioMmu = this.memoryModel.ioMmu;
		if (!ioMmu)
			return;

		try {
			// Set slots etc.
			this.setSlotsInContext();
			this.bankSwitchingContext.portAddress = -1;
			this.bankSwitchingContext.portValue = 0xFF;
			this.bankSwitchingContext.slots = this.slots;	// Note: slots can be either changed by name or by index.
			// For performance reasons the loop is run inside the vm
			ioMmu = "for (portAddress = 0; portAddress < 0x10000; portAddress++) {\n"
				+ ioMmu + "}\n";
			// Run with a timeout of 1000ms.
			const filename = Utility.getLaunchJsonPath(Utility.getRootPath());
			Utility.runInContext(ioMmu, this.bankSwitchingContext, 1000, filename, -1);
		}
		catch (e) {
			// In case of an error try to find where it occurred
			const portAddress = this.bankSwitchingContext.portAddress;
			if (portAddress >= 0) {
				const hexPort = Utility.getHexString(portAddress, 4);
				e.message = this.memoryModel.name + ' Memory Model problem at port address 0x' + hexPort + ': ' + e.message;
			}
			else {
				e.message = this.memoryModel.name + ' Memory Model: ' + e.message;
			}
			// Add diagnostics message
			if (SimulatedMemory.addDiagnosticsErrorFunc && e.position) {
				// Improve message. E.g. ".../.vscode/launch.json:4" will become ".../.vscode/launch.json:'Internal simulator'.zsim.customMemory.ioMmu:4"
				const find = 'launch.json:';
				let msg: string = e.message;
				let k = msg.indexOf(find);
				if (k >= 0) {
					k += find.length;
					const configName = (Settings.launch as any).name;
					msg = msg.substring(0, k) + "'" + configName + "'.zsim.customMemory.ioMmu: line " + msg.substring(k);
				}
				// Remove the "^^^^^^" Error location. The diagnostics anyhow remove all spaces.
				// I.e. it would point to the wrong location.
				const msgs = msg.split('\n');
				for (let i = 1; i < msgs.length; i++) {
					const line = msgs[i];
					if (/^\s*\^/.exec(line)) {
						/*
						// Get number of spaces in previous line
						const prevLine = msgs[i - 1];
						const match = /^(\s*)\S/.exec(prevLine);
						if (match) {
							const len = match[1].length;
							// Remove leading spaces
							msgs[i - 1] = prevLine.substring(len);
							msgs[i] = line.substring(len);
							// Substitute spaces in ^^^^ string, so that they are not removed by diagnostics
							msgs[i] = msgs[i].replace(/\s/g, '.');
						}
						*/
						// Simply remove line
						msgs.splice(i, 1);
						break;
					}
				}
				msg = msgs.join('\n');
				// Send to diagnostics
				SimulatedMemory.addDiagnosticsErrorFunc(msg, 'error', e.position.filename, 0, 0);
			}
			// Re-throw
			throw e;
		}
	}


	/** Clears the whole memory (all banks) with 0s.
	 * So far only used by unit tests.
	 */
	public clear() {
		for (const bank of this.memoryBanks)
			bank.fill(0);
	}


	/** Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Get slot/bank mapping
		memBuffer.write8(this.slots.length);
		for (const bank of this.slots)
			memBuffer.write8(bank);

		// Store banks
		for (const bank of this.memoryBanks)
			memBuffer.writeArrayBuffer(bank);

		// Write the bank switching context
		const contextString = JSON.stringify(this.bankSwitchingContext);
		memBuffer.writeString(contextString);
	}


	/** Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Store slot/bank association
		const slotLength = memBuffer.read8();
		this.slots = [];
		for (let i = 0; i < slotLength; i++)
			this.slots.push(memBuffer.read8());

		// Create memory banks
		for (const bank of this.memoryBanks) {
			const buffer = memBuffer.readArrayBuffer();
			if (buffer.length != bank.byteLength)
				throw Error("Can't read data. Loaded format is different.");
			bank.set(buffer);
		}

		// Get the bank switching context
		const contextString = memBuffer.readString();
		this.bankSwitchingContext = JSON.parse(contextString);

		// Clear visual memory
		this.clearVisualMemory();
	}


	/** Adds a watchpoint address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public setWatchpoint(address: number, size: number, access: string) {
		const readAdd = access.includes('r') ? 1 : 0;
		const writeAdd = access.includes('w') ? 1 : 0;
		// Set area
		for (let i = 0; i < size; i++) {
			const wp = this.watchPointMemory[address & 0xFFFF];
			wp.read += readAdd;
			wp.write += writeAdd;
			address++;
		}
	}


	/** Removes a watchpoint address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public removeWatchpoint(address: number, size: number, access: string) {
		const readAdd = access.includes('r') ? 1 : 0;
		const writeAdd = access.includes('w') ? 1 : 0;
		// remove area
		for (let i = 0; i < size; i++) {
			const wp = this.watchPointMemory[address & 0xFFFF];
			if (wp.read > 0)
				wp.read -= readAdd;
			if (wp.write > 0)
				wp.write -= writeAdd;
			address++;
		}
	}


	/** Clears the hit flag and the arrays.
	 */
	public clearHit() {
		this.hitAddress = -1;
		this.hitAccess = '';
	}


	// Read 1 byte during M1 cycle, i.e. opcode fetch.
	// This is used by the Z80 CPU.
	// It was necessary to emulate the ZX81 ULA (display).
	// In other cases this is the same as read8.
	// Is set in the constructor and manipulated by the zx81 ULA.
	public m1Read8: (addr64k: number) => number;


	// Read 1 byte.
	// This is used by the Z80 CPU.
	// Note: no special check is done reading UNUSED memory. As this cannot be
	// written a read will always return the default value (defaultFill).
	public read8(addr64k: number): number {
		// Check for watchpoint access
		const wp = this.watchPointMemory[addr64k];
		if (wp) {
			// Check access
			if ((this.hitAddress < 0) && wp.read > 0) {
				// Read access
				this.hitAddress = addr64k;
				this.hitAccess = 'r';
			}
		}

		// Visual memory
		this.visualMemory[addr64k >>> this.VISUAL_MEM_SIZE_SHIFT] = this.VISUAL_MEM_COL_READ;

		// Read
		const slotIndex = this.slotAddress64kAssociation[addr64k];
		const bankNr = this.slots[slotIndex];
		const rangeStart = this.slotRanges[slotIndex].start;
		const offs = addr64k - rangeStart;
		const value = this.memoryBanks[bankNr][offs];
		return value;
	}

	// Write 1 byte.
	// This is used by the Z80 CPU.
	public write8(addr64k: number, val: number) {
		// Check for watchpoint access
		const wp = this.watchPointMemory[addr64k];
		if (wp) {
			// Check access
			if ((this.hitAddress < 0) && wp.write > 0) {
				// Write access
				this.hitAddress = addr64k;
				this.hitAccess = 'w';
			}
		}

		// Visual memory
		this.visualMemory[addr64k >>> this.VISUAL_MEM_SIZE_SHIFT] = this.VISUAL_MEM_COL_WRITE;


		// Read
		const slotIndex = this.slotAddress64kAssociation[addr64k];
		const bankNr = this.slots[slotIndex];

		// Don't write if non-writable, e.g. ROM or UNUSED
		if (this.bankTypes[bankNr] === BankType.RAM) {
			const rangeStart = this.slotRanges[slotIndex].start;
			const offs = addr64k - rangeStart;
			// Write
			this.memoryBanks[bankNr][offs] = val;
		}
	}


	/** Returns the number of banks.
	 */
	public getNumberOfBanks(): number {
		return this.memoryBanks.length;
	}


	/** @param bankNr The bank number.
	 * @returns the Uint8Array of a bank.
	 */
	public getBankMemory(bankNr: number): Uint8Array {
		return this.memoryBanks[bankNr];
	}


	// Reads a value from the memory. Value can span over several bytes.
	// This is **not** used by the Z80 CPU.
	// Used to read the WORD at SP or to read a 4 byte opcode.
	// @param addr64k The 64k start address
	// @param size The length of the value in bytes.
	// @returns The value (little endian)
	public getMemoryValue(addr64k: number, size: number): number {
		let value = 0;
		let shift = 1;

		for (let i = size; i > 0; i--) {
			// Read
			const slotIndex = this.slotAddress64kAssociation[addr64k];
			const bankNr = this.slots[slotIndex];
			const rangeStart = this.slotRanges[slotIndex].start;
			const offs = addr64k - rangeStart;
			const val8 = this.memoryBanks[bankNr][offs];
			// Store
			value += val8 * shift;
			// Next
			addr64k = (addr64k + 1) & 0xFFFF;
			shift *= 256;
		}

		return value;
	}


	// Reads 2 bytes.
	// This is **not** used by the Z80 CPU.
	// Used e.g to read the WORD at SP.
	public getMemory16(addr64k: number): number {
		return this.getMemoryValue(addr64k, 2);
	}

	// Reads 4 bytes.
	// This is **not** used by the Z80 CPU.
	// Used to read an opcode which is max. 4 bytes.
	public getMemory32(addr64k: number): number {
		return this.getMemoryValue(addr64k, 4);
	}


	/** Write to memoryData directly into a bank.
	 * Is e.g. used during SNA / NEX file loading.
	 * @param bankNr The bank to write.
	 * @param bankOffset Offset into the bank buffer.
	 * @param data The data to write.
	 * @param dataOffset Offset into the data buffer.
	 * @param size The number of bytes to write.
	 */
	public writeMemoryData(bankNr: number, bankOffset: number, data: Uint8Array, dataOffset: number, size: number) {
		const bank = this.memoryBanks[bankNr];
		// Write
		bank.set(data.slice(dataOffset, dataOffset + size), bankOffset);
	}


	/** Returns the bank and offset into the bank for a given address and slots configuration.
	 * @param addr64k The 64k address.
	 * @param slots The (current) slot configuration.
	 * @returns {bank, offset}
	 */
	public getBankAndOffsetForAddress(addr64k: number, slots: number[]): {bank: number, offset: number} {
		const slot = this.memoryModel.slotAddress64kAssociation[addr64k];
		const bank = slots[slot];
		const startAddr = this.memoryModel.slotRanges[slot].start;
		const offset = addr64k - startAddr;
		return {bank, offset};
	}


	// Write 1 byte.
	public setVisualProg(addr: number) {
		// Visual memory
		this.visualMemory[addr >>> this.VISUAL_MEM_SIZE_SHIFT] = this.VISUAL_MEM_COL_PROG;
	}


	/** Associates a slot with a bank number.
	 */
	public setSlot(slot: number, bank: number) {
		this.slots[slot] = bank;
	}


	/** Returns the slots array.
	 */
	public getSlots(): number[] {
		return this.slots;
	}


	/** Returns the bank for a 64k address.
	 * @param addr64k The 64k address.
	 * @returns The bank number.
	 */
	// public getBankForAddr64k(addr64k: number): number {
	// 	const slot = this.memoryModel.slotAddress64kAssociation[addr64k];
	// 	return this.slots[slot];
	// }


	/** Reads a block of bytes.
	 * @param startAddr64k The 64k start address
	 * @param size The length of the data in bytes.
	 * @returns The data as Uint8Array (a new array is returned.)
	 */
	public readBlock(startAddr64k: number, size: number): Uint8Array {
		const data = new Uint8Array(size);
		let dataOffset = 0;

		while (size > 0) {
			// Get start address and bank
			const slotIndex = this.slotAddress64kAssociation[startAddr64k];
			const bankNr = this.slots[slotIndex];
			const rangeStart = this.slotRanges[slotIndex].start;
			const offs = startAddr64k - rangeStart;
			const bank = this.memoryBanks[bankNr];
			if (!bank)
				break;	// A switch to a non existing bank happened.
			const rangeSize = this.slotRanges[slotIndex].end + 1 - rangeStart;
			// Copy
			let sizeOffs = rangeSize - offs;
			if (sizeOffs > size)
				sizeOffs = size;
			data.set(bank.slice(offs, offs + sizeOffs), dataOffset);
			// Next
			dataOffset += sizeOffs;
			size -= sizeOffs;
			startAddr64k = (startAddr64k + sizeOffs) & 0xFFFF;
		}

		return data;
	}


	/** Writes a block of bytes.
	 * But does not write to UNUSED memory.
	 * @param startAddress The 64k start address.
	 * @param data The block to write.
	 * @param allowedTypes The allowed bank types. Default is UNKNOWN, ROM and RAM.
	 * E.g. if you only want to allow to write to RAM set [BankType.RAM].
	 */
	public writeBlock(startAddr64k: number, data: Buffer | Uint8Array, allowedTypes: BankType[] = [BankType.ROM, BankType.RAM, BankType.UNKNOWN]) {
		if (!(data instanceof Uint8Array))
			data = new Uint8Array(data);
		// The block may span several banks.
		let dataOffset = 0;
		let size = data.byteLength;

		while (size > 0) {
			// Get start address and bank
			const slotIndex = this.slotAddress64kAssociation[startAddr64k];
			const bankNr = this.slots[slotIndex];
			const rangeStart = this.slotRanges[slotIndex].start;
			const offs = startAddr64k - rangeStart;
			const bank = this.memoryBanks[bankNr];
			Utility.assert(bank, "writeBlock: Bank " + bankNr + " not found.");
			// if (!bank)
			// 	break;	// A switch to a non existing bank happened.
			const rangeSize = this.slotRanges[slotIndex].end + 1 - rangeStart;
			// Copy
			let sizeOffs = rangeSize - offs;
			if (sizeOffs > size)
				sizeOffs = size;
			if (allowedTypes.includes(this.bankTypes[bankNr])) {
				bank.set(data.slice(dataOffset, dataOffset + sizeOffs), offs);
			}
			// Next
			dataOffset += sizeOffs;
			size -= sizeOffs;
			startAddr64k = (startAddr64k + sizeOffs) & 0xFFFF;
		}
	}


	/** Writes a complete memory bank.
	 * @param bankNr The bank number.
	 * @param block The block to write.
	 */
	public writeBank(bankNr: number, block: Buffer | Uint8Array) {
		const bank = this.memoryBanks[bankNr];
		if (block.length != bank.byteLength)
			throw Error("writeBank: Block length " + block.length + " not allowed. Expected " + bank.byteLength + ".");
		bank.set(block);
	}


	/** Clears the visual buffer.
	 */
	public clearVisualMemory() {
		this.visualMemory.fill(0);
	}


	/** @returns The visual memory as a buffer.
	 */
	public getVisualMemory(): number[] {
		return this.visualMemory;
	}


	/** Reads a file in Intel hex file format.
	 * @param filePath Absolute path to the *.hex file.
	 * @returns An Uint8Array with the data.
	 */
	protected readHexFromFile(filePath: string): Uint8Array {
		const {data}: {data: Buffer} = intelHex.parse(fs.readFileSync(filePath));
		return new Uint8Array(data);
	}


	/** Reads a ROM file.
	 * @param filePath Absolute path to the *.hex file or a raw data file.
	 * @returns An Uint8Array with the data.
	 */
	protected readRomFile(filePath: string): Uint8Array {
		switch (path.extname(filePath).toLowerCase()) {
			case ".hex":
				return this.readHexFromFile(filePath);
			default: {
				const romBuffer = fs.readFileSync(filePath);
				const romUint8 = Uint8Array.from(romBuffer);
				return romUint8;
			}
		}
	}
}
