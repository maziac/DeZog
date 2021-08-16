//import { Log } from './log';
import { Labels } from '../labels/labels';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { Settings } from '../settings'
import { Utility } from '../misc/utility';
import { RefList } from '../misc/reflist';
import { Remote } from '../remotes/remotefactory';
import { Format } from '../disassembler/format';
import {DisassemblyClass} from '../misc/disassembly';
import {StepHistory} from '../remotes/cpuhistory';



/**
 * Represents a variable.
 * Variables know how to retrieve the data from the remote.
 */
export class ShallowVar {
	// Static bools to remember if some data type has been changed.
	// Is used to inform vscode about changes.
	public static pcChanged = false;
	public static spChanged = false;
	public static otherRegisterChanged = false;	// Other than pc and sp
	public static memoryChanged = false;


	// Clears all remembered flags.
	public static clearChanged() {
		this.pcChanged = false;
		this.spChanged = false;
		this.otherRegisterChanged = false;
		this.memoryChanged = false;
	}


	/**
	 *  Override this. It should retrieve the contents of the variable. E.g. by communicating with the remote.
	 * @param start The start index of the array. E.g. only the range [100..199] should be displayed.
	 * @param count The number of bytes to display.
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		return [];
	}


	/**
	 * Override if the variable or its properties can be set.
	 * Sets the value of the variable.
	 * The formatted read data is returned in the Promise.
	 * @param name The name of data.
	 * @param value The value to set.
	 * @returns A Promise with the formatted string. undefined if not implemented.
	 */
	public async setValue(name: string, value: number): Promise<string> {
		return undefined as any;
	};


	/**
	 * Checks if allowed to change the value.
	 * If not returns a string with an error message.
	 * Override if necessary.
	 * @param name The name of data.
	 * @returns 'Altering values not allowed in time-travel mode.' or undefined.
	 */
	public changeable(name: string): string|undefined {
		// Change normally not allowed if in reverse debugging
		if (StepHistory.isInStepBackMode())
			return 'Altering values not allowed in time-travel mode.';
		// Otherwise allow
		return undefined;
	}

}


/**
 * Represents a ShallowVar that is const, i.e. not changeable by the user.
 */
export class ShallowVarConst extends ShallowVar {
	/**
	 * Not changeable by user.
	 * @param name The name of data.
	 * @returns 'You cannot alter this value.'
	 */
	public changeable(name: string): string|undefined {
		return 'You cannot alter this value.';
	}
}


/**
 * The DisassemblyVar class knows how to retrieve the disassembly from the remote.
 */
export class DisassemblyVar extends ShallowVarConst {

	/// The address the disassembly should start
	public address: number;

	/// The number of lines for the disassembly
	public count: number;

	/// Pointer to the disassembly history.
	protected disassemblyHistory: Array<{address: number, text: string}>;


	/**
	 * Communicates with the Remote to retrieve the disassembly.
	 * @returns A Promise with the disassembly.
	 * A list with all disassembled lines is passed (as variables).
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		start = start || 0;
		count = count || (this.count - start);
		const end = start + count;

		// Get code memory
		const size = 4 * this.count;	// 4 is the max size of an opcode
		const data = await Remote.readMemoryDump(this.address, size);

		// Disassemble
		const dasmArray = DisassemblyClass.get(this.address, data, this.count);

		// Add extra info
		const list = new Array<DebugProtocol.Variable>();
		const dasmFiltered = dasmArray.filter((value, index) => (index >= start && index < end));
		for (const entry of dasmFiltered) {
			const address = entry.address;
			// Add to list
			const addrString = Format.getHexString(address).toUpperCase();
			const labels = Labels.getLabelsForNumber64k(address);
			let addrLabel = addrString;
			if (labels)
				addrLabel = labels.join(',\n');
			list.push({
				name: addrString,
				type: addrLabel,
				value: entry.instruction,
				variablesReference: 0
			});
		}

		// Pass data
		return list;
	}
}


/**
 * The MemorySlotsVar class knows how to retrieve the mapping of
 * memory slots and banks from Remote.
 */
export class MemorySlotsVar extends ShallowVarConst {
	/**
	 * Constructor.
	 */
	public constructor() {
		super();
	}


