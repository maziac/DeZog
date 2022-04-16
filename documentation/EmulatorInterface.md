# Emulator Interface

This document describes the messages used to interface with the emulator(s).

Note: This is an old document and mainly outdated!

# General

To interface to different emulators (e.g. MAME, ZEsarUX and also ZXNext HW) the Emulator classes (EmulatorClass) are used. The specific 'EmulatorClass' implementations abstracts the emulator interface and the used "HW" (e.g. Spectrum 48, Spectrum 128, ...).

In general the following interfaces are required:
- start, stop, stepping
- reading, setting registers
- reading, setting memory
- reading ZX Next registers
- setting breakpoints
- conditional breakpoints
- revere debugging (cpu history)
- save/load state


The 'EmulatorClass' instance is created in the 'create' function. Here a different EmulatorClass is chosen depending on the configuration.

The EmulatorClass interface to vscode via the 'EmulDebugAdapter'. The main interfaces are:
- init: Initialization of the EmulatorClass.
- continue, next, pause, stepOver, stepInto, stepOut, (reverseContinue, stepBack): Stepping through code. Called as reaction to clicking the correspondent vscode buttons.
- getRegisters, getRegisterValue: Returns register values. Called if the registers are updated, e.g. in the VARIABLES area on every step.
- setProgramCounter: Change the program counter. Used when the program counter is changed from the menu.
- stackTraceRequest: Retrieves the call stack. Called on every step.
- setBreakpoints: Called on startup and on every user change to the breakpoints.
- setWPMEM, enableWPMEM: setWPMEM is called at startup to set all memory watchpoints ("WPMEM") in the assembly sources. enableWPMEM is a debug console command to enable/disable these watchpoints.
- getDisassembly: Returns a disassembly of the code.
- dbgExec: Executes a command on the emulator.
- getMemoryDump: Retrieves a memory dump.
- writeMemory: Changes memory values.
- getTbblueRegister: Reads ZXNext registers.
- state save/restore: Saves and restores the complete EmulatorClass state.

Apart from EmulatorClass there is another class collection that communicate with the emulator, the ShallowVar classes.
The ShallowVar classes represent variables shown e.g. in vscode's VARIABLES section ot the WATCHES section. Examples are: Disassembly, registers, watches.
Whenever the value should be updated, vscode requests the value and the ShallowVar sends the request to the emulator and receives the value as response.

Every specific Emulator derives three different classes:
- EmulatorClass
- Socket
- Z80Registers


# Functionality Overview - ZEsarUX, CSpect, ZXNext HW


|           | start, step | ext. break | breakpoints | cond. bp | mem bp | rev. dbg |save state | ZXNext regs | Unittests |
|-----------|-------------|------------|-------------|----------|--------|----------|-----------|-------------|-----------|
| ZEsarUX   | y           | y          | y           | y        | y      | y        | n         | y           | y         |
| CSpect    | y           | y          | y           | e        | n      | n        | ?         | e           | e         |
| ZXNext HW | y           | s          | y           | e        | n      | n        | n         | e           | e         |
| MAME      | y           | y          | y           | ?        | ?y     | n        | n         | n           | ?         |

y = is or would be support
s = somewhat, supported but with constraints
e = is some effort to support but possible
n = not supported


## MAME

(not implemented)


### gdbstub

The Remote communicates with MAME via the gdb remote protocol via a socket.
MAME needs to be like so:
~~~bash
./mame -window pacman -debugger gdbstub -debug -debugger_port 11222
~~~

I.e. MAME uses gdb syntax for communicaton with DeZog.

Here are the available commands in short:
- CTRL-C: Break (stop debugger execution)
- c: Continue
- s: Step into
- g: Read registers
- G: Write registers
- m: Read memory
- M: Write memory
- p: Read register
- P: Write register
- X: Load binary data
- z: Clear breakpoint/watchpoint
- Z: Set breakpoint/watchpoint

Missing:
- no bank/paging info

The gdbstub acts like a gdbserver.
It communicates with the gdb at the client via a remote protocol:
https://sourceware.org/gdb/onlinedocs/gdb/Overview.html#Overview

Unfortunately the gdb at the client also needs to be aware of the target architecture (i.e. the cpu). Otherwise it does not work.
I.e. vscode alone connected to MAME gdbstub will not work. At least not for Z80.
Maybe it would work for x86 target processor architectures.

