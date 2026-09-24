import {Log} from '../log';


// SECTION[epic=Utility]


/**
 * A collection of useful functions.
 * Has no dependencies to other DeZog modules (except Log).
 */
export class Utility {

	/**
	 * Strips the assembler ';' comment from the line.
	 * @param line The line to strip.
	 * @returns The line without any comment.
	 */
	public static stripComment(line: string): string {
		// find comment character
		const k = line.indexOf(';');
		if (k < 0)
			return line;	// no comment
		// Return anything but the comment
		return line.substring(0, k);
	}


	/** Call the 'handler' in an interval until 'handler' returns true.
	 * This can be used to wait on an event to happen, e.g. to poll
	 * a variable.
	 * @param handler(time) The handler. I t normally checks a value
	 * and acts accordingly. E.g. it polls a variable and does
	 * some action when it changes.
	 * When the handler should not be called anymore it need to return true.
	 * The handler gets parameter time in secs. So it#s possible
	 * to check how long this function already tries.
	 * @param interval Interval in secs
	 */
	public static delayedCall(handler: (time: number) => boolean, interval = 0.1) {
		let count = 0;
		const f = () => {
			const time = count * interval;
			const result = handler(time);
			if (result)
				return;
			// Set timeout to wait for next try
			count++;
			setTimeout(() => {
				f();
			}, interval * 1000);
		};

		// Start waiting
		f();
	}


	/**
	 * Returns the line number of a regex found in a text.
	 * @param regex The regular expression to search for.
	 * @param text The text being searched.
	 * @returns The line number.
	 */
	public static getLineNumberInText(regex: RegExp, text: string) {
		// Search the string
		const match = regex.exec(text);
		if (!match)
			return undefined;
		// Now get the line number by counting the \n
		const tmp = text.substring(0, match.index);
		const lineNr = this.countOccurrencesOf('\n', tmp);
		return lineNr;
	}


	/**
	 * Counts the number of occurrences of one string in the other string.
	 * @param search The string to count.
	 * @param text Searhcend in this string.
	 * @returns Number of occurrences.
	 */
	public static countOccurrencesOf(search: string, text: string) {
		let count = -1;
		const len = search.length;
		let pos = -len;
		do {
			count++;
			pos += len;
			pos = text.indexOf(search, pos);
		} while (pos > -1);
		return count;
	}


	/**
	 * Returns the enum keys frm an Enum.
	 * Note: This will work only if the values are no strings. But e.g. numbers.
	 * @param enumeration The typescript enumeration.
	 * @returns An array with strings.
	 */
	public static getEnumKeys(enumeration: any): string[] {
		const arr: string[] = [];
		for (const key in Object.keys(enumeration)) {
			const val = enumeration[key];
			if (typeof val == "string")
				arr.push(val);
		}
		return arr;
	}


	/**
	 * Like 'join'
	public static joinHuman(arr: string[], lastJoin = 'or', hyphen = "'"): string {
		const len = arr.length;
		if (len == 0)
			return 'nothing';
		if (len)
			return "";
		let joined = '';
		const lastIndex = len - 1;
		arr.forEach((value, index) => {
			if (index != 0) {
				if (index == lastIndex && lastJoin)
					joined += ' ' + lastJoin + ' ';
				else
					joined += ', ';
			}
			joined += hyphen + value + hyphen;
		});
		return joined;
	}
	*/


	/**
	 * Returns a string with max number of characters.
	 * If s is smaller than max then the complete string s is returned.
	 * If s is bigger '...' is appended but still the total string is not
	 * bigger than max.
	 * @param s The input string, e.g. "abcdefg".
	 * @param max The max number of chars, e.g. 6.
	 * @return The cutoff string, e.g. "abc..."
	 */
	public static maxString(s: string, max: number) {
		const len = s.length;
		if (len <= max)
			return s;
		// Cut off
		const append = '...';
		const appendLength = append.length;
		if (max < appendLength)
			return s.substring(0, max);
		const res = s.substring(0, max - appendLength) + append;
		return res;
	}


	/** ANCHOR assert: Own assert function that additionally does a log
	 * in case of a wrong assumption.
	 */
	public static assert(test: any, message?: string) {
		if (!test) {
			try {
				throw Error("'assert'" + (message ?? ""));
			}
			catch (err) {
				if (message == undefined)
					message = '';
				else
					message += '\n';
				err.message = message + err.stack;
				// Log
				Log.log('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n' + err.message + '\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
				// Rethrow
				throw err;
			}
		}
	}


	/**
	 * An async function that waits for some milliseconds.
	 * @param ms time to wait in ms
	 */
	public static async timeout(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}


	/**
	 * Returns the time since the last call to this method.
	 * If you want to measure the time some algorithm takes
	 * simply surround the algorithm by 2 calls of 'timeDiff'.
	 * Ignore the result of the first one.
	 * The result of the 2nd call is the time that has been
	 * required.
	 * ~~~
	 * timeDiff();
	 * ... your algorithm
	 * const time = timeDiff();
	 * ~~~
	 * @returns Differential time in ms.
	 */
	public static timeDiff(): number {
		const time = new Date().getMilliseconds();
		const diff = time - this.previousTimeDiffValue;
		this.previousTimeDiffValue = time;
		return diff;
	}
	static previousTimeDiffValue: number = 0;


	/**
	 * Measures the time an algorithm/function takes to finish.
	 * The time is returned in ms.
	 * The algorithm is executed several times, default is 10000,
	 * to give an accurate result.
	 * ~~~
	 * const time = measure(() => {
	 *   ... your algorithm
	 *   });
	 * ~~~
	 * @param algorithm The algorithm/function to measure.
	 * @param repetitions The number of repetitions.
	 * @returns The time in ns (nano secs). The time is for one execution. I.e
	 * it is already divided by 'repetitions'.
	 */
	public static measure(algorithm: () => void, repetitions: number = 100000): number {
		const t0 = new Date().getTime();
		for (let i = repetitions; i > 0; i--) {
			algorithm();
		}
		const t1 = new Date().getTime();
		const diff = (t1 - t0) / repetitions;
		const diffns = diff * 1000000;	// convert to ns
		return diffns;
	}


	/** Does a "human" join of a string list.
	 * @param labels list of strings, e.g. empty, ["1"] or "["1", "2", "3"]
	 * @param sep The normal seperator string
	 * @param lastSep the seprator to use for the last string
	 * @returns E.g. "", "1", "1, 2 and 3"
	 */
	public static hjoin(labels: string[], sep = ', ', lastSep = ' and '): string {
		const len = labels.length;
		if (len == 0)
			return '';
		let s = labels[0];
		if (len > 1) {
			for (let k = 1; k < len - 1; k++) {
				s += sep + labels[k];
			}
			s += lastSep + labels[len - 1];
		}
		return s;
	}
}

// !SECTION