	/**
	 * Communicates with the Remote to retrieve the memory pages.
	 * @returns A Promise with the memory page data is available.
	 * A list with start/end address and name (bank name) is passed.
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		start = start || 0;

		// Get code memory
		const memoryBanks = await Remote.getMemoryBanks();
		count = count || (memoryBanks.length - start);
		// Convert array
		let slot = -1;
		const segments = new Array<DebugProtocol.Variable>(count);
		for (let i = 0; i < count; i++) {
			const bank = memoryBanks[i+start];
			const name = Utility.getHexString(bank.start, 4) + '-' + Utility.getHexString(bank.end, 4);
			slot++;
			const slotString = slot.toString();
			segments[i] = {
				name: slotString + ": " + name,
				type: "Slot " + slotString,
				value: bank.name,
				variablesReference: 0
			};
		};

		// Return
		return segments;
	}
}


/**
 * The RegistersMainVar class knows how to retrieve the register values from Remote.
 */
export class RegistersMainVar extends ShallowVar {

	/**
	 * Communicates with the remote to retrieve the register values.
	 * @returns A Promise with the register values.
	 * A list with all register values is passed (as variables).
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		start = start || 0;
		const regNames = this.registerNames();
		count = count || (regNames.length - start);
		const registers = new Array<DebugProtocol.Variable>(count);
		for (let i = 0; i < count; i++) {
			const regName = regNames[i + start];
			const formattedValue = Remote.getVarFormattedReg(regName);
			registers[i] = {
				name: regName,
				type: formattedValue,
				value: formattedValue,
				variablesReference: 0
			};
		}
		return registers;
	}



	/**
	 * Sets the value of the variable.
	 * The formatted read data is returned in the Promise.
	 * @param name The name of the register, e.g. "HL" or "A"
	 * @param value The value to set.
	 * @returns A Promise with the formatted string.
	 */
	public async setValue(name: string, value: number): Promise<string> {
		// Set value (works always for registers.
		if (!isNaN(value)) {
			await Remote.setRegisterValue(name, value);
			await Remote.getRegistersFromEmulator();
			// Handle PC special
			if (name == "PC") {
				StepHistory.clear();
				ShallowVar.pcChanged = true;
			}
			if (name == "SP") {
				StepHistory.clear();
				ShallowVar.spChanged = true;
			}
			else {
				ShallowVar.otherRegisterChanged = true;
			}
		}
		//await Remote.getRegisters()
		const formatted = Remote.getVarFormattedReg(name);
		return formatted;
	}

	/**
	 * Checks if allowed to change the value.
	 * If not returns a string with an error message.
	 * @param name The name of data.
	 * @returns 'Altering values not allowed in time-travel mode.' or undefined.
	 */
	public changeable(name: string): string|undefined {
		// Change normally not allowed if in reverse debugging
		if (StepHistory.isInStepBackMode())
			return 'Altering values not allowed in time-travel mode.';
		// Otherwise allow
		return undefined;
	}


	/**
	 * Returns the register names to show. The 1rst half of the registers.
	 */
	protected registerNames(): Array<string> {
		return ["PC", "SP", "A", "F", "HL", "DE", "BC", "IX", "IY",
				"B", "C", "D", "E", "H", "L"];
	}

}


/**
 * The RegistersMainVar class knows how to retrieve the register values from zeasrux.
 */
export class RegistersSecondaryVar extends RegistersMainVar {

	/**
	 * Returns the register names to show. The 2nd half of the registers.
	 */
	protected registerNames(): Array<string> {
		return ["A'", "F'", "HL'", "DE'", "BC'", "IXH", "IXL", "IYH", "IYL", "I", "R", "IM"];
	}
}


/**
 * The StackVar represents the stack variables. I.e. the pushed
 * registers that are on the stack. This stack contains only the pushed registers
 * until the next CALL return address.
 */
export class StackVar extends ShallowVar {

	private stack: Array<number>;	/// The stack objects.
	private stackAddress: number;	/// The start address of the stack.

