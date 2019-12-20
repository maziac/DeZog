# ZX Next Interface

Here I collect first ideas to conenct the z80-debug-adapter remotely with a real ZX Next Spectrum.

It basically has to communicate with the ZX Next similarly as with ZEsarUX, but there are, of course, specific problems.

Certain commands are not working at all because the ZX Next has no special debugging HW.
E.g. I can't get any cpu history/trace information. So reverse debugging is not possible at all.

Breakpoints don't have HW support so I need to deal with it in SW.

The document deals with the main problems/solutions.

# Communication

RS232, Raspi?

ZS Next has a UART, e.g. to connect to Wifi.
How to program it. Does it use an interrupt? Would be required.

# ZX Next SW

The ZX Next requires a program to be executed on the Next to communicate with the PC with the z80-debug-adapter.
The SW has the following main tasks:
- communication with z80-debug
- read/write registers
- break the execution
- set SW breakpoints


# SW Breakpoints

<<use of RST 0>>
