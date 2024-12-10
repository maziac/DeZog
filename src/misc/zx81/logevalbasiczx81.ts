import {LabelsClass} from '../../labels/labels';
import {Z80RegistersClass} from '../../remotes/z80registers';
import {RemoteBase} from '../../remotes/remotebase';
import {LogEval} from '../logeval';
import {Zx81Tokens} from './zx81tokens';


/** Creates a log message to log a ZX81 BASIC line.
 * It logs the line number and the contents of the line.
 * E.g. Log: BASIC: 10 PRINT "HELLO"
 * This logpoint is part of the [BASIC] group.
 * How it works:
 * A breakpoint is set into ROM at 0x067A TODO: 0x0692.
 * This is the start of the evaluation of a BASIC line.
 * The address of the next BASIC line is retrieved by (NXTLIN), i.e. addr=w@(0x4029).
 * At this address the BASIC line number is stored in big endian:
 * line_number = b@(addr+1)+256*b@(addr)
 * Thereafter the size of the BASIC line is stored, followed by the contents.
 * (NXTLIN):
 * LINE: 1 word, big endian
 * SIZE: 1 word, little endian
 * CONTENT: SIZE bytes, ended by newline=0x76
 */
export class LogEvalBasicZx81 extends LogEval {
	/** Constructor. */
	constructor(remote: RemoteBase, z80Registers: Z80RegistersClass, labels: LabelsClass) {
		super('', remote, z80Registers, labels);
	}


	/** Returns the BASIC line.
	 * @returns E.g. 'BASIC: 10 PRINT "HELLO"'
	 */
	public async evaluate(): Promise<string> {
		// Only output everything below VARS (i.e. in program area, but allow also DFILE)
		const lineContentsAddr = this.remote.getRegisterValue('HL');
		const vars = await this.getWordEval(16400);
		if (lineContentsAddr >= vars)
			return 'BASIC: ---';

		// HL points to the address just after LINE and SIZE:
		const lineNumberArray = await this.remote.readMemoryDump(lineContentsAddr-4, 2);
		const lineNumber = lineNumberArray[1] + 256 * lineNumberArray[0];
		const size = await this.getWordEval(lineContentsAddr - 2);
		let result = `BASIC: ${lineNumber} `;

		// Convert BASIC tokens into text
		const buffer = await this.remote.readMemoryDump(lineContentsAddr, size);
		const txt = Zx81Tokens.convertBasLine(buffer);

		result += txt;
		return result;
	}
}