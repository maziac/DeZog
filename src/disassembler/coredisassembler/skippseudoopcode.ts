import * as assert from 'assert';
import {Format} from "./format";
import {Opcode} from "./opcode";



/** Pseudo Opcode to show the 'SKIP' or 'SKIP WORD' used for reverse engineering
 * (RST).
 */
export class SkipPseudoOpcode extends Opcode {

	/**
	 * Constructor.
	 * @param data The data to skip. Is shown in brackets.
	 */
	constructor(data: Uint8Array) {
		super();
		// Create name
		this.length = data.length;
		if (this.length == 1) {
			this.name = 'SKIP [' + Format.getHexFormattedString(data[0], 2) + ']';
		}
		else if (this.length == 2) {
			this.name = 'SKIPWORD [' + Format.getHexFormattedString(data[0] + 256 * data[1], 4) + ']';
		}
		else {
			// Other skips are not implemented
			assert(false, 'SkipPseudoCode: length ' + this.length + ' not implemented.');
		}
	}

	/** More or less just returns the 'name'.
	 * @param func A function that returns a label for a (64k) address.
	 * Not used.
	 */
	public disassembleOpcode(funcGetLabel: (addr64k: number) => string) {
		this.disassembledText = this.name;
	}
}
