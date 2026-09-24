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


|           | start, step | ext. break | breakpoints | cond. bp | mem bp | rev. dbg | save state | ZXNext regs | Unittests |
| --------- | ----------- | ---------- | ----------- | -------- | ------ | -------- | ---------- | ----------- | --------- |
| ZEsarUX   | y           | y          | y           | y        | y      | y        | n          | y           | y         |
| CSpect    | y           | y          | y           | e        | n      | n        | ?          | e           | e         |
| ZXNext HW | y           | s          | y           | e        | n      | n        | n          | e           | e         |
| MAME      | y           | y          | y           | y        | y      | n        | y          | s           | ?         |

- y = is or would be supported
- s = somewhat, supported but with constraints
- e = is some effort to support but possible
- n = not supported


# MAME

## gdbstub

The Remote communicates with MAME via the gdb remote protocol via a socket.
MAME needs to be started like this:
~~~bash
./mame -window <rom> -debugger gdbstub -debug -debugger_port 12000
~~~

I.e. MAME uses gdb syntax for communication with DeZog.
The remote is implemented in `src/remotes/mame/mamegdbremote.ts` (class `MameGdbRemote`, derived from `DzrpQueuedRemote`).
It overrides the `sendDzrpCmd...` methods and maps them to gdb packets and to MAME debugger commands (see below).

Here are the gdb commands the gdbstub offers in short:
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
- qRcmd: Execute a MAME debugger console command (see "qRcmd")
- qXfer:features:read:target.xml: Describes the target (CPU, registers)

Missing in the gdbstub:
- no bank/paging info (worked around with qRcmd, see "Paging/Banking")
- no state save/load (worked around with qRcmd, see "State save/load")

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

| MAME gdb commands   | Description                                                                                                                                                                                                                                 | Reply                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| \x03                | CTRL-C. Break. Stop execution.                                                                                                                                                                                                              | No reply                                          |
| '!'                 | Enable extended mode. In extended mode, the remote server is made persistent. The ‘R’ packet is used to restart the program being debugged.                                                                                                 | 'OK'                                              |
| '?'                 | This is sent when connection is first established to query the reason the target halted. The reply is the same as for step and continue. This packet has a special interpretation when the target is in non-stop mode; see Remote Non-Stop. | See Stop Reply Packets                            |
| 'c [addr]'          | Continue at addr, which is the address to resume. If addr is omitted, resume at current address.                                                                                                                                            | See Stop Reply Packets                            |
| 'D'                 | is used to detach GDB from the remote system. It is sent to the remote target before GDB disconnects via the detach command.                                                                                                                | 'OK' or 'E nn' (Error)                            |
| 'g'                 | Read general registers.                                                                                                                                                                                                                     | 'XX...' the hex values of all registers or 'E nn' |
| 'G XX..'            | Write general registers.                                                                                                                                                                                                                    | 'OK' or 'E nn'                                    |
| 'H op thread-id'    | Set thread for subsequent operations. E.g. 'c'                                                                                                                                                                                              | 'OK' or 'E nn'                                    |
| 'k'                 | Kill. Closes session and socket.                                                                                                                                                                                                            | No reply                                          |
| ‘m addr,length’     | Read length addressable memory units starting at address addr (see addressable memory unit). Note that addr may not be aligned to any particular boundary.                                                                                  | 'XX...' the hex values or 'E nn'                  |
| ‘M addr,length:XX…’ | Write length addressable memory units starting at address addr (see addressable memory unit). The data is given by XX…; each byte is transmitted as a two-digit hexadecimal number.                                                         | 'OK' or 'E nn' (Error)                            |
| ‘p n’               | Read the value of register n; n is in hex. See read registers packet, for a description of how the returned register value is encoded.                                                                                                      | 'XX...' the hex value of the register or 'E nn'   |
| ‘P n…=r…’           | Write register n… with value r…. The register number n is in hexadecimal, and r… contains two hex digits for each byte in the register (target byte order).                                                                                 | 'OK' or 'E nn'                                    |
| ‘q name params…’    | General query (‘q’) and set (‘Q’). These packets are described fully in General Query Packets.                                                                                                                                              |                                                   |
| ‘s [addr]’          | Single step, resuming at addr. If addr is omitted, resume at same address.                                                                                                                                                                  | See Stop Reply Packets                            |
| ‘z type,addr,kind’  | Remove (‘z’) a type breakpoint or watchpoint starting at address address of kind kind.                                                                                                                                                      | ‘OK’, ‘’ not supported or ‘E NN’ for an error     |
| ‘Z type,addr,kind’  | Insert (‘z’) a type breakpoint or watchpoint starting at address address of kind kind. type is 0=SW BP, 1=HW BP, 2=write watchpoint, 3=read watchpoint, 4=access (rw) watchpoint.                                                           | ‘OK’, ‘’ not supported or ‘E NN’ for an error     |