	/**
	 * Sets stack array and address.
	 * @param stack The array containing the pushed data (address + value).
	 * @param stackAddress The start address of the stack (the top). The stack grows to bottom.
	 */
	public setFrameAddress(stack: Array<number>, stackAddress: number) {
		this.stack = stack;
		this.stackAddress = stackAddress;
	}


	/**
	 * Formats the stack.
	 * @returns A Promise with the stack values.
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		start = start || 0;
		count = count || (this.stack.length - start);

		// Calculate tabsizing array
		const format = Settings.launch.formatting.stackVar;
		const tabSizes = Utility.calculateTabSizes(format, 2);

		// Create list
		const stackList = new Array<DebugProtocol.Variable>(count);
		let undefText = "unknown";
		for (let i = 0; i < count; i++) {
			const index = i + start;
			const value = this.stack[index];
			const formatted = await Utility.numberFormatted('', value, 2, format, tabSizes, undefText);
			stackList[i] = {
				name: Utility.getHexString(this.stackAddress - 2 * index, 4),
				type: formatted,
				value: formatted,
				variablesReference: 0
			};
			// Next
			undefText = undefined as any;
		}

		return stackList;
	}


	/**
	 * Sets the value of the pushed stack data.
	 * Value is set and afterwards read.
	 * The formatted read data is returned in the Promise.
	 * @param name The 'name', the address as hex value, e.g. "041Ah".
	 * @param value The value to set.
	 * @returns A Promise with the formatted string.
	 */
	public async setValue(name: string, value: number): Promise<string> {
		// Check if address and value are valid
		const address = Utility.parseValue(name+'h');
		if(!isNaN(address) && !isNaN(value)) {
			// Change neg to pos
			if(value < 0)
				value += 0x10000;
			const data = new Uint8Array(2);
			data[0] = value & 0xFF;
			data[1] = value >>> 8;
			await Remote.writeMemoryDump(address, data);
			ShallowVar.memoryChanged = true;
		}

		// Retrieve memory values, to see if they really have been set.
		const data=await Remote.readMemoryDump(address, 2);
		const memWord = data[0] + (data[1]<<8);
		// Pass formatted string to vscode
		const formattedString = Utility.numberFormatted(name, memWord, 2, Settings.launch.formatting.stackVar, undefined);
		return formattedString;
	}
}


/**
 * Object used for the SubStructVar to store elements in the array.
 */
interface SubStructItems {
	// The corresponding address and size.
	address: number,
	// The size (1 or 2). Only used if itemRef is a function call.
	elemSize: number;
	// The reference to the variable or (in case of an immediate value)
	// the callback which return the result string.
	itemRef: number | (() => string);
	// In case of array, the count:
	indexedVariables: number
};


/**
 * The StructVar class is a container class which holds other properties (the elements of the
 * struct). I.e. SubStructVars.
 * The StructVar is the parent object which also holds the memory contents.
 * The SubStructVars refer to it.
 */
export class SubStructVar extends ShallowVar {
	// Holds a map with name and with the structure properties.
	protected propMap = new Map<string, SubStructItems>();


	/**
	 * Constructor.
	 * @param relIndex The relative address inside the parent's memory dump.
	 * @param count The count of elements to display. The count of elements in the struct
	 * (each can have a different size).
	 * @param elemSize The size of this object. All elements together.
	 * @param struct 'b'=byte, 'w'=word or 'bw' for byte and word.
	 * @param props An array of names of the direct properties of the struct.
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 * @param parentStruct The parent object which holds the memory. If undefined createpropArray is not called.
	 */
	public constructor(relIndex: number, count: number, elemSize: number, struct: string, props: Array<string>, list: RefList<ShallowVar>, parentStruct?: StructVar) {
		super();
		if (parentStruct) {
			this.createPropArray(relIndex, count, elemSize, struct, props, list, parentStruct);
		}
	}


