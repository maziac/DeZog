import {Labels} from '../labels/labels';
import {Settings} from '../settings/settings';
import {Z80RegistersClass} from '../remotes/z80registers';
import {Remote, RemoteBase} from '../remotes/remotebase';
import * as fs from 'fs';
import {UnifiedPath} from './unifiedpath';
import {Log} from '../log';
//import requireFromString from 'require-from-string';
import * as vm from 'vm';
import * as jsonc from 'jsonc-parser';
import {HexNumber} from '../settings/settingscustommemory';
import {Utility} from '../misc/utility';


/** Evaluates log expressions.
 */
export class LogEval {

	// The Remote.
	protected remote: RemoteBase;

	/** Constructor. */
	constructor(remote : RemoteBase) {
		this.remote = remote;
	}


	/** Prepares an expression:
	 * Exchanges labels with their values and b@ and w@ with
	 * function calls.
	 * Register names are untouched.
	 * @param expr The expression to evaluate. May contain math expressions and labels.
	 * Also evaluates numbers in formats like '$4000', '2FACh', 100111b, 'G'.
	 * E.g. 2*b@abstract(HL+LABEL):hex
	 * @param modulePrefix An optional prefix to use for each label. (sjasmplus)
	 * @param lastLabel An optional last label to use for local labels. (sjasmplus)
	 * @returns The 'expr' with all labels replaced by numbers.
	 * E.g. hex:2*getByte(HL+0x1234)
	 */
	public static prepareExpression(expr: string, modulePrefix?: string, lastLabel?: string): string {
		// Tear apart the format string
		const match = /([^:]*)(:(.*))?/.exec(expr)!;
		const expression = match[1].trim();
		const format = (match[3] || 'string').trim();

		// Get all labels and registers replaced with numbers
		const exprLabelled = Utility.replaceVarsWithValues(expression, false, modulePrefix, lastLabel);

		// Exchange w@(...) and b@(...) with getWord(...) and getByte(...)
		const regexAt = /([bw])@\(/g;
		const exprWithFunc = exprLabelled.replace(regexAt, (match, p1) => {
			return (p1 === 'w') ? 'await getWord(' : 'await getByte(';
		});

		return format + ':' + exprWithFunc;
	}


	/** Checks the syntax of the expression.
	 * Throws an exception if the syntax is wrong.
	 * @param expr The expression to check. Use the output of prepareExpression.
	 * E.g. string:2*getByte(HL+0x1234)
	*/
	public static checkExpressionSyntax(expr: string) {
		// Check format
		const match = /((.*):)?(.*)/.exec(expr)!;
		const format = match[2];
		if (!['string', 'hex8', 'hex16', 'int8', 'int16', 'uint8', 'uint16', 'bits', 'flags'].includes(format))
			throw Error("Unknown format '" + format + "'.");

		// Make function 'sync' for checking
		const expression = match[3];
		const exprSync = expression.replace(/await/g, '');

		function getByte(addr: number): number {return 1;}
		function getWord(addr: number): number {return 2;}

		function checkEval(expr: string): any {
			const func = new Function('getByte', 'getWord', `return ${expr};`);
			return func(getByte, getWord);
		}

		// Check syntax
		checkEval(exprSync);
	}


	/** Evals a full expression.
	 * Labels have already been replaced with their values and b@ and w@ with getByte and getWord.
	 * See prepareExpression.
	 * So here the registers are replaced with real values.
	 * And the real memory contents is used.
	 * @param expr The expression to evaluate. May contain math expressions and registers.
	 * E.g. string:2*getByte(HL+2453)
	 * @returns The output of the evaluation as string.
	 */
	public async evalFullExpression(expr: string): Promise<string> {
		try {
			// Get format
			const k = expr.indexOf(':');
			const format = expr.substring(0, k);
			const expression = expr.substring(k + 1);

			// Evaluate
			const result = await this.customEval(expression);

			// Format
			let retValue: string;
			switch (format) {
				case 'string':
					retValue = result.toString();
					break;
				case 'hex8':
					retValue = '0x' + Utility.getHexString(result, 2);
					break;
				case 'hex16':
					retValue = '0x' + Utility.getHexString(result, 4);
					break;
				case 'int8': {
						let iResult = result & 0xFF;
						if (iResult > 0x7F)
							iResult -= 0x100;
						retValue = iResult.toString();
					}
					break;
				case 'int16': {
						let iResult = result & 0xFFFF;
						if (iResult > 0x7FFF)
							iResult -= 0x10000;
						retValue = iResult.toString();
					}
					break;
				case 'uint8': {
						let iResult = result & 0xFF;
						retValue = iResult.toString();
					}
					break;
				case 'uint16': {
						let iResult = result & 0xFFFF;
						retValue = iResult.toString();
					}
					break;
				case 'bits':
					retValue = result.toString(2).padStart(8, '0');
					break;
				case 'flags':
					retValue = result.toString(2).padStart(8, '0');	// TODO
					break;
				default:
					throw Error("Unknown format '" + format + "'.");
			}

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

	protected async customEval(expr: string): Promise<any> {
		const func = new Function('getByte', 'getWord', `return (async () => { return ${expr}; })();`);
		const result = func(this.getByteEval.bind(this), this.getWordEval.bind(this));
		return result;
	}
}
