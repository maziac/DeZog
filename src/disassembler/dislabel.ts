import { Format } from './format';
import {NumberType, getNumberTypeAsString} from './numbertype';



/**
 * Class for the labels used for disassembly.
 */
export class DisLabel {
	// A static counter to assign an id to the labels.
	public static id = 0;

	/// The id of the label. Starts at 1.
	public id: number;

	/// The type of the label, e.g. if it is data or program code.
	public type: NumberType;

	// The associated 64k address.
	public address: number;

	/// The name of the label, e.g. "SUB001" or ".sub001_loop5"
	public name: string;

	/// The "parent" label: Either a subroutine or a code label.
	/// Used for local label naming.
	public parent: DisLabel;

	/// The code locations that reference the label. (parents are the 'callers'.)
	public references = new Set<number>();

	/// A list with all called subroutine labels. (for statistics)
	public calls = new Array<DisLabel|number>();

	/// True if it is an EQU label. A label whose memory was not given as binary value.
	/// I.e. outside the range of the given memory.
	public isEqu = false;

	/// Set to true if label belongs to an interrupt.
	public belongsToInterrupt = false;

	/// Determines if the type etc. might be changed.
	/// E.g. used if the user sets a label, so that it is not changed afterwards.
	public isFixed = false;


	/**
	 * Constructor: Initializes memory.
	 * @param type E.g. CODE_LOCAL_LBL
	 * @param address The associated 64k address.
	 */
	constructor(type: NumberType, address: number) {
		this.type = type;
		DisLabel.id++;
		this.id = DisLabel.id;
		this.address = address;
	}


	/**
	 * returns the LabelType enum as string.
	 * For debugging.
	 */
	public getTypeAsString(): string {
		return getNumberTypeAsString(this.type);
	}


	/**
	 * @returns The label name.
	 */
	public getName() {
		return this.name;
	}


	/**
	 * Returns either the hex value as string or the label name.
	 * Used for items in the 'this.calls' list.
	 * @param called Either a label or an 64k address.
	 * @returns a string, e.g. "C000h".
	 */
	public static getLabelName(called: DisLabel | number) {
		if (typeof called == 'number') {
			// Just return the hex address as name
			return Format.getHexString(called, 4) + 'h';
		}
		else {
			// Return the label name
			return called.name;
		}
	}


	/**
	 * Returns the address (number) no matter if a number or a DisLabel is passed.
	 * Used for items in the 'this.calls' list.
	 * @param called Either a label or an 64k address.
	 * @returns The 64k address e.g. 0xC000h
	 */
	public static getLabelAddress(called: DisLabel | number) {
		if (typeof called == 'number') {
			// Just return the hex address as name
			return called;
		}
		else {
			// Return the label address
			return called.address;
		}
	}
}
