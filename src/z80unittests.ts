import * as vscode from 'vscode';
import * as assert from 'assert';
//import { EmulatorBreakpoint } from './emulator';
//import { GenericWatchpoint, GenericBreakpoint } from './genericwatchpoint';
//import { ZesaruxEmulator } from './zesaruxemulator';
//import { zSocket } from './zesaruxSocket';
//import { Labels } from './labels';
//import { Utility } from './utility';
import { EmulDebugAdapter} from './emuldebugadapter';
import { Emulator } from './emulatorfactory';
//import { EmulatorBreakpoint } from './emulator';
import { GenericBreakpoint } from './genericwatchpoint';
import { Z80Registers } from './z80registers';
import { Labels } from './labels';
//import { zSocket } from './zesaruxSocket'; // TODO: remove



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


	/**
	 * Execute all unit tests.
	 */
	public static execute() {
		// Start
		const success = EmulDebugAdapter.startUnitTests(this.handleDebugAdapter);
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
			// The Z80 binary has been loaded.
			// The debugger stopped before starting the program.
			// Now read all the unit tests.
			Z80UnitTests.outputSummary = '';

			// Get the unit test code
			Z80UnitTests.addrInit = Labels.getNumberForLabel("UNITTEST_INIT") as number;
			if(!Z80UnitTests.addrInit) {
				Z80UnitTests.stopUnitTests(debugAdapter, "Couldn't find label UNITTEST_INIT. Did you forget to define the initialization routine?");
				return;
			}
			Z80UnitTests.addrTestWrapper = Labels.getNumberForLabel("UNITTEST_TEST_WRAPPER") as number;
			if(!Z80UnitTests.addrTestWrapper) {
				Z80UnitTests.stopUnitTests(debugAdapter, "Couldn't find the unit test wrapper. Did you forget to use the macro?");
				return;
			}
			Z80UnitTests.addrCall = Labels.getNumberForLabel("UNITTEST_CALL_ADDR") as number;
			assert(Z80UnitTests.addrCall);
			Z80UnitTests.addrCall ++;
			Z80UnitTests.addrTestReadySuccess = Labels.getNumberForLabel("UNITTEST_TEST_READY_SUCCESS") as number;
			assert(Z80UnitTests.addrTestReadySuccess);
			Z80UnitTests.addrTestReadyFailure = Labels.getNumberForLabel("UNITTEST_TEST_READY_FAILURE") as number;
			assert(Z80UnitTests.addrTestReadyFailure);

			// Labels not yet known.
			Z80UnitTests.utLabels = undefined as unknown as Array<string>;

			// Success and failure breakpoints
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

			// Start unit tests after a short while
			Z80UnitTests.startUnitTestsWhenQuiet(debugAdapter);
		});

		debugAdapter.on('break', () => {
			// The program was run and a break occured.
			// Now check the PC.
			Emulator.getRegistersFromEmulator

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
				Z80UnitTests.dbgOutput('UnitTest: da.emulatorContinue()');
				da.emulatorContinue();
			});
		});
	}


	/**
	 * Executes the next test case.
	 * @param da The debug adapter.
	 */
	protected static nextUnitTest(da: EmulDebugAdapter) {
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
		const tcResult = (pc == this.addrTestReadySuccess)? 'OK' : 'Fail';

		// Print test case name, address and result.
		const label = Z80UnitTests.utLabels[0];
		const addr = Labels.getNumberForLabel(label) || 0;
		const outTxt = label + ' (0x' + addr.toString(16) + '):\t' + tcResult;
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
		vscode.debug.activeDebugConsole.appendLine(emphasize);
	}

}


/*
       {
            "type": "z80-debug",
            "request": "launch",
            "name": "Z80 Debugger - Unit Tests Debug",
            "zhostname": "localhost",
            "zport": 10000,
            "topOfStack": "stack_top",
            "resetOnLaunch": true,
            "skipInterrupt": true,
            "startAutomatically": true,
            "rootFolder": "${workspaceFolder}",
            "commandsAfterLaunch": [
                "-wpmem enable",
                "-assert enable"
            ],
            "disassemblerArgs": {
                "esxdosRst": true
            },
            "listFiles": [
                {
                    "path": "out/ut_dbg.list",
                    "asm": "sjasmplus",
                    "mainFile": "unit_tests.asm",
                    "srcDirs": [ "src" ]
                    //"srcDirs": []  // Use list file
                }
            ],

            "load": "out/ut_dbg.sna",

            "log": {
                "channelOutputEnabled": true
            },
            "logSocket": {
                "channelOutputEnabled": true
            },
			"socketTimeout": 50,    // 50 secs for debugging
		}
		*/
