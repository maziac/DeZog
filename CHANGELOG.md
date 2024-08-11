# Changelog
# 3.5.0
- zsim:
  - Simulation of ZX81
  - Removed "vsyncInterrupt". A VSYNC interrupt is now generated if the Spectrum ULA is enabled.
  - "ulaScreen":
    - Type changed from boolean to 'spectrum' | 'zx81'.
  - Z80 CPU simulation fix: HALT instruction: r is now incremented on each instruction.
  - New debug command, "-ml address filepath", to load binary data into the memory.
  - Fixed setting of A' from the UI.

# 3.4.1
- zsim: Removed annoying logging.

# 3.4.0
- zsim:
  - Fixed instruction time display of HALT.
  - Fixed FLASH frequency from 1/625ms to 1/640ms.
  - Simulation of 'zxnDMA'.
  - Changed calculation of cpu load (moved to UlaScreen).
- Logging:
  - Settings: 'dezog.log.customCode' changed to 'dezog.log.zsim.customCode'.
  - Added new log for the zxnDMA under 'dezog.log.zsim.hardware'.
  - Fixed problem with disabling 'dezog.log.zsim.customCode'.

# 3.3.4
- Fix for #126: Data misalignment for ZX128K SNA with Active BANK6 in zsim. Banks in SNA loading fixed.

# 3.3.3
- Added palette command "dezog.serialport.test" to test the serial connection.

# 3.3.2
- Fixed version numbering parsing for zesarux.
- Removed human.join package.

# 3.3.1
- New setting for launch.json/"zxnext": "timeout". If there are connection problems try increasing this value (the default has been increased from 1 to 5 seconds).
- Sonar linting.
- Improved zesarux disconnect for unit tests.
- Improved performance of search in memory dump view.

# 3.3.0
- ZEsarUX:
	- Support for ZEsarUX version 10.3
	- Closes all ZEsarUX menus (close-all-menus) when a debug session starts
- Improvements in disconnection handling.
- launch.json: 'loadObjs' 'start' also supports labels.
- ZXNext: Requires now dezogif v2.2.0. Older versions not supported anymore.
- Exchanged aduh95 with node-graphviz library.

# 3.2.4
- Fix for #110: Attempts to start debugging result in error Cannot evaluate 'execAddress'.
setLaunchExecAddress moved after readListFiles.
- Small fixes for unit tests and custom code.
- Experimental implementation of DZRP 2.1.0 (cmd_interrupt_on_off) for zxnextserialremote.
- debug console: "-e test ...": Tests for the serial interface.

# 3.2.3
- Fix for #109: Extension host terminated unexpectedly 3 times within the last 5 minutes. aduh95/graphviz.js has been replaced with node-graphviz.
- Changed disassembly of e.g. 'LD DE,8000.1' to 'LD DE,$8000.1'

# 3.2.2
- Fix for #108: Reverse engineering: Call Graph and Flow Chart failing to render.
- Changed disassembly "out (c),f" to "out (c),0".
- Fixed display of hex number in flowchart.

# 3.2.1
- Fix for #107: Z80CPU Error: TypeError: Cannot read properties of undefined (reading 'start').

# 3.2.0
- Changed to esbuild. Package size decreased.
- zsim: Audio fixed for chrome behavior. Note: audio is not started until the user has interacted with the simulator webview.
- Fixed an old bug when using different palettes in patterns and sprites view.
- "-address" debug console command to print out debug information about an address.

# 3.1.2
- Added option 'Break on Interrupt' in vscode's BREAKPOINTS panel. Therefore the command "-e breakinterrupt on" has been removed.
- Added missing config attributes for "z88dkv2".
- Changed "z88dkv2" parser to understand both, 4 and 6 digit addresses.
- Fixed a problem with disconnecting/reconnecting the ZX Next.
- "-dbg" debug console command added to help finding the root cause of 'unverified breakpoint' errors.
- Fixed 'step-back' in unit tests.

# 3.1.1
- zsim: sna loading now sets IFF2 and port 7FFD.

# 3.1.0
- Fixed incompatibility with vscode 1.74.

# 3.0.0
- Better reverse engineering support
	- Improved disassembly
	- Reload list file during debug session
	- Disassembly into list file format also for data
