import * as vscode from 'vscode';
import * as assert from 'assert';
//import { EmulatorBreakpoint } from './emulator';
//import { GenericWatchpoint, GenericBreakpoint } from './genericwatchpoint';
//import { ZesaruxEmulator } from './zesaruxemulator';
//import { zSocket } from './zesaruxSocket';
//import { Labels } from './labels';
//import { Utility } from './utility';
import { EmulDebugAdapter, DbgAdaperState } from './emuldebugadapter';
import { Emulator } from './emulatorfactory';
//import { EmulatorBreakpoint } from './emulator';
import { GenericBreakpoint } from './genericwatchpoint';
import { Z80Registers } from './z80registers';
import { Labels } from './labels';
import { EmulatorBreakpoint } from './emulator';
//import { zSocket } from './zesaruxSocket'; // TODO: remove





/// Some definitions for colors.
enum Color {
	Reset = "\x1b[0m",
	Bright = "\x1b[1m",
	Dim = "\x1b[2m",
	Underscore = "\x1b[4m",
	Blink = "\x1b[5m",
	Reverse = "\x1b[7m",
	Hidden = "\x1b[8m",

	FgBlack = "\x1b[30m",
	FgRed = "\x1b[31m",
	FgGreen = "\x1b[32m",
	FgYellow = "\x1b[33m",
	FgBlue = "\x1b[34m",
	FgMagenta = "\x1b[35m",
	FgCyan = "\x1b[36m",
	FgWhite = "\x1b[37m",

	BgBlack = "\x1b[40m",
	BgRed = "\x1b[41m",
	BgGreen = "\x1b[42m",
	BgYellow = "\x1b[43m",
	BgBlue = "\x1b[44m",
	BgMagenta = "\x1b[45m",
	BgCyan = "\x1b[46m",
	BgWhite = "\x1b[47m",
}

/**
 * Colorize a string
 * @param color The color, e.g. '\x1b[36m' for cyan, see https://coderwall.com/p/yphywg/printing-colorful-text-in-terminal-when-run-node-js-script.
 * @param text The strign to colorize.
 */
function colorize(color: string, text: string): string {
	return color + text + '\x1b[0m';
}



/**
 * This class takes care of executing the unit tests.
 * It basically
 * 1. Reads the list file to find the unit test labels.
 * 2. Loads the binary into the emulator.
 * 3. Manipulates memory and PC register to call a specific unit test.
 * 4. Loops over all found unit tests.
 */
export class Z80UnitTests {

	/// This array will containt the names of all UT testcases.
	protected static utLabels: Array<string>;

	/// The unt test initialization routine. The user has to provide
	/// it and the label.
	protected static addrInit: number;

	/// The start address of the unit test wrapper.
	/// This is called to start the unit test.
	protected static addrTestWrapper: number;

	/// Here is the address of the unit test written.
	protected static addrCall: number;

	/// At the end of the test this address is reached on success.
	protected static addrTestReadySuccess: number;

	/// At the end of the test this address is reached on failure.
	protected static addrTestReadyFailure: number;

	/// Is filled with the summary of tests and results.
	protected static outputSummary: string;

	/// Counts number of failed and total testcases.
	protected static countFailed: number;
	protected static countExecuted: number;

	/// Is set if the current  testcase fails.
	protected static currentFail: boolean;

	protected static debug = true;

	/**
	 * Execute all unit tests.
	 */
	public static execute() {
		// Start
		const success = EmulDebugAdapter.startUnitTests(DbgAdaperState.UNITTEST_DEBUG, this.handleDebugAdapter);
		if(!success) {
			vscode.window.showErrorMessage("Couldn't start unit tests. Is maybe a debug session active?");
			return;
		}
	}


