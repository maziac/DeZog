import * as vscode from 'vscode';
import { DebugSessionClass } from '../debugadapter';
import { RemoteFactory, Remote } from '../remotes/remotefactory';
import {Labels, LabelsClass } from '../labels/labels';
import { RemoteBreakpoint } from '../remotes/remotebase';
import { Settings } from '../settings';
import { Utility } from '../misc/utility';
import { Decoration } from '../decoration';
import {StepHistory, CpuHistory, CpuHistoryClass} from '../remotes/cpuhistory';
import {Z80RegistersClass, Z80Registers} from '../remotes/z80registers';
import {StepHistoryClass} from '../remotes/stephistory';
import {ZSimRemote} from '../remotes/zsimulator/zsimremote';
import * as path from 'path';
import {FileWatcher} from '../misc/filewatcher';
import {UnitTestCaseBase, UnitTestCase, RootTestSuite, UnitTestSuiteConfig} from './UnitTestCase';




/// Some definitions for colors.
// TODO: Do I need the colors still?
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
 * @param text The string to colorize.
 */
function colorize(color: string, text: string): string {
	//return color + text + '\x1b[0m';
	return text;	// No easy colorizing possible in output channel.
}


/**
 * Enumeration for the returned test case pass or failure.
 */
enum TestCaseResult {
	OK = 0,
	FAILED = 1,
	TIMEOUT = 2,
	CANCELLED = 3,	// Test cases have been cancelled, e.g. manually or the connection might have been lost or whatever.
}



/**
 * This class takes care of executing the unit tests.
 * It basically
 * 1. Reads the list file to find the unit test labels.
 * 2. Loads the binary into the emulator.
 * 3. Manipulates memory and PC register to call a specific unit test.
 * 4. Loops over all found unit tests.
 */
export class Z80UnitTestRunner {
	/// This array will contain the names of all UT test cases.
	protected static utLabels: Array<string>;

	/// This array will contain the names of the test cases that should be run.
	protected static partialUtLabels: Array<string> | undefined;

	/// A map for the test case labels and their resolve functions. The resolve
	/// function is called when the test cases has been executed.
	/// result:
	///   0 = passed
	///   1 = failed
	///   2 = timeout
	protected static testCaseMap = new Map<string, (result: number) => void>();

	/// The unit test initialization routine. The user has to provide
	/// it and the label.
	protected static addrStart: number;

	/// The start address of the unit test wrapper.
	/// This is called to start the unit test.
	protected static addrTestWrapper: number;

	/// Here is the address of the unit test written.
	protected static addrCall: number;

	/// At the end of the test this address is reached on success.
	protected static addrTestReadySuccess: number;

	/// Is filled with the summary of tests and results.
	protected static outputSummary: string;

	/// Counts number of failed and total test cases.
	protected static countFailed: number;
	protected static countExecuted: number;

	/// Is set if the current  test case fails.
	protected static currentFail: boolean;

	/// The handle for the timeout.
	protected static timeoutHandle;

	/// Debug mode or run mode.
	protected static debug = false;

	/// Set to true if unit tests are cancelled.
	protected static cancelled = false;

	/// Stores the covered addresses for all unit tests.
	protected static allCoveredAddresses: Set<number>;

	/// Caches the last received addresses (from Emulator)
	protected static lastCoveredAddresses: Set<number>;

	/// Called when the unit test have finished.
	/// Used to know when the async function is over.
	protected static finishedCallback?: () => void;

	/// The output channel for the unit tests
	protected static unitTestOutput = vscode.window.createOutputChannel("DeZog Unit Tests");

	// The map of file watchers. Key is the file path.
	protected static fileWatchers: Map<string, FileWatcher>;

	// Maps the filename (=id) to the test item.
	protected static testItems: Map<string, vscode.TestItem>;

	// Maps the sld/list files to launch configs.
	protected static listFileContexts: Map<string, any>;

	// The root of all test cases.
	protected static rootTestSuite: RootTestSuite;