- Parsing errors/warnings (list/sld files) now reported in PROBLEM pane.
- Refactored:
	- zsim ulaScreen simulation
	- memory models
	- labels parsings
- "rootFolder" does allow now for 'wrong' capitalization (breakpoint problem)
- Restart behavior changed because of issue #91. A restart **with a new or changed configuration** will now terminate the current session without restarting.
- Break decoration color changed to red.
- "disableBanking" option removed from "sjasmplus" launch.json configuration.
- ZEsarUX:
	- "Coleco Vision" memory model added.
	- Fixed obtaining of the sprite patterns.
- zsim:
	- Added command to break on interrupt ("-e breakinterrupt on").
- Settings:
	- "esxdosRst" removed. See Reverse Engineering for a replacement.
- Switched to @vscode/debugadapter 1.57.0.
- Use of debugadapter API:
	- ASSERTIONs, WPMEMs and LOGPOINTs can now be easily enabled/disabled from the vscode BREAKPOINTS pane. The now superfluous DEBUG CONSOLE commands (-assertion, -wpmem and -logpoint) have been removed.
- debug console:
	- Fixed "-wprm".
	- "-assertion", "-wpmem" and "-logpoint" removed (see above)
	- "-label" now also prints the bank of a label.
	- "-mvw" for viewing words instead of bytes is now shown in the debug console help.
- The order of loading has been changed: First "load" (nex or sna file) then "loadObjs".
- Added "z88dkv2" parsing of .lis files for z88dk v2.2 and above.
- "mame": does support "load" for 48k sna files and "loadObjs".


# 2.7.4
- Fixed #96: srcPath appears to need an absolute path

# 2.7.3
- Fixed #95: bug in watch structures

# 2.7.2
- Fixed #94: watch block of memory show same memory position multiple times

# 2.7.1
- Fixed disassembly of instructions: INC (IX+n), DEC (IX+n), INC (IY+n) and DEC (IY+n). #93 Stepping over.

# 2.7.0
- Experimental MAME support.
- Changed name of disassembly from 'disasm.asm' to 'disasm.list'.
- zsim: Fixed IND/I instruction #89 and OUTD/I.
- Improved regex in evalExpression.
- Fixed: Running zsim with code coverage disabled (codeCoverage: false).

# 2.6.2
- Fix #85: Serial port is not locked anymore.

# 2.6.1
- Fix #84: The 'entry point' bank is now set after loading the nex file as it should be.
- Disallowed starting a 2nd instance of DeZog.

# 2.6.0
- zxnext configuration: The ZXNext can be connected via serial interface directly from DeZog. There is no need anymore to go through the extra program DeZogSerialInterface.
For this there are changes to the "zxnext" launch.json configuration.
- Log in OUTPUT panel fixed. It was not possible to enable.
- LogSocket renamed to LogTransport.

# 2.5.1
- Fixed handling of path with spaces when using loadObjs and ZEsarUX.
- Fixed path for mapFile for z88dk.
- Changed activation event to "onStartupFinished" otherwise unit tests will not show up before a debug session has been started.
- zsim: Changed order of port simulation: custom ports are executed first.
- Documentation for core 03.01.10 debugging updated.

# 2.5.0
- zsim: Added 'ZX16K' memory model, contributed by lmartorella '(zsim) Support for not-populated slots'.
- zsim: Added 'CUSTOM' memory model to define an arbitrary memory layout.
- Fixed intellisense for the launch.json.

# 2.4.3
- Unit tests: name for the workspace: removed accidentally added '.x' from the name.
- activation event changed to be more specific and don't use "*" anymore.

# 2.4.2
- Unit tests hidden if workspace does not contain a Dezog launch.json.

# 2.4.1
- Fixed opcode disassembly (Index of IX/IY and others).
- Fixed response from custom request.
- Allow multiple selections for "Disassembly at Cursor"

# 2.4.0
- Unit tests now use the vscode test API.
- The restart behavior was reverted to some degree. Now it is possible to do a re-compile of the assembler sources followed by a restart because the labels are re-read.
- Fixed memory model for ZEsarUX >= 9.2: Symptom: Breakpoints could not be set.
- "Disassembly at Cursor" now also allows to select an area that should be disassembled.
- CSpect is paused now before terminating the socket connection.
- Better peripherals simulation error messaging (now added to diagnostics).
- zxnext: Fixed stepping with ASSERTION at the same address. Stepping continued instead if ASSERTION was true.
- Fixed: an error in displaying memory arrays inside STRUCTs.
- When loading a .nex file the IM (interrupt mode) is set to 1 per default.
- Improved label parsing for z80asm list file.
- Coverage decoration now is half-transparent to allow that a selection is visible at the same time.