	/**
	 * Creates the propArray.
	 * @param relIndex The relative address inside the parent's memory dump.
	 * @param count The count of elements to display. The count of elements in the struct
	 * (each can have a different size).
	 * @param elemSize The size of this object. All elements together.
	 * @param struct 'b'=byte, 'w'=word or 'bw' for byte and word.
	 * @param props An array of names of the direct properties of the struct.
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 * @param parentStruct A reference to a parent struct which retrieves the memory for all sub structs.
	 */
	protected createPropArray(relIndex: number, count: number, elemSize: number, struct: string, props: Array<string>, list: RefList<ShallowVar>, parentStruct: StructVar) {
		// Now create a new variable for each
		const unsortedMap = new Map<number, string>();
		for (const prop of props) {
			// Get the relative address
			const relAddr = Labels.getNumberFromString64k(struct + '.' + prop);
			unsortedMap.set(relAddr, prop);
		}
		// Sort map by indices
		const sortedMap = new Map([...unsortedMap.entries()].sort(
			(a, b) => a[0] - b[0]	// Sort numbers (first element)
		));
		// Add an end marker
		sortedMap.set(-1, '');
		// Get all lengths of the leafs and dive into nodes
		let prevName;
		let prevIndex;
		let lastIndex = elemSize;
		for (const [index, name] of sortedMap) {
			if (prevName) {
				let len;
				if (name) {
					// Create diff of the relative addresses
					len = index - prevIndex;
				}
				else {
					// Treat last element different
					// Create diff to the size
					len = lastIndex - prevIndex;
				}
				// Check for leaf or node
				const fullName = struct + '.' + prevName;
				const subProps = Labels.getSubLabels(fullName);
				const memIndex = relIndex + prevIndex;
				const address = parentStruct.getAddress() + memIndex;
				const item: SubStructItems = {
					address,
					elemSize: 0,
					itemRef: 0,
					indexedVariables: 0
				};
				if (subProps.length > 0) {
					// Node
					item.itemRef = list.addObject(new SubStructVar(relIndex, 1, len, fullName, subProps, list, parentStruct));
				}
				else {
					// Leaf
					const memIndex = relIndex + prevIndex;
					// Get value depending on len: 1 byte, 1 word or array.
					if (len <= 2) {
						// Byte or word
						item.elemSize = len;
						item.itemRef = () => {
							const mem = parentStruct.getMemory();
							const value = Utility.getUintFromMemory(mem, memIndex, len, true);	// Is done only for little endian, if wanted it could be extended to big endian
							const result = Utility.getHexString(value, 2 * len) + 'h';
							return result;
						};
					}
					else {
						// Array
						const memDumpVar = new MemDumpVar(parentStruct.getAddress(), elemSize, 1);
						memDumpVar.setParent(parentStruct, memIndex);
						item.itemRef = list.addObject(memDumpVar);
						item.indexedVariables = len;
					}
				}
				// Add to array
				this.propMap.set(prevName, item);
			}
			else {
				// Calculate last index
				lastIndex += index;
			}
			// Next
			prevName = name;
			prevIndex = index;
		}
	}


	/**
	 * Returns the properties.
	 * Ignores start and count for a struct.
	 * @returns A Promise with the properties.
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		// Return range
		const dbgVarArray = new Array<DebugProtocol.Variable>();
		for (const [name, item] of this.propMap) {
			// Add item to array for display
			let value = '';
			let ref = 0;
			if (typeof item.itemRef == 'number') {
				// Variables reference
				ref = item.itemRef;
			}
			else {
				// Callback which retrieves the result
				value = item.itemRef();
			}
			const result: DebugProtocol.Variable = {
				name: name,
				type: Utility.getHexString(item.address, 4) + 'h',
				value,
				variablesReference: ref,
				indexedVariables: item.indexedVariables
			};
			dbgVarArray.push(result);
		}
		return dbgVarArray;
	}


	/**
	 * Sets the value of the variable.
	 * The formatted read data is returned in the Promise.
	 * @param name The name of data. E.g. '[0]' or '[12]'
	 * @param value The value to set.
	 * @returns A Promise with the formatted string. undefined if not implemented.
	 */
	public async setValue(name: string, value: number): Promise<string> {
		// Get item
		const item = this.propMap.get(name)!;
		// Check if value is not an object itself
		if (typeof item.itemRef == 'number')
			return '';	// Variables reference

		// Otherwise change the value.

		// Get address
		const address = item.address;
		// Note: item.elemSize is <= 2

		// Change neg to pos
		if (value < 0)
			value += 0x10000;

		// Write data
		const dataWrite = new Uint8Array(item.elemSize);
		for (let i = 0; i < item.elemSize; i++) {
			dataWrite[i] = value & 0xFF;
			value = value >>> 8;
		}
		await Remote.writeMemoryDump(address, dataWrite);
		ShallowVar.memoryChanged = true;

		// Retrieve memory values, to see if they really have been set.
		const data = await Remote.readMemoryDump(address, item.elemSize);
		let readValue = 0;
		for (let i = item.elemSize - 1; i >= 0; i--) {
			readValue = readValue << 8;
			readValue += data[i] & 0xFF;
		}

		// Pass formatted string to vscode
		const formattedString = Utility.numberFormatted(name, readValue, item.elemSize, this.formatString(item.elemSize), undefined);
		return formattedString;
	};