	// Pointer to the test controller.
	protected static testController: vscode.TestController;

	// The currently used (and setup) test configuration.
	protected static testConfig: UnitTestSuiteConfig | undefined;

	/**
	 * Called to initialize the test controller.
	 */
	public static Init() {
		// Init
		this.testConfig = undefined;
		this.allCoveredAddresses = new Set<number>();
		this.lastCoveredAddresses = new Set<number>();
		// Create test controller
		this.testController = vscode.tests.createTestController(
			'maziac.dezog.z80unittest.controller',
			'Z80 Unit Tests'
		);
		// For test case discovery
		this.rootTestSuite = new RootTestSuite(this.testController);
		// Add profiles for test case execution
		this.testController.createRunProfile('Run', vscode.TestRunProfileKind.Run, (request, token) => {
			this.runHandler(request, token);
		});

		this.testController.createRunProfile('Debug', vscode.TestRunProfileKind.Debug, (request, token) => {
			this.runDebugHandler(request, token);
		});
	}


	/**
	 * Runs a test case. (Not debug)
	 */
	protected static async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		const run = this.testController.createTestRun(request);
		const queue: vscode.TestItem[] = [];

		// Loop through all included tests, or all known tests, and add them to our queue
		if (request.include) {
			request.include.forEach(test => queue.push(test));
		} else {
			this.testController.items.forEach(test => queue.push(test));
		}

		// For every test that was queued, try to run it. Call run.passed() or run.failed().
		// The `TestMessage` can contain extra information, like a failing location or
		// a diff output. But here we'll just give it a textual message.
		while (queue.length > 0 && !token.isCancellationRequested) {
			const test = queue.shift()!;

			// Skip tests the user asked to exclude
			if (request.exclude?.includes(test))
				continue;

			// If it has children it is a test suite, otherwise a test case
			if (test.children.size == 0) {
				// Get "real" unit test
				const ut = UnitTestCaseBase.getUnitTestCase(test) as UnitTestCase;
				// Setup the test config
				await this.setupTestCase(ut);
				// Run the test case
				const start = Date.now();
				try {
					run.started(test);
					await this.runTestCase(ut);
					run.passed(test, Date.now() - start);
				}
				catch (e) {
					// Test failure
					const testMsg = new vscode.TestMessage(e.message);
					let range = test.range;
					if (e.position) {
						const line = e.position.line;
						const col = e.position.column;
						range = new vscode.Range(line, col, line, col);
					}
					if (range) {
						testMsg.location = new vscode.Location(test.uri!, range);
					}
					run.failed(test, testMsg, Date.now() - start);
				}
			}
			else {
				// Run child tests
				const tmp: vscode.TestItem[] = [];
				test.children.forEach(item => tmp.push(item));
				queue.unshift(...tmp);
			}
		}

