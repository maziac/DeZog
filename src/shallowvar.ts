
//import { Log } from './log';
import { zSocket } from './zesaruxSocket';
import { Labels } from './labels';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Z80Registers } from './z80Registers';
import { CallSerializer } from './callserializer';
import { Settings } from './settings'
import { Utility } from './utility';
import { RefList } from './reflist';
//import { Variable } from 'vscode-debugadapter/lib/main';

/**
 * Represents a variable.
 * Variables know how to retrieve the data from Zesarux.
 */
export class ShallowVar {
	/// Override this. It should retrieve the contents of the variable. E.g. bei commnuicating with zesarux.
	public getContent(handler: (varList: Array<DebugProtocol.Variable>) => {}, ...args) {
		handler([]);
	}

	/**
	 * Override if the variable or its properties can be set.
	 * Sets the value of the variable.
	 * @param name The name of the register, e.g. "HL" or "A"
	 * @param value The value to set.
	 * @param handler The handler gets the resulting (formatted) string with the value.
	 */
	public setValue(name: string, value: number, handler: (formattedString: string) => {}) {
		handler('');
	};

}


/**
 * The DisassemblyVar class knows how to retrieve the disassembly from zeasrux.
 */
export class DisassemblyVar extends ShallowVar {

	private addr: number;	/// The address the disassembly should start
	private count: number;	/// The number of lines for the disassembly


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
		// get disassembly lines
		zSocket.send('disassemble ' + this.addr + ' ' + this.count, data => {
			// split text output into array
			const list = new Array<DebugProtocol.Variable>();
			var disLines = data.split('\n');
			for( let line of disLines) {
				const addrString = line.substr(2, 4);
				const addr = parseInt(addrString, 16);
				const labels = Labels.getLabelsForNumber(addr);
				var addrLabel = addrString;
				if(labels)
					addrLabel = labels.join(',\n');
				list.push({
					name: addrString,
					type: addrLabel,
					value: line.substr(7),
					variablesReference: 0
				});
			}
			// Pass data to callback
			handler(list);
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
		zSocket.send('get-registers', data => {
			const registers = new Array<DebugProtocol.Variable>();
			const regNames = this.registerNames();

			// Serialize formatting calls on independent serializer.
			const innerSerializer = new CallSerializer("Inner");
			for(let regName of regNames) {
				innerSerializer.exec(() => {
					Z80Registers.getVarFormattedReg(regName, data,  (formattedValue) => {
						registers.push({
							name: regName,
							type: formattedValue,
							value: formattedValue,
							variablesReference: 0
						});
						innerSerializer.endExec();
					});
				});
			}

			// call handler
			innerSerializer.exec(() => {
				handler(registers);
				innerSerializer.endExec();
			});
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
			zSocket.send('get-registers', data => {
				Z80Registers.getVarFormattedReg(name, data, formatted => {
					handler(formatted);
				});
			});
			return;
		}

		// set value
		zSocket.send('set-register ' + name + '=' + value, data => {
			// Get real value (should be the same as the set value)
			Z80Registers.getVarFormattedReg(name, data, formatted => {
				handler(formatted);
			});
		});
	}


	/**
	 * Returns the register names to show. The 1rst half of the registers.
	 */
	protected registerNames(): Array<string> {
		return ["PC", "SP", "A", "F", "HL", "DE", "BC", "IX", "IY"];
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
	 * @param stackAddress The start address of the stack.
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
		const format = Settings.launch.stackVarFormat;
		const tabSizes = Utility.calculateTabSizes(format, 2);

		// Loop list as recursive function
		var index = 0;
		var value = this.stack[0];
		const recursiveFunction = (formatted) => {
			stackList.push({
				name: Utility.getHexString(this.stackAddress+2*index,4),
				type: formatted,
				value: formatted,
				variablesReference: 0
			});
			// Next
			index++;
			if(index < this.stack.length) {
				// Next
				value = this.stack[index];
				Utility.numberFormattedBy('', value, 2, format, tabSizes, recursiveFunction);
			}
			else {
				// end, call handler
				handler(stackList);
			}
		};

		// Call recursively
		Utility.numberFormattedBy('', value, 2, format, tabSizes, recursiveFunction);
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
		const address = Utility.parseValue(name);
		if(!isNaN(address) && !isNaN(value)) {
			// Change neg to pos
			if(value<0)
				value += 0x10000;
			var hexValue = value.toString(16);
			if(hexValue.length == 4) {
				hexValue = '0'.repeat(4-hexValue.length) + hexValue;
				const cmd = 'write-memory-raw ' + address + ' ' + hexValue.substr(2,2) + hexValue.substr(0,2);

				serializer.exec(() => {
					zSocket.send(cmd, data => {
						// Retrieve memory values, to see if they really have been set.
						zSocket.send( 'read-memory ' + address + ' 2', data => {
							const b1 = data.substr(0,2);
							const b2 = data.substr(2,2);
							const memByte = parseInt(b1,16);
							const memWord = memByte + (parseInt(b2,16)<<8);
							// Pass formatted string to vscode
							Utility.numberFormattedBy(name, memWord, 2, Settings.launch.stackVarFormat, undefined, handler);
						});
					});
				});
			}
		}

		serializer.exec(() => {
			// Retrieve memory values, to see if they really have been set.
			zSocket.send( 'read-memory ' + address + ' 2', data => {
				const b1 = data.substr(0,2);
				const b2 = data.substr(2,2);
				const memByte = parseInt(b1,16);
				const memWord = memByte + (parseInt(b2,16)<<8);
				// Pass formatted string to vscode
				Utility.numberFormattedBy(name, memWord, 2, Settings.launch.stackVarFormat, undefined, handler);
				// End
				serializer.endExec();
			});
		});
	}
}


/**
 * The LabelVar class is a container class which holds to pseudo properties to open
 * a byte or a word array. The user has the possibility to open it from the UI.
 */
export class LabelVar extends ShallowVar {

	private memArray: Array<DebugProtocol.Variable>;	/// Holds teh 2 pseudo variables for 'byte' and 'word'

	/**
	 * Constructor.
	 * @param addr The address of the memory dump
	 * @param count The count of elements to display.
	 * @param list The list of variables. The constructor adds the 2 pseudo variables to it.
	 */
	public constructor(addr: number, count: number, list: RefList) {
		super();
		// Create 2 pseudo variables
		//const count = 100;
		this.memArray = [
			{
				name: "byte",
				type: "data",
				value: "[0.."+(count-1)+"]",
				variablesReference: list.addObject(new MemDumpByteVar(addr)),
				indexedVariables: count
			},
			{
				name: "word",
				type: "data",
				value: "[0.."+(count-1)+"]",
				variablesReference: list.addObject(new MemDumpWordVar(addr)),
				indexedVariables: count
			}
		];
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
	 * @param count The count of elements to display.
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
		for(var i=0; i<count;i++) {
			// format
			const addr_i = addr+i*size;
			innerSerializer.exec((cs) => {
				Utility.numberFormattedBy('', addr_i, size, format, tabSizes, (formatted) => {
					// check for label
					var types = [ Utility.getHexString(addr_i,4) ];
					const labels = Labels.getLabelsPlusIndexForNumber(addr_i);
					if(labels)
						types = types.concat(labels);
					const descr = types.join(',\n');
					// add to array
					memArray.push({
						name: "["+memArray.length+"]",
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
		return Settings.launch.labelWatchesByteFormat;	// byte
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
		return Settings.launch.labelWatchesWordFormat;	// word
	}

	/**
	 * The size of the data: 1=byte, 2=word.
	 */
	protected size(): number {
		return 2;	// word
	}
}