### Stop Reply Packet

The MAME gdb stub sends e.g:
~~~
T050a:0000;0b:0100;
~~~

it adds 'watch', 'rwatch' or 'awatch' for a write, read or read/write watchpoint if that was hit, e.g.:
~~~
T05watch:A000;0a:0000;0b:0100;
~~~


### Break (CTRL-C)

To pause/break the server (DeZog) sends a single 0x03 character.
The gdbstub does not send any reply.

To get a reply (also to know when to continue) DeZog will not send a single CTRL-C but follow it always by a register read to get a reply from the gdbstub.
~~~
CTRL-C
$g#HH
~~~

### Continue

The c(continue) command is responded with a '+'.
The program in MAME is running afterwards until a breakpoint is hit or until CTRL-C is received.

Meanwhile it is still possible to send other commands, e.g. to retrieve registers or memory contents.

If a c(continue) is sent while the program is already running (e.g. a c(ontinue) was already set) is ACKed with a '+' and nothing happens.
It is enough to send a CTRL-C once to stop execution.


### Breakpoints

Breakpoints are set with
~~~
Z0,2312,0
~~~

and removed with
~~~
z0,2312,0
~~~

If 2 breakpoints are set at the same address, these are still 2 breakpoints.
I.e. if one of these breakpoints is removed the other still remains.

Note: DeZog uses the gdb `Z0`/`z0` packets only for the temporary breakpoints used for stepping (`Z1`/`z1`, see `dzrpContinue`).
Normal user breakpoints are set via the MAME debugger command `bpset` (see "qRcmd") because only that allows to add a condition (the bank on ZX Next).
Watchpoints use `Z2`-`Z4`/`z2`-`z4` (write, read, access).


### Detach

The D(etach) command in MAME gdbstub just sets a variable that stops acting in 'wait_for_debugger'.

### Kill

The k(ill) command terminates MAME.


### Extended mode

The MAME gdbstub sets an internal variable to true but it does nto act on it in any way.


### State save/load

The MAME debugger supports load and save of the state via the debugger commands `statesave <file>` and `stateload <file>`.
These are not available as gdb packets, but they can be executed through `qRcmd`.
DeZog uses this for the debug console commands `-state save` and `-state restore`
(`MameGdbRemote.stateSave()` / `stateRestore()`).

