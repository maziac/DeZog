

/**
 * Represents a frame, i.e. an entry on the callstack/a subroutine.
 */
export class CallStackFrame {
	public addr: number;	///< The corresponding address
	public name: string;	///< The shown name, e.g. "clear_screen"
	public stack = new Array<number>();	///< The objects currently pushed on the stack
	public stackStartAddress = -1;	///< The start address of the stack.

	/**
	 * Constructor
	 * @param addr The corresponding address
	 * @param stackAddr The start address of the stack
	 * @param name The shown name, e.g. "clear_screen"
	 */
	constructor(addr: number, stackAddr: number, name: string) {
		this.addr = addr;
		this.stackStartAddress = stackAddr;
		this.name = name;
	}
}

