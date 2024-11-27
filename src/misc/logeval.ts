import {LabelsClass} from '../labels/labels';
import {Z80RegistersClass} from '../remotes/z80registers';
import {RemoteBase} from '../remotes/remotebase';
import {Utility} from '../misc/utility';


/** Evaluates log expressions.
 * The evaluation is a 2 step process:
 * 1. Prepare the expression: Replace labels with their values,
 * b@ and w@ with function calls and register names with object variables.
 * 2. Evaluate the expression: Evaluate the expression with the real memory contents.
 */
export class LogEval {

	// The Remote.
	protected remote: RemoteBase;

	// The Z80 registers.
	protected z80Registers: Z80RegistersClass;

	// The labels.
	protected labels: LabelsClass;

	// The output format.
	protected format: string;

	// The created evaluation function.
	protected evalFunc: Function;


	/** Constructor. */
	constructor(expression: string, remote: RemoteBase, z80Registers: Z80RegistersClass, labels: LabelsClass) {
		this.remote = remote;
		this.z80Registers = z80Registers;
		this.labels = labels;

		// Prepare expression
		const preparedExpr = this.prepareExpression(expression);
		// Check syntax
		this.checkExpressionSyntax(preparedExpr);	// Throws an exception if the syntax is wrong.

		// Create evaluation function
		this.evalFunc = new Function('getByte', 'getWord', 'getRegValue', `return (async () => { return ${preparedExpr}; })();`);
	}


	/** Prepares an expression:
	 * Exchanges labels with their values and b@ and w@ with
	 * function calls.
	 * Register names are untouched.
	 * @param expr The expression to evaluate. May contain math expressions and labels.
	 * Also evaluates numbers in formats like '$4000', '2FACh', 100111b, 'G'.
	 * E.g. 2*b@abstract(HL+LABEL):hex8
	 * Also extracts the format and set this.format accordingly.
	 * @param modulePrefix An optional prefix to use for each label. (sjasmplus)
	 * @param lastLabel An optional last label to use for local labels. (sjasmplus)
	 * @returns The prepared expression.
	 */
	public prepareExpression(expr: string): string {
		// Tear apart the format string
		const match = /([^:]*)(:(.*))?/.exec(expr)!;
		const expression = match[1].trim();
		this.format = (match[3] || 'string').trim();
		if (!['string', 'hex8', 'hex16', 'int8', 'int16', 'uint8', 'uint16', 'bits', 'flags'].includes(this.format))
			throw Error("Unknown format '" + this.format + "'.");

		// Replace labels
		const labelsReplaced = this.replaceLabels(expression);
		// Replace registers
		const regsReplaced = this.replaceRegisters(labelsReplaced);
		// Replace b@ and w@ with getByte and getWord
		const exprWithFunc = this.replaceAt(regsReplaced);

		return exprWithFunc;
	}


	/** Replaces all labels with their numbers.
	 * (Supports only fully qualified labels.)
	 * @param expr The expression to replace the labels in.
	 * @returns The expression with the labels replaced.
	 */
	protected replaceLabels(expr: string): string {
		const regex = /[A-Za-z_][A-Za-z0-9_]*/g;
		const replaced = expr.replace(regex, match => {
			const lbl = match;
			const value = this.labels.getNumberFromString64k(lbl);
			return (isNaN(value)) ? lbl : value.toString();
		});
		return replaced;
	}


	/** Replaces all registers.
	 * @param expr The expression to replace the registers in.
	 * @returns The expression with the registers replaced.
	 */
	protected replaceRegisters(expr: string): string {
		// Replace all registers
		const regex = /PC|SP|AF|BC|DE|HL|IX|IY|AF'|BC'|DE'|HL'|IR|IM|F|A|C|B|E|D|L|H|IXL|IXH|IYL|IYH|A'|C'|B'|E'|D'|L'|H'|R|I|/ig;
		const replaced = expr.replace(regex, match => {
			const reg = match.toUpperCase();
			const regFunc = `getRegValue(${reg})`;
			return regFunc;
		});
		return replaced;
	}


