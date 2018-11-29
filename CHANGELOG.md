# Changelog

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