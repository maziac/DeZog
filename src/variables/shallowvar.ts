//import { Log } from './log';
import { Labels } from '../labels/labels';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { Settings } from '../settings'
import { Utility } from '../misc/utility';
import { RefList } from '../misc/refList';
import { Remote } from '../remotes/remotefactory';
import { Format } from '../disassembler/format';
import {DisassemblyClass} from '../misc/disassembly';
import {StepHistory} from '../remotes/cpuhistory';


/**
 * Represents a variable.
 * Variables know how to retrieve the data from the remote.
 */
export class ShallowVar {
	/// Override this. It should retrieve the contents of the variable. E.g. by communicating with the remote.
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
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
	private addr: number;

	/// The number of lines for the disassembly
	private count: number;

	/// Pointer to the disassembly history.
	protected disassemblyHistory: Array<{address: number, text: string}>;

	/**
	 * Constructor.
	 * @param addr The address the disassembly should start
	 * @param count The number of lines for the disassembly
	 */
	public constructor(addr: number, count: number) {
		super();
		this.addr = addr&0xFFFF;
		this.count = count;
	}


	/**
	 * Communicates with the Remote to retrieve the disassembly.
	 * @returns A Promise with the disassembly.
	 * A list with all disassembled lines is passed (as variables).
	 */
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
		// Get code memory
		const size=4*this.count;	// 4 is the max size of an opcode
		const data=await Remote.readMemoryDump(this.addr, size);

		// Disassemble
		const dasmArray=DisassemblyClass.get(this.addr, data, this.count);

		// Add extra info
		const list=new Array<DebugProtocol.Variable>();
		for (const entry of dasmArray) {
			const address=entry.address;
			// Add to list
			const addrString=Format.getHexString(address).toUpperCase();
			const labels=Labels.getLabelsForNumber64k(address);
			let addrLabel=addrString;
			if (labels)
				addrLabel=labels.join(',\n');
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
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
		// Get code memory
		const memoryBanks=await Remote.getMemoryBanks();
		// Convert array
		let slot=-1;
		const segments=memoryBanks.map(bank => {
			const name=Utility.getHexString(bank.start, 4)+'-'+Utility.getHexString(bank.end, 4);
			slot++;
			const slotString=slot.toString();
			return {
				name: slotString+": "+name,
				type: "Slot "+slotString,
				value: bank.name,
				variablesReference: 0
			};
		});

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
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
		//await Remote.getRegisters();
		const registers=new Array<DebugProtocol.Variable>();
		const regNames=this.registerNames();
		for (let regName of regNames) {
			const formattedValue=Remote.getVarFormattedReg(regName);
			registers.push({
				name: regName,
				type: formattedValue,
				value: formattedValue,
				variablesReference: 0
			});
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
			// Handle PC special
			if (name=="PC")
				await Remote.setProgramCounterWithEmit(value);
			if (name=="SP")
				await Remote.setStackPointerWithEmit(value);
			else
				await Remote.setRegisterValueWithEmit(name, value);
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
	 * Constructor.
	 * @param stack The array containing the pushed data (address + value).
	 * @param stackAddress The start address of the stack (the top). The stack grows to bottom.
	 */
	public constructor(stack: Array<number>, stackAddress: number) {
		super();
		this.stack = stack;
		this.stackAddress = stackAddress;
	}


	/**
	 * Formats the stack.
	 * @returns A Promise with the stack values.
	 */
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
		const stackList=new Array<DebugProtocol.Variable>();
		// Check if stack available
		const stackDepth = this.stack.length;
		if(stackDepth == 0) {
			// Return empty
			return stackList;
		}

		return new Promise<Array<DebugProtocol.Variable>>(resolve => {
			// Calculate tabsizing array
			const format=Settings.launch.formatting.stackVar;
			const tabSizes=Utility.calculateTabSizes(format, 2);

			// Loop list as recursive function
			let index=0;
			let value=this.stack[0];
			const undefText="unknown";
			const recursiveFunction=(formatted) => {
				stackList.push({
					name: Utility.getHexString(this.stackAddress-2*index, 4),
					type: formatted,
					value: formatted,
					variablesReference: 0
				});
				// Next
				index++;
				if (index<this.stack.length) {
					// Next
					value=this.stack[index];
					Utility.numberFormatted('', value, 2, format, tabSizes, undefined)
						.then(recursiveFunction);
				}
				else {
					// end, call handler
					resolve(stackList);
				}
			};

			// Call recursively
			Utility.numberFormatted('', value, 2, format, tabSizes, undefText)
				.then(recursiveFunction);
		});
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
		}

		// Retrieve memory values, to see if they really have been set.
		const data=await Remote.readMemoryDump(address, 2);
		const memWord = data[0] + (data[1]<<8);
		// Pass formatted string to vscode
		const formattedString = Utility.numberFormatted(name, memWord, 2, Settings.launch.formatting.stackVar, undefined)
		return formattedString;
	}
}