- The state file is written/read by MAME itself (MAME's own .sta format). It contains the complete machine state (CPU, memory, banking, video, ...), not only the Z80 state as in the other remotes.
- The path is quoted (`statesave "<file>"`). MAME strips the quotes, they allow spaces and commas in the path.
- MAME does not report errors via `qRcmd` for these commands.
  - If MAME runs on the local host (`hostname` is `localhost`, `127.0.0.1` or `::1`) DeZog checks itself: for save the old file is deleted first and afterwards it is checked that the new file exists, for restore it is checked that the file exists.
  - If MAME runs on a different host DeZog cannot check the file. Only the base name of the file is sent, i.e. the file is stored in/read from the state directory of MAME on that host (not the local workspace directory).
- Reverse debugging/step history is not affected: DeZog has no CPU history for MAME.



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
For step and continue this means it is sent after the emulator has stopped.


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

Therefore DeZog does not use 'g' to read the registers. Instead it uses the debugger command
~~~
print pc,sp,af,bc,de,hl,ix,iy,af2,bc2,de2,hl2,ir,im
~~~
via `qRcmd` (plus `mmu0`...`mmu7` for the ZX Next). The reply contains the values separated by spaces
and is decoded by `Z80RegistersMameDecoder`.
Registers are set with `qRcmd` as well (e.g. `bc=1234`; AF' etc. are named `af2`, ...).
`P` is not used.


### qRcmd

`qRcmd,<hex-encoded string>` sends a command of the MAME debugger console to MAME. The reply is the hex encoded output of the command.
DeZog uses this for everything that the gdbstub cannot do (`sendQrcmd()`):

| Purpose                       | MAME debugger command                      |
| ----------------------------- | ------------------------------------------ |
| Read registers                | `print pc,sp,af,...,im[,mmu0..mmu7]`       |
| Set register                  | `<reg>=<value>`                            |
| Interrupts on/off             | `iff1=<0/1>`, `iff2=<0/1>`                 |
| Write to port                 | `ib@<port>=<value>`                        |
| Set slot (ZX Next only)       | `do mmu<slot>=<bank>`                      |
| Read/write bank (ZX Next)     | `print mmu<n>` / `do mmu<n>=...`           |
| Add breakpoint                | `bpset <addr>[,mmu<slot>==<bank>]`         |
| Remove breakpoint             | `bpclear <id>`                             |
| State save/load               | `statesave "<file>"`, `stateload "<file>"` |
| Run/single step (start delay) | `g`, `step`                                |
| ZX Next: set ROM              | `nr8e=3` (ROM3)                            |

Errors: MAME reports errors as reply starting with 'E', containing 'error' or (in the decoded output) starting with '>'. DeZog turns these into exceptions.

The debug console command `-exec qrcmd <cmd>` (`dbgExec`) can be used to send any such command manually, e.g. `-exec qrcmd print pc`.


### Loading programs

The ROM is loaded by MAME itself at startup. The program to debug is transferred by DeZog after the connection setup (`load()`):
- `.sna`: For ZX Next the normal DeZog routine is used. For other machines only 48k files are supported (128k throws an error). The memory is written with `M`, border via port 0xFE, registers via `qRcmd`.
- `.z80`: only 48k files.
- `.nex`: ZX Next.
- Loading .sna/.z80 makes sense only if MAME was started with a 48k Spectrum machine. For other machines the behavior is undefined.
- Workaround in `loadBin()`: MAME shows the effects of the loading (e.g. the new screen or border) only after at least one executed instruction. Therefore a NOP is temporarily put at the PC, one step is executed and PC and the memory byte are restored.

### Start options

Dependent on the `mame` settings in launch.json:
- `startDelay`: The emulation is started and stopped again (`g`, wait, `step`) after the given time, e.g. to let the machine boot.
- `startWaitOnZxInterrupt`: Starts the emulation and waits until IM 1 and interrupts are enabled and the FRAMES system variable (0x5C78) counts up, i.e. until ZXNextOS is ready. Default: enabled for the ZX Next, disabled otherwise. Timeout: 20 seconds.


## DZRP commands and MAME

`MameGdbRemote` does not speak DZRP, but it implements the `sendDzrpCmd...` methods of the DZRP base classes.
This is how they are mapped:

| DZRP command / method                                                                                       | MAME | Implementation                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| CMD_INIT                                                                                                    | X    | `qXfer:features:read:target.xml` (checks 'z80', detects Z80N by `mmu0`-`mmu7`)  |
| CMD_CLOSE                                                                                                   | X    | Nothing sent. On disconnect: `k` (kill, terminates MAME)                        |
| CMD_GET_REGISTERS                                                                                           | X    | qRcmd `print pc,sp,af,...` (not `g`, IM/IR are missing there)                   |
| CMD_SET_REGISTER                                                                                            | X    | qRcmd `<reg>=<value>` (not `P`)                                                 |
| CMD_INTERRUPT_ON_OFF                                                                                        | X    | qRcmd `iff1=`, `iff2=`                                                          |
| CMD_WRITE_PORT                                                                                              | X    | qRcmd `ib@<port>=<value>` (replaces the former CMD_SET_BORDER)                  |
| CMD_CONTINUE                                                                                                | X    | `c` (temporary breakpoints for stepping with `Z1`/`z1`)                         |
| CMD_PAUSE                                                                                                   | X    | `\x03` (CTRL-C) followed by `p0b` to get a reply                                |
| CMD_READ_MEM                                                                                                | X    | `m`                                                                             |
| CMD_WRITE_MEM                                                                                               | X    | `M` (in chunks of 2000 bytes)                                                   |
| CMD_READ_BANK_MEM                                                                                           | Z80N | Temporarily pages the bank into slot 0, reads with `m`, restores                |
| CMD_WRITE_BANK_MEM                                                                                          | Z80N | Same as read, with `M`                                                          |
| CMD_SET_SLOT                                                                                                | Z80N | qRcmd `do mmu<slot>=<bank>`                                                     |
| CMD_ADD_BREAKPOINT                                                                                          | X    | qRcmd `bpset <addr>[,mmu<slot>==<bank>]`, the MAME bp id is stored in `bp.bpId` |
| CMD_REMOVE_BREAKPOINT                                                                                       | X    | qRcmd `bpclear <id>`                                                            |
| CMD_ADD_WATCHPOINT                                                                                          | X    | `Z2` (w), `Z3` (r), `Z4` (rw), 64k address only                                 |
| CMD_REMOVE_WATCHPOINT                                                                                       | X    | `z2`-`z4`                                                                       |
| State save/load (`-state save/restore`)                                                                     | X    | qRcmd `statesave`/`stateload`                                                   |
| CMD_WRITE_BANK                                                                                              |      | Not supported                                                                   |
| CMD_GET_TBBLUE_REG                                                                                          |      | Not supported (only `mmu0`-`mmu7` are read with the registers)                  |
| CMD_SET_BREAKPOINTS, CMD_RESTORE_MEM                                                                        |      | Not supported                                                                   |
| CMD_LOOPBACK                                                                                                |      | Not supported                                                                   |
| CMD_GET_SPRITES*, CMD_GET_SPRITE_PATTERNS, CMD_GET_SPRITES_PALETTE, CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL |      | Not supported                                                                   |
| CMD_READ_STATE, CMD_WRITE_STATE                                                                             |      | Not supported (DZRP state, i.e. no CPU history/reverse debugging)               |

Not supported by MAME: code coverage (a warning is shown), break on interrupt, reverse debugging.
Supported: ASSERTION, WPMEM and LOGPOINT.


## MAME - Paging/Banking in DeZog

The gdbstub has no paging/banking information at all: `m`/`M` always access the CPU's current 64k address space.
Whether DeZog can show banks therefore depends on the machine.

### Generic Z80 machines (Z80N not detected)

- The memory model is `MemoryModelUnknown`: 64k of RAM without slots/banks is assumed.
- Long addresses are not used, only 64k addresses. Watchpoints and breakpoints ignore the bank part of a long address.
- Reading/writing banks (`sendDzrpCmdReadBankMem`/`WriteBankMem`) throws an error ("supports banked memory only for Z80N").
- Machines with banked memory (e.g. a 128k Spectrum) can be debugged, but DeZog only sees the memory that is currently paged in. The paging state (e.g. port 0x7FFD) is not evaluated.
- Loading .sna/.z80 works only for 48k files (see "Loading programs").

### ZX Next (Z80N detected)

Z80N is detected if the target XML contains the registers `mmu0` ... `mmu7` (8 slots of 8k).
- The memory model is `MemoryModelZxNext`, i.e. slots/banks like on the real ZX Next.
- `mmu0`-`mmu7` are read together with the other registers (`print ...,mmu0,...,mmu7`) which gives the slot/bank association. `getSlots()` is derived from that.
- Set slot: `do mmu<slot>=<bank>`.
- Bank memory access: DeZog pages the bank temporarily into slot 0 (`TMP_SLOT`), accesses it via the normal 64k `m`/`M` and restores the original bank afterwards. Slot 0 is used (see `TMP_SLOT`) because the ROM can only be paged into slots 0 and 1. The program is stopped while this happens. Only offsets within one 8k bank are possible per access.
- Breakpoints with a long address get a MAME condition: `bpset 0xC000,mmu6==0x21` (bank = bankp1-1, slot = address>>>13). Breakpoints with only a 64k address are set without condition.
- Watchpoints: The gdbstub only knows 64k addresses. `DzrpRemote` filters the hits and checks the bank against the current slots.
- At startup the ROM is set to ROM3 (`nr8e=3`) because DeZog comes from ZXNextOS.

### Limits

- No banking information for other multi-bank machines (128k Spectrum, ...). A possible enhancement would be reading the machine's paging registers via `qRcmd` and selecting a matching memory model.


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



