
//import * as fs from 'fs';
import { writeFileSync, appendFileSync } from 'fs';
import * as util from 'util';
import * as vscode from 'vscode';


/// All log output goes additionally here.
let outFilePath: string;	// Disable
//const outFilePath = "/Volumes/Macintosh HD 2/Projects/zesarux/vscode/z80-debug-adapter/logs/main.log";

/// Output logging to the "OUTPUT" tab in vscode.
let logOutput: vscode.OutputChannel;	// Disable
//let logOutput = vscode.window.createOutputChannel("Z80 Debugger");


/**
 * Class for logging.
 */
export class Log {

	/// Last time a log has been written.
	private static lastLogTime = Date.now();


	/**
	 * Clears a former log file.
	 */
	public static clear() {
		if(outFilePath) {
			try {
				writeFileSync(outFilePath, (new Date()).toString() + ': log started.\n');
			}
			catch(e) {
				console.log('Error: '+e);
			}
		}
		Log.lastLogTime = Date.now();
	}


	/**
	 * Logs to console.
	 * Puts the caller name ('class.method'. E.g. "ZesaruxDebugSession.initializeRequest")
	 * in front of each log.
	 * @param args The log arguments
	 */
	public static log(...args) {
		// check time
		const diffTime = (Date.now() - Log.lastLogTime)/1000;
		if(diffTime > 2) {
			// > 2 secs
			Log.write('...');
			Log.write('Pause for ' + diffTime + ' secs.');
			Log.write('...');
		}
		// write log
		const who = Log.callerName() + ": ";
		Log.write(who, ...args);
		// get new time
		Log.lastLogTime = Date.now();
	}


	/**
	 * Writes to console and file.
	 * @param args the values to write.
	 */
	private static write(format: string, ...args) {
		var text = util.format(format, ...args);
		try {
			// write to console
			if(logOutput)
				logOutput.appendLine(text);
			// Append to file
			appendFileSync(outFilePath, text + '\n');
		}
		catch(e) {
		}
	}


	/**
	 * Returns the caller name.
	 * @returns 'class.method'. E.g. "ZesaruxDebugSession.initializeRequest"
	 */
	private static callerName(): string {
		// Throw error to get call stack
		try {
			throw new Error();
		}
		catch(e) {
			try {
				// Find caller name
				return e.stack.split('at ')[3].split(' ')[0];
			}
			catch (e) {
				return 'Unknown';
			}
		}
	}
}