	/**
	 * Handles the states of the debug adapter. Will be called after setup
	 * @param debugAdapter The debug adpater.
	 */
	protected static handleDebugAdapter(debugAdapter: EmulDebugAdapter) {
		debugAdapter.on('initialized', () => {
			try {
				// The Z80 binary has been loaded.
				// The debugger stopped before starting the program.
				// Now read all the unit tests.
				Z80UnitTests.outputSummary = '';
				Z80UnitTests.countFailed = 0;
				Z80UnitTests.countExecuted = 0;

				// Get the unit test code
				Z80UnitTests.addrInit = Z80UnitTests.getNumberForLabel("UNITTEST_INIT");
				Z80UnitTests.addrTestWrapper = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_WRAPPER");
				Z80UnitTests.addrCall = Z80UnitTests.getNumberForLabel("UNITTEST_CALL_ADDR");
				Z80UnitTests.addrCall ++;
				Z80UnitTests.addrTestReadySuccess = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_SUCCESS");
				Z80UnitTests.addrTestReadyFailure = Z80UnitTests.getNumberForLabel("UNITTEST_TEST_READY_FAILURE_BREAKPOINT");
				const stackMinWatchpoint = Z80UnitTests.getNumberForLabel("UNITTEST_MIN_STACK_GUARD");
				const stackMaxWatchpoint = Z80UnitTests.getNumberForLabel("UNITTEST_MAX_STACK_GUARD");

				// Labels not yet known.
				Z80UnitTests.utLabels = undefined as unknown as Array<string>;

				// Success and failure breakpoints
/*
				const successBp: GenericBreakpoint = {
					address: Z80UnitTests.addrTestReadySuccess,
					conditions: '',
					log: undefined
				}
				const failureBp: GenericBreakpoint = {
					address: Z80UnitTests.addrTestReadyFailure,
					conditions: '',
					log: undefined
				}
				Emulator.setAssertBreakpoints([successBp, failureBp]);
*/

				const successBp: EmulatorBreakpoint = {
					bpId: 0,
					filePath: '',
					lineNr: -1,
					address: Z80UnitTests.addrTestReadySuccess,
					condition: '',
					log: undefined
				}
				Emulator.setBreakpoint(successBp);
				const failureBp: EmulatorBreakpoint = {
					bpId: 0,
					filePath: '',
					lineNr: -1,
					address: Z80UnitTests.addrTestReadyFailure,
					condition: '',
					log: undefined
				}
				Emulator.setBreakpoint(failureBp);

				// Start unit tests after a short while
				Z80UnitTests.startUnitTestsWhenQuiet(debugAdapter);
			}
			catch(e) {
				Z80UnitTests.stopUnitTests(debugAdapter, e.message);
			}
		});

		debugAdapter.on('break', () => {
			// The program was run and a break occured.
			// Get current pc
			Emulator.getRegisters(data => {
				// Parse the PC value
				const pc = Z80Registers.parsePC(data);
				//const sp = Z80Registers.parseSP(data);
				// Check if testcase was successfull
				Z80UnitTests.checkUnitTest(debugAdapter, pc);
				// Otherwise another break- or watchpoint was hit or the user stepped manually.
			});
		});
	}


	/**
	 * Returns the address for a label. Checks it and throws an error if it does not exist.
	 * @param label The label eg. "UNITTEST_TEST_WRAPPER"
	 * @returns An address.
	 */
	protected static getNumberForLabel(label: string): number {
		const addr = Labels.getNumberForLabel(label) as number;
		if(!addr) {
			throw Error("Couldn't find the unit test wrapper (" + label + "). Did you forget to use the macro?");
		}
		return addr;
	}


	/**
	 * Waits a few 100ms until traffic is quiet on the zSocket interface.
	 * The problem that is solved here:
	 * After starting the vscode sends the source file breakpoints.
	 * But there is no signal to tell when all are sent.
	 * If we don't wait we would miss a few and we wouldn't break.
	 * @param da The debug emulator.
	 */
	protected static startUnitTestsWhenQuiet(da: EmulDebugAdapter) {
		da.executeAfterBeingQuietFor(300, () => {
			// Load the initial unit test routine (provided by the user)
			Z80UnitTests.execAddr(Z80UnitTests.addrInit, da);
		});
	}


	/**
	 * Executes the sub routine at 'addr'.
	 * Used to call the unit test initialization subroutine and the unit
	 * tests.
	 * @param da The debug adapter.
	 */
	protected static execAddr(address: number, da: EmulDebugAdapter) {
		// Set memory values to test case address.
		const callAddr = new Uint8Array([ address & 0xFF, address >> 8]);
		Emulator.writeMemoryDump(this.addrCall, callAddr, () => {
			// Set PC
			Emulator.setProgramCounter(this.addrTestWrapper, () => {
				// Run
				if(Z80UnitTests.utLabels)
					Z80UnitTests.dbgOutput('UnitTest: ' + Z80UnitTests.utLabels[0] + ' da.emulatorContinue()');
				da.emulatorContinue();
			});
		});
	}


	/**
	 * Executes the next test case.
	 * @param da The debug adapter.
	 */
	protected static nextUnitTest(da: EmulDebugAdapter) {
		// Increase count
		Z80UnitTests.countExecuted ++;
		Z80UnitTests.currentFail = false;
		// Get Unit Test label
		const label = Z80UnitTests.utLabels[0];
		// Calculate address
		const address = Labels.getNumberForLabel(label) as number;
		assert(address);

		// Start at test case address.
		Z80UnitTests.dbgOutput('TestCase ' + label + '(0x' + address.toString(16) + ') started.');
		Z80UnitTests.execAddr(address, da);
	}