/**
 * The StructVar class is a container class which holds other properties (the elements of the
 * struct). I.e. SubStructVars.
 * The StructVar is the parent object which also holds the memory contents.
 * The SubStructVars refer to it.
 */
export class SubStructVar extends ShallowVar {
	// The parent of the sub structure (which holds the memory contents.
	protected parentStruct: StructVar;

	// Holds an array with structure properties.
	protected propArray: Array<DebugProtocol.Variable>;

	// The data is copied from the constructor for lazy initialization.
	protected relIndex: number;
	protected count: number;
	protected elemSize: number;
	protected struct: string;
	protected props: Array<string>;
	protected list: RefList<ShallowVar>;


	/**
	 * Constructor.
	 * @param relIndex The relative address inside the parent's memory dump.
	 * @param count The count of elements to display. The count of elements in the struct
	 * (each can have a different size).
	 * @param elemSize The size of this object. All elements together.
	 * @param struct 'b'=byte, 'w'=word or 'bw' for byte and word.
	 * @param props An array of names of the direct properties of the struct.
	 * @param parentStruct The parent object which holds the memory.
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 */
	public constructor(relIndex: number, count: number, elemSize: number, struct: string, props: Array<string>, parentStruct: StructVar, list: RefList<ShallowVar>) {
		super();
		// Save all arguments
		this.relIndex = relIndex;
		this.count = count;
		this.elemSize = elemSize;
		this.struct = struct.trim();;
		this.props = props;
		this.parentStruct = parentStruct;
		this.list = list;
	}


