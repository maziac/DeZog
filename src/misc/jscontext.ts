import * as vm from 'vm';


/**
 * Running custom javascript code in a context and retrieving line numbers from errors.
 */
export class JsContext {

	/**
	 * Does a 'require' but on a string.
	 * If an error occurs it parses the output for the line number.
	 * 'line' and 'column' is added to the thrown error.
	 * @param code The js file as a string.
	 * @param timeout Specifies the number of milliseconds to execute code before terminating execution. If execution is terminated, an Error will be thrown.
	 * @param filename Optional filename to use.
	 * @param lineOffset Used for reporting the line number.
	 * @throws An Error with an additional property 'position' that contains
	 * {filename, line, column}.
	 */
	public static runInContext(code: string, context: any, timeout?: number, filename?: string, lineOffset = 0): any {
		try {
			// Contextify the object.
			vm.createContext(context);
			// Run
			vm.runInContext(code, context, {timeout, filename, lineOffset});
		}
		catch (e) {
			// e.stack contains the error location with the line number.
			// E.g. '/Volumes/SDDPCIE2TB/Projects/Z80/asm/z80-peripherals-sample/simulation/ports.js:93\nxAPI.tick = () => {\n^\n\nReferenceError: xAPI is not defined\n\tat /Volumes/SDDPCIE2TB/Projects/Z80/asm/z80-peripherals-sample/simulation/ports.js:93:1\n\tat Script.runInContext (vm.js:143:18)\n\tat Object.runInContext (vm.js:294:6)\n\tat Function.runInContext (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/misc/utility.js:1028:16)\n\tat Function.runInContext (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remo…mcode.js:183:20)\n\tat CustomCode.load (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/customcode.js:195:14)\n\tat new CustomCode (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/customcode.js:114:14)\n\tat ZSimRemote.configureMachine (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/zsimremote.js:286:31)\n\tat ZSimRemote.<anonymous> (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/out/src/remotes/zsimulator/zsimremote.js:311:18)'
			if (filename) {
				// Remove windows \r
				const stackWo = e.stack.replace(/\r/g, '');
				const stack = stackWo.split('\n');
				let errorText = '';
				for (const stackLine of stack) {
					// Search for "at "
					//					if (stackLine.startsWith('\tat ')) {
					if (/\s*at\s/.exec(stackLine)) {
						// Check if this line is e.g. '/Volumes/.../ports.js:93:1'
						const regex = new RegExp(filename + ':(\\d+):(\\d+)');
						const match = regex.exec(stackLine);
						if (match) {
							// Add line/column to error.
							// Extract line number.
							const line = parseInt(match[1]) - 1;
							// Extract column
							const column = parseInt(match[2]) - 1;
							// Return
							e.position = {filename, line, column};
						}
						else {
							// Other wise use line number of first line.
							// '/Volumes/.../ports.js:93'
							const regexFirst = new RegExp(filename + ':(\\d+)');
							const matchFirst = regexFirst.exec(stack[0]);
							if (matchFirst) {
								// Extract line number.
								const line = parseInt(matchFirst[1]) - 1;
								// Return
								e.position = {filename, line, column: 0};
							}
						}
						break;
					}

					// Belongs to error text
					errorText += stackLine + '\n';
				}
				e.message = errorText || "Unknown error";
			}

			// Re-throw
			throw e;
		}
	}