# 2.3.2
- Fixed #69: No code coverage on Windows.

# 2.3.1
- Fixed #65: Uncaught errors.

# 2.3.0
- Added "-addexpr/delexpr" command to add/remove expressions (variables/labels) to the VARIABLEs pane.
- Added "-mvw" to display a memory viewer that display the memory organized in words instead of bytes.
- Added "-msetb/w" command: See help ("-h"). With mset you can change single memory locations or fill a complete area.
- Fix: register colors in memory views now also updated if the memory view is not focused.
- Refactored/optimized variable references.
- Disabled disturbing vscode's default debug inline values.
- Added editor command "Disassembly at Cursor Position".
- Removed ZesaruxExt as Remote.
- Fixed #63: Help View: TOC is now scrollable.

# 2.2.5
- Fixed: Memory views were not updated if the debug session was restarted. See #59.

# 2.2.4
- Fixed #55: '??' in WATCH display
- STRUCTs smaller than 3 bytes are now recognized in the WATCHes
- Fixed #56: Watch doesn't support byte group above 2

# 2.2.3
- SP adjusted by 2 when loading a SNA file in zsim.

# 2.2.2
- Fixed the display of local and call stack if "topOfStack" is omitted.
(Nevertheless it's good practice not to omit "topOfStack" but to provide this value to DeZog).

# 2.2.1
- Fixed #51: Closing the help once prevents it from being opened again

# 2.2.0
- Thanks to bereal DeZog is now working also in multiroot workspaces.
- The Z80 unit test interface has been changed as well to support new version of z80-unit-tests that also supports multiroot workspaces now.
- CSpect supported now for Z80 unit tests.

# 2.1.7
- "Register memory View" behavior changed (see feature request #47).
	- Is not automatically started.
	- New command "-rmv" to start the register memory view.

# 2.1.6
- Start activation changed to "*". Otherwise DeZog help sidebar is empty.

# 2.1.5
- Fix: RegisterMemoryView lost content when hidden and re-displayed.
- Fix: z80asm line address association wrong when using macros.
- Allowed bullets for list in help view.
- zsim:
	- Big performance improvement (achieved by improving the decoding the ULA screen).
	- "limitSpeed": If enabled the simulated CPU performance is throttled to fit the given CPU frequency. Is enabled by default. If disabled the CPU will be simulated as fast as possible.
	- "defaultPortIn": The default value that is read if the read port is unused.
	- ULA screen now supports flash color attribute (#44).
	- "zxInterface2Joy": Enables the ports and the visuals for simulating ZX interface 2 joysticks.
	- "kempstonJoy": Enables the port for a Kempston joystick at 0x1F.
	- Joystick simulation supports attached gamepads.
	- Corrected T-states counting for HALT instruction.
	- "updateFrequency" added: the frequency the Z80 simulation view gets updated.
	- Fixed save/restore.
	- Added "zxBorderWidth" to display the simulated border.
	- Added "zxBeeper" (experimental).

# 2.1.4
- Settings names for 'logpanel's changed.
- Folder structure refactored.
- WhatsNew refactored.
- 'DeZog Help' view for sidebar added.
- Hover format overworked.
- WATCH: 'b' and 'w' removed for size. Use 1 and 2 instead.
- Smaller memory footprint.

# 2.1.3
- Regression fixed: Allow input of hex values with preceding '$'.

# 2.1.2
- WATCH: Fixed sorting of STRUCT properties.

# 2.1.1
- Fixed: WATCH: elem count was regexed wrongly.
- Fixed #42: Breakpoint on multi-instruction line.

# 2.1.0
- WATCH window: can show structured variables (sjasmplus).
- cspect, zsim: LOGPOINT, ASSERTION are printed also on step-over, step-into.
- Fixed #41: Can't see values of memory view in light theme

# 2.0.3
- Fixed #39: windows path back slash in SLD file.

# 2.0.2
- Help view added. Palette command "dezog.help".
- New "zsim" option to set the "cpuFrequency".
- "resetOnLaunch" moved to "zrcp".
- ASSERTION for ZEsarUX implemented.

# 2.0.1
- Logging to files removed. vscode does this anyway.
- sjasmplus list file support disabled.

# 2.0.0
- Fix in sendDzrpCmd: length of transmitted bytes fixed.
- Improvements to unit tests. Now ASSERTIONs show the failure values.
- "sjasmplus" configuration now uses the SLD file instead of a list file to support banking information (long addresses). If you want to use 64k addresses instead there is a new option "disableBanking".
- launch.json: deprecated option "filter" has been removed.
- "zsim": Support for custom code added. E.g. it is possible now to add custom peripheral code to implement ports. You can now write code to support peripherals within zsim.
  - Support for in-ports, out-ports and to generate an interrupt.
  - Support to create a custom UI within the ZSimulationView.
  - See [documentation/zsimPeripherals.md](documentation/zsimPeripherals.md) for more details.
	- New commands
		- out: Output to port.
		- in: input from port.
		- tstates add/set: change t-states.
	- launch.json: Added parameters for custom code:
		- customCode.debug: Enables a few debug buttons in ZSimulationView
		- customCode.jsPath: Path to the custom javascript file.
		- customCode.uiPath: Path to the custom html UI.
		- customCode.timeStep: The t-state interval for reporting.
- "zsim": changed parameters:
	- Removed: "memoryPagingControl", "tbblueMemoryManagementSlots", "loadZxRom"
	- Added: "memoryModel": "RAM", "ZX48K", "ZX128K", "ZXNEXT"
	- Changed: "visualMemory" to boolean.
- For Kris: Changed naming of "ASSERT" to "ASSERTION" to avoid conflicts with commented sjasmplus ASSERTs. (Also the command was renamed from "-ASSERT" to "-ASSERTION".)
- 'find' enabled on webviews.
- Fixed a bug in highlighting register addresses in the MemoryRegisterView .
- spotHistory now also displays the changed registers.
- Fixed: during time-travel it is not possible anymore to change the registers.
- Fixed a bug with UNKNOWN label in call stack during time-travel.

# 1.5.5
- Fixed an 'Unverified breakpoint' issue for z88dk. (See #38)

# 1.5.4
- Fixed #34: Unverified breakpoints in version 1.5.3. Windows 10

# 1.5.3
- Merged into master branch.
- Updated 'whatsnew'.

# 1.5.2
- Relaunch: the memory view of the first session is now correctly closed before re-launching.
- Commands: "-view" is now working with all commands.
- Commands:
	- Renamed: "md" changed to "mv".
	- "md" used to do a memory dump to console.
	- "ms" used to save memory contents to a file.

# 1.5.1
- Packaged for beta testing.

# 1.5.0
- New architecture for parsing list files. This will make it easier to add parsing for a new assembler.
- Changes to launch.json:
	- "listFiles" removed.
	- Instead a configuration for each assembler: "sjasmplus", "z80asm" and "z88dk" added with overworked parameters.
	- "excludeFiles" parameter added to allow excluding certain files from association with execution addresses.
	- "filter" regex deprecated (i.e. it will not be supported anymore in future versions of DeZog).
	- "disassemblerArgs"/"numberOfLines": New parameter to control the number of displayed disassembled lines.
- z88dk:
	- Renamed "z88dkMapFile" to "mapFile".
	- "addOffset" removed for z88dk. Use "mapFile" instead.
	- "mapFile" is mandatory now.
- Byte registers IXL, IXH, IYL and IYH now show additionally under "Registers 2"
- Bugfix for a hang when Disassembly should wrap around 0xFFFF.
- Fixed an "Unverified breakpoint" issue on Windows.

# 1.4.9
- Fixed issue #29: Zsim: load instruction not executed properly for addresses between 0x0000 and 0x3FFF

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
  - warning if codeCoverageEnabled==true.
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
- Fixed: crash when switching from ZEsarUX to CSpect.
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
- Simulation of ZX Spectrum keys.

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
- Changed 'Restart' behavior to overcome hang on restart.

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
- A memory viewer/editor has been added.
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