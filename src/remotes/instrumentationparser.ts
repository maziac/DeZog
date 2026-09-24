import {GenericBreakpoint, GenericWatchpoint} from '../genericwatchpoint';
import {Labels} from '../labels/labels';
import {Expressions} from '../misc/expressions';
import {LogEval} from '../misc/logeval';
import {RemoteBase} from './remotebase';
import {Z80Registers} from './z80registers';


/** Parses the WPMEM, ASSERTION and LOGPOINT lines (found in the comments
 * of the list files) and creates the watchpoints and breakpoints.
 */
export class InstrumentationParser {

	/**
	 * Creates an array of watch points from the text lines.
	 * @param watchPointLines An array with address and line (text) pairs.
	 * @return An array with watch points (GenericWatchpoints).
	 */
	public static createWatchPoints(watchPointLines: Array<{address: number, line: string}>): Array<GenericWatchpoint> {
		// convert labels in watchpoints.
		const watchpoints = new Array<GenericWatchpoint>();

		let i = -1;
		for (let entry of watchPointLines) {
			i = i + 1;
			// WPMEM:
			// Syntax:
			// WPMEM [addr [, length [, access]]]
			// with:
			//	addr = address (or label) to observe (optional). Defaults to current (long) address.
			//	length = the count of bytes to observe (optional). Default = 1.
			//	access = Read/write access. Possible values: r, w or rw. Defaults to rw.
			// e.g. WPMEM LBL_TEXT, 1, w
			// or
			// WPMEM ,1,w, MWV&B8h/0

			try {
				// Now check more thoroughly: group1=address, group3=length, group5=access, group7=condition
				//const match = /^WPMEM(?=[,\s]|$)\s*([^\s,]*)?(\s*,\s*([^\s,]*)(\s*,\s*([^\s,]*)(\s*,\s*([^,]*))?)?)?/.exec(entry.line)
				// All lines start with WPMEM, remove it
				const line = entry.line.substring(5);
				const subParts = line.split(',').map(s => s.trim());
				// Get arguments
				let addressString = subParts[0];
				let lengthString = subParts[1];
				let access = subParts[2];
				let cond = subParts[3];	// This is supported only with "fast-breakpoints" not with the unmodified ZEsarUX. Also the new (7.1) faster memory breakpoints do not support conditions.
				// defaults
				let entryAddress: number | undefined = entry.address;
				if (addressString && addressString.length > 0)
					entryAddress = Expressions.evalExpression(addressString, false); // don't evaluate registers
				if (isNaN(entryAddress))
					continue;	// could happen if the WPMEM is in an area that is conditionally not compiled, i.e. label does not exist.
				let length = 1;
				if (lengthString && lengthString.length > 0) {
					length = Expressions.evalExpression(lengthString, false); // don't evaluate registers
				}
				/*
				else {
					if (!addressString||addressString.length==0) {
						// If both, address and length are not defined it is checked
						// if there exists bytes in the list file (i.e.
						// numbers after the address field).
						// If not the "WPMEM" is assumed to be inside a
						// macro and omitted.
						const match=/^[0-9a-f]+\s[0-9a-f]+/i.exec(entry.line);
						if (!match)
							continue;
					}
				}
				*/
				if (access && access.length > 0) {
					access = access.trim();
					access = access.toLowerCase();
					if (access != 'r' && access != 'w' && access != 'rw') {
						const errText = "Wrong access mode in watch point. Allowed are only 'r', 'w' or 'rw' but found '" + access + "' in line: '" + entry.line + "'";
						console.log(errText);
						continue;
					}
				}
				else
					access = 'rw';
				// Set watchpoint. (long or 64k address)
				watchpoints.push({longOr64kAddress: entryAddress, size: length, access: access, condition: cond || ''});
			}
			catch (e) {
				throw Error("Problem with WPMEM. Could not evaluate: '" + entry.line + "': " + e.message + "");
			}
		}

		return watchpoints;
	}


