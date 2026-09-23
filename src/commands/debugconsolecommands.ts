import * as fs from 'fs';
import {StoppedEvent} from '@vscode/debugadapter';
import {DebugProtocol} from '@vscode/debugprotocol';
import argv from 'string-argv';
import {SimpleDisassembly} from '../disassembler/simpledisassembly';
import {GenericWatchpoint} from '../genericwatchpoint';
import {Labels} from '../labels/labels';
import {UnifiedPath} from '../misc/unifiedpath';
import {Utility} from '../misc/utility';
import {Remote} from '../remotes/remotebase';
import {Z80Registers} from '../remotes/z80registers';
import {Settings, SettingsParameters} from '../settings/settings';
import {TextView} from '../views/textview';
import {ZxNextSpritePatternsView} from '../views/zxnextspritepatternsview';
import {ZxNextSpritesView} from '../views/zxnextspritesview';
import {MemoryCommands} from './memorycommands';


/** The callbacks for the commands.
 */
export interface DebugConsoleCallbacks {
	sendEvent(event: DebugProtocol.Event): void;
	stateSave(stateName: string): Promise<void>;
	stateRestore(stateName: string): Promise<void>;
	loadLabels(settingsLaunch: SettingsParameters): Promise<void>;
}


/** A command handler: gets the arguments and returns the text to print.
 */
type CommandHandler = (tokens: Array<string>) => Promise<string>;


/** Contains the debug console commands (all commands starting with "-",
 * e.g. "-help", "-dasm", "-sprites").
 * The memory related commands are implemented in MemoryCommands.
 */
export class DebugConsoleCommands {

	/// The session, e.g. used to send events.
	protected session: DebugConsoleCallbacks;

	/// Maps the command names (including aliases) to their handlers.
	protected commands = new Map<string, CommandHandler>();


	/** Constructor.
	 * @param session The debug session (callbacks) used by some commands.
	 */
	constructor(session: DebugConsoleCallbacks) {
		this.session = session;
		const table: Array<[Array<string>, CommandHandler]> = [
			[['-help', '-h'], tokens => this.evalHelp(tokens)],
			[['-address'], tokens => this.evalAddress(tokens)],
			[['-dasm'], tokens => this.evalDasm(tokens)],
			[['-eval'], tokens => this.evalEval(tokens)],
			[['-exec', '-e'], tokens => this.evalExec(tokens)],
			[['-label', '-l'], tokens => this.evalLabel(tokens)],
			[['-md'], tokens => MemoryCommands.evalMemDump(tokens)],
			[['-mdelta'], tokens => MemoryCommands.evalMemDelta(tokens)],
			[['-memmodel'], tokens => this.evalMemModel(tokens)],
			[['-msetb'], tokens => MemoryCommands.evalMemSetByte(tokens)],
			[['-msetw'], tokens => MemoryCommands.evalMemSetWord(tokens)],
			[['-ml'], tokens => MemoryCommands.evalMemLoad(tokens)],
			[['-ms'], tokens => MemoryCommands.evalMemSave(tokens)],
			[['-mv'], tokens => MemoryCommands.evalMemViewByte(tokens)],
			[['-mvd'], tokens => MemoryCommands.evalMemViewDiff(tokens)],
			[['-mvw'], tokens => MemoryCommands.evalMemViewWord(tokens)],
			[['-rmv'], tokens => MemoryCommands.evalRegisterMemView(tokens)],
			[['-patterns'], tokens => this.evalSpritePatterns(tokens)],
			[['-wpadd'], tokens => this.evalWpAdd(tokens)],
			[['-wprm'], tokens => this.evalWpRemove(tokens)],
			[['-sprites'], tokens => this.evalSprites(tokens)],
			[['-state'], tokens => this.evalStateSaveRestore(tokens)],
			[['-sjasmplus.path'], tokens => this.evalSjasmPlusPath(tokens)],
			// Debug commands
			[['-dbg'], tokens => this.evalDebug(tokens)],
		];
		for (const [names, handler] of table) {
			for (const name of names)
				this.commands.set(name, handler);
		}
	}


