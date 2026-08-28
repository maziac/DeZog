import {PortInModeType} from "../../settings/settings";


/**
 * Represents the port behavior for a ZX80 CPU.
 */
export class Z80Ports {

	// How to hand in-port devices: 'AND', 'OR', 'SINGLE'
	protected portInMode: PortInModeType;

	// The default value returned if no peripheral is attached.
	public defaultPortIn: number;	// 0-255

	protected genericOutPortFuncs: Array<(port: number, value: number) => void>;
	protected genericInPortFuncs: Array<(port: number) => (number | undefined)>;

	// It is possible to add behavior when writing to a specific port.
	// This map maps port addresses to functions that are executed on a port write.
	// If no function is mapped the value is send to 'generalOutPortFunc'.
	protected outPortMap: Map<number, (port: number, value: number) => void>;

	// This map maps port addresses to functions that are executed on a specific port read.
	// If no function is registered the value is read from the generalInPortFunc.
	protected inPortMap: Map<number, (port: number) => number>;


	/**
	 *  Constructor.
	 * @param portInMode 'AND', 'OR' or 'SINGLE'
	 * @param defaultPortIn 0-255
	 */
	constructor(portInMode: PortInModeType, defaultPortIn: number) {
		this.portInMode = portInMode;
		this.defaultPortIn = defaultPortIn;
		this.genericOutPortFuncs = [];
		this.genericInPortFuncs = [];
		this.outPortMap = new Map<number, (port: number, value: number) => void>();
		this.inPortMap = new Map<number, (port: number) => number>();
	}


	/**
	 * Registers a generic function that is called when e.g. an 'out (c),a' is executed
	 * and no specific port function is registered.
	 * @param func The function to execute if the port is written. If undefined the
	 * current function is deregistered.
	 * 'func' is added to the beginning of the list. I.e. last added comes first.
	 */
	public registerGenericOutPortFunction(func: (port: number, value: number) => void) {
		this.genericOutPortFuncs.unshift(func);
	}


	/**
	 * Registers a generic function that is called when e.g. an 'in a,(c)' is executed
	 * and no specific port function is registered.
	 * @param func The function to execute if the port is read. If undefined the
	 * current function is deregistered.
	 * 'func' is added to the beginning of the list. I.e. last added comes first.
	 */
	public registerGenericInPortFunction(func: (port: number) => (number | undefined)) {
		this.genericInPortFuncs.unshift(func);
	}


	/**
	 * Registers a function for a write to a specific port address.
	 * @param port The port address
	 * @param func The function to execute if the port is written.
	 */
	public registerSpecificOutPortFunction(port: number, func: ((port: number, value: number) => void) | undefined) {
		if (func)
			this.outPortMap.set(port, func);
		else
			this.outPortMap.delete(port);
	}


	/**
	 * Registers a function for a read to a specific port address.
	 * @param port The port address
	 * @param func The function to execute if the port is read.
	 */
	public registerSpecificInPortFunction(port: number, func: ((port: number) => number) | undefined) {
		if (func)
			this.inPortMap.set(port, func);
		else
			this.inPortMap.delete(port);
	}


	/**
	 *  Read 1 byte. Used by the CPU when doing a 'in a,(c)'.
	 */
	public read(port: number): number {
		// Handle 'AND', 'OR' or 'SINGLE' mode
		let allValue: number = this.defaultPortIn;

		// Check for general read function.
		// Is done at first, so it can "override" other functions.
		// Custom code is also found here.
		for (const func of this.genericInPortFuncs) {
			const value = func(port);
			if (value !== undefined) {
				switch (this.portInMode) {
					case 'AND':
						allValue &= value;
						break;
					case 'OR':
						allValue |= value;
						break;
					case 'SINGLE':
						return value;
				}
			}
		}

		// Check for specific read function
		const func = this.inPortMap.get(port);
		if (func) {
			const value = func(port);
			if (value !== undefined) {
				switch (this.portInMode) {
					case 'AND':
						allValue &= value;
						break;
					case 'OR':
						allValue |= value;
						break;
					case 'SINGLE':
						return value;
				}
			}
		}

		return allValue;
	}


	/**
	 * Write 1 byte. Used by the CPU when doing a 'out (c),a'.
	 * Executes a custom method.
	 */
	public write(port: number, data: number) {
		// Note: more than one function could be executed.

		// Check for a generic write function
		for (const func of this.genericOutPortFuncs) {
			func(port, data);
		}

		// Check for specific write function
		const writefunc = this.outPortMap.get(port);
		if (writefunc) {
			writefunc(port, data);
		}
	}
}

