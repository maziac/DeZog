import {LabelsClass} from '../../labels/labels';
import {Z80RegistersClass} from '../../remotes/z80registers';
import {RemoteBase} from '../../remotes/remotebase';
import {LogEval} from '../logeval';
import {Zx81Tokens} from './zx81tokens';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Zx81BasicVars} from './zx81basicvars';


/** Creates a log message to log a ZX81 BASIC line with variable contents.
 * It logs the line number and the contents of the line.
 * E.g. Log: BASIC: 10 PRINT "HELLO"
 * This logpoint is part of the [BASIC] group.
 * How it works:
 * A breakpoint is set into ROM.
 * The BASIC is decoded like this:
 * LINE: 1 word, big endian
 * SIZE: 1 word, little endian
 * CONTENT: SIZE bytes, ended by newline=0x76
 *
 * Then also the used variables are logged at a second breakpoint.
 * The VARS area is decoded and the variables are stored in a map
 * and printed out when they are changed.
 *
 * Note: The contents of fields (DIM) are not logged.
 * Because it would get to complicated.
 * A field could be referenced by other variables:
 * 100 LET F(j,k+1) = M
 */
export class LogEvalBasicZx81 extends LogEval {
	protected static readonly BP_ADDR_BASIC_LINE = 0x0673;	// The breakpoint address for the BASIC line.
	protected static readonly BP_ADDR_BASIC_VARS = 0x0676;	// The breakpoint address for the BASIC variables.

	// The long breakpoints for the logpoints.
	protected bpLongAddressLine: number;	// For BASIC line decoding
	protected bpLongAddressVars: number;	// For BASIC variables decoding

	// The cached variable names.
	protected cachedVarNames: string[] = [];

	// Holds the BASIC vars.
	protected zx81BasicVars: Zx81BasicVars;


	/** Constructor. */
	constructor(remote: RemoteBase, z80Registers: Z80RegistersClass, labels: LabelsClass) {
		super('', remote, z80Registers, labels);
		this.zx81BasicVars = new Zx81BasicVars();
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
			const txt = await this.evaluateLine();
			return txt;
		}
		if (pc === this.bpLongAddressVars) {
			const txt = await this.evaluateChangedVars();
			return txt;
		}
		// Should not happen
		return undefined;
	}


	/** Returns the BASIC line.
	 * @returns E.g. 'BASIC: 10 PRINT "HELLO"'
	 */
	protected async evaluateLine(): Promise<string | undefined> {
		// Only output everything below VARS (i.e. in program area, but allow also DFILE)
		const lineContentsAddr = this.remote.getRegisterValue('HL');
		const vars = await this.getWordEval(16400);
		if (lineContentsAddr >= vars)
			return undefined;

		// HL points to the address just after LINE and SIZE:
		const lineNumberArray = await this.remote.readMemoryDump(lineContentsAddr - 4, 2);
		const lineNumber = lineNumberArray[1] + 256 * lineNumberArray[0];
		const size = await this.getWordEval(lineContentsAddr - 2);
		let basicLine = `BASIC: ${lineNumber} `;

		// Convert BASIC tokens into text
		const buffer = await this.remote.readMemoryDump(lineContentsAddr, size);
		const txt = Zx81Tokens.convertBasLine(buffer);

		// Extract variables from BASIC buffer
		basicLine += txt;
		if (txt.startsWith('NEXT ')) {
			// Don't show variables for NEXT
			this.cachedVarNames = [];
		}
		else {
			this.cachedVarNames = this.extractVarNames(buffer);
			const varsTxt = this.evaluateVars();
			basicLine += ' ' + varsTxt;
		}
		return basicLine;
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
					if (buffer[i] === Zx81Tokens.QUOTE)
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
					if(!varNames.includes(varName))
						varNames.push(varName);
					varName = '';
				}
			}
		}
		// Push also last var name if necessary
		if (varName.length > 0 && !varNames.includes(varName))
			varNames.push(varName);

		return varNames;
	}


	/** Returns the variables mentioned
	 * with their values.
	*/
	protected evaluateVars(): string {
		// Add all vars with their values
		let varsTxt = '';
		let sep = '';
		for (let varName of this.cachedVarNames) {
			// Gt current value
			const value = this.zx81BasicVars.basicVars.get(varName);
			if (value !== undefined) {
				varsTxt += sep + varName + '=' + value;
				// Separator
				sep = ', ';
			}
		}

		// Check if there are any variables
		if (varsTxt.length > 0)
			varsTxt = '[' + varsTxt + ']';

		return varsTxt;
	}


	/** Returns the variables mentioned
	 * with their values.
	*/
	protected async evaluateChangedVars(): Promise<string | undefined> {
		// Remember old values
		const lastBasicVars = this.zx81BasicVars.basicVars;
		// Get the BASIC variables
		const [varBuffer, varsStart] = await this.zx81BasicVars.getBasicVars((addr64k, size) => this.remote.readMemoryDump(addr64k, size));
		this.zx81BasicVars.parseBasicVars(varBuffer, varsStart);

		// Add all vars with their values
		let varsTxt = '';
		let sep = '';
		for (let varName of this.cachedVarNames) {
			// Gt old and new value
			const oldValue = lastBasicVars.get(varName);
			const changedValue = this.zx81BasicVars.basicVars.get(varName);
			if (changedValue !== undefined && oldValue !== changedValue)
				varsTxt += sep + varName + '=' + changedValue;
			// Separator
			sep = ', ';
		}
		this.cachedVarNames = [];

		// Check if any variable has changed
		if (varsTxt.length === 0)
			return undefined;

		const txt = 'BASIC: Changed: ' + varsTxt;
		return txt;
	}
}