	/** Evaluates the command and executes it.
	 * The method might throw an exception if it cannot parse the command.
	 * @param command E.g. "-exec tbblue-get-register 57".
	 * @returns A Promise<string> with an text to output (e.g. an error).
	 */
	public async evaluateCommand(command: string): Promise<string> {
		const tokens = argv(command);
		const cmd = tokens.shift();
		if (!cmd)
			throw Error("No command.");

		console.log('Evaluate command:', command);
		for (const token of tokens) {
			console.log('Token: "' + token + '"');
		}

		// Check for "-view"
		let viewTitle;
		if (tokens[0] === '-view') {
			tokens.shift();
			viewTitle = cmd.substring(1) + ' ' + tokens.join(' ');	// strip '-'
		}

		// All commands start with "-"
		const handler = this.commands.get(cmd);
		if (!handler) {
			// Unknown command
			throw Error("Unknown command: '" + cmd + "'");
		}
		const output = await handler(tokens);

		// Check for output target
		if (viewTitle) {
			// Output text to new view.
			const panel = new TextView(viewTitle, output);
			await panel.update();
			// Send empty response
			return 'OK';
		}
		else {
			// Output text to console
			return output;
		}
	}


	/** Prints a help text for the debug console commands.
	 * @param tokens The arguments. Unused.
	 * @param A Promise with a text to print.
	 */
	protected async evalHelp(_tokens: Array<string>): Promise<string> {
		const output =
			`Allowed commands are:
"-address <address>": Prints out internal information of the debugger for a 64k address. Can be helpful if you encounter e.g. 'Unverified breakpoints' problems.
"-dasm <address> <count>": Disassembles a memory area. count=number of lines.
"-eval <expr>": Evaluates an expression. The expression might contain mathematical expressions and also labels. It will also return the label if
the value correspondents to a label.
"-exec|e <<cmd>> <args>": cmd and args are directly passed to the remote (ZEsarUX, CSpect, ...). E.g. "-exec get-registers".
"-help|h": This command. Do "-e help" to get all possible remote (ZEsarUX, CSpect, ...) commands.
"-label|-l <XXX>": Returns the matching labels (XXX) with their values. Allows wildcard "*".
"-md [bank=<b>] <address> <size> [dec|hex] [word] [little|big]": Memory dump at 'address' with 'size' bytes. Output is in 'hex' (default) or 'dec'imal. Per default data will be grouped in bytes.
  But if chosen, words are output. Last argument is the endianness which is little endian by default.
"-mdelta [bank=<b>] <address> <size> <string>": This does a 'delta' search on the address range. The memory is searched for byte
  sequences that contain the same deltas as the given string. E.g. if you would search for "MIK" not only "MIK"
  would be found but also "mik" or "njl". The whole memory is dumped but all values are adjusted by an offset to
  match the searched string. If several sequences are found the memory might be dumped several times.
  The idea is to find strings also if they are not coded as ASCII sequence but with some other, unknown coding
  scheme.
"-memmodel": Prints slot and bank info of the currently used memory model.
"-ml [bank=<b>] <address> <filepath>": Loads a binary file into memory. The filepath is relative to the TMP directory.
"-ms [bank=<b>] <address> <size> <filename>": Saves a memory dump to a file. The file is saved to the temp directory.
"-msetb [bank=<b>] <address> <value> [repeat]":
	- address: The address to fill. Can also be a label or expression.
	- value: The byte value to set.
	- repeat: (Optional) How often the value is repeated.
	Examples:
	"-msetb <8000h> <0Fh>" : Puts a 15 into memory location 0x8000.
	"-msetb <8000h> <0> <100h>" : fills memory locations 0x8000 to 0x80FF with zeroes.
	"-msetb <fill_colors_ptr+4> <FEh>": If fill_colors_ptr is e.g. 0xCF02 the value FEh is put into location 0xCF06.
"-msetw [bank=<b>] <address> <value> [repeat [endianness]]:"
	- address: The address to fill. Can also be a label or expression.
	- value: The word value to set.
	- repeat: (Optional) How often the value is repeated.
	- endianness: (Optional) 'little' (default) or 'big'.
	Examples:
	"-msetw 8000h AF34h" : Puts 34h into location 0x8000 and AFh into location 0x8001.
	"-msetw 8000h AF34h 1 big" : Puts AFh into location 0x8000 and 34h into location 0x8001.
	"-msetw 8000h 1234h 100h" : fills memory locations 0x8000 to 0x81FF with the word value 1234h.
"-mv [bank=<b>] <address> <size> [<address_n> <size_n>]*": Memory view at 'address' with 'size' bytes. Will open a new view to display the memory contents. If bank <b> is given, the memory is read from that bank and <address> is the offset into the bank.
"-mvd [bank=<b>] <address> <size> [<address_n size_n>]*": Opens a memory view that can be used for comparison. I.e. you start at some time than later you update the view and then you can make a diff and search e.g. for all values that have been decremented by 1. If bank <b> is given, the memory is read from that bank and <address> is the offset into the bank.
"-mvw [bank=<b>] <address> <size> [<address_n size_n>]* [big]": Memory view at 'address' with 'size' words. Like -mv but display unit is word instead of byte. Normally the display is little endian. This can be changed by adding "big" as last argument.
"-patterns [<index>[+<count>|-<endindex>] [...]": Shows the tbblue sprite patterns beginning at 'index' until 'endindex' or a number of 'count' indices.
	The values can be omitted. 'index' defaults to 0 and 'count' to 1.
	Without any parameter it will show all sprite patterns.
	You can concat several ranges.
	Example: "-patterns 10-15 20+3 33" will show sprite patterns at index 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
"-rmv": Shows the memory register view. I.e. a dynamic view with the memory contents the registers point to.
"-sjasmplus.path": Sets the path to an sjasmplus sld file. Can be used to change the sld file (with labels) during runtime. Only one sld file allowed. Replaces any already loaded sld file.
"-sprites [<slot>[+<count>|-<endslot>] [...]": Shows the tbblue sprite registers beginning at 'slot' until 'endslot' or a number of 'count' slots.
  The values can be omitted. 'slot' defaults to 0 and 'count' to 1. You can concat several ranges.
	Example: "-sprite 10-15 20+3 33" will show sprite slots 10, 11, 12, 13, 14, 15, 20, 21, 22, 33.
	Without any parameter it will show all visible sprites automatically.
"-state save|restore|list|clear|clearall [<statename>]": Saves/restores the current state. I.e. the complete RAM + the registers.
"-wpadd <address> [<size>] [<type>]": Adds a watchpoint. See below.
"-wprm <address> [<size>] [<type>]": Removes a watchpoint.
	- address: The 64k address to watch.
	- size: The size of the area to watch. Can be omitted. Defaults to 1.
	- type:
	    - "r": Read watchpoint
	    - "w": Write watchpoint
	    - "rw": Read/write watchpoint. Default.
	Note: This is a leightweight version of the WPMEM watchpoints you can add to your sources.
	      Watchpoints added through "-wpadd" are independent. They are NOT controlled (enabled/disabled) through the
		  vscode's BREAKPOINTS pane.
		  Furthermore they work on 64k addresses (whereas WPMEM works on long addresses).
		  I.e. a watchpoint added through "-wpadd" will break in any bank.

Some examples:
"-exec h 0 100": Does a hexdump of 100 bytes at address 0.
"-e write-memory 8000h 9fh": Writes 9fh to memory address 8000h.
"-e gr": Shows all registers.
"-eval 2+3*5": Results to "17".
"-msetb mylabel 3": Sets the data at memory location 'mylabel' to 3.
"-mv 0 10": Shows the memory at address 0 to address 9.
"-sprites": Shows all visible sprites.
"-state save 1": Stores the current state as 'into' 1.
"-state restore 1": Restores the state 'from' 1.

Notes:
For all commands (if it makes sense or not) you can add "-view" as first parameter. This will redirect the output to a new view instead of the console.
E.g. use "-help -view" to put the help text in an own view.
`;

		this.session.sendEvent(new StoppedEvent('Value updated'));

		/*
		For debugging purposes there are a few more:
		-dbg serializer clear: Clears the call serializer queue.
		-dbg serializer print: Prints the current function. Use this to see where
		it hangs if it hangs. (Use 'setProgress' to debug.)
		*/
		return output;
	}