	/**
	 * Checks if the testcase was OK or a fail.
	 * Or undetermined.
	 * @param da The debug adapter.
	 * @param pc The program counter to check.
	 */
	protected static checkUnitTest(da: EmulDebugAdapter, pc: number) {
		// Check if test case ended successfully or not
		if(pc != this.addrTestReadySuccess
			&& pc != this.addrTestReadyFailure) {
			// Undetermined. Testcase not ended yet.
			//Z80UnitTests.dbgOutput('UnitTest: checkUnitTest: user break');
			// Count failure
			if(!Z80UnitTests.currentFail) {
				// Count only once
				Z80UnitTests.currentFail = true;
				Z80UnitTests.countFailed ++;
			}
			// Check if in debug or run mode.
			if(Z80UnitTests.debug) {
				// In debug mode: Send break to give vscode control
				da.sendEventBreak();
			}
			return;
		}

		// Check if this was the init routine that is started
		// before any test case:
		if(!Z80UnitTests.utLabels) {
			// Get all labels that look like: 'UT_xxx'
			Z80UnitTests.utLabels = Labels.getLabelsForRegEx('.*\\bUT_\\w*$', '');	// case-sensitive
			// Error check
			if(Z80UnitTests.utLabels.length == 0) {
				// No unit tests found -> disconnect
				Z80UnitTests.stopUnitTests(da, "Couldn't start unit tests. No unit tests found. Unit test labels should start with 'UT_'.");
				return;
			}
			// Start unit tests
			Z80UnitTests.nextUnitTest(da);
			return;
		}

		// Was a real test case.

		// OK or failure
		const tcSuccess = (pc == Z80UnitTests.addrTestReadySuccess);

		// Count failure
		if(!tcSuccess) {
			if(!Z80UnitTests.currentFail) {
				// Count only once
				Z80UnitTests.currentFail = true;
				Z80UnitTests.countFailed ++;
			}
		}

		// In debug mode do break after one step. The step is required to put the PC at the right place.
		const label = Z80UnitTests.utLabels[0];
		if(Z80UnitTests.debug && !tcSuccess) {
			// Do a step
			Z80UnitTests.dbgOutput('UnitTest: ' + label + '  da.emulatorStepOver()');
			da.emulatorStepOver();
			return;
		}

		// Print test case name, address and result.
		const tcResultStr = (Z80UnitTests.currentFail) ? colorize(Color.FgRed, 'Fail') : colorize(Color.FgGreen, 'OK');
		const addr = Labels.getNumberForLabel(label) || 0;
		const outTxt = label + ' (0x' + addr.toString(16) + '):\t' + tcResultStr;
		Z80UnitTests.dbgOutput(outTxt);
		Z80UnitTests.outputSummary += outTxt + '\n';

		// Next unit test
		Z80UnitTests.utLabels.shift();
		if(Z80UnitTests.utLabels.length == 0) {
			// End the unit tests
			Z80UnitTests.dbgOutput("All tests ready.");
			Z80UnitTests.printSummary();
			Z80UnitTests.stopUnitTests(da);
			return;
		}
		Z80UnitTests.nextUnitTest(da);
	}


	/**
	 * Stops the unit tests.
	 * @param errMessage If set an optional error message is shown.
	 */
	protected static stopUnitTests(debugAdapter: EmulDebugAdapter, errMessage?: string) {
		// Unsubscribe on events
		//debugAdapter.removeListener()
		// Exit
		debugAdapter.exit(errMessage);
	}


	/**
	 * Prints out text to the clients debug console.
	 * @param txt The text to print.
	 */
	protected static dbgOutput(txt: string) {
		// Savety check
		if(!vscode.debug.activeDebugConsole)
			return;

		// Only newline?
		if(!txt)
			txt = '';
		vscode.debug.activeDebugConsole.appendLine('UNITTEST: ' + txt);
		//zSocket.logSocket.log('UNITTEST: ' + txt);
	}


	/**
	 * Prints out a test case and result summary.
	 */
	protected static printSummary() {
		// Savety check
		if(!vscode.debug.activeDebugConsole)
			return;

		// Print summary
		const emphasize = '+-------------------------------------------------';
		vscode.debug.activeDebugConsole.appendLine('');
		vscode.debug.activeDebugConsole.appendLine(emphasize);
		vscode.debug.activeDebugConsole.appendLine('UNITTEST SUMMARY:\n\n');
		vscode.debug.activeDebugConsole.appendLine(Z80UnitTests.outputSummary);

		const color = (Z80UnitTests.countFailed>0) ? Color.FgRed : Color.FgGreen;
		const countPassed = Z80UnitTests.countExecuted - Z80UnitTests.countFailed;
		vscode.debug.activeDebugConsole.appendLine('');
		vscode.debug.activeDebugConsole.appendLine('Total testcases: ' + Z80UnitTests.countExecuted);
		vscode.debug.activeDebugConsole.appendLine('Passed testcases: ' + countPassed);
		vscode.debug.activeDebugConsole.appendLine(colorize(color, 'Failed testcases: ' + Z80UnitTests.countFailed));
		vscode.debug.activeDebugConsole.appendLine(colorize(color, Math.round(100*countPassed/Z80UnitTests.countExecuted) + '% passed.'));
		vscode.debug.activeDebugConsole.appendLine('');

		vscode.debug.activeDebugConsole.appendLine(emphasize);
	}

}

