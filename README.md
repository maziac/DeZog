# VS Code Z80 Debug Adapter

![](documentation/images/main.gif)

**Note: the current implementation is still experimental. Most of the features have not been thoroughly tested. It may or may not work for you.**

The Z80-Debug-Adapter (z80-debug) lets you use Visual Studio Code (vscode) as IDE for ZEsarUX (a ZX Spectrum emulator).
With this extension it is possible to debug assembler programs built for the ZX Spectrum.
It's primary intention is to support building new programs, i.e. programs with existent assembler source code.
(It may also be used without source code to debug binaries but in that case the support is very limited and you could probably better directly debug at ZEsarUX.)
The biggest help it offers is that you are able to step through your sources and that  z80-debug is aware of all labels and can give hints to what label a number resolves.

The z80-debug connects to ZEsarUX via a socket connection. ZEsarUX offers quite a few commands accessible via socket according to the so-called ZRCP (Zesarux Remote Control Protocol). See [ZEsarUX](https://github.com/chernandezba/zesarux) for more information.

Note: The Z80-Debug-Adapter does not include any support for building from assembler sources. For this you need to create a build task yourself. For an example look here: https://github.com/maziac/z80-sample-program

## Features

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
- memory viewer / editor
- automatic display of memory that is pointed to by HL, DE, etc.
- change of program counter through menu


## Constraints

- supports only ZEsarUX emulator
- build output must
	- create a .list file (format as of Savannah's Z80 Assembler: http://savannah.nongnu.org/projects/z80asm/)
	- _alternatively you can use other list files (like z88dk)with limited functionality, please consult the documentation. You can also simply fetch a disassembly of your code from ZEsarUX. Please see the "List file" section in the documentation._
	- create a .sna file containing the binary


## Installation

### Prerequisites

In order to use z80-debug you need
- vscode (of course)
- the ZEsarUX ZX Spectrum emulator (https://github.com/chernandezba/zesarux). Tested was version 7.


### z80-debug

In Visual Studio Code simply install "Z80 Debugger" (maziac.z80-debug) from the Marketplace.


## Usage

Please look at the documentation ['Usage of the VS Code Z80 Debug Adapter'](documentation/Usage.md).


## License

z80-debug is licensed under the [MIT license](https://github.com/maziac/z80-debug/blob/master/LICENSE.txt).

The source code is available on [github](https://github.com/maziac/z80-debug).