	/** Evaluates a given expression.
	 * @param tokens The arguments. I.e. the expression to evaluate.
	 * @returns A Promise with a text to print.
	 */
	protected async evalEval(tokens: Array<string>): Promise<string> {
		const expr = tokens.join(' ').trim();	// restore expression
		if (expr.length === 0) {
			// Error Handling: No arguments
			throw new Error("Expression expected.");
		}
		// Evaluate expression
		let result;
		// Evaluate
		const value = Utility.evalExpression(expr);
		// Convert to decimal
		result = value.toString();
		// Convert also to hex
		result += ', ' + value.toString(16).toUpperCase() + 'h';
		// Convert also to bin
		result += ', ' + value.toString(2) + 'b';
		// Check for label
		const labels = Labels.getLabelsPlusIndexForNumber64k(value);
		if (labels.length > 0) {
			result += ', ' + labels.join(', ');
		}

		return result;
	}


	/** Executes a command in the emulator.
	 * @param tokens The arguments. I.e. the command for the emulator.
	 * @returns A Promise with a text to print.
	 */
	protected async evalExec(tokens: Array<string>): Promise<string> {
		// Execute
		const machineCmd = tokens.join(' ');
		const textData = await Remote.dbgExec(machineCmd);
		// Return value
		return textData;
	}


