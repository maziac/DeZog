
//import { Log } from './log';
import { Labels } from '../labels';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { CallSerializer } from '../callserializer';
import { Settings } from '../settings'
import { Utility } from '../utility';
import { RefList } from '../reflist';
import { Remote } from '../remotes/remotefactory';
import { BaseMemory } from '../disassembler/basememory';
import { Opcode } from '../disassembler/opcode';
import { Format } from '../disassembler/format';


/**
 * Represents a variable.
 * Variables know how to retrieve the data from Zesarux.
 */
export class ShallowVar {
	/// Override this. It should retrieve the contents of the variable. E.g. bei communicating with zesarux.
	public getContent(handler: (varList: Array<DebugProtocol.Variable>) => {}, ...args) {
		handler([]);
	}

	/**
	 * Override if the variable or its properties can be set.
	 * Sets the value of the variable.
	 * @param name The name of the variable, e.g. for registers "HL" or "A"
	 * @param value The value to set.
	 * @param handler The handler gets the resulting (formatted) string with the value.
	 * If the variable is readonly or for soem other reason could not be set
	 * then an 'undefined' is passed instead of a string.
	 */
	public setValue(name: string, value: number, handler: (formattedString: string|undefined) => {}) {
		handler(undefined);
	};

}


/**
 * The DisassemblyVar class knows how to retrieve the disassembly from zesarux.
 */
export class DisassemblyVar extends ShallowVar {

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
		this.addr = addr;
		this.count = count;
	}


	/**
	 * Communicates with zesarux to retrieve the disassembly.
	 * @param handler This handler is called when the disassembly is available.
	 * A list with all disassembled lines is passed (as variables).
	 */
	public getContent(handler: (varlist: Array<DebugProtocol.Variable>) => {}) {
		// Get code memory
		const size = 4*this.count;	// 4 is the max size of an opcode
		Remote.getMemoryDump(this.addr, size).then(data => {
			// convert hex values to bytes
			const buffer = new BaseMemory(this.addr, size);
			for(let i=0; i<size; i++) {
				const value = data[i];
				buffer.setValueAtIndex(i, value);
			}
			// disassemble all lines
			let address = this.addr;
			const list = new Array<DebugProtocol.Variable>();
			for(let i=0; i<this.count; i++) {
				// Get opcode
				const opcode = Opcode.getOpcodeAt(buffer, address);
				// disassemble
				const opCodeDescription = opcode.disassemble();
				const line = Format.formatDisassembly(undefined /*buffer*/, false, 0, 0 /*12*/, 0 /*5*/, 0 /*8*/, address, opcode.length, opCodeDescription.mnemonic);
				// Add to list
				const addrString = Format.getHexString(address).toUpperCase();
				const labels = Labels.getLabelsForNumber(address);
				var addrLabel = addrString;
				if(labels)
					addrLabel = labels.join(',\n');
				list.push({
					name: addrString,
					type: addrLabel,
					value: line,
					variablesReference: 0
				});
				// Next address
				address += opcode.length;
			}
			// Pass data to callback
			handler(list);
		});
	}
}


/**
 * The MemoryPagesVar class knows how to retrieve the mapping of
 * memory slots and banks from zesarux.
 */
export class MemoryPagesVar extends ShallowVar {
	/**
	 * Constructor.
	 */
	public constructor() {
		super();
	}


	/**
	 * Communicates with zesarux to retrieve the memory pages.
	 * @param handler This handler is called when the memory page data is available.
	 * A list with start/end address and name (bank name) is passed.
	 */
	public getContent(handler: (varlist: Array<DebugProtocol.Variable>) => {}) {
		// Get code memory
		Remote.getMemoryPages(memoryPages => {
			// Convert array
			const segments = memoryPages.map(page => {
				const name = Utility.getHexString(page.start,4) + '-' + Utility.getHexString(page.end,4);
				return {
					name: name,
					type: page.name,
					value: page.name,
					variablesReference: 0
				};
			});

			// Pass data to callback
			handler(segments);
		});
	}
}


/**
 * The RegistersMainVar class knows how to retrieve the register values from zeasrux.
 */
export class RegistersMainVar extends ShallowVar {