Other reverse engineering IDEs support the Z80 architecture gdb e.g. through plugins.
- [IDA: Extending IDA processor modules for GDB debugging (MAME)](https://malware.news/t/extending-ida-processor-modules-for-gdb-debugging/35136)
- [Binary Ninja Debugger Plugin (BNDP): connect to MAME](https://binary.ninja/2020/05/06/debugger-showcase.html)

DeZog needs to implement that gdb part that understands the gdb remote protocol and the commands supported by the MAME gdbstub.


The gdb protocol can be found [here](
https://sourceware.org/gdb/onlinedocs/gdb/Overview.html#Overview).
The MAME implementation [here](https://github.com/mamedev/mame/blob/master/src/osd/modules/debugger/debuggdbstub.cpp).

| MAME gdb commands | Description | Reply |
|-------------------|-------------|-------|
| \x03 | CTRL-C. Break. Stop execution. | No reply |
| '!' | Enable extended mode. In extended mode, the remote server is made persistent. The ‘R’ packet is used to restart the program being debugged. | 'OK' |
| '?' | This is sent when connection is first established to query the reason the target halted. The reply is the same as for step and continue. This packet has a special interpretation when the target is in non-stop mode; see Remote Non-Stop. | See Stop Reply Packets |
| '[c addr]' | Continue at addr, which is the address to resume. If addr is omitted, resume at current address. | See Stop Reply Packets |
| 'D' | is used to detach GDB from the remote system. It is sent to the remote target before GDB disconnects via the detach command. | 'OK' or 'E nn' (Error) |
| 'g' | Read general registers. | 'XX...' the hex values of all registers or 'E nn'|
| 'G XX..' | Write general registers. | 'OK' or 'E nn'|
| 'H op thread-id' | Set thread for subsequent operations. E.g. 'c' | 'OK' or 'E nn'|
| 'k' | Kill. Closes session and socket. | No reply |
| ‘m addr,length’ | Read length addressable memory units starting at address addr (see addressable memory unit). Note that addr may not be aligned to any particular boundary. | 'XX...' the hex values or 'E nn'|
| ‘M addr,length:XX…’ | Write length addressable memory units starting at address addr (see addressable memory unit). The data is given by XX…; each byte is transmitted as a two-digit hexadecimal number. | 'OK' or 'E nn' (Error) |
| ‘p n’ | Read the value of register n; n is in hex. See read registers packet, for a description of how the returned register value is encoded. | 'XX...' the hex value of the register or 'E nn'|
| ‘P n…=r…’ | Write register n… with value r…. The register number n is in hexadecimal, and r… contains two hex digits for each byte in the register (target byte order). | 'OK' or 'E nn'|
| ‘q name params…’ | General query (‘q’) and set (‘Q’). These packets are described fully in General Query Packets. | |
| ‘s [addr]’ | Single step, resuming at addr. If addr is omitted, resume at same address. | See Stop Reply Packets |
| ‘z type,addr,kind’ | Remove (‘z’) a type breakpoint or watchpoint starting at address address of kind kind. | ‘OK’, ‘’ not supported or ‘E NN’ for an error |
| ‘Z type,addr,kind’ | Insert (‘z’) a type breakpoint or watchpoint starting at address address of kind kind. type is 0=SW BP, 1=HW BP, 2=write watchpoint, 3=read watchpoint, 4=access (rw) watchpoint.| ‘OK’, ‘’ not supported or ‘E NN’ for an error |


#### Stop Reply Packet

The MAME gdb stub sends e.g:
~~~
T050a:0000;0b:0100;
~~~

it adds 'watch', 'rwatch' or 'awatch' for a write, read or read/write watchpoint if that was hit, e.g.:
~~~
T05watch:A000;0a:0000;0b:0100;
~~~


### Break (CTRL-C)

To pause/break the server (DeZog) send a single 0x03 character.
The gdbstub does not send any reply.

To get a reply (also to know when to continue) DeZog will not send a sogle CTRL-C but follow it always by a register read to get a reply from the gdbstub.
~~~
CTRL-C
$g#HH
~~~

# Continue

The c(continue) command is responded with a '+'.
The program in MAMe is running afterwards until a breakpoint is hit or until CTRL-C is received.

Meanwhile it is still possible to send other commands, e.g. to retrieve registers or memory contents.

If a c(continue) is sent while the program is already running (e.g. a c(ontinue) was already set) is ACKed with a '+' and nothing happens.
It is enough to senda CTRL-C once to stop execution.


### Extended mode

The MAME gdbstub sets an internal variable to true but it does nto act on it in any way.


### DZRP vs GDB Remote Protocol

The MAME gdbstub functionality is compared with the DZRP functionality to find any lacks.
One major drawback we can see already: the MAME gdbstub does not support any information about the banking/paging.
Note: gdb itself might support banking/paging via [overlays](https://docs.adacore.com/gdb-docs/html/gdb.html#Overlays).


| Command               | MAME | Cmd  |
|-----------------------|------|------|
| CMD_INIT              | X    | !,?  |
| CMD_CLOSE             | X    | D (MAME starts running wo debugger attached) |
| CMD_GET_REGISTERS     | X    | g    |
| CMD_SET_REGISTER      | X    | P    |
| CMD_WRITE_BANK        |      |      |
| CMD_CONTINUE          | X    | c    |
| CMD_PAUSE             | X    | \x03, CTRL-C |
| CMD_READ_MEM          | X    | m    |
| CMD_WRITE_MEM         | X    | M    |
| CMD_SET_SLOT          |      |      |
| CMD_GET_TBBLUE_REG    |      |      |
| CMD_SET_BORDER        |      |      |
| CMD_SET_BREAKPOINTS   |      |      |
| CMD_RESTORE_MEM       |      |      |
| CMD_LOOPBACK	        |      |      |
| CMD_GET_SPRITES_PALETTE |    |      |
| CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL |  |  |
| CMD_GET_SPRITES       |      |      |
| CMD_GET_SPRITE_PATTERNS |    |      |
| CMD_ADD_BREAKPOINT    | X    | Z0   |
| CMD_REMOVE_BREAKPOINT | X    | z0   |
| CMD_ADD_WATCHPOINT    | X    | Z2-4 |
| CMD_REMOVE_WATCHPOINT | X    | z2-4 |
| CMD_READ_STATE        |      |      |
| CMD_WRITE_STATE       |      |      |


### The gdb protocol in brief

The client (DeZog) sends packets in the form
~~~
$packet-data#checksum
~~~

All data is ASCII and without spaces between the characters. But fields might be separated by ',', ';' or ':'.

Each packet is acknowledged with a
~~~
+
~~~

or NACKed with a
~~~
-
~~~

e.g. if the command has a bad checksum.

The ACK/NACK is sent immediately and can be used to stop the timeout.

The response/reply is sent after the ACK when the command has completed.
For step and continue this means it is sent after the emulator has breaked.


### XML

For 'g', 'G', 'p', and 'P to work the MAME gdbstub need to be set to XML mode.
~~~
qXfer:features:read:target.xml:offset,length
~~~

It returns the xml which describes the target architecture and the registers.
offset and length could restrict the size of the doc, or read it in chunks.

For
~~~
qXfer:features:read:target.xml:00,FFFF
~~~

the MAME gdbstub returns:
~~~

Sent "qXfer:features:read:target.xml:00,FFFF".
Response received: l<?xml version="1.0"?>
<!DOCTYPE target SYSTEM "gdb-target.dtd">
<target version="1.0">
<architecture>z80</architecture>
  <feature name="mame.z80">
    <reg name="af" bitsize="16" type="int"/>
    <reg name="bc" bitsize="16" type="int"/>
    <reg name="de" bitsize="16" type="int"/>
    <reg name="hl" bitsize="16" type="int"/>
    <reg name="af'" bitsize="16" type="int"/>
    <reg name="bc'" bitsize="16" type="int"/>
    <reg name="de'" bitsize="16" type="int"/>
    <reg name="hl'" bitsize="16" type="int"/>
    <reg name="ix" bitsize="16" type="int"/>
    <reg name="iy" bitsize="16" type="int"/>
    <reg name="sp" bitsize="16" type="data_ptr"/>
    <reg name="pc" bitsize="16" type="code_ptr"/>
  </feature>
</target>
~~~

for the Z80.


### Registers

The MAME gdbstub returns the registers in the order given from the XML.
Here is an example:
~~~
40000000000000000000000000000000ffffffff00000000
~~~

I.e. 12 words in hex.

Note: The IM and IR registers are not transferred.


### How to get the program into the emulator

a) the program is already there: For MAME this is nothing special the ROM is loaded at startup.
b) the program is transferred by DeZog: Not sure if it works to write a ROM via gdbstub. Since everything is ROM might also not be needed.


## ZEsarUX

The EmulatorClass communicates with the emulator via the ZEsaruxSocket.
The following commands are used.

### ZesaruxRemote class

Initialization (after connection setup):
- about
- get-version
- get-current-EmulatorClass
- set-debug-settings
- enter-cpu-step

Other:
- get-registers
- disassemble
- get-stack-backtrace
- run
- 'sendBlank' (to break running)
- cpu-step
- set-breakpointaction
- set-breakpoint
- enable-breakpoint
- disable-breakpoint
- read-memory
- write-memory
- set-register
- cpu-history
- extended-stack
- getTbblueRegister


### ShallowVar

- disassemble
- set-register
- write-memory-raw
- read-memory



