# Changelog

# 1.4.8
- Fixed white spaces in loading for zrcp (ZEsarUX).

# 1.4.7
- Added donate button.

# 1.4.6
- Removed double timer for command/response.
- Added "What's New".

# 1.4.5
- Version to start beta testing "zxnext".

# 1.4.4
- remoteType: "serial" renamed to "zxnext".
- Allowing to set/remove breakpoints during debugged program being run for cspect, zsim and zxnext.

# 1.4.3
- Support for DZRP 1.6.0. CMD_CLOSE implemented.
- startAutomatically with z80 unit tests improved.

# 1.4.2
- Support for DZRP 1.4.0: Changed numbering.
- ZXNext remote debugging working. Major changes to DZRP.
- Breakpoints at address 0x0000 fixed.
- Introduced TC_END to Unit tests.
- New eval '-dasm' command.

# 1.4.1
- Support for DZRP 1.2.0: CMD_SLOT.

# 1.4.0
- sjasmplus "--lstlab" labels are parsed now.
- Support for DZRP 1.1.0
- Formatting of Z80 flags changed.
- Command dezog.cancelUnitTests added.

# 1.3.1
- Corrected display of memory slots for zsim and cspect.
- Removed 'replaceAll'.
- Fixed issue #24: (sjasmplus) Watch expression evaluates incorrect value for label within IFDEF

# 1.3.0
- Fix for ZEsarUX history spot.
- Merged develop branch into master.

# 1.2.8
- skipInterrupt setting moved to zrcp.
- cspect:
  - warning if codeCoverabeEnabled==true.
  - error if Z80 unit tests are started with cspect.
- Fixed ZEsarUX Z80 unit tests.
- Fix for cspect HL', I, R and IM registers.

# 1.2.7
- Watchpoints disabled for CSpect.
- Enabled "cspect" support.

# 1.2.6
- Z80 unit tests fixed.
- Sprites/patterns view:
	- Grayscale palette exchanged by false colors palette.
	- Alternating colors for rows.
	- Visibility of anchor sprite is now taken into account.
- zrcp: Improved stability of socket connection.
- Disabled "cspect" support.

# 1.2.5
- Improved zsim performance when stepping over macro.
- Sprites/patterns view:
	- now also able to show 4 bit color pattern sprites.
	- improvements for relative sprites (but not fully working yet)

# 1.2.4
- cspect:
	- Logpoints working.
	- StepOut corrected.
- Fixed: Update of word register in case of byte register change (and vice versa).

# 1.2.3
- Fixed: crash when switching form ZEsarUX to CSpect.
- Manual change of PC (or SP) will update the shown file.
- zsim: cpu writing to ROM does not change the contents anymore.
- zsim: simulator exchanged. Is less buggy and 30% performance increase.
- cspect:
  - conditional breakpoints working.
  - watchpoints added.

# 1.2.2
- CSpect: timeout error if no response received.
- Fixed: "TypeError: cannot read property 'getObject' of undefined"
- ZEsarUX: Sprite palette colors corrected.
- CSpect: Improved RST 08 StepOver/Into handling.
- General stepOver improvement: stepOver now steps over whole line, e.g. macros, fake instructions, several instruction on one line.

# 1.2.1
- Renamed "Memory Pages" to "Slots".
- Added forgotten Z80N instructions.
- Fixed bug in sprite patterns display.
- Log of assertions now under 'DeZog' output.
- Fixed bug with repetitive StepIntos (and others) via key (F11).

# 1.2.0
- Basic CSpect support.

# 1.1.3
- Preparation for market place release.

# 1.1.2
- Small fix and cleanup.
- zsim:
  - "tbblueMemoryManagementSlots": slots can be read now.
  - Simulator view closed now after stopping debugging a unit test.

# 1.1.1
- 'movePCtoCursor' back in right-click menu.
- "z88dkMapFile" parameter: better support for z88dk labels.

# 1.1.0
- zsim:
	- Optimized handling of HALT instruction.
	- Added "tbblueMemoryManagementSlots".
	- New values for "visualMemory": "none", "64K", "ZX48", "ZX128" and "ZXNEXT"
	- Added "Z80N" instructions.
	- "vsyncInterrupt" introduced to enable the 20ms interrupt.

# 1.0.2
- Documentation update.
- Z80 unit tests fixed.
- Decorations (coverage, history spot, etc.) on disassembly improved.

# 1.0.1
- zsim: USR0 mode for 128K Spectrum.

# 1.0.0
- This release is meant for the market place to substitute z80-debug.

# 0.13.7
- zsim: Coupled ula screen update and interrupt.
- zrcp: fixed timeout for step-over/out.

# 0.13.6
- Refactoring: CallSerializer finally removed (!)
- "zrcp.loadDelay" launch.json parameter added. Default value is 100ms for Windows, 0ms for others. Adds an additional delay before loading the Z80 program as a workaround for the initial zesarux crash.
- debug_wait_before and debug_wait_after removed.
- zsim:
	- Code coverage can be disabled now.
	- More configurable. 'machine' removed but added:
		- loadZxRom
		- zxKeyboard
		- visualMemory
		- ulaScreen
		- memoryPagingControl