	/** Replaces all b@(...) and w@(...) with 'await getByte/Word(...)'.
	 * @param expr The expression to replace the b@ and w@ in.
	 * @returns The expression with the b@ and w@ replaced.
	 */
	protected replaceAt(expr: string): string {
		const regex = /([bw])@\(/g;
		const replaced = expr.replace(regex, (match, p1) => {
			return (p1 === 'w') ? 'await getWord(' : 'await getByte(';
		});
		return replaced;
	}


	/** Checks the syntax of the expression.
	 * Throws an exception if the syntax is wrong.
	 * @param expr The expression to check. Use the output of prepareExpression.
	 * E.g. string:2*getByte(HL+0x1234)
	*/
	protected checkExpressionSyntax(expr: string) {
		// Check format
		const match = /((.*):)?(.*)/.exec(expr)!;

		// Make function 'sync' for checking
		const expression = match[3];
		const exprSync = expression.replace(/await/g, '');

		function getByte(addr: number): number {return 1;}
		function getWord(addr: number): number {return 2;}
		function getRegValue(addr: number): number {return 14;}

		function checkEval(expr: string): any {
			const func = new Function('getByte', 'getWord', `return ${expr};`);
			return func(getByte, getWord, getRegValue);
		}

		// Check syntax
		checkEval(exprSync);
	}


	/** Formats a given numeric value according to the specified format.
	 * @param value - The numeric value to format.
	 * @returns The formatted string representation of the value.
	 * @throws Will throw an error if the format is unknown.
	 *
	 * The possible formats are:
	 * - 'string': Converts the value to a string.
	 * - 'hex8': Converts the value to a hexadecimal string with at least 2 digits, prefixed with '0x'.
	 * - 'hex16': Converts the value to a hexadecimal string with at least 4 digits, prefixed with '0x'.
	 * - 'int8': Converts the value to an 8-bit signed integer string.
	 * - 'int16': Converts the value to a 16-bit signed integer string.
	 * - 'uint8': Converts the value to an 8-bit unsigned integer string.
	 * - 'uint16': Converts the value to a 16-bit unsigned integer string.
	 * - 'bits': TODO
	 * - 'flags': TODO
	 */
	protected formatValue(value: number): string {
		// Format
		let retValue: string;
		switch (this.format) {
			case 'string':
				retValue = value.toString();
				break;
			case 'hex8':
				retValue = '0x' + Utility.getHexString(value, 2);
				break;
			case 'hex16':
				retValue = '0x' + Utility.getHexString(value, 4);
				break;
			case 'int8': {
				let iResult = value & 0xFF;
				if (iResult > 0x7F)
					iResult -= 0x100;
				retValue = iResult.toString();
			}
				break;
			case 'int16': {
				let iResult = value & 0xFFFF;
				if (iResult > 0x7FFF)
					iResult -= 0x10000;
				retValue = iResult.toString();
			}
				break;
			case 'uint8': {
				let iResult = value & 0xFF;
				retValue = iResult.toString();
			}
				break;
			case 'uint16': {
				let iResult = value & 0xFFFF;
				retValue = iResult.toString();
			}
				break;
			case 'bits':
				retValue = value.toString(2).padStart(8, '0');
				break;
			case 'flags':
				retValue = value.toString(2).padStart(8, '0');	// TODO
				break;
			default:
				throw Error("Unknown format '" + this.format + "'.");
		}
		return retValue;
	}


	/**
	 * The function `evaluate` in TypeScript asynchronously evaluates an expression based on a specified
	 * format and returns the result in the desired format.
	 * @param {string} expr - The `evaluate` function takes an expression string as input, which consists
	 * of a format specifier followed by the expression to evaluate. The format specifier determines how
	 * the result of the expression should be formatted.
	 * @returns The `evaluate` function returns a Promise that resolves to a string value based on the
	 * format specified in the input expression. The function first extracts the format and expression
	 * from the input string, then evaluates the expression using a custom evaluation function. Depending
	 * on the format specified, it processes the result accordingly and returns the formatted string
	 * value. If an unknown format is encountered, it throws an error.
	 */
	/** Evals a full expression.
	 * Labels have already been replaced with their values and b@ and w@ with getByte and getWord.
	 * See prepareExpression.
	 * So here the registers are replaced with real values.
	 * And the real memory contents is used.
	 * @param expr The expression to evaluate. May contain math expressions and registers.
	 * E.g. string:2*getByte(HL+2453)
	 * @returns The output of the evaluation as string.
	 */
	public async evaluate(): Promise<string> {
		try {
			// Evaluate
			const result = this.evalFunc(this.getByteEval.bind(this), this.getWordEval.bind(this), this.getRegValue.bind(this)); // TODO: Maybe I could pass 'this' as variable instead of passing the functions.
			// Format
			const retValue = this.formatValue(result);

			// Return string
			return retValue;
		}
		catch (e) {
			// Rethrow, Should not happen because the expression was checked before.
			throw Error(e.message);
		}
	}

	protected async getByteEval(addr: number): Promise<number> {
		const value = await this.remote.readMemoryDump(addr, 1);
		return value[0];
	}

	protected async getWordEval(addr: number): Promise<number> {
		const value = await this.remote.readMemoryDump(addr, 2);
		return value[0] + 256 * value[1];
	}

	protected getRegValue(regName: string): number {
		const value = this.z80Registers.getRegValueByName(regName);
		return value;
	}
}
