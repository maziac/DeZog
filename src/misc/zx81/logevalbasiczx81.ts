import {LabelsClass} from '../../labels/labels';
import {Z80RegistersClass} from '../../remotes/z80registers';
import {RemoteBase} from '../../remotes/remotebase';
import {LogEval} from '../logeval';
import {Zx81Tokens} from './zx81tokens';
import {GenericBreakpoint} from '../../genericwatchpoint';


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
	protected static readonly BP_ADDR_BASIC_LINE = 0x0673;	// The breakpoint address for the BASIC line.
	protected static readonly BP_ADDR_BASIC_VARS = 0x0676;	// The breakpoint address for the BASIC variables.

	// The long breakpoints for the logpoints.
	protected bpLongAddressLine: number;	// For BASIC line decoding
	protected bpLongAddressVars: number;	// For BASIC variables decoding

	// The cached BASIC line.
	protected cachedBasicLine: string | undefined;

	// The cached variable names.
	protected cachedVarNames: string[];

	/** Constructor. */
	constructor(remote: RemoteBase, z80Registers: Z80RegistersClass, labels: LabelsClass) {
		super('', remote, z80Registers, labels);
	}


	/** Set the logpoints at the right addresses.
	 * 2 addresses are set:
	 * 1. To capture the BASIC line text.
	 * 2. To capture the BASIC variables.
	 */
	public setLogPoints(logPointsMap: Map<string, GenericBreakpoint[]>) {
		// BASIC LOGPOINT
		let array = logPointsMap.get('BASIC');
		if (!array) {
			array = new Array<GenericBreakpoint>();
			logPointsMap.set('BASIC', array);
		}
		// For all ZX81 memory models ROM is bank 0.
		// TODO: I need some check that the address is used for the right bank:
		//const longAddress = Z80RegistersClass.getLongAddressWithBank(0x0CC1, 0);
		this.bpLongAddressLine = Z80RegistersClass.getLongAddressWithBank(LogEvalBasicZx81.BP_ADDR_BASIC_LINE, 0);	// CALL L0CC1
		this.bpLongAddressVars = Z80RegistersClass.getLongAddressWithBank(LogEvalBasicZx81.BP_ADDR_BASIC_VARS, 0);	// RES 1,(IY+$01)
		array.push({longAddress: this.bpLongAddressLine, condition: '', log: this});
		array.push({longAddress: this.bpLongAddressVars, condition: '', log: this});
	}


	/** Returns the BASIC line.
	 * @returns E.g. 'BASIC: 10 PRINT "HELLO"'
	 */
	public async evaluate(): Promise<string | undefined> {
		// Check which breakpoint is hit
		const pc = this.remote.getPCLong();
		if (pc === this.bpLongAddressLine) {
			await this.evaluateLine();
			return undefined;	// No output yet
		}
		if (pc === this.bpLongAddressVars) {
			const txt = await this.evaluateVars();
			return txt;
		}
		// Should not happen
		return undefined;
	}


	/** Returns the BASIC line.
	 * @returns E.g. 'BASIC: 10 PRINT "HELLO"'
	 */
	protected async evaluateLine(): Promise<void> {
		this.cachedBasicLine = undefined;
		// Only output everything below VARS (i.e. in program area, but allow also DFILE)
		const lineContentsAddr = this.remote.getRegisterValue('HL');
		const vars = await this.getWordEval(16400);
		if (lineContentsAddr >= vars)
			return;

		// HL points to the address just after LINE and SIZE:
		const lineNumberArray = await this.remote.readMemoryDump(lineContentsAddr-4, 2);
		const lineNumber = lineNumberArray[1] + 256 * lineNumberArray[0];
		const size = await this.getWordEval(lineContentsAddr - 2);
		this.cachedBasicLine = `BASIC: ${lineNumber} `;

		// Convert BASIC tokens into text
		const buffer = await this.remote.readMemoryDump(lineContentsAddr, size);
		const txt = Zx81Tokens.convertBasLine(buffer);

		// Extract variables from BASIC buffer
		this.cachedVarNames = this.extractVarNames(buffer);

		this.cachedBasicLine += txt;
	}

	/** Extract variable names from the BASIC line buffer.
	 * Simply everything that is a letter+ is taken as a variable name.
	 * @param buffer The BASIC line buffer.
	 * @returns An array with the variable names.
	 * Note: Does not evaluate "IF ... THEN REM" correctly
	 */
	protected extractVarNames(buffer: Uint8Array): string[] {
		const varNames: string[] = [];
		let varName = '';
		for (let i = 0; i < buffer.length; i++) {
			const c = buffer[i];
			if (c === Zx81Tokens.REM)
				break;	// No more variables
			if (c === Zx81Tokens.NUMBER) {
				// Skip number part
				i += 5;
				continue;
			}
			if (c === Zx81Tokens.QUOTE) {
				// Skip quoted text
				i++;
				for (; i < buffer.length; i++) {
					if (c === Zx81Tokens.QUOTE)
						break;
				}
				continue;
			}
			if (varName.length === 0) {
				// First char must be a letter
				if (c >= 0x26 && c <= 0x3F) {
					varName += Zx81Tokens.convertToken(c);
				}
			}
			else {
				// Second or later letter, then allow also digits.
				if ((c >= 0x1C && c <= 0x3F) || c === 0x0D) {  // Or $
					varName += Zx81Tokens.convertToken(c);
				}
				else if (c === 0x10) {
					// Opening bracket "(": Arrays are not shown
					varName = '';
				}
				else {
					// Does not belong to var name, store var name
					varNames.push(varName);
					varName = '';
				}
			}
		}
		// Push also last var name if necessary
		if (varName.length > 0)
			varNames.push(varName);

		return varNames;
	}


	/** Returns the cached BASIC line text plus the variables mentioned
	 * with their values.
	*/
	protected async evaluateVars(): Promise<string | undefined> {
		if (this.cachedBasicLine === undefined)
			return undefined;
		let txt = this.cachedBasicLine;
		this.cachedBasicLine = undefined;

		// Add variables
		txt += ' [' + this.cachedVarNames.join(', ') + ']';

		return txt;
	}
}