# 0.13.5
- zsim.cpuLoadInterruptRange introduced. Change the range for the average calculation.
- ZEsarUX: launch.json parameters "debug_wait_before" and "debug_wait_after" (in ms) are more accurate now.

# 0.13.4
- Internal simulator
	- Fix: Write-watchpoint was indicated as read-watchpoint.
	- Fix: corrected "LD (IX/IY+d),n".
	- Performance improvement
- ZEsarUX: automatic loading enabled again. But added launch.json parameters to wait before and after loading ("debug_wait_before" and "debug_wait_after" in ms).
- Visual update corrected after MovePcToCursor.

# 0.13.3
- PC jumps to correct location after state restore.
- Fixed 'continue' for ZEsarUX.
- ZEsarUX: automatic loading of the sna file disabled. Use "-e smartload full_path_to_your_sna_file" instead.

# 0.13.2
- Fix for "Fix including nested directories".
- Step history.
- A lot of refactoring regarding history/reverse debugging.
- True cpu history for internal simulator.

# 0.13.1
- Code coverage for internal simulator.
- Simulator: A StepInto will now do a single step also for LDIR, LDDR, CPIR, CPDR and HALT.

# 0.13.0
- New command: "clearAllDecorations".
- Command removed "clearCodeCoverage".

# 0.12.4
- remoteType "zxsim" renamed to "zsim".
- Simulator:
	- CPU load for simulator added.
	- Visual memory added.
	- loadObj supported.
	- state save/restore added
- ZEsarUX: using zsf for save state/restore.

# 0.12.3
- launch.json changes:
	- "zhostname" and "zport" removed. Use "hostname" and "port" under "zrcp" instead.
	- Configurations for "zxsim" ("machine") and "serial" ("baudrate", "port") added.
- Included rom in simulator.
- Added IM register.

# 0.12.2
- Package 'SerialPort' removed temporarily.

# 0.12.1
- Added simulator remoteType: 'zxsim'.
- Changed remoteType 'zxnext' to 'serial'.
- Ssimulation of ZX Spectrum keys.

# 0.12.0
- Changed remoteType 'zesarux' to 'zrcp'.
- Fixed bug "Debugging with source files is impossible when there are ORGs with non-increasing addresses"
- Added a Z80 simulator to fake the serial connection (not usable yet).
- Added remoteType 'zxnext' (not usable yet).

# 0.11.4
- Design document added to describe the process of adding a new Remote.

# 0.11.3
- Added remoteType to package.json.
- Fixed bug with callstack and RST.
- Fixed bug with stack for pushed values on top level.
- Fixed bug if no unit tests were configured.
- Label evaluation: Allow and evaluate "$" in EQU.
- Fixed bug with wrong order in call stack when disassembling.
- A lot of refactoring (handler -> Promises).

# 0.11.2
- More refactoring.

# 0.11.1
- Regrouping files in folders.

# 0.11.0
- The z80-debug adapter has been renamed to "DeZog".
- All references have been changed. Instead of "z80-debug" now "dezog" is used to refer to internal functions.

# 0.10.0
- Major redesign around Z80Registers to make it easier to add other remotes like a real ZXNext HW.

# 0.9.7
- Different way to step-over (SP).

# 0.9.6
- spotCount added. A list of instructions is highlighted that were executed just before and just after the current one.
- Fixed extended and real stack.
- Fix for coverage display after unit tests stopped.
- Fix for forward step during reverse debug (isCallOpcode corrected).
- Suppressed "Already enabled" errors.
- Prepared breakpoint decorations.

## 0.9.5
- Reverse debugging: Conditional breakpoints.
- Fixed moving of PC to cursor during reverse debugging.
- Changed reverse debug decoration to blue background due to performance reasons.

## 0.9.4
- Reverse debugging available.
	- Uses ZEsarUX cpu-history zrcp command.
	- Breakpoints (without condition) are evaluated.
- Fixed bug in disassembling ZX Next instruction PUSH nn.

## 0.9.3-2
- Fixed path problem for windows.

## 0.9.3-1
- Allows parsing of sjasmplus labels without ":".

## 0.9.2
- Fixed bug in register parsing.
- Changed to use ZEsarUX 'cpu-code-coverage' for decorating code coverage.
- Changed to use ZEsarUX 'extended-stack' for displaying the callstack. This makes it possible to highlight interrupts in the callstack.
- Fixed bug in sjasmplus parser (fake instructions).

## 0.9.1
- Fixed error in unit test stack label

## 0.9.0
- Unit Tests for assembler sources!
- Supports new enhanced breakpoint condition format of ZEsarUX.
- new setting 'loadObjs' to load object files.
- Requires ZEsarUX 8.0.

## 0.8.1
- Memory pages are shown in VARIABLES section.

## 0.8.0
- Support for sjasmplus v1.11.0 list file format.
- Fix of 'include' parsing for z88dk.

## 0.7.1
- Debug Console: Display of T-states while executing instructions or sub routine calls.
- Disassembler:
	- Corrected opcode "SUB A,s" to "SUB s".
	- Added new Z80N barrel shift and "JP (C)" opcodes.
	- Corrected "JP (IXY)".
- Fixed a bug in "startAutomatically".
- Corrected file association for z80asm.
- Default assembler changed to sjasmplus.
- Break reason now also shown at first breakpoint after launch.
- LOGPOINTs added.
- WPMEM now evaluates expression not just labels.
- Adjusted to changed sjasmplus list file format.
- Corrected association of list file line numbers with addresses.


## 0.7.0
- New assembler listings supported: "sjasmplus".
- Better support for z88dk-z80asm.
- New parameters "asm" and "srcDirs".
- '-eval' now evaluates also label names with a starting "_".
- Dropped support for label files. The labels are extracted anyway from the list file.
- Watches allow now more complex expressions not only labels. Now e.g. "dlistw+3" is supported.
- Changed appearance of memory viewer: Added a column header and a legend for the register colors.


## 0.6.2
- Debugging can now start immediately after loading the snapshot file. Requires ZEsarUX 7.2.
- Setting breakpoints from vscode without interrupting a running program.
- "startAutomatically" launch option working now.
- Option "loadSnap" replaced by "load". "load" allows for loading .sna and .tap files.
- "wpmem"/"assert" now disabled by default. It can be turned on manually or in the launch.json.
- ASSERTs now work similar to WPMEM. They are not combined with vscode breakpoints anymore.
- log configuration moved to the launch settings.
- socketTimeout configurable.

## 0.6.1
- Fixed Event-Stream vulnerability.
- Added breakpoint conditions that are translated into the ZEsarUX condition syntax.
- Added parsing for ASSERTs.
- New commands: "ASSERT enable|disable|status" (still experimental)
- "state save" now persistent.

## 0.6.0
- Changed handling of code areas without sources. These areas are now automatically disassembled.
- Disassembly done with z80dismblr.
- Disassembly option to deal with special 'rst 8' esxdos convention ("esxdosRst":true)
- Settings for "disassemblies" removed, superfluous.
- Internal logging disabled.
- RST improvements: call stack, step-over, step-out.

## 0.5.1
- Fixed hovering on IXL, IXH, IYL and IYH
- Renamed "resetOnStart" to "resetOnLaunch"
- New launch.json option "commandsAfterLaunch" to execute certain emulator commands right after the program-to-debug has been loaded.
- Changed 'Restart' behaviour to overcome hang on restart.

## 0.5.0
- Uses new (ZEsarUX 7.1) and fast memory breakpoints for WPMEM watchpoints, see https://github.com/maziac/z80-debug/blob/master/documentation/Usage.md#wpmem
- Use of z80dismblr for disassembly.
- Improved disconnection handling.
- New command "-sprites" displays the sprites in a new window.
- New command "-patterns" displays the sprite patterns in a new window.
- New option for "-exec": "-view" redirects the output from console to a new view.
- Experimental implementation for "-state save|restore".

## 0.4.1
- Corrected setting of unverified breakpoints.
- Fixed error when fetching disassemblies.

## 0.4.0
- Settings cleaned up.
- Changing the program counter is now directly reflected in the UI.
- Memory viewer got an additional ASCII field.
- New debug command "-label" to output the number for a label.
- labels and constants are now also extracted from the asm files. I.e. in most cases it shouldn't be required to add a labels file anymore.
- Formatting distinguishes now between 'small values' and 'big values'.
- Basic support for z88dk z80asm.
- Improved documentation of the list files.

## 0.3.1
- Program Counter can be changed via menu.

## 0.3.0
- First release to market place.

## 0.2.0
- WPMEM: Persistent memory watchpoints added.
- Watches: now the size and type can be manually added.
- A memory viewer/editory has been added.
- console command to evaluate expressions/labels.

## 0.1.2
- Setting of breakpoints now also works even if mborik.z80-macroasm (or other Z80 extensions) are installed as well.

## 0.1.1
- Register parsing corrected.

## 0.1.0
Initial version.
Functionality:
- supports ZEsarUX emulator
- reads .list and .labels files
	- supports stepping through source code
	- either in .list file or in .asm files
- step-over, step-in, step-out, continue, pause
- display of
	- disassembly
	- Z80 registers
	- stack
	- callstack
- changing of Z80 registers from vscode IDE
- labels
	- number-label resolution, i.e. along with numbers also the corresponding label is displayed
- hovering
	- registers: reveals its contents and associated label
	- labels: reveals their value
- watches of labels
- formatting registers
	- customizable formatting for registers, e.g. format as hex and/or decimal and/or label etc.
	- different formatting for registers while hovering