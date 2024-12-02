/** The ZX81 BASIC tokens. */
export class Zx81Tokens {
	// A few often needed constants
	public static readonly SPACE = 0;
	public static readonly QUOTE = 0x0B;
	public static readonly NEWLINE = 0x76;
	public static readonly NUMBER = 0x7E;
	public static readonly REM = 0xEA;
	public static readonly DIM = 0xE9;
	public static readonly LET = 0xF1;


	/** The ZX81 charset and tokens.
	 * For the graphics codes and the inverse characters the coding
	 * of ZXText2P has been used.
	 * See https://freestuff.grok.co.uk/zxtext2p/index.html
	 * To be able to reconstruct machine code in REM statements the ZX81 charser codes
	 * without character are put as a number in square brackets.
	 * The codes that correspondent to commands like " GOTO " are additionally but in brackets,
	 * e.g. "[GOTO]" when they appear in REM statements or quoted text.
	 */
	public static tokens = [
		// 0x0
		" ", "\\' ", "\\ '", "\\''", "\\. ", "\\: ", "\\.'", "\\:'", "\\##", "\\,,", "\\~~", "\"", "#", "$", ":", "?",
		// 0x1
		"(", ")", ">", "<", "=", "+", "-", "*", "/", ";", ",", ".", "0", "1", "2", "3",
		// 0x2
		"4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
		// 0x3
		"K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
		// 0x4
		"RND", "INKEY$", "PI", "", "", "", "", "", "", "", "", "", "", "", "", "",
		// 0x5
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		// 0x6
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
		// 0x7
		//"UP", "DOWN", "LEFT", "RIGHT", "GRAPHICS", "EDIT", "NEWLINE", "RUBOUT", "K/L", "MODE", "FUNCTION", "", "", "", "NUMBER", "CURSOR",
		"", "", "", "", "", "", ""/*NL*/, "", "", "", "", "", "", "", "", "",
		// 0x8 Inverse graphics
		"\\::", "\\.:", "\\:.", "\\..", "\\':", "\\ :", "\\'.", "\\ .", "@@", "\\;;", "\\!!", "\"", "#", "$", ":", "?",
		// 0x9 Inverse
		"(", ")", ">", "<", "=", "+", "-", "*", "/", ";", ",", ".", "0", "1", "2", "3",
		// 0xA Inverse
		"4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
		// 0xB Inverse
		"K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
		// 0xC
		"\\\"", "AT ", "TAB ", "", "CODE ", "VAL ", "LEN ", "SIN ", "COS ", "TAN ", "ASN ", "ACS ", "ATN ", "LN ", "EXP ", "INT ",
		// 0xD
		"SQR ", "SGN ", "ABS ", "PEEK ", "USR ", "STR$ ", "CHR$ ", "NOT ", "**", " OR ", " AND ", "<=", ">=", "<>", " THEN ", " TO ",
		// 0xE
		" STEP ", "LPRINT ", "LLIST ", "STOP ", "SLOW ", "FAST ", "NEW ", "SCROLL ", "CONT ", "DIM ", "REM ", "FOR ", "GOTO ", "GOSUB ", "INPUT ", "LOAD ",
		// 0xF
		"LIST ", "LET ", "PAUSE ", "NEXT ", "POKE ", "PRINT ", "PLOT ", "RUN ", "SAVE ", "RAND ", "IF ", "CLS ", "UNPLOT ", "CLEAR ", "RETURN ", "COPY "
	];


	/** The tokens that allow a newline as trailing character
	 * instead of a space.
	 * For these tokens it is not possible to differentiate from variable names.
	 * For the other tokens it may be possible in some cases.
	 */
	public static tokensAllowingTrailingNl = [
		"\\' ", "\\. ", "\\: ",	// OK, these are anyway not variable names but a NL is allowed as well
		"LPRINT ", "LLIST ", "STOP ", "SLOW ", "FAST ",
		"NEW ", "SCROLL ", "CONT ", "REM ", "LIST ", "PRINT ",
		"RUN ", "RAND ", "CLS ", "CLEAR ", "RETURN ", "COPY "
	];