	/**
	 * Communicates with zesarux to retrieve the register values.
	 * @param handler This handler is called when the register values are available.
	 * A list with all register values is passed (as variables).
	 */
	public getContent(handler: (varlist:Array<DebugProtocol.Variable>) => {}) {
		Remote.getRegisters().then(() => {
			const registers = new Array<DebugProtocol.Variable>();
			const regNames = this.registerNames();
			for(let regName of regNames) {
				const formattedValue = Remote.getVarFormattedReg(regName);
				registers.push({
					name: regName,
					type: formattedValue,
					value: formattedValue,
					variablesReference: 0
				});
			}
			handler(registers);
		});
	}


	/**
	 * Sets the value of the variable.
	 * @param name The name of the register, e.g. "HL" or "A"
	 * @param value The value to set.
	 * @param handler The handler gets the resulting (formatted) string with the value.
	 */
	public setValue(name: string, value: number, handler: (formattedString) => {}) {
		// Check if value is valid
		if(isNaN(value)) {
			// Get old value and send it back
			Remote.getRegisters()
			.then(() => {
				const formatted = Remote.getVarFormattedReg(name);
				handler(formatted);
			});
			return;
		}

		// Set value
		Remote.setRegisterValue(name, value)
		.then(() => {
			const formatted = Remote.getVarFormattedReg(name);
			handler(formatted);
		});
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
		return ["A'", "F'", "HL'", "DE'", "BC'", "I", "R"];
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
	 * Communicates with zesarux to retrieve the register values.
	 * @param handler This handler is called when the register values are available.
	 * A list with all register values is passed (as variables).
	 */
	public getContent(handler: (varlist:Array<DebugProtocol.Variable>) => {}) {
		const stackList = new Array<DebugProtocol.Variable>();
		// Check if stack available
		const stackDepth = this.stack.length;
		if(stackDepth == 0) {
			// Return empty
			handler(stackList);
			return;
		}

		// Calculate tabsizing array
		const format = Settings.launch.formatting.stackVar;
		const tabSizes = Utility.calculateTabSizes(format, 2);

		// Loop list as recursive function
		var index = 0;
		var value = this.stack[0];
		const undefText = "unknown";
		const recursiveFunction = (formatted) => {
			stackList.push({
				name: Utility.getHexString(this.stackAddress-2*index,4),
				type: formatted,
				value: formatted,
				variablesReference: 0
			});
			// Next
			index++;
			if(index < this.stack.length) {
				// Next
				value = this.stack[index];
				Utility.numberFormatted('', value, 2, format, tabSizes, recursiveFunction, undefText);
			}
			else {
				// end, call handler
				handler(stackList);
			}
		};

		// Call recursively
		Utility.numberFormatted('', value, 2, format, tabSizes, recursiveFunction, undefText);
	}


	/**
	 * Sets the value of the pushed stack data.
	 * @param name The 'name', the address as hex value, e.g. "041Ah".
	 * @param value The value to set.
	 * @param handler The handler gets the resulting (formatted) string with the value.
	 */
	public setValue(name: string, value: number, handler: (formattedString) => {}) {
		// Serializer
		const serializer = new CallSerializer("StackVar");

		// Check if address and value are valid
		const address = Utility.parseValue(name+'h');
		if(!isNaN(address) && !isNaN(value)) {
			// Change neg to pos
			if(value < 0)
				value += 0x10000;
			const data = new Uint8Array(2);
			data[0] = value & 0xFF;
			data[1] = value >> 8;

			serializer.exec(() => {
				Remote.writeMemoryDump(address, data, () => {
					serializer.endExec();
				});
			});
		}

		serializer.exec(() => {
			// Retrieve memory values, to see if they really have been set.
			Remote.getMemoryDump(address, 2).then(data => {
				const memWord = data[0] + (data[1]<<8);
				// Pass formatted string to vscode
				Utility.numberFormatted(name, memWord, 2, Settings.launch.formatting.stackVar, undefined, handler);
				// Pass formatted string to vscode
				Utility.numberFormatted(name, memWord, 2, Settings.launch.formatting.stackVar, undefined, handler);
				serializer.endExec();
			});
		});
	}
}


/**
 * The LabelVar class is a container class which holds two pseudo properties to open
 * a byte or a word array. The user has the possibility to open it from the UI.
 */
export class LabelVar extends ShallowVar {