	/**
	 * The format to use.
	 */
	protected formatString(elemSize: number): string {
		if (elemSize == 1)
			return Settings.launch.formatting.watchByte;	// byte
		else
			return Settings.launch.formatting.watchWord;	// word
	}

}



/**
 * The StructVar class is a container class which holds other properties (the elements of the
 * struct). I.e. SubStructVars.
 * The StructVar is the parent object which also holds the memory contents.
 * The SubStructVars refer to it.
 */
export class StructVar extends SubStructVar {

	// The memory contents (lazy initialized).
	protected memory: Uint8Array;

	// To store the base address.
	protected baseAddress: number;

	// The total number of bytes to read.
	protected countBytes: number;


	/**
	 * Constructor.
	 * @param addr The address of the memory dump
	 * @param count The count of elements to display. The count of elements in the struct
	 * (each can have a different size).
	 * @param size The size of this object. All elements together.
	 * @param struct 'b'=byte, 'w'=word or 'bw' for byte and word.
	 * @param props An array of names of the direct properties of the struct.
	 * @param parentStruct Not used at this level.
	 * @param list The list of variables. The constructor adds the variables to it.
	 */
	public constructor(addr: number, count: number, size: number, struct: string, props: Array<string>, list: RefList<ShallowVar>) {
		super(0, count, size, struct, props, list);
		this.baseAddress = addr;
		this.createPropArray(0, count, size, struct, props, list, undefined as any);
		// The amount of bytes to retrieve:
		this.countBytes = count * size;
	}


	/**
	 * Creates the propArray.
	 * On top level this is really an array.
	 * @param relIndex The relative address inside the parent's memory dump.
	 * @param count The count of elements to display. The count of elements in the struct
	 * (each can have a different size).
	 * @param elemSize The size of this object. All elements together.
	 * @param struct 'b'=byte, 'w'=word or 'bw' for byte and word.
	 * @param props An array of names of the direct properties of the struct.
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 * @param parentStruct If undefined the method does nothing. Otherwise it is the
	 * reference to a parent struct which retrieves the memory for all sub structs.
	 */
	protected createPropArray(relIndex: number, count: number, elemSize: number, struct: string, props: Array<string>, list: RefList<ShallowVar>, parentStruct: StructVar) {
		// But only if more than 1 element
		if (count <= 1) {
			super.createPropArray(relIndex, count, elemSize, struct, props, list, this);
		}
		else {
			// Create a number of nodes
			let relIndex = 0;
			for (let i = 0; i < count; i++) {
				let labelVar;
				const address = this.getAddress() + i * elemSize;
				const name = '[' + i + ']';
				const item: SubStructItems = {
					address,
					elemSize: 0,
					itemRef: 0,
					indexedVariables: 0
				};
				if (props.length) {
					// Sub structure
					labelVar = new SubStructVar(relIndex, 1, elemSize, struct, props, list, this);
				}
				else {
					// Simple array
					labelVar = new MemDumpVar(this.getAddress(), elemSize, 1);
					labelVar.setParent(this, relIndex);
					item.indexedVariables = elemSize;
				}
				item.itemRef = list.addObject(labelVar);
				this.propMap.set(name, item);
				// Next
				relIndex += elemSize;
			}
		}
	}


