import * as vscode from 'vscode';
import { DebugSessionClass } from '../debugadapter';
import { RemoteFactory, Remote } from '../remotes/remotefactory';
import {Labels, SourceFileEntry } from '../labels/labels';
import { RemoteBreakpoint } from '../remotes/remotebase';
import { Settings } from '../settings';
import { Utility } from '../misc/utility';
import { Decoration } from '../decoration';
import {StepHistory, CpuHistory, CpuHistoryClass} from '../remotes/cpuhistory';
import {Z80RegistersClass, Z80Registers} from '../remotes/z80registers';
import {StepHistoryClass} from '../remotes/stephistory';
import {ZSimRemote} from '../remotes/zsimulator/zsimremote';
import {UnitTestCaseBase, UnitTestCase, RootTestSuite, UnitTestSuiteConfig, UnitTestSuite} from './unittestcase';
import {PromiseCallbacks} from '../misc/promisecallbacks';




/**
 * This class takes care of executing the unit tests.
 * It basically
 * 1. Reads the list file to find the unit test labels.
 * 2. Loads the binary into the emulator.
 * 3. Manipulates memory and PC register to call a specific unit test.
 * 4. Loops over all found unit tests.
 */
export class Z80UnitTestRunner {
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

	/// Is set if the current  test case fails.
	protected static currentFail: boolean;

	/// Debug mode or run mode.
	protected static debug = false;

	/// For debugging. Pointer to debug adapter class.
	protected static debugAdapter: DebugSessionClass;

	// The root of all test cases.
	protected static rootTestSuite: RootTestSuite;

	// Pointer to the test controller.
	protected static testController: vscode.TestController;

	// The currently used (and setup) test configuration.
	protected static testConfig: UnitTestSuiteConfig | undefined;

	// Used for returning test cases from the debugger.
	protected static waitOnDebugger: PromiseCallbacks<void> | undefined;

	// The current test run.
	protected static currentTestRun: vscode.TestRun | undefined;

	// The current test item.
	protected static currentTestItem: vscode.TestItem | undefined;

	// The current test start time.
	protected static currentTestStart: number;

	// Remembers if the current test case was failed.
	protected static currentTestFailed: boolean;

	// Is true during test case setup (assembler) code
	protected static testCaseSetup: boolean;

	// Set to true if test timeout occurs.
	protected static timedOut: boolean;

	// Set to true while tests are executed.
	protected static testRunActive: boolean;

	// Set to true during cancelling unit tests.
	protected static stoppingTests: boolean;