	/**
	 * Creates an array of assertions from the text lines.
	 * @param assertionLines An array with address and line (text) pairs.
	 * @return An array with assertions (GenericWatchpoints).
	 */
	public static createAssertions(assertionLines: Array<{address: number, line: string}>): Array<GenericBreakpoint> {
		const assertionMap = new Map<number, GenericBreakpoint>();
		// Convert ASSERTIONS to watchpoints
		for (let entry of assertionLines) {
			// ASSERTION:
			// Syntax:
			// ASSERTION var comparison expr [&&|| expr]
			// with:
			//  var: a variable, i.e. a register like A or HL
			//  comparison: one of '<', '>', '==', '!=', '<=', '=>'.
			//	expr: a mathematical expression that resolves into a constant
			// Examples:
			// - ASSERTION A < 5
			// - ASSERTION HL <= LBL_END+2
			// - ASSERTION B > (MAX_COUNT+1)/2
			// - ASSERTION false
			// - ASSERTION

			// ASSERTIONs are breakpoints with "inverted" condition.
			// Now check more thoroughly: group1=var, group2=comparison, group3=expression
			try {
				const matchAssertion = /^ASSERTION(.*)/.exec(entry.line);
				if (!matchAssertion)
					continue;

				// Get part of the string after the "ASSERTION"
				const part = matchAssertion[1].trim();

				// Check if no condition was set = ASSERTION false = Always break
				let conds = '';
				if (part.length > 0) {
					// Some condition is set
					const regex = /\s*([^;]*)/i;
					let match = regex.exec(part);
					if (!match)	// At least one match should be found
						throw Error("Expecting 'ASSERTION expr'.");
					conds = match[1];
				}

				// Negate the expression
				conds = Expressions.getConditionFromAssertion(conds);

				// Check if ASSERTION for that address already exists.
				if (conds.length > 0) {
					let bp = assertionMap.get(entry.address);
					if (bp) {
						// Already exists: just add condition.
						bp.condition = '(' + bp.condition + ') || (' + conds + ')';
					}
					else {
						// Breakpoint for address does not yet exist. Create a new one.
						const assertionBp = {longAddress: entry.address, condition: conds, log: undefined};
						assertionMap.set(entry.address, assertionBp);
					}
				}
			}
			catch (e) {
				console.log("Problem with ASSERTION. Could not evaluate: '" + entry.line + "': " + e.message + "");
			}
		}

		// Convert map to array.
		const assertionsArray = Array.from(assertionMap.values());

		return assertionsArray;
	}


	/**
	 * Creates an array of log points from the text lines.
	 * @param logPointLines An array with address and line (text) pairs.
	 * @param remote The remote used to evaluate the log points.
	 * @param warning Called with a message if a log point could not be evaluated.
	 * @return An array with log points (GenericWatchpoints) for each group.
	 */
	public static createLogPoints(logPointLines: Array<{address: number, line: string}>, remote: RemoteBase, warning: (msg: string) => void): Map<string, Array<GenericBreakpoint>> {
		// convert labels in watchpoints.
		const logpoints = new Map<string, Array<GenericBreakpoint>>();
		for (let entry of logPointLines) {
			// LOGPOINT:
			// Syntax:
			// LOGPOINT [group] text ${(var):signed} text ${reg:hex} text ${w@(reg)} text ¢{b@(reg):unsigned}
			// e.g. LOGPOINT [SPRITES] Status=${A}, Counter=${(sprite.counter):unsigned}

			// Now check more thoroughly i.e. for comma
			const match = /^LOGPOINT\b(\s*\[\s*(\w*)\s*\])?\s*(.*)/gm.exec(entry.line);
			if (match) {
				// get arguments
				const group = match[2] || "DEFAULT";
				const logMsg = '[' + group + '] ' + match[3];
				// Create group if not existent
				let array = logpoints.get(group);
				if (!array) {
					array = new Array<GenericBreakpoint>();
					logpoints.set(group, array);
				}
				// Convert labels
				try {
					const log = new LogEval(logMsg, remote, Z80Registers, Labels);
					// set watchpoint
					array.push({longAddress: entry.address, condition: '', log: log});
				}
				catch (e) {
					// Show error
					const msg = "Problem with LOGPOINT. Could not evaluate: '" + entry.line + "': " + e.message;
					console.log(msg);
					warning(msg);
				}
			}
		}

		return logpoints;
	}
}