	/**
	 * Returns the properties.
	 * Retrieves the memory.
	 * @returns A Promise with the properties.
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		this.memory = await Remote.readMemoryDump(this.getAddress(), this.countBytes);
		// Check if properties array exists and create
		return await super.getContent(start, count);
	}


	/**
	 * Returns the cached memory. If not existing yet it is fetched.
	 */
	public getMemory() {
		return this.memory;
	}


	/**
	 * Returns the base address.
	 */
	public getAddress() {
		return this.baseAddress;
	}
}


/**
 * The MemDumpByteVar class knows how to retrieve a memory dump from remote.
 * It allows retrieval of byte and word arrays.
 */
export class MemDumpVar extends ShallowVar {

	/// The address of the memory dump.
	protected addr: number;

	// The element count.
	protected totalCount: number;

	// The element size. byte=1, word=2.
	protected elemSize: number;

	// The parent of the sub structure (which holds the memory contents.
	protected parentStruct: StructVar;

	// The offset (in bytes) where the displayed memory begins.
	protected memOffset: number;


	/**
	 * Constructor.
	 * @param addr The address of the memory dump.
	 * @param totalCount The element count.
	 * @param elemSize The element size. byte=1, word=2.
	 */
	public constructor(addr: number, totalCount: number, elemSize: number) {
		super();
		this.addr = addr;
		this.totalCount = totalCount;
		this.elemSize = elemSize;
		this.memOffset = 0;
	}


	/**
	 * Set a parent which holds the memory.
	 * @param parentStruct The parent object which holds the memory.
	 * @param memOffset The offset (in bytes) where the displayed memory begins.
	 */
	public setParent(parentStruct: StructVar, memOffset: number) {
		this.parentStruct = parentStruct;
		this.memOffset = memOffset;
	}


	/**
	 * Communicates with the remote to retrieve the memory dump.
	 * @param handler This handler is called when the memory dump is available.
	 * @param start The start index of the array. E.g. only the range [100..199] should be displayed.
	 * @param count The number of bytes to display.
	 * Note: start, count are only used for arrays.
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		start = start || 0;
		count = count || (this.totalCount - start);
		let addr = this.addr + start;
		const elemSize = this.elemSize;
		const memArray = new Array<DebugProtocol.Variable>();
		const format = this.formatString();

		// Check for parent
		let memory;
		let offset = this.memOffset;
		if (this.parentStruct) {
			// Use memory of parent
			memory = this.parentStruct.getMemory();
			offset += elemSize * start!;
		}
		else {
			// Get memory
			memory = await Remote.readMemoryDump(addr, count * elemSize);
		}

		// Calculate tabsizing array
		const tabSizes = Utility.calculateTabSizes(format, elemSize);
		// Format all array elements
		let k = offset;
		for (let i = 0; i < count!; i++) {
			// Get value
			let value = memory[k++];
			let mult = 1;
			for (let j = 1; j < elemSize; j++) {
				mult *= 256;
				value += mult * memory[k++];
			}
			// Format
			const addr_i = addr + offset + i * elemSize;
			const formatted = Utility.numberFormattedSync(value, elemSize, format, false, undefined, undefined, tabSizes);
			// Add to array
			const descr = Utility.getHexString(addr_i, 4) + 'h'
			memArray.push({
				name: "[" + (start + i) + "]",
				type: descr,
				value: formatted,
				variablesReference: 0
			});
		}

		// Pass data
		return memArray;
	}


	/**
	 * The format to use.
	 */
	protected formatString(): string {
		if (this.elemSize == 1)
			return Settings.launch.formatting.watchByte;	// byte
		else
			return Settings.launch.formatting.watchWord;	// word
	}


