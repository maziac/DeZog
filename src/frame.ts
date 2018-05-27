
//import { Log } from './log';


/**
 * Represents a frame, i.e. an entry on the callstack/a subroutine.
 */
export class Frame {
	public addr: number;	/// The corresponding address
	public name: string;	/// The shown name, e.g. "CALL clear_screen"
	public fileName: string;	/// The corresponding filename
	public lineNr: number;	/// The corresponding line number in the file
	public stack = new Array<number>();	/// The objects currently pushed on the stack
	public stackStartAddress = -1;	/// The start address of the stack

	/**
	 * Constructor
	 * @param addr The corresponding address
	 * @param stackAddr The start address of the stack
	 * @param name The shown name, e.g. "CALL clear_screen"
	 * @param fileName The corresponding filename
	 * @param lineNr The corresponding line number in the file
	 */
	constructor(addr: number, stackAddr: number, name: string, fileName: string, lineNr: number) {
		this.addr = addr;
		this.stackStartAddress = stackAddr;
		this.name = name;
		this.fileName = fileName;
		this.lineNr = lineNr;
	}
}