		// Make sure to end the run after all tests have been executed:
		run.end();
	}


	/**
	 * Runs a test case. (debug)
	 */
	protected static async runDebugHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		// TODO
	}


	/**
	 * Sets up the test case.
	 * Goes up the parents until it finds the unit test config.
	 * Then (if not yet done before) it starts up the Remote to be
	 * able to execute a single test case.
	 */
	protected static async setupTestCase(ut: UnitTestCase) {
		// Clear coverage for this unit test.
		this.lastCoveredAddresses.clear();

		// Check for parent config
		const testConfig = ut.getConfigParent();
		if (!testConfig)
			throw Error("No test config found.");
		// Check if already setup
		if (this.testConfig == testConfig)
			return;
		this.testConfig = testConfig;

		// Terminate any probably runnning instance
		await this.terminateRemote(false);

		// Prepare running of the test case

		// Mode
		//this.debug = false;
		//this.cancelled = false;

		// Get unit test launch config
		const configuration = this.testConfig!.config;

		// Setup root folder
		Utility.setRootPath(this.testConfig!.wsFolder);

		// Reset all decorations
		this.allCoveredAddresses.clear();	// TODO: Does this work in multiroot or are only the coverred lines of the last workspace shown?
		Decoration.clearAllDecorations();

		// Create the registers
		Z80RegistersClass.createRegisters();

		// Start emulator.
		RemoteFactory.createRemote(configuration.remoteType);

		// Check if a cpu history object has been created. (Note: this is only required for debug but done for both)
		if (!(CpuHistory as any)) {
			// If not create a lite (step) history
			CpuHistoryClass.setCpuHistory(new StepHistoryClass());
			StepHistory.decoder = Z80Registers.decoder;
		}

		// Reads the list file and also retrieves all occurrences of WPMEM, ASSERTION and LOGPOINT.
		Labels.init(configuration.smallValuesMaximum);
		Remote.readListFiles(configuration);

		return new Promise<void>(async (resolve, reject) => {
			// Events
			Remote.once('initialized', async () => {
				try {
					// Initialize Cpu- or StepHistory.
					StepHistory.init();  // might call the socket

					// Execute command to enable wpmem, logpoints, assertions.
					await Remote.enableLogpointGroup(undefined, true);
					try {
						await Remote.enableWPMEM(true);
					}
					catch (e) {
						// It's not essential anymore to have watchpoints running.
						// So catch this error from CSpect and show a warning instead
						vscode.window.showWarningMessage(e.message);
					}
					await Remote.enableAssertionBreakpoints(true);

					// Initialize
					await this.initUnitTests();

					// End
					resolve();
				}
				catch (e) {
					// Some error occurred
					//Z80UnitTests.stopUnitTests(undefined, e.message);// TODO
					reject(e);
				}
			});

			Remote.on('coverage', coveredAddresses => {
				// Cache covered addresses (since last unit test)
				coveredAddresses.forEach(this.lastCoveredAddresses.add, this.lastCoveredAddresses);
				Decoration.showCodeCoverage(coveredAddresses);
			});

			Remote.on('warning', message => {
				// Some problem occurred
				vscode.window.showWarningMessage(message);
			});

			Remote.on('debug_console', message => {
				// Show the message in the debug console
				vscode.debug.activeDebugConsole.appendLine(message);

			});

			Remote.once('error', e => {
				// Some error occurred
				//Z80UnitTests.stopUnitTests(undefined, err.message); // TODO
				reject(e);
			});


			// Connect to debugger.
			try {
				await Remote.init();
			}
			catch (e) {
				// Some error occurred
				//Z80UnitTests.stopUnitTests(undefined, e.message);// TODO
				reject(e);
			};
		});
	}


	/**
	 * Checks if the debugger is active. If yes terminates it and
	 * executes the unit tests.
	 * @param debug false: unit tests are run without debugger,
	 * true: unit tests are run with debugger.
	 */
	protected static async terminateRemote(debug: boolean): Promise<void> {
		//Z80UnitTests.debug = debug;
		return new Promise<void>(async resolve => {
			// Wait until vscode debugger has stopped.
			if (Remote) {
				// Terminate emulator
				await Remote.terminate();
				RemoteFactory.removeRemote();
			}

			// (Unfortunately there is no event for this, so we need to wait)
			Utility.delayedCall(time => {
				// After 5 secs give up
				if (time >= 5.0) {
					// Give up
					vscode.window.showErrorMessage('Could not terminate active debug session. Please try manually.');
					resolve();
					return true;
				}
				// New coverage set
				this.allCoveredAddresses = new Set<number>();
				// Check for active debug session
				if (vscode.debug.activeDebugSession)
					return false;  // Try again
				resolve();
				return true;  // Stop
			});
		});
	}

	/**
	 * Runs a single test case.
	 * Throws an exception on failure.
	 * Np exception if passed correctly.
	 * @param test The TestItem.
	 */
	protected static async runTestCase(ut: UnitTestCase) {
		// Start the part that is executed before each unit test
		await this.execAddr(this.addrStart);
		// Start the unit test
		const utAddr = this.getLongAddressForLabel(ut.utLabel);
		await this.execAddr(utAddr);


		/*
		// Get 'required' context
		const tcContext = this.tcContexts.get(test)!;

		this.allCoveredAddresses = new Set<number>();
		await this.terminateEmulator();

		// Debugger not active anymore, start tests
		//this.cancelled = false;
		//if (debug)
		//	this.debugTests();
		//else
		try {
			await this.runTests();	// TODO rename to prepareTest
		}
		catch (e) {
			vscode.window.showErrorMessage(e.message);
			throw Error('Problem starting the Remote.');
		}

		// Execute
		//tcContext.requireContext.dezogExecAddr = this.execAddr;

		const spStr = Settings.launch.topOfStack;
		let sp = Labels.getNumberForLabel(spStr) || 0;
		sp &= 0xFFFF;

		tcContext.requireContext.setDezogTestContext(sp, this, Remote);
		try {
			await tcContext.testFunc!();	// TODO: also async functions
		}
		catch (e) {
			// Add the line number
			if (!e.position) {
				e.position = Utility.getLineNumberFromError(e, 0, this.fakeTestScriptFileName);
			}
			throw e;
		}
*/
		await Utility.timeout(2000);
	}



	/**
	 * Command execution: Cancel all unit tests.
	 */
	public static async cmdCancelAllUnitTests() {
		Remote.emit('terminated');
		await Z80UnitTestRunner.cancelUnitTests();
	}


	/**
	 *  Command to cancel the unit tests. E.g. during debugging of one unit test.
	 */
	public static async cancelUnitTests() {
		// Avoid calling twice
		if (this.cancelled)
			return;
		// Cancel the unit tests
		this.cancelled = true;
		const text = "Unit tests cancelled.";
		Z80UnitTestRunner.dbgOutput(text);
		await Z80UnitTestRunner.stopUnitTests(undefined);
		//	ds.customRequest("terminate");
		// Fail the current test
		/*
		Z80UnitTestRunner.countFailed++;
		if (Z80UnitTestRunner.countFailed>Z80UnitTestRunner.countExecuted)
			Z80UnitTestRunner.countFailed=Z80UnitTestRunner.countExecuted;
		*/
		if (Z80UnitTestRunner.countExecuted > 0)
			Z80UnitTestRunner.countExecuted--;
		Z80UnitTestRunner.unitTestsFinished();
	}


	/**
	 * Start the unit tests, either partial or full, in debug mode.
	 * Debug mode simulates the vscode UI to start debugging and to press continue
	 * after each unit test case.
	 */
	protected static debugTests() {
		try {
			// Get unit test launch config
			let configuration;// = Z80UnitTestRunner.getUnitTestsLaunchConfigs();
			const configName: string = configuration.name;

			// Start debugger
			const success = DebugSessionClass.unitTests(configName, this.handleDebugAdapter);
			if (!success) {
				vscode.window.showErrorMessage("Couldn't start unit tests. Is maybe a debug session active?");
			}
		}
		catch (e) {
			vscode.window.showErrorMessage(e.message);
		}
	}


	/**
	 * Clears the map of test cases.
	 * Is called at first when starting (partial) unit test cases.
	 */
	public static clearTestCaseList() {
		// Clear map
		Z80UnitTestRunner.testCaseMap.clear();
	}


	/**
	 * "Executes" one unit test case.
	 * The test case is just remembered and executed later.
	 * Whenever the test case is executed the result is passed in the promise.
	 * @param tcLabels An array with the unit test case labels.
	 */
	public static async execUnitTestCase(tcLabel: string): Promise<number> {
		return new Promise<number>((resolve) => {
			// Remember its resolve function.
			Z80UnitTestRunner.testCaseMap.set(tcLabel, resolve);
		});
	}






	/**
	 * Loads all labels from the launch.json unit test configuration and
	 * returns a new labels object.
	 * Reads in all labels files.
	 * @param rootFolder The root folder of the project.
	 * @returns A labels object.
	 */
	protected static loadLabelsFromConfiguration(rootFolder: string): LabelsClass {
		// Set root path
		Utility.setRootPath(rootFolder);

		let configuration;// = Z80UnitTestRunner.getUnitTestsLaunchConfigs();

		// Setup settings
		Settings.launch = Settings.Init(configuration, rootFolder);
		Settings.CheckSettings();

		// Get labels
		const labels = new LabelsClass();
		labels.readListFiles(configuration);
		return labels;
	}


	/**
	 * Retrieves a list of strings with the labels of all unit tests.
	 * @returns A list of strings with the label names of the unit tests or a single string with the error text.
	 */
	/*
	public static async getAllUnitTests(): Promise<UnitTestCase[]> {
		return new Promise<UnitTestCase[]>((resolve, reject) => {
			try {
				// Read all list files.
				const labels = Z80UnitTestRunner.loadLabelsFromConfiguration();
				// Check if unit tests available
				if (!Z80UnitTestRunner.AreUnitTestsAvailable(labels))
					return resolve([]);	// Return empty array
				// Get the unit test labels
				const utLabels = Z80UnitTestRunner.getAllUtLabels(labels);
				resolve(utLabels);
			}
			catch (e) {
				// Error
				reject(e.message || "Unknown error.");
			}
		});
	}
	*/
	// TODO: REMOVE
	public static getAllUnitTests(rootFolder: string): any[] {
		let allUtLabels: any[] = [];
		try {
			// Read all list files.
			const labels = Z80UnitTestRunner.loadLabelsFromConfiguration(rootFolder);
			// Check if unit tests available
			if (Z80UnitTestRunner.AreUnitTestsAvailable(labels)) {
				// Get the unit test labels
		//		allUtLabels = Z80UnitTestRunner.getAllUtLabels(labels);
			}
		}
		catch (e) {
			// Re-throw
			const msg = e.message || "Unknown error.";
			throw Error("Z80 Unit Tests: " + msg);
		}
		return allUtLabels;
	}


	/**
	 * Check for z80asm:
	 * In z80asm the labels will be visible in the list file for the macro definition.
	 * Even if no unit test has been defined.
	 * This can be checked. In that case the addresses for all labels are the same.	protected
	 */
	protected static AreUnitTestsAvailable(labels: LabelsClass): boolean {
		const firstLabel = labels.getNumberForLabel("UNITTEST_TEST_WRAPPER");
		const lastLabel = labels.getNumberForLabel("UNITTEST_MAX_STACK_GUARD");

		if(firstLabel == lastLabel) {
			// Note: this is also true if both labels are not defined (undefined == undefined)
			return false;
		}

		// Everything fine
		return true;
	}


	/**
	 * Initializes the unit tests. Is called after the emulator has been setup.
	 */
	protected static async initUnitTests(): Promise<void> {
		// Get the unit test code
		this.addrStart = this.getLongAddressForLabel("UNITTEST_START");
		this.addrTestWrapper = this.getLongAddressForLabel("UNITTEST_TEST_WRAPPER");
		this.addrCall = this.getLongAddressForLabel("UNITTEST_CALL_ADDR");
		this.addrCall++;
		this.addrTestReadySuccess = this.getLongAddressForLabel("UNITTEST_TEST_READY_SUCCESS")

		// The Z80 binary has been loaded.
		// The debugger stopped before starting the program.
		// Now read all the unit tests.
		this.timeoutHandle = undefined;
		this.currentFail = true;

		// Check if code for unit tests is really present
		// (In case labels are present but the actual code was not loaded.)
		const opcode = await Remote.readMemory(this.addrTestWrapper & 0xFFFF);
		// Should start with DI (=0xF3)
		if (opcode != 0xF3)
			throw Error("Code for unit tests is not present.");

		// Labels not yet known.
		//this.utLabels = undefined as unknown as Array<string>;

		// Success and failure breakpoints
		const successBp: RemoteBreakpoint = { bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTestRunner.addrTestReadySuccess, condition: '',	log: undefined };
		await Remote.setBreakpoint(successBp);
		//const failureBp1: RemoteBreakpoint={bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTestRunner.addrTestReadyFailure, condition: '', log: undefined};
		//await Remote.setBreakpoint(failureBp1);
		//const failureBp2: RemoteBreakpoint={bpId: 0, filePath: '', lineNr: -1, address: Z80UnitTestRunner.addrTestReadyReturnFailure, condition: '', log: undefined};
		//await Remote.setBreakpoint(failureBp2);

		// Stack watchpoints
		//const stackMinWp: GenericWatchpoint = { address: stackMinWatchpoint, size: 2, access: 'rw', condition: '' };
		//const stackMaxWp: GenericWatchpoint = { address: stackMaxWatchpoint, size: 2, access: 'rw', condition: '' };
		//await Remote.setWatchpoint(stackMinWp);
		//await Remote.setWatchpoint(stackMaxWp);
	}


	/**
	 * Handles the states of the debug adapter. Will be called after setup
	 * @param debugAdapter The debug adapter.
	 */
	protected static handleDebugAdapter(debugAdapter: DebugSessionClass) {
		debugAdapter.on('initialized', async () => {
			try {
				// Execute command to enable wpmem, logpoints, assertions.
				await Remote.enableLogpointGroup(undefined, true);
				try {
					await Remote.enableWPMEM(true);
				}
				catch (e) {
					// It's not essential anymore to have watchpoints running.
					// So catch this error from CSpect and show a warning instead
					vscode.window.showWarningMessage(e.message);
				}
				await Remote.enableAssertionBreakpoints(true);

				// Handle coverage
				Remote.on('coverage', coveredAddresses => {
					// Cache covered addresses (since last unit test)
					//Z80UnitTestRunner.lastCoveredAddresses = coveredAddresses;
					if (!Z80UnitTestRunner.lastCoveredAddresses)
						Z80UnitTestRunner.lastCoveredAddresses = new Set<number>();
					coveredAddresses.forEach(Z80UnitTestRunner.lastCoveredAddresses.add, Z80UnitTestRunner.lastCoveredAddresses);
				});

				// After initialization vscode might send breakpoint requests
				// to set the breakpoints.
				// Unfortunately this request is sent only if breakpoints exist.
				// I.e. there is no safe way to wait for something to
				// know when vscode is ready.
				// So just wait some time:
				if (Settings.launch.startAutomatically)
					await Utility.timeout(500);

				// Init unit tests
				await Z80UnitTestRunner.initUnitTests();
				// Start unit tests after a short while
				Z80UnitTestRunner.startUnitTestsWhenQuiet(debugAdapter);
			}
			catch(e) {
				Z80UnitTestRunner.stopUnitTests(debugAdapter, e.message);
			}
		});

		debugAdapter.on('break', () => {
			this.onBreak(debugAdapter);
		});
	}


	/**
	 * A break occurred. E.g. the test case stopped because it is finished
	 * or because of an error (ASSERTION).
	 * @param debugAdapter The debugAdapter (in debug mode) or undefined for the run mode.
	 */
	protected static onBreak(debugAdapter?: DebugSessionClass) {
		// Parse the PC value
		//const pc = Remote.getPCLong();
		////const sp = Z80Registers.parseSP(data);
		// Check if test case was successful
		Z80UnitTestRunner.checkUnitTest(debugAdapter);
		// Otherwise another break- or watchpoint was hit or the user stepped manually.
	}


	/**
	 * Returns the long address for a label. Checks it and throws an error if it does not exist.
	 * @param label The label eg. "UNITTEST_TEST_WRAPPER"
	 * @returns An address.
	 */
	protected static getLongAddressForLabel(label: string): number {
		const loc = Labels.getLocationOfLabel(label);
		let addr;
		if (loc)
			addr = loc.address;
		if (addr == undefined) {
			throw Error("Unit tests are not enabled in the enabled sources. Label " + label + " is not found. Did you forget to use the 'UNITTEST_INITIALIZE' macro ?");
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
	protected static startUnitTestsWhenQuiet(da: DebugSessionClass) {
		// Wait
		da.waitForBeingQuietFor(1000)
		.then(() => {
			// Load the initial unit test routine (provided by the user)
	//		Z80UnitTestRunner.execAddr(Z80UnitTestRunner.addrStart, da);
		});
	}


	/**
	 * Executes the sub routine at 'addr'.
	 * Used to call the unit test initialization subroutine and the unit
	 * tests.
	 * @param address The (long) address to call.
	 * @param da The debug adapter.
	 */
	protected static async execAddr(address: number, da?: DebugSessionClass) {
		// Set memory values to test case address.
		const callAddr = new Uint8Array([address & 0xFF, (address >>> 8) & 0xFF]);

		await Remote.writeMemoryDump(this.addrCall & 0xFFFF, callAddr);

		// Set slot/bank to Unit test address
		const bank = Z80Registers.getBankFromAddress(address);
		if (bank >= 0) {
			const slot = Z80Registers.getSlotFromAddress(address)
			await Remote.setSlot(slot, bank);
		}
		// Set PC
		const addr64k = this.addrTestWrapper & 0xFFFF;
		await Remote.setRegisterValue("PC", addr64k);

		// Init
		StepHistory.clear();
		await Remote.getRegistersFromEmulator();
		await Remote.getCallStackFromEmulator();

		// Special handling for zsim: Re-init custom code.
		if (Remote instanceof ZSimRemote) {
			const zsim = Remote as ZSimRemote;
			zsim.customCode?.reload();
		}

		// Run or Debug
		await this.RemoteContinue(da);
	}


	/**
	 * Starts Continue directly or through the debug adapter.
	 */
	protected static async RemoteContinue(da: DebugSessionClass | undefined): Promise<void> {
		// Check if cancelled
		//if (Z80UnitTestRunner.cancelled)
		//	return;
		// Init
		Remote.startProcessing();
		// Run or Debug
		if (da) {
			// With vscode UI
			da.sendEventContinued();
			// Debug: Continue
			await da.remoteContinue();
			Remote.stopProcessing();
		}
		else {
			// Run: Continue
			await Remote.continue();
			Remote.stopProcessing();
			await this.checkUnitTest(da);
		}
	}


	/**
	 * Checks if the test case was OK or a fail.
	 * Or undetermined.
	 * @param da The debug adapter.
	 */
	protected static async checkUnitTest(da?: DebugSessionClass): Promise<void> {
		// Collect coverage:
		// Get covered addresses (since last unit test) and add to collection.
		const target = this.allCoveredAddresses;
		this.lastCoveredAddresses.forEach(target.add, target);
		this.lastCoveredAddresses.clear();

		// Check if it was a timeout
		let timeoutFailure = !Z80UnitTestRunner.debug;
		if(Z80UnitTestRunner.timeoutHandle) {
			// Clear timeout
			clearTimeout(Z80UnitTestRunner.timeoutHandle);
			Z80UnitTestRunner.timeoutHandle = undefined;
			timeoutFailure = false;
		}

		// Check if test case ended successfully or not
		const pc = Remote.getPCLong();
		// OK or failure
		const tcSuccess = (pc == this.addrTestReadySuccess);
		if (!tcSuccess) {
			// Undetermined. Test case not ended yet.
			// Check if in debug or run mode.
			if(da) {
				// In debug mode: Send break to give vscode control
				await da.sendEventBreakAndUpdate();
				return;
			}
			// Else: Test case failure
			throw Error("Test case failed.");
		}

		// Collect coverage:
		// Get covered addresses (since last unit test) and add to collection.
		/*
		if (Z80UnitTestRunner.lastCoveredAddresses) {
			const target=Z80UnitTestRunner.allCoveredAddresses;
			Z80UnitTestRunner.lastCoveredAddresses.forEach(target.add, target);
			Z80UnitTestRunner.lastCoveredAddresses = undefined as any;
		}
		*/
	}


	/**
	 * Called when all unit tests have finished.
	 * Will print the summary and display the decorations for the line coverage.
	 */
	protected static unitTestsFinished() {
		// Summary
		Z80UnitTestRunner.printSummary();
		// Inform
		if (Z80UnitTestRunner.finishedCallback)
			Z80UnitTestRunner.finishedCallback();
	}


	/**
	 * Sends a CANCELLED for all still open running test cases
	 * to the caller (i.e. the test case adapter).
	 */
	protected static CancelAllRemainingResults() {
		for(const [, resolveFunc] of Z80UnitTestRunner.testCaseMap) {
			// Return an error code
			resolveFunc(TestCaseResult.CANCELLED);
		}
		Z80UnitTestRunner.testCaseMap.clear();
	}


	/**
	 * Stops the unit tests.
	 * @param errMessage If set an optional error message is shown.
	 */
	protected static async stopUnitTests(debugAdapter: DebugSessionClass|undefined, errMessage?: string): Promise<void> {
		// Async
		return new Promise<void>(async resolve => {
			// Clear timeout
			clearTimeout(Z80UnitTestRunner.timeoutHandle);
			Z80UnitTestRunner.timeoutHandle=undefined;
			// Clear remaining test cases
			Z80UnitTestRunner.CancelAllRemainingResults();

			// Show coverage
			Decoration.showCodeCoverage(Z80UnitTestRunner.allCoveredAddresses);

			// Wait a little bit for pending messages (The vscode could hang on waiting on a response for getRegisters)
			if (debugAdapter) {
				Remote.stopProcessing();	// To show the coverage after continue to end
				await debugAdapter.waitForBeingQuietFor(300);
			}

			// Show remaining covered addresses
			if (Z80UnitTestRunner.lastCoveredAddresses) {
				Decoration.showCodeCoverage(Z80UnitTestRunner.lastCoveredAddresses);
				Z80UnitTestRunner.lastCoveredAddresses = undefined as any;
			}

			// For reverse debugging.
			StepHistory.clear();

			// Exit
			if (debugAdapter) {
				this.cancelled = true;	// Avoid calling the cancel routine.
				debugAdapter.terminate(errMessage);
			}
			else {
				// Stop emulator
				await Remote.disconnect();
				// Show error
				if (errMessage)
					vscode.window.showErrorMessage(errMessage);
			}

			// Remove event handling for the emulator
			Remote.removeAllListeners();

			resolve();
		});
	}


	/**
	 * Prints out text to the clients debug console.
	 * @param txt The text to print.
	 */
	protected static dbgOutput(txt: string) {
		// Safety check
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


		// Print summary
		const emphasize = '+-------------------------------------------------';
		this.unitTestOutput.show();
		this.unitTestOutput.appendLine('');
		this.unitTestOutput.appendLine(emphasize);
		const projectName = path.basename(Utility.getRootPath());
		this.unitTestOutput.appendLine('UNITTEST SUMMARY, ' + projectName + ':');
		this.unitTestOutput.appendLine('Date: ' + new Date().toString() + '\n\n');
		this.unitTestOutput.appendLine(Z80UnitTestRunner.outputSummary);

		const color = (Z80UnitTestRunner.countFailed>0) ? Color.FgRed : Color.FgGreen;
		const countPassed = Z80UnitTestRunner.countExecuted - Z80UnitTestRunner.countFailed;
		this.unitTestOutput.appendLine('');
		this.unitTestOutput.appendLine('Total test cases: ' + Z80UnitTestRunner.countExecuted);
		this.unitTestOutput.appendLine('Passed test cases: ' + countPassed);
		this.unitTestOutput.appendLine(colorize(color, 'Failed test cases: '+Z80UnitTestRunner.countFailed));
		if (Z80UnitTestRunner.countExecuted>0)
			this.unitTestOutput.appendLine(colorize(color, Math.round(100*countPassed/Z80UnitTestRunner.countExecuted) + '% passed.'));
		this.unitTestOutput.appendLine('');

		this.unitTestOutput.appendLine(emphasize);
	}

}