	/**
	 * Sets the value of the variable.
	 * The formatted read data is returned in the Promise.
	 * @param name The name of data. E.g. '[0]' or '[12]'
	 * @param value The value to set.
	 * @returns A Promise with the formatted string. undefined if not implemented.
	 */
	public async setValue(name: string, value: number): Promise<string> {
		// Get index (strip brackets)
		const indexString = name.substr(1, name.length - 2);
		const index = parseInt(indexString);

		// Get address
		const address = this.addr + this.memOffset + index * this.elemSize;

		// Change neg to pos
		if (value < 0)
			value += 0x10000;

		// Write data
		const dataWrite = new Uint8Array(this.elemSize);
		for (let i = 0; i < this.elemSize; i++) {
			dataWrite[i] = value & 0xFF;
			value = value >>> 8;
		}
		await Remote.writeMemoryDump(address, dataWrite);
		ShallowVar.memoryChanged = true;

		// Retrieve memory values, to see if they really have been set.
		const data = await Remote.readMemoryDump(address, this.elemSize);
		let readValue = 0;
		for (let i = this.elemSize - 1; i >= 0; i--) {
			readValue = readValue << 8;
			readValue += data[i] & 0xFF;
		}

		// Pass formatted string to vscode
		const formattedString = Utility.numberFormatted(name, readValue, this.elemSize, this.formatString(), undefined);
		return formattedString;
	};

}


/**
 * Special object to hold either a reference or a pointer to an immediate value object.
 * Similar to ExpressionVariable.
 */
interface VarOrImmediate extends DebugProtocol.Variable {
	immediateValue?: () => Promise<string>;
}


/**
 * The ContainerVar class acts as a container for other variables.
 * It is e.g. used for labels added by the user.
 */
export class ContainerVar extends ShallowVar {
	// The array which holds the variables.
	public varList = new Array<VarOrImmediate>();


	/**
	 * Returns the variables with references.
	 * @param start The start index of the array. E.g. only the range [100..199] should be displayed.
	 * @param count The number of bytes to display.
	 * @returns A Promise with the all variables
	 */
	public async getContent(start: number, count: number): Promise<Array<DebugProtocol.Variable>> {
		start = start || 0;
		count = count || (this.varList.length-start);
		// Add the index hover text to each item
		const dynList = new Array<DebugProtocol.Variable>(count);
		for (let i = 0; i < count; i++) {
			const entry = this.varList[i + start];
			const description = entry.type + '\n\n(Use "-delexpr ' + i + '" to remove)';
			let value = '';
			if (entry.immediateValue) {
				// ImmediateMemValue
				value = await entry.immediateValue();
			}
			dynList[i] = {
				name: entry.name,
				type: description,
				value,
				indexedVariables: entry.indexedVariables,
				variablesReference: entry.variablesReference
			};
		}
		return dynList;
	}


	/**
	 * Adds a new item to the list.
	 * @param name The name of the variable/label.
	 * @param immediateValue If not undefined the immediate value to use instead of a variable reference.
	 * @param varRef The variable reference to use. 0 if unused.
	 * @param description A description shown in the UI on hovering.
	 * @param count The elem count or 0.
	 */
	public addItem(name: string, immediateValue: (() => Promise<string>)|undefined, varRef: number, description: string, count: number) {
		this.varList.push({
			name,
			type: description,
			value: '',
			indexedVariables: count,
			variablesReference: varRef,
			immediateValue
		});
	}


	/**
	 * Removes an item from the list.
	 * Note: The expression is not removed from the ExpressionsList or the variables list.
	 * @param index The index to remove. Note: other indexes of following
	 * items change as well.
	 * If index is not in range an exception is thrown.
	 */
	public deleteItem(index: number) {
		if (index < 0 || index >= this.varList.length)
			throw Error("No such index: " + index);

		// Remove from own list
		this.varList.splice(index, 1);
	}


	/**
	 * Checks if allowed to change the value.
	 * If not returns a string with an error message.
	 * @param name The name of data.
	 * @returns 'Altering values not allowed in time-travel mode.' or undefined.
	 */
	public changeable(name: string): string | undefined {
		// Change normally not allowed if in reverse debugging
		//if (StepHistory.isInStepBackMode())
		//	return 'Altering values not allowed in time-travel mode.';
		// Otherwise allow
		//return undefined;
		return 'Use -addexpr/-delexpr to change the list of variables.';
	}


	/**
	 * Clears the list.
	 */
	public clear() {
		this.varList.length = 0;
	}

}