	/** Evaluates a label.
	 * evalEval almost gives the same information, but evalLabel allows
	 * to use wildcards.
	 * @param tokens The arguments. I.e. the label. E.g. "main" or "mai*".
	 * @returns A Promise with a text to print.
	 */
	protected async evalLabel(tokens: Array<string>): Promise<string> {
		const expr = tokens.join(' ').trim();	// restore expression
		if (expr.length === 0) {
			// Error Handling: No arguments
			return "Label expected.";
		}

		// Find label with regex, every star is translated into ".*"
		const rString = '^' + expr.replace(/\*/g, '.*?') + '$';
		// Now search all labels
		const labels = Labels.getLabelsForRegEx(rString);
		let result = '';
		if (labels.length > 0) {
			labels.forEach(label => {
				const value = Labels.getNumberForLabel(label)!;
				const bankString = Remote.memoryModel.getBankNameForAddress(value);
				result += label + ': ' + Utility.getHexString(value & 0xFFFF, 4) + 'h';
				if (bankString)
					result += ' (@' + bankString + ')';
				result += '\n';
			})
		}
		else {
			// No label found
			result = 'No label matches.';
		}
		// return result
		return result;
	}


	/** Displays the used Memory Model. I.e. the slot ranges and the bank info.
	 * @param tokens No arguments
	 * @returns A Promise with a text to print.
	 */
	protected async evalMemModel(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length !== 0) {
			// Error Handling: No arguments
			throw new Error("No arguments are expected.");
		}

		const txt = Remote.memoryModel.getMemModelInfo();
		return txt;
	}


	/** Shows a a small disassembly in the console.
	 * @param tokens The arguments. I.e. the address and size.
	 * @returns A Promise with a text to print.
	 */
	protected async evalDasm(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length === 0) {
			// Error Handling: No arguments
			throw new Error("Address and number of lines expected.");
		}

		if (tokens.length > 2) {
			// Error Handling: Too many arguments
			throw new Error("Too many arguments.");
		}

		// Get address
		const addressString = tokens[0];
		const address = Utility.evalExpression(addressString);

		// Get size
		const countString = tokens[1];
		let count = 10;	// Default
		if (tokens.length > 1) {
			// Count given
			count = Utility.evalExpression(countString);
		}

		// Get memory
		const data = await Remote.readMemoryDump(address, 4 * count);

		// Disassembly
		const dasmArray = SimpleDisassembly.getLines(address, data, count);

		// Convert to text
		let txt = '';
		for (const line of dasmArray) {
			txt += Utility.getHexString(line.address, 4) + '\t' + line.instruction + '\n';
		}

		// Send response
		return txt;
	}


	/** Prints out internal information for an address.
	 * Helpful to trace down 'Unverified breakpoint' problems.
	 * @param tokens The arguments. I.e. the address.
	 * @returns A Promise with a text to print.
	 */
	protected async evalAddress(tokens: Array<string>): Promise<string> {
		// Check count of arguments
		if (tokens.length > 1) {
			// Error Handling
			throw new Error("Too many arguments.");
		}

		// One or none arguments ?
		const slots = Remote.getSlots();
		let txt = '';
		if (tokens.length === 1) {
			// One argument:
			// Get address
			const addressString = tokens[0];
			const addr64k = Utility.evalExpression(addressString);
			if (isNaN(addr64k)) {
				// Error Handling: No number
				throw new Error("The given address is no number.");
			}
			txt += 'Address: ' + addr64k + ', (' + Utility.getHexString(addr64k, 4) + 'h)\n';

			// Convert to long address
			const address = Z80Registers.createLongAddress(addr64k, slots);
			txt += 'Slots: [' + slots.join(', ') + ']\n';
			txt += 'Long address: ' + address + ', (' + Utility.getHexString(address, 6) + 'h)\n';

			// Check labels
			txt += 'Label: ';
			const labels = Labels.getLabelsForLongAddress(address);
			if (labels.length > 0) {
				const quotedLabels = labels.map(label => "'" + label + "'");
				txt += Utility.hjoin(quotedLabels) + '\n';
			}
			else {
				txt += 'None.\n';
			}

			// Get file and line number
			const e = Labels.getFileAndLineForAddress(address);
			txt += 'File: ';
			if (e.fileName) {
				txt += e.fileName + ', line: ' + (e.lineNr + 1) + ', size: ' + e.size;
			}
			else {
				txt += 'None.\n';
			}
		}
		else {
			// Print all address file/line associations.
			txt += '\nAddress/File/Line associations:\n';
			let count = 0;
			for (let addr = 0x0000; addr < 0x10000; addr++) {
				const lAddr = Z80Registers.createLongAddress(addr, slots);
				const e = Labels.getFileAndLineForAddress(lAddr);
				if (e.fileName) {
					count++;
					txt += Utility.getHexString(addr, 4) + 'h: ' + e.fileName + ', line: ' + (e.lineNr + 1) + ', size: ' + e.size + '\n';
				}
			}
			if (count === 0)
				txt += 'None.\n';
		}

		// Send response
		return txt;
	}


	/** Parses the arguments of "-wpadd" and "-wprm".
	 * @param tokens The arguments. E.g. "0x8000 1 r"
	 * @returns The watchpoint.
	 */
	protected parseWatchpoint(tokens: Array<string>): GenericWatchpoint {
		// Get parameters
		if (tokens.length < 1)
			throw Error("Expecting at least 1 argument.");
		// Address
		const addr64k = Utility.evalExpression(tokens[0]);
		// Size
		let size = 1;
		let access = 'rw';
		if (tokens[1] !== undefined)
			size = Utility.evalExpression(tokens[1]);
		// Access
		if (tokens[2]) {
			if (!['r', 'w', 'rw'].includes(tokens[2]))
				throw Error("'type' must be one of r, w or rw.");
			access = tokens[2];
		}

		return {
			longOr64kAddress: addr64k,
			size,
			access,
			condition: ''
		};
	}


	/** Add a watchpoint.
	 * Independent of WPMEM.
	 * @param tokens The arguments. E.g. "-wpadd 0x8000 1 r"
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalWpAdd(tokens: Array<string>): Promise<string> {
		const wp = this.parseWatchpoint(tokens);
		await Remote.setWatchpoint(wp);
		return 'OK';
	}


	/** Removes a watchpoint.
	 * Independent of WPMEM.
	 * @param tokens The arguments. E.g. "-wprm 0x8000 1 r"
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalWpRemove(tokens: Array<string>): Promise<string> {
		const wp = this.parseWatchpoint(tokens);
		await Remote.removeWatchpoint(wp);
		return 'OK';
	}


	/** Parses ranges like "10-15 20+3 33" used by "-sprites" and "-patterns".
	 * @param tokens The ranges. Each token is "start", "start+count" or "start-end".
	 * @returns An array with pairs of start and count, e.g. [10, 6, 20, 3, 33, 1].
	 */
	protected parseRanges(tokens: Array<string>): Array<number> {
		const params: Array<number> = [];
		for (const param of tokens) {
			if (!param)
				break;
			// Evaluate
			const match = /([^+-]*)(([-+])(.*))?/.exec(param);
			if (!match) // Error Handling
				throw new Error("Can't parse: '" + param + "'");
			// start slot
			const start = Utility.parseValue(match[1]);
			if (isNaN(start))	// Error Handling
				throw new Error("Expected slot but got: '" + match[1] + "'");
			// count
			let countValue = 1;
			if (match[3]) {
				countValue = Utility.parseValue(match[4]);
				if (isNaN(countValue))	// Error Handling
					throw new Error("Can't parse: '" + match[4] + "'");
				if (match[3] === "-")	// turn range into count
					countValue += 1 - start;
			}
			// Check
			if (countValue <= 0)	// Error Handling
				throw new Error("Not allowed count: '" + match[0] + "'");
			// Add
			params.push(start, countValue);
		}
		return params;
	}


	/** Show the sprite patterns in a view.
	 * @param tokens The arguments.
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalSpritePatterns(tokens: Array<string>): Promise<string> {
		// Evaluate arguments
		let title;
		let params: Array<number>;
		if (tokens.length === 0) {
			// Show all patterns
			title = 'Sprite Patterns: 0-63';
			params = [0, 64];
		}
		else {
			title = 'Sprite Patterns: ' + tokens.join(' ');
			params = this.parseRanges(tokens);
		}

		// Create new view
		const panel = new ZxNextSpritePatternsView(title, params);
		await panel.update();

		// Send response
		return 'OK';
	}


	/** Show the sprites in a view.
	 * @param tokens The arguments.
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalSprites(tokens: Array<string>): Promise<string> {
		// Evaluate arguments
		let title;
		let params: Array<number> | undefined;
		if (tokens.length === 0) {
			// The view should choose the visible sprites automatically
			title = 'Visible Sprites';
		}
		else {
			title = 'Sprites: ' + tokens.join(' ');
			params = this.parseRanges(tokens);
		}

		// Create new view
		const panel = new ZxNextSpritesView(title, params);
		await panel.update();

		// Send response
		return 'OK';
	}


	/** Save/restore the state.
	 * @param tokens The arguments. 'save'/'restore'
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalStateSaveRestore(tokens: Array<string>): Promise<string> {
		const param = tokens[0] || '';
		const stateName = tokens[1];
		if (!stateName &&
			(param === 'save' || param === 'restore' || param === 'clear'))
			throw new Error("Parameter missing: You need to add a name for the state, e.g. '0', '1' or more descriptive 'start'");

		if (param === 'save') {
			// Save current state
			await this.session.stateSave(stateName);
			// Send response
			return "Saved state '" + stateName + "'.";
		}
		else if (param === 'restore') {
			// Restores the state
			await this.session.stateRestore(stateName);
			return "Restored state '" + stateName + "'.";
		}
		else if (param === 'list') {
			// List all files in the state dir.
			let files;
			try {
				const dir = Utility.getAbsStateFileName('');
				files = fs.readdirSync(dir);
			}
			catch {}
			let text;
			if (files === undefined || files.length === 0)
				text = "No states saved yet.";
			else
				text = "All states:\n" + files.join('\n');
			return text;
		}
		else if (param === 'clearall') {
			// Removes the files in the states directory
			try {
				const dir = Utility.getAbsStateFileName('');
				const files = fs.readdirSync(dir);
				for (const file of files) {
					const path = Utility.getAbsStateFileName(file);
					fs.unlinkSync(path);
				}
			}
			catch (e) {
				return e.message;
			}
			return "All states deleted.";
		}
		else if (param === 'clear') {
			// Removes one state
			try {
				const path = Utility.getAbsStateFileName(stateName);
				fs.unlinkSync(path);
			}
			catch (e) {
				return e.message;
			}
			return "State '" + stateName + "' deleted.";
		}
		else {
			// Unknown argument
			throw new Error("Unknown argument: '" + param + "'");
		}
	}


	/** Load an sjasmplus sld file dynamically.
	 * just if it was given in the launch.json in
	 *      "sjasmplus": [
	 *           {
	 *               "path": "myfile.sld"
	 *           }
	 *       ],
	 */
	protected async evalSjasmPlusPath(tokens: Array<string>): Promise<string> {
		if (tokens.length !== 1) {
			throw new Error("Invalid number of arguments");
		}
		let filename = tokens[0];
		// Strip any quotes, if given
		if ((filename.startsWith('"'))) {
			if (!filename.endsWith('"'))
				throw Error("Mismatched quotes in filename: " + filename);
			filename = filename.substring(1, filename.length - 1);
		}

		// Root folder
		const unifiedRootFolder = UnifiedPath.getUnifiedPath(Utility.getRootPath());

		// Check if file exists
		const absFileName = unifiedRootFolder + '/' + filename;
		if (!fs.existsSync(absFileName)) {
			throw new Error("File not found: " + absFileName);
		}

		// Prepare config object
		const launch = Settings.launch;
		const cfg = {
			smallValuesMaximum: launch.smallValuesMaximum,
			sjasmplus: [{
				path: absFileName,
				srcDirs: [],
				excludeFiles: []
			}]
		} as any as SettingsParameters;

		// Load sld file
		await this.session.loadLabels(cfg);
		return 'OK';
	}


	/** Debug commands. Not shown publicly.
	 * @param tokens The arguments.
	 * @returns A Promise<string> with a text to print.
	 */
	protected async evalDebug(tokens: Array<string>): Promise<string> {
		const param1 = tokens[0] || '';
		// Unknown argument
		throw new Error("Unknown argument: '" + param1 + "'");
	}
}