	private memArray: Array<DebugProtocol.Variable>;	/// Holds teh 2 pseudo variables for 'byte' and 'word'

	/**
	 * Constructor.
	 * @param addr The address of the memory dump
	 * @param count The count of elements to display.
	 * @param types 'b'=byte, 'w'=word or 'bw' for byte and word
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 */
	public constructor(addr: number, count: number, types: string, list: RefList<ShallowVar>) {
		super();
		// Create up to 2 pseudo variables
		this.memArray = [];

		// Byte array
		if(types.indexOf('b') >= 0)
			this.memArray.push(
			{
				name: "byte",
				type: "data",
				value: "[0.."+(count-1)+"]",
				variablesReference: list.addObject(new MemDumpByteVar(addr)),
				indexedVariables: count
			});

		// Word array
		if(types.indexOf('w') >= 0)
			this.memArray.push(
			{
				name: "word",
				type: "data",
				value: "[0.."+(count-1)+"]",
				variablesReference: list.addObject(new MemDumpWordVar(addr)),
				indexedVariables: count
			});
	}


	/**
	 * Communicates with zesarux to retrieve the memory dump.
	 * @param handler This handler is called when the memory dump is available.
	 */
	public getContent(handler: (varlist:Array<DebugProtocol.Variable>) => {}) {
		// Pass data to callback
		handler(this.memArray);
	}
}


/**
 * The MemDumpByteVar class knows how to retrieve a memory dump from zesarux.
 * It allows retrieval of byte arrays.
 */
export class MemDumpByteVar extends ShallowVar {

	private addr: number;	/// The address of the memory dump

	/**
	 * Constructor.
	 * @param addr The address of the memory dump
	 */
	public constructor(addr: number) {
		super();
		this.addr = addr;
	}


	/**
	 * Communicates with zesarux to retrieve the memory dump.
	 * @param handler This handler is called when the memory dump is available.
	 * @param start The start index of the array. E.g. only the range [100..199] should be displayed.
	 * @param count The number of bytes to display.
	 */
	public getContent(handler: (varlist:Array<DebugProtocol.Variable>) => {}, start: number, count: number) {
		var addr = this.addr + start;
		const size = this.size();
		const innerSerializer = new CallSerializer("MemDumpVar");
		const memArray = new Array<DebugProtocol.Variable>();
		const format = this.formatString();
		// Calculate tabsizing array
		const tabSizes = Utility.calculateTabSizes(format, size);
		// Format all array elements
		for(var i=0; i<count/size;i++) {
			// format
			const addr_i = addr+i*size;
			innerSerializer.exec((cs) => {
				Utility.numberFormatted('', addr_i, size, format, tabSizes, (formatted) => {
					// check for label
					var types = [ Utility.getHexString(addr_i,4) ];
					const labels = Labels.getLabelsPlusIndexForNumber(addr_i);
					if(labels)
						types = types.concat(labels);
					const descr = types.join(',\n');
					// add to array
					memArray.push({
						name: "["+memArray.length*size+"]",
						type:  descr,  //type,
						value: formatted,
						variablesReference: 0
					});
					cs.endExec();
				});
			});
		}
		innerSerializer.exec((cs) => {
			// Pass data to callback
			handler(memArray);
			// end the serialized calls
			cs.endExec();
		});
	}


	/**
	 * The format to use.
	 */
	protected formatString(): string {
		return Settings.launch.formatting.arrayByte;	// byte
	}

	/**
	 * The size of the data: 1=byte, 2=word.
	 */
	protected size(): number {
		return 1;	// byte
	}
}


/**
 * The MemDumpWordVar class knows how to retrieve a memory dump from zesarux.
 * It allows retrieval of word arrays.
 */
export class MemDumpWordVar extends MemDumpByteVar {
	/**
	 * The format to use.
	 */
	protected formatString(): string {
		return Settings.launch.formatting.arrayWord;	// word
	}

	/**
	 * The size of the data: 1=byte, 2=word.
	 */
	protected size(): number {
		return 2;	// word
	}
}