	/** Converts one ZX81 character/token into text. */
	public static convertToken(tokenNumber: number): string {
		let txt = '';
		// Negativ/inverse "-., 0-9, A-Z
		if (tokenNumber >= 0x8B && tokenNumber <= 0xBF) {
			txt += '%';	// Inverse
		}
		// Use table
		txt += Zx81Tokens.tokens[tokenNumber];
		// If not defined then use token in square brackets.
		if (!txt)
			txt = '[' + tokenNumber + ']';
		return txt;
	}


	/** Converts one BASIC line into text.
	 * @param buffer The data of the BASIC line.
	 * @param bracketized If true then tokens are put in brackets.
	 * @returns The text of the BASIC line.
	 */
	public static convertBasLine(buffer: Uint8Array, bracketized = false): string {
		let txt = '';
		let rem = false;
		let quoted = false;
		let token = -1;
		const length = buffer.length - 1;
		for (let i = 0; i < length; i++) {
			token = buffer[i];

			// Number?
			if (!rem && !quoted && token === Zx81Tokens.NUMBER) {	// Number (is hidden)
				// Get block of 5 bytes, the floating point number
				const buf = buffer.slice(i+1, i + 6);
				// Convert block to float
				const value = this.convertBufToZx81Float(buf);
				// Find digits belonging to the number
				const txtNumberStr = this.getLastNumber(txt);
				const txtNumber = parseFloat(txtNumberStr);
				if (isNaN(txtNumber) || (Math.abs(txtNumber - value) > 1e-6)) {
					// If digits are not the same as the value or they are not a real number then print the real value as comment
					txt += '[#' + value + ']';
				}
				i += 5;
				continue;
			}

			// Get token
			let cvt = Zx81Tokens.convertToken(token);

			// If REM or quoted then add brackets to commands
			if ((bracketized || rem || quoted) && ((token >= 0xC1 && token !== 0xC3) || (token >= 0x40 && token <= 0x42)))
				cvt = '[' + cvt.trim() + ']';
			txt += cvt;

			// Check for REM
			if (i == 0 && token === Zx81Tokens.REM) {
				rem = true;
			}
			// Check for quoted text
			else if (token === Zx81Tokens.QUOTE) {
				quoted = !quoted;
			}
		}

		// In case a REM line ends with a space, then exchange it with
		// [0] to prevent that trailing spaces are removed by an editor.
		if (rem && token === Zx81Tokens.SPACE)
			txt = txt.slice(0, -1) + '[0]';

		// Line should end with a new line
		const lastToken = buffer[length];
		if (lastToken !== Zx81Tokens.NEWLINE) {
			//txt += `[${lastToken}]\n`; For Ant Attack this produces a problem.
			txt += '# Note: Line did not end with 118 (END token) but with ' + lastToken + '.';
		}

		return txt;
	}


	/** Converts a ZX81 float number in a buffer into a float.
	 * @param buf The 5 elements buffer with the ZX81 float number.
	 * @returns The float number.
	 */
	public static convertBufToZx81Float(buf: Uint8Array): number {
		if (buf.length !== 5)
			throw Error("Expected 5 bytes for a ZX81 float number.");
		const mantissa = (buf[1] << 24) + (buf[2] << 16) + (buf[3] << 8) + buf[4];
		if (mantissa === 0 && buf[0] === 0)
			return 0;
		const exponent = buf[0] - 129;
		const value = (mantissa / 0x80000000 + 1) * Math.pow(2, exponent);
		return value;
	}


	/** Searches from the end of the text for the last number.
	 * @param txt The text to search in.
	 * @returns The last number found as string. Empty string if nothing found.
	 */
	protected static getLastNumber(txt: string): string {
		let found = '';
		txt = txt.toUpperCase();
		let expFound = 0;
		let k = txt.length - 1;
		while (k >= 0) {
			const c = txt[k];
			if (c >= '0' && c <= '9' || c === '.') {
				found = c + found;
			}
			else if (c === 'E') {
				if (expFound > 0)
					break;	// Exponent already found
				expFound++;
				found = c + found;
			}
			else if (c === '+' || c === '-') {
				if (expFound > 0)
					break;	// Other than exponent, no +/- allowed
				// A 'E' is expected before the sign.
				k--;
				if (k < 0)
					break;	// String ended
				if (txt[k] !== 'E')
					break;	// No 'E' so strings ends without sign.
				expFound++;
				found = 'E' + c + found;
			}
			else
				break;
			// Next
			k--;
		}
		return found;
	}
}