	/**
	 * Does a 'require' but on a string.
	 * If an error occurs it parses the output for the line number.
	 * 'line' and 'column' is added to the thrown error.
	 * @param code The js file as a string.
	 * @param fileName Optional filename to use.
	 */
	/*
	public static requireFromString(code: string, fileName?: string): any {
		try {
			return requireFromString(code, fileName);	// Note: was changed for esbuild but not tested
		}
		catch (e) {
			// e.stack contains the error location with the line number.
			// e.stack contains the error location with the line number.
			// Remove windows \r
			const stackWo = e.stack.replace(/\r/g, '');
			const stack = stackWo.split('\n');
			if (stack.length > 1) {
				// Try this pattern:
				// 'ReferenceError: xsuite is not defined\n\tat Object.<anonymous> (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/src/firsttests2.ut.jsm:20:1)\n...'
				const firstAt = stack[1];
				const match = /.*?:(\d+):(\d+)/.exec(firstAt);
				if (match) {
					// Add line/column to error.
					// Extract line number.
					const line = parseInt(match[1]) - 1;
					// Extract column number.
					const column = parseInt(match[2]) - 1;
					// Return
					e.position = {line, column};
				}
				else {
					// Try this pattern:
					// ':192\n\tawait dezogExecAddr(address, sp, a, f, bc, de, hl);\n\t^^^^^\n\nSyntaxError: await is only valid in async functions and the top level bodies of modules\n\tat wrapSafe (internal/modules/cjs/loader.js:1033:16)\n...'
					const line0 = stack[0];
					const match2 = /^:(\d+)$/.exec(line0);
					if (match2) {
						// Add line/column to error.
						// Extract line number.
						const line = parseInt(match2[1]) - 1;
						// Return
						e.position = {line, column: 0};
					}
				}
			}

			// Re-throw
			throw e;

			//'ReferenceError: xsuite is not defined\n\tat Object.<anonymous> (/Volumes/SDDPCIE2TB/Projects/Z80/vscode/DeZog/src/firsttests2.ut.jsm:20:1)\n\tat Module._compile (internal/modules/cjs/loader.js:1125:30)\n\tat Object..js (internal/modules/cjs/loader.js:1155:10)\n\tat Module.load (internal/modules/cjs/loader.js:982:32)\n\tat internal/modules/cjs/loader.js:823:14\n\tat Function.<anonymous> (electron/js2c/asar_bundle.js:5:12913)\n\tat Function.<anonymous> (/Volumes/SDDPCIE2TB/Applications/Visual Studio Code.app/C…ostProcess.js:90:14919)\n\tat Function._callActivate (/Volumes/SDDPCIE2TB/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/services/extensions/node/extensionHostProcess.js:90:14592)\n\tat /Volumes/SDDPCIE2TB/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/services/extensions/node/extensionHostProcess.js:90:12789\n\tat processTicksAndRejections (internal/process/task_queues.js:93:5)\n\tat async Promise.all (index 14)\n\tat async Promise.all (index 0)'
		}
	}
	*/


	/**
	 * Returns the line (and column) number of the current execution location.
	 * @param depth The depth. O = current line. 1 = caller function etc.
	 * @param file (Optional) The file name. Other files are ignored during depth search.
	 * E.g. 'dezog.unittest.js'
	 * @returns {line, column} The line number and column. Lines/columns start at 0. undefined if something was wrong.
	 */
	public static getLineNumber(depth = 0, file?: string): {line: number, column: number} | undefined {
		try {
			throw new Error('getLineNumber');
		}
		catch (e) {
			return this.getLineNumberFromError(e, depth, file);
		}
	}


	/**
	 * Returns the line (and column) number from the givven Error.
	 * @param e An error that was thrown.
	 * @param depth The depth. O = current line. 1 = caller function etc.
	 * @param file (Optional) The file name. Other files are ignored during depth search.
	 * E.g. 'dezog.unittest.js'
	 * @returns {line, column} The line number and column. Lines/columns start at 0. undefined if something was wrong.
	 */
	public static getLineNumberFromError(e: Error, depth = 0, file?: string): {line: number, column: number} | undefined {
		if (e?.stack) {
			// e.stack contains the error location with the line number.
			// Remove windows \r
			const stackWo = e.stack.replace(/\r/g, '');
			const stackWhole = stackWo.split('\n');
			let stack;
			if (file)
				stack = stackWhole.filter(line => line.includes(file));
			else
				stack = stackWhole;
			const index = depth + 1;
			const indexAt = stack[index];
			const match = /.*?:(\d+):(\d+)/.exec(indexAt);
			// If asynchronous we have to step up until we find a line number.
			if (match) {
				// Add line/column to error.
				// Extract line number.
				const line = parseInt(match[1]) - 1;
				// Extract column number.
				const column = parseInt(match[2]) - 1;
				return {line, column};
			}
		}
		return undefined;
	}


	/**
	 * Deep copies the the src object to the target.
	 * Of course, only properties, o functions.
	 * @param src Source object.
	 * @param dest Destination object.
	 */
	public static deepCopyContext(src: Object, dest: Object) {
		Object.keys(src).forEach(key => {
			const value = src[key];
			//console.log(`key: ${key}, value: ${value}`)
			if (typeof value === 'object') {
				JsContext.deepCopyContext(value, dest[key]);
			}
			else {
				// Copy primitive
				dest[key] = value;
			}
		});
	}
}
