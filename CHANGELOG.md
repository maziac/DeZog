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