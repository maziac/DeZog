# Unit Tests

~~~
┌──────────────────────────────────────────────┐
│                                              │
│                 Z80UnitTests                 │
│                                              │
└──────────────────────────────────────────────┘
     ▲                 ▲                  ▲
     │                 │                  │
     ▼                 ▼                  ▼
┌─────────┐    ┌───────────────┐    ┌──────────────────┐
│         │    │               │    │                  │
│ Labels  │    │    Remote     │    │   DebugAdapter   │
│         │    │               │    │                  │
└─────────┘    └───────────────┘    └──────────────────┘
                       ▲
                       │
                       ▼
               ┌──────────────┐
               │              │
               │ Z80Registers │
               │              │
               └──────────────┘
~~~

Z80UnitTests is a static class that controls the DebugAdapter and Emulator.
It basically
1. Reads the list file to find the unit test labels. Those beginning with "UT_".
2. Loads the binary into the emulator.
3. Manipulates memory and PC register to call a specific unit test.
4. Loops over all found unit tests.

While the unit tests are executed the coverage is determined.
While executing a trace log is written. After the test the trace file is evaluated.
With the disassembler it is determined what code in the binary and in the file are really code lines (and not data).
This code is evaluated against the trace log. Addresses that are not in the trace log are "uncovered".

Coverage is handled differently if debugging a testcase or if the testcases are simply run.

If all testcases are run (not debugged) a summary is written afterwards with all OK and failed testacses.
It will also list how many lines of the file are "uncovered": as source code lines and also as percentage.

If a specific (or several) testcases are debugged no summary is written but the covered lines are shown in the gutter.


# Coverage

While the unit tests are executed the ZEsarUX cpu-code-coverage is enabled.
This records all executed addresses.
When the unit tests are passed (or on every break) the code coverage is read, the addresses are converted to source code locations and the vscode is told to mark (decorate) the covered lines.


======================

# New Z80 Unit Tests

# TestRunner / Z80UnitTestRunner

## History

Since v1.59 (2021) vscode implements an own testing api.
Therefore the separate z80-unit-test extension was abandoned and integrated into DeZog.

## Design

There are basically 2 classes:
- Testrunner: Handles the basic communication with vscode and examines which (test) files have been updated. I.e. discovers tests and executes tests.
- Z80UnitTestRunner: Extends the class and handles the Z80 labels and communication with the Remote.

And there are basically 2 modes:
- Test Discovery
- Test Execution


### Test Discovery

The test case discovery works in a few steps.
First the launch.json is checked for changes (file + document changes).
From the launch.json the list of sld/list files is read.
These files are watched for file and document changes.
If one of those files changes the list files are read to find the Unit Test case labels from the assembler sources.
For each found test case label a test case is returned to vscode.

~~~puml
hide footbox
participant vscode as "vscode\nTestController"
participant Z80UnitTestRunner
participant RootTestSuite
participant UnitTestSuiteLaunchJson
participant UnitTestSuiteConfig
participant UnitTestSuite
participant UnitTestCase


== Init ==
Z80UnitTestRunner -> RootTestSuite: constructor
activate RootTestSuite
vscode <- RootTestSuite: createTestController
activate vscode

== First opening of test cases ==
vscode -> RootTestSuite: resolveTests(undefined)
note over RootTestSuite: Create FileWatcher for\nall workspaces (launch.json)
RootTestSuite -> UnitTestSuiteLaunchJson: constructor
activate UnitTestSuiteLaunchJson

note over UnitTestSuiteLaunchJson: Create a UnitTestSuiteConfig for\neach unit test configuration\nin launch.json
UnitTestSuiteLaunchJson -> UnitTestSuiteConfig: constructor
activate UnitTestSuiteConfig

note over UnitTestSuiteConfig: Get and watch all list files
note over UnitTestSuiteConfig: Create all labels and\nsearch for "UT_" labels
note over UnitTestSuiteConfig: Create test suites and\ntest cases from the labels

UnitTestSuiteConfig -> UnitTestSuite: constructor
activate UnitTestSuite
UnitTestSuiteConfig -> UnitTestCase: constructor
activate UnitTestCase
~~~


### Test Execution

For test execution the list of test cases to execute is passed from vscode to the TestRunner which executes the testcases.
Either in Run or in Debug mode.

~~~puml
hide footbox
title Continue
participant vscode as "vscode\nTestController"
'participant TestRunner
participant Z80UnitTestRunner
participant runItem
'participant DebugAdapter
participant Remote

== Init ==
note over Z80UnitTestRunner: create profiles for Run and Debug

vscode <- Z80UnitTestRunner: createRunProfile('Run')
vscode <- Z80UnitTestRunner: createRunProfile('Debug')

Z80UnitTestRunner -> Remote: terminate
note over Z80UnitTestRunner: Settings.Init\nLabels.init
Z80UnitTestRunner -> Remote: readListFiles
Z80UnitTestRunner <- Remote: initialized

== Test Case started by User ==
alt Run profile
     vscode -> Z80UnitTestRunner: testRunHandler(TestItem[])
     vscode <- Z80UnitTestRunner: createTestRun
     vscode --> runItem
     activate runItem
     loop testItem : TestItem[]
     Z80UnitTestRunner -> runItem: started(testItem)
     Z80UnitTestRunner -> Z80UnitTestRunner: runTestCase(testItem)

     Z80UnitTestRunner -> Z80UnitTestRunner: execAddr
     Z80UnitTestRunner -> Z80UnitTestRunner: RemoteContinue
     Z80UnitTestRunner -> Remote: continue
     Z80UnitTestRunner <-- Remote
     Z80UnitTestRunner -> Z80UnitTestRunner: onBreak

     Z80UnitTestRunner -> runItem: passed/failed(testItem)
     vscode <- runItem: update UI
end

Z80UnitTestRunner -> runItem: end
deactivate runItem

~~~



## Required tests


Test for zsim, zrcp, cspect and zxnext.

Test groups of test cases:

- run single test case
- run group of test
- run complete configuration
- run complete launch.json (several configs)
- run multiroot tests
- debug single test case
- debug group of test
- debug complete configuration
- debug complete launch.json (several configs)
- debug multiroot tests

Do these testing in following configurations:
- All test cases pass
- Run all with some failing test cases
     - run: should run til the end and show failures at the end
     - debug:
          - should stop at the first failure. Test case should be marked as failed.
          - **Important:** a 'continue' should not mark the test case as passed.
- Have Breakpoints in the sources
     - run: should not affect
     - debug: should stop at the BP. It should be possible to continue and stop at the next BP. Or run to the end. A BP should not affect the pass/fail status.
- An test case with an endless loop.
     - run: should timeout.
     - debug: should run forever (no timeout) until user presses 'pause'.
- An error in the UNITTEST_INITIALIZE code
     - run: should make all test cases fail.
     - debug: should fail at first execution. Break at (user) initialization code.
- Terminate:
     - run/debug: The test cases should be interruptable. (Exception: zxnext)
          - Manual termination of long running tests. Use long tests or add a Utility.timeout to the test case to fake long tests.
          - Disconnect socket.




# Unit tests written in java script

I wanted to setup unit tests from javascript and just execute the z80 subroutine (that should be tested) from that javascript code.

The sources here reflect this attempt.
z80unittests/testrunner.ts: The main test execution/discovery.

Although it did work I discovered some drawbacks with this approach and in the end decided not to follow this way.

Advantages:

- the memory comparison could be done easier
- it would have been possible to stimulate also the ports (zsim)
- Uses less Z80 resources (program and memory)
- For simple tests no additional build target would be required

Disadvantages:

- Inconvenient: To get the value of a label I need to call an extra function. In Assembler I can use the label directly.
- Many function calls in js require an 'await'. This would be error prone.
- The user has to learn js syntax.
- The js has to be executed in worker threads, otherwise an infinite loop can hang the complete dezog.
- User must now specify topOfStack in launch.json.
- From a reference in the js code to a label you can't jump directly to the label/function like it is possible in assembler unit tests with ASM-code-lens.
- You still need a special configuration/build for testdata. To read and write testdata. Alternatively one could follow the following strategies:
  - small memory areas (some bytes) could be allocated on the stack.
  - When not writing to the screen one can use the area.
  - If you don't use ROM routines you can map RAM memory into the ROM area.
  - Or you can use code area that you know for sure is not in use, but problematic if there are WPMEMs set.
- User can't debug the js code. I.e. he can't look at intermediate values.
