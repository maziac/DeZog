import {MemBuffer} from '../../misc/membuffer';
import {Utility} from '../../misc/utility';

/**
 * Represents the port behavior for a ZX80 CPU.
 */
export class Z80Ports {

	// Holds the ports for reading.
	//protected ports: Uint8Array;

	protected genericOutPortFunc: ((port: number, value: number) => void)|undefined;
	protected genericInPortFunc: ((port: number) => number)|undefined;

	// It is possible to add behavior when writing to a specific port.
	// This map maps port addresses to functions that are executed on a port write.
	// If no function is mapped the value is send to 'generalOutPortFunc'.
	protected outPortMap: Map<number, (port: number, value: number) => void>;

	// This map maps port addresses to functions that are executed on a specific port read.
	// If no function is registered the value is read from the generalInPortFunc.
	protected inPortMap: Map<number, (port: number) => number>;


	/// Constructor.
	constructor() {
		//this.ports=new Uint8Array(0x10000);
		this.outPortMap=new Map<number, (port: number, value: number) => void>();
		this.inPortMap=new Map<number, (port: number) => number>();
	}


	/**
	 * Registers a generic function that is called when e.g. an 'out (c),a' is executed
	 * and no specific port function is registered.
	 * @param func The function to execute if the port is written. If undefined the
	 * current function is deregistered.
	 */
	public registerGeneralInPortFunction(func: ((port: number, value: number) => void)|undefined) {
		this.genericOutPortFunc=func;
	}


	/**
	 * Registers a generic function that is called when e.g. an 'in a,(c)' is executed
	 * and no specific port function is registered.
	 * @param func The function to execute if the port is read. If undefined the
	 * current function is deregistered.
	 */
	public registerGenericInPortFunction(func: ((port: number) => number)|undefined) {
		this.genericInPortFunc=func;
	}


	/**
	 * Registers a function for a write to a specific port address.
	 * @param port The port address
	 * @param func The function to execute if the port is written.
	 */
	public registerSpecificOutPortFunction(port: number, func: ((port: number, value: number) => void)|undefined) {
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
	public registerspecificInPortFunction(port: number, func: ((port: number) => number)|undefined) {
		if (func)
			this.inPortMap.set(port, func);
		else
			this.inPortMap.delete(port);
	}


	/**
	 * Returns the size the serialized object would consume.
	 */
	public getSerializedSize(): number {
		// Create a MemBuffer to calculate the size.
		const memBuffer=new MemBuffer();
		// Serialize object to obtain size
		this.serialize(memBuffer);
		// Get size
		const size=memBuffer.getSize();
		return size;
	}


	/**
	 * Serializes the object.
	 */
	public serialize(memBuffer: MemBuffer) {
		// Get ports
		//memBuffer.writeArrayBuffer(this.ports);
	}


	/**
	 * Deserializes the object.
	 */
	public deserialize(memBuffer: MemBuffer) {
		// Read ports from buffer
		//const buffer=memBuffer.readArrayBuffer();
		//Utility.assert(buffer.length==this.ports.length);
		//this.ports.set(buffer);
	}


	/**
	 *  Read 1 byte. Used by the CPU when doing a 'in a,(c)'.
	 */
	public read(port: number): number {
		// Check for specific read function
		const func=this.inPortMap.get(port);
		if (func)
			return func(port);

		// Check for general read function
		if (this.genericInPortFunc)
			return this.genericInPortFunc(port);

		// Otherwise return default
		return 0xFF;
	}


	/**
	 * Write 1 byte. Used by the CPU when doing a 'out (c),a'.
	 * Executes a custom method.
	 */
	public write(port: number, data: number) {
		// Check for specific write function
		const writefunc=this.outPortMap.get(port);
		if (writefunc) {
			writefunc(port, data);
			return;
		}

		// Check for a generic write function
		if (this.genericOutPortFunc) {
			this.genericOutPortFunc(port, data);
			return;
		}

		// Else: do nothing
	}


	// Change the port value. Simulates HW access.
	// Is e.g. called if a key is "pressed".
	// TODO: Remove
	public setPortValue(port: number, data: number) {
		Utility.assert(port>=0&&port<0x10000);
		//this.ports[port]=data;
	}

	// Get a port value.
	// Is e.g. called if a key is "pressed".
	// TODO: Remove
	public getPortValue(port: number): number {
		Utility.assert(port>=0&&port<0x10000);
		//return this.ports[port];
		return 0xFF;
	}
}

