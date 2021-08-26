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
title Continue
participant vscode as "vscode\nTestController"
participant TestRunner
participant Z80UnitTestRunner
'participant DebugAdapter
participant Remote

== Init ==
note over Z80UnitTestRunner: watch for launch.json document\nor file changes
vscode <- Z80UnitTestRunner: createFileSystemWatcher
vscode <- Z80UnitTestRunner: onDidOpen/ChangeTextDocument

== Idle ==
alt launch.json document/file changed
     alt launch.json file changed
          vscode -> Z80UnitTestRunner: launchJsonFileChanged
     end
     vscode -> Z80UnitTestRunner: launchJsonDocumentChanged
     note over Z80UnitTestRunner: Read launch.json\nand get sld/list\nfiles
     note over Z80UnitTestRunner: watch for sld/list document\nor file changes
     vscode <- Z80UnitTestRunner: createFileSystemWatcher
     vscode <- Z80UnitTestRunner: onDidOpen/ChangeTextDocument
end

alt sld/list document or file changed
     alt sld/list file changed
          vscode -> Z80UnitTestRunner: sldListFileChanged
     end
     vscode -> Z80UnitTestRunner: sldListDocumentChanged
     note over Z80UnitTestRunner: Read launch.json\nand the sld/list files
     note over Z80UnitTestRunner: Obtain the Unit Test labels\nand create test items
     vscode <- Z80UnitTestRunner: createTestItem
end
~~~


### Test Execution

For test execution the list of test cases to execute is passed from vscode to the TestRunner which executes the testcases.
Either in Run or in Debug mode.

~~~puml
hide footbox
title Continue
participant vscode as "vscode\nTestController"
participant TestRunner
participant Z80UnitTestRunner
participant runItem
'participant DebugAdapter
participant Remote

== Init ==
note over Z80UnitTestRunner: create profiles for Run and Debug

vscode <- Z80UnitTestRunner: createRunProfile('Run')
vscode <- Z80UnitTestRunner: createRunProfile('Debug')

== Test Case started by User ==
alt Run profile
     vscode -> Z80UnitTestRunner: testRunHandler(TestItem[])
     vscode <- Z80UnitTestRunner: createTestRun
     vscode --> runItem
     activate runItem
     loop testItem : TestItem[]
     Z80UnitTestRunner -> runItem: started(testItem)
     Z80UnitTestRunner -> Z80UnitTestRunner: runTestCase(testItem)
     Z80UnitTestRunner -> runItem: passed/failed(testItem)
     vscode <- runItem: update UI
end

Z80UnitTestRunner -> runItem: end
deactivate runItem

~~~
