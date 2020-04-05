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