	/**
	 * Creates the propArray.
	 */
	protected createPropArray() {
		// Create array for struct
		this.propArray = [];

		// Now create a new variable for each
		const unsortedMap = new Map<number, string>();
		for (const prop of this.props) {
			// Get the relative address
			const relAddr = Labels.getNumberFromString64k(this.struct + '.' + prop);
			unsortedMap.set(relAddr, prop);
		}
		// Sort map by indices
		const sortedMap = new Map([...unsortedMap.entries()].sort());
		// Add an end marker
		sortedMap.set(-1, '');
		// Get all lengths of the leafs and dive into nodes
		let prevName;
		let prevIndex;
		let lastIndex = this.elemSize;
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
				const fullName = this.struct + '.' + prevName;
				const subProps = Labels.getSubLabels(fullName);
				const memIndex = this.relIndex + prevIndex;
				const address = this.parentStruct.getAddress() + memIndex;
				const elem: DebugProtocol.Variable = {
					name: prevName,
					type: Utility.getHexString(address, 4) + 'h',
					value: '',
					variablesReference: 0
				};
				if (subProps.length > 0) {
					// Node
					elem.variablesReference = this.list.addObject(new SubStructVar(this.relIndex, 1, len, fullName, subProps, this.parentStruct, this.list));
				}
				else {
					// Leaf
					const memIndex = this.relIndex + prevIndex;
					// Get value depending on len: 1 byte, 1 word or array.
					if (len <= 2) {
						// Byte or word
						const mem = this.parentStruct.getMemory();
						let value = mem[memIndex];
						if (len > 1)
							value += 256 * mem[memIndex + 1];
						elem.value = Utility.getHexString(value, 2 * len) + 'h';
					}
					else {
						// Array
						const memDumpVar = new MemDumpVar(this.parentStruct.getAddress(), this.elemSize, 1);
						memDumpVar.setParent(this.parentStruct, memIndex);
						elem.variablesReference = this.list.addObject(memDumpVar);
						elem.indexedVariables = len;
					}
				}
				// Add to array
				this.propArray.push(elem);
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
	 * @returns A Promise with the properties.
	 */
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
		if (!this.propArray)
			this.createPropArray();
		return this.propArray;
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

	/**
	 * Constructor.
	 * @param addr The address of the memory dump
	 * @param count The count of elements to display. The count of elements in the struct
	 * (each can have a different size).
	 * @param size The size of this object. All elements together.
	 * @param struct 'b'=byte, 'w'=word or 'bw' for byte and word.
	 * @param props An array of names of the direct properties of the struct.
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 */
	public constructor(addr: number, count: number, size: number, struct: string, props: Array<string>, list: RefList<ShallowVar>) {
		super(0, count, size, struct, props, undefined as any, list);
		this.parentStruct = this;
		this.baseAddress = addr;
	}


	/**
	 * Creates the propArray.
	 * On top level this is really an array.
	 */
	protected createPropArray() {
		// But only if more than 1 element
		if (this.count <= 1) {
			super.createPropArray();
		}
		else {
			// Create array
			this.propArray = [];
			// Create a number of nodes
			let relIndex = 0;
			for (let i = 0; i < this.count; i++) {
				let labelVar;
				const address = this.getAddress() + i*this.elemSize;
				const elem: DebugProtocol.Variable = {
					name: '[' + i + ']',
					type: Utility.getHexString(address, 4) + 'h',
					value: '',
					variablesReference: 0
				};
				if (this.props.length) {
					// Sub structure
					 labelVar = new SubStructVar(relIndex, 1, this.elemSize, this.struct, this.props, this.parentStruct, this.list);
				}
				else {
					// Simple array
					labelVar = new MemDumpVar(this.getAddress(), this.elemSize, 1);
					labelVar.setParent(this.parentStruct, relIndex);
					elem.indexedVariables = this.elemSize;
				}
				elem.variablesReference = this.list.addObject(labelVar);
				this.propArray.push(elem);
				// Next
				relIndex += this.elemSize;
			}
		}
	}


	/**
	 * Returns the properties.
	 * Retrieves the memory.
	 * @returns A Promise with the properties.
	 */
	public async getContent(): Promise<Array<DebugProtocol.Variable>> {
		// Check if memory has been retrieved
		if (!this.memory) {
			// Retrieve memory values
			const countBytes = this.count * this.elemSize;
			this.memory = await Remote.readMemoryDump(this.getAddress(), countBytes);
		}
		// Check if properties array exists.
		if (!this.propArray)
			this.createPropArray();
		return this.propArray;
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
	public async getContent(start?: number, count?: number): Promise<Array<DebugProtocol.Variable>> {
		Utility.assert(start != undefined);
		Utility.assert(count != undefined);
		let addr = this.addr + (start!);
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
			memory = await Remote.readMemoryDump(addr, count! * elemSize);
		}

		// Calculate tabsizing array
		const tabSizes = Utility.calculateTabSizes(format, elemSize);
		// Format all array elements
		let k = offset;
		for (let i = 0; i < count!; i++) {
			// Get value
			let value = memory[k++];
			if (elemSize > 1)
				value += 256 * memory[k++];
			// Format
			const addr_i = addr + offset + i * elemSize;
			const formatted = Utility.numberFormattedSync(value, elemSize, format, false, undefined, undefined, tabSizes);
			// Add to array
			const descr = Utility.getHexString(addr_i, 4) + 'h'
			memArray.push({
				name: "[" + (start! + i) + "]",
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
}