	/**
	 * Called to initialize the test controller.
	 */
	public static Init() {
		// Init
		this.testConfig = undefined;
		this.testRunActive = false;
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
		}); // TODO: requires dispose

		this.testController.createRunProfile('Debug', vscode.TestRunProfileKind.Debug, (request, token) => {
			this.runDebugHandler(request, token);
		});// TODO: requires dispose

	}


	/**
	 * Runs one or several test cases. (Not debug)
	 */
	protected static async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		this.debug = false;
		await this.runOrDebugHandler(request, token);
	}


	/**
	 * Runs one or several test cases. (debug)
	 */
	protected static async runDebugHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		// Start with debugger
		this.debug = true;
		await this.runOrDebugHandler(request, token);
	}


	/**
	 * The run or debug handler.
	 * Uses 'run' if the debug adapter is undefined.
	 * Otherwise a debug session is started.
	 * @param request The original request from vscode.
	 */
	protected static async runOrDebugHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
		// Only allow one test run at a time
		if (this.testRunActive) {
			// Cancel unit tests
			await this.stopUnitTests();
			return;
		}
		this.stoppingTests = false;
		this.testRunActive = true;

		// Create test run
		const run = this.testController.createTestRun(request);
		this.currentTestRun = run;
		const queue: vscode.TestItem[] = [];

		// Register function to terminate if requested
		token.onCancellationRequested(async () => {
			await this.stopUnitTests();	// Will also terminate the debug adapter.
		});

		// Init
		this.testConfig = undefined;

		// Loop through all included tests, or all known tests, and add them to our queue
		if (request.include) {
			request.include.forEach(test => queue.push(test));
		} else {
			this.testController.items.forEach(test => queue.push(test));
		}

		// For every test that was queued, try to run it. Call run.passed() or run.failed().
		// The `TestMessage` can contain extra information, like a failing location or
		// a diff output. But here we'll just give it a textual message.
		while (!this.stoppingTests && queue.length > 0 && !token.isCancellationRequested) {
			const test = queue.shift()!;

			// Skip tests the user asked to exclude
			if (request.exclude?.includes(test))
				continue;

			// Check if there are children
			if (test.children.size > 0) {
				// Run child tests
				const tmp: vscode.TestItem[] = [];
				test.children.forEach(item => tmp.push(item));
				queue.unshift(...tmp);
			}

			// Get "real" unit test
			const ut = UnitTestCaseBase.getUnitTestCase(test) as UnitTestCase;
			if (!(ut instanceof UnitTestSuite)) {
				let timeoutHandle;
				this.timedOut = false;
				this.currentTestStart = Date.now();
				try {
					// Setup the test config
					if (this.debug)
						await this.setupDebugTestCase(ut);
					else
						await this.setupRunTestCase(ut);
				}
				catch (e) {
					// Output error
					vscode.window.showErrorMessage(e.message);
					// Leave loop
					break;
				}
				try {
					// Set timeout
					if (!this.debug) {
						const toMs = 1000 * Settings.launch.unitTestTimeout;
						timeoutHandle = setTimeout(() => {
							this.timedOut = true;
							// Failure: Timeout. Send a break.
							Remote.pause();
						}, toMs);
					}
					// Run the test case
					this.currentTestItem = test;
					this.currentTestStart = Date.now();
					run.started(test);

					//await Utility.timeout(1000);
					await this.runTestCase(ut);
				}
				catch (e) {
					if (!this.stoppingTests) {
						// Some unspecified test failure
						const pc = Remote?.getPCLong();
						this.testFailed(e.message, pc);
					}
				}
				finally {
					clearTimeout(timeoutHandle);
					this.currentTestItem = undefined;
				}
			}
		}

		// Make sure to end the run after all tests have been executed:
		run.end();

		// Stop debugger
		if (Remote) {
			await this.stopUnitTests();
		}

		// Test run finished
		this.stoppingTests = true;
		this.testRunActive = false;
	}


	/**
	 * Sets up the test case.
	 * Goes up the parents until it finds the unit test config.
	 * Then (if not yet done before) it starts up the Remote to be
	 * able to execute a single test case.
	 */
	protected static async setupRunTestCase(ut: UnitTestCase) {
		// Check for parent config
		const testConfig = ut.getConfigParent();
		if (!testConfig)
			throw Error("No test config found.");
		// Check if already setup
		if (this.testConfig == testConfig)
			return;
		this.testConfig = testConfig;

		// Terminate any probably runnning instance
		await this.terminateRemote();
		this.debugAdapter = undefined as any;

		// Prepare running of the test case

		// Get unit test launch config
		const configuration = this.testConfig!.config;

		// Setup root folder
		const rootFolder = this.testConfig!.wsFolder;
		Utility.setRootPath(rootFolder);

		// Setup settings
		Settings.launch = Settings.Init(configuration, rootFolder);
		Settings.CheckSettings();

		// Reset all decorations
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

					if (this.debug) {
						// After initialization vscode might send breakpoint requests
						// to set the breakpoints.
						// Unfortunately this request is sent only if breakpoints exist.
						// I.e. there is no safe way to wait for something to
						// know when vscode is ready.
						// So just wait some time:
						if (Settings.launch.startAutomatically)
							await Utility.timeout(500);
					}

					// Initialize
					await this.initUnitTests();

					// End
					resolve();
				}
				catch (e) {
					// Some error occurred
					reject(e);
				}
			});

			Remote.on('coverage', coveredAddresses => {
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
				reject(e);
			});


			// Connect to debugger.
			try {
				await Remote.init();
			}
			catch (e) {
				// Some error occurred
				reject(e);
			};
		});
	}


	/**
	 * Sets up the test case.
	 * Goes up the parents until it finds the unit test config.
	 * Then (if not yet done before) it starts up the debug adapter.
	 */
	protected static async setupDebugTestCase(ut: UnitTestCase): Promise<void> {
		// Check for parent config
		const testConfig = ut.getConfigParent();
		if (!testConfig)
			throw Error("No test config found.");
		// Check if already setup
		if (this.testConfig == testConfig)
			return;
		this.testConfig = testConfig;

		// Terminate any probably running instance
		await this.terminateRemote();

		// Setup root folder
		Utility.setRootPath(testConfig!.wsFolder);

		// Start debugger
		this.debugAdapter = undefined as any;
		try {
			const configName = testConfig!.testItem.label;
			this.debugAdapter = await DebugSessionClass.unitTestsStart(configName);
		}
		catch (e) {
			throw e;
		}


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

			await Utility.timeout(500);	// TODO: Remove one wait

			// Init unit tests
			await this.initUnitTests();
			// Start unit tests after a short while
			await Remote.waitForBeingQuietFor(1000);
		}
		catch (e) {
			throw e;
		}
	}


	/**
	 * Checks if the debugger is active. If yes terminates it and
	 * executes the unit tests.
	 */
	protected static async terminateRemote(): Promise<void> {
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
		this.testCaseSetup = true;
		this.currentTestFailed = false;
		await this.execAddr(this.addrStart);
		if (this.currentTestFailed)
			return;

		// If not 'startAutomatically' then set a BP at the start of the unit test
		const utAddr = this.getLongAddressForLabel(ut.utLabel);
		let breakpoint;
		if (this.debug && !Settings.launch.startAutomatically) {
			// Set breakpoint
			breakpoint = {bpId: 0, filePath: '', lineNr: -1, address: utAddr, condition: '', log: undefined};
			await Remote.setBreakpoint(breakpoint);
		}

		// Start the unit test
		this.testCaseSetup = false;
		await this.execAddr(utAddr);

		// Remove breakpoint
		if (breakpoint) {
			await Remote?.removeBreakpoint(breakpoint);
		}
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
	 * Executes the sub routine at 'addr'.
	 * Used to call the unit test initialization subroutine and the unit
	 * tests.
	 * @param address The (long) address to call.
	 */
	protected static async execAddr(address: number) {
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
		if (this.testCaseSetup) {
			if (Remote instanceof ZSimRemote) {
				const zsim = Remote as ZSimRemote;
				zsim.customCode?.reload();
			}
		}

		// Run or Debug
		await this.RemoteContinue();
	}


	/**
	 * Starts Continue directly or through the debug adapter.
	 */
	protected static async RemoteContinue(): Promise<void> {
		// Init
		Remote.startProcessing();
		// Run or Debug
		if (this.debugAdapter) {
			// With vscode UI
			this.debugAdapter.sendEventContinued();
			// Debug: Continue
			const finish = new Promise<void>((resolve, reject) => {
				new PromiseCallbacks<void>(this, 'waitOnDebugger', resolve, reject);
			});
			await this.debugAdapter.remoteContinue();
			Remote?.stopProcessing();
			// Note: after the first call to debugAdapter.remoteContinue the vscode will take over until dbgCheckUnitTest will finally return (in 'finish')
			await finish;
			console.log();
		}
		else {
			// Run: Continue
			let reasonString =  await Remote.continue();
			Remote.stopProcessing();
			// There are 2 possibilities to get here:
			// a) the test case is passed
			// b) the test case stopped because of an ASSERTION or WPMEM, i.e. it is failed
			const pc = Remote.getPCLong();
			// OK or failure
			if (pc == this.addrTestReadySuccess) {
				// Passed
				this.testPassed();
			}
			else {
				// Failure
				if (this.timedOut) {
					reasonString = "Timeout (" + Settings.launch.unitTestTimeout + "s)";
				}
				this.testFailed(reasonString, pc);
			}
		}
	}


	/**
	 * Checks if the test case was OK or a fail.
	 * Or undetermined.
	 * There are 3 possibilities to get here:
	 * a) the test case is passed
	 * b) the test case stopped because of an ASSERTION, i.e. it is failed
	 * c) a user breakpoint was hit or the user paused the execution
	 * The c) is the ricky one because the Promise is not fulfilled in this situation.
	 * @param breakReasonString Contains the break reason, e.g. the assert.
	 * @returns true If test case has been finished.
	 */
	public static dbgCheckUnitTest(breakReasonString: string): boolean {
		Utility.assert(this.waitOnDebugger);
		// Check if test case ended successfully or not
		const pc = Remote.getPCLong();
		// OK or failure
		if (pc == this.addrTestReadySuccess) {
			// Success
			if (!this.currentTestFailed)
				this.testPassed();
			this.waitOnDebugger!.resolve();
			return true;
		}
		else {
			// The pass/fail is distinguished by the breakReasonString text.
			if (breakReasonString?.toLowerCase().startsWith('assertion')) {
				this.testFailed(breakReasonString, pc);
			}
			return false;
		}
	}


	/**
	 * Make the test item fail. Create a TestMessage. I.e. an error occurred now create the failure
	 * which contains the line number.
	 * Note: vscode will only display the first of the test messages.
	 * @param reason The text to show.
	 * @param pc The associated address for file/line information.
	 */
	protected static testFailed(reason?: string, pc?: number) {
		const testMsg = new vscode.TestMessage(reason || "Failure.");
		if (pc != undefined) {
			const position: SourceFileEntry = Labels.getFileAndLineForAddress(pc);
			if (position) {
				const uri = vscode.Uri.file(position.fileName);
				const line = position.lineNr;
				const range = new vscode.Range(line, 10000, line, 10000);
				testMsg.location = new vscode.Location(uri!, range);
			}
		}
		// "Normal" test case failure
		this.currentTestRun?.failed(this.currentTestItem!, testMsg, Date.now() - this.currentTestStart);
		// Remember
		this.currentTestFailed = true;
	}


	/**
	 * Make the test item pass.
	 */
	protected static testPassed() {
		// Don't allow passing during test case setup
		if (!this.testCaseSetup) {
			this.currentTestRun?.passed(this.currentTestItem!, Date.now() - this.currentTestStart);
		}
	}


	/**
	 *  Command to cancel the unit tests.
	 *  Called from the debug adapter.
	 */
	public static async cancelUnitTests(): Promise<void> {
		this.stoppingTests = true;
		this.waitOnDebugger?.reject(Error("Unit test cancelled."));
	}


	/**
	 * Stops all unit tests.
	 * Called by the test runner.
	 */
	protected static async stopUnitTests(): Promise<void> {
		// Async
		return new Promise<void>(async resolve => {
			this.stoppingTests = true;

			// Call reject if on.
			this.waitOnDebugger?.reject(Error("Unit tests cancelled"));

			// Wait a little bit for pending messages (The vscode could hang on waiting on a response for getRegisters)
			if (this.debugAdapter) {
				//Remote.stopProcessing();	// To show the coverage after continue to end
				//this.debugAdapter.sendEventBreakAndUpdate();
				//await Utility.timeout(1);
				await Remote?.waitForBeingQuietFor(300);
			}

			// For reverse debugging.
			StepHistory.clear();

			// Exit
			await Remote?.terminate();

			// Remove event handling for the emulator
			Remote?.removeAllListeners();

			resolve();
		});
	}

}

