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


# MAME

(not implemented)


## gdbstub

The Remote communicates with MAME via the gdb remote protocol via a socket.
MAME needs to be like so:
~~~bash
./mame -window <rom> -debugger gdbstub -debug -debugger_port 12000
~~~

I.e. MAME uses gdb syntax for communication with DeZog.

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
| 'c [addr]' | Continue at addr, which is the address to resume. If addr is omitted, resume at current address. | See Stop Reply Packets |
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
spec
I.e. if one of these breakpoints is removed the other still remains.


### Detach

The D(etach) command in MAME gdbstub just sets a variable that stops acting in 'wait_for_debugger'.

### Kill

The k(ill) command terminates MAME.


### Extended mode

The MAME gdbstub sets an internal variable to true but it does nto act on it in any way.


### statesave / stateload

The MAME debugger supports load and save of the state.
Unfortunately this is not available through the gdbstub.



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


### How to get the program into the emulator

a) the program is already there: For MAME this is nothing special the ROM is loaded at startup.
b) the program is transferred by DeZog: Not sure if it works to write a ROM via gdbstub. Since everything is ROM might also not be needed.


## Using Lua to implement the DZRP protocol in MAME


### Compiling MAME

To compile MAME with all debugging support use:
~~~
make REGENIE=1 SYMBOLS=1 SYMLEVEL=3 OPTIMIZE=0 -j5
~~~

This takes about 2 hrs (without debugging 1h).

Starting MAME on macos should be done with the vscode extension codelldb ('lldb').
Has a better performance than gdb.
Anyhow, starting of MAME is still slow and might take up to a minute.
Stepping time is fine though.


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


### MAME - Paging

See https://docs.mamedev.org/techspecs/memory.html#shares-banks-and-regions,
https://wiki.mamedev.org/index.php/CPUs_and_Address_Spaces.

- Address space (class address_space): methods for read/write access.
  - ADDRESS_SPACE_PROGRAM: Code and data (von Neumann)
  - ADDRESS_SPACE_DATA: Separate space where data is stored (Harvard).
  - ADDRESS_SPACE_IO: Address space for IO.
- Address maps: Maps banks into address ranges.
- Memory region: Most probably this is the 'natural' address space, e.g. 64k for a Z80.

Special types of memory:
- banks (SMH_BANK(banknum)): Max. 32 banks, SMH_BANK(1)...SMH_BANK(32).
  - memory_configure_bank: configure the base pointer to a bank.
  - memory_set_bank: select one of the pointers.
  - A base pointer is e.g. memory_region(REGION_CPU2) + 0x2000.
- RAM (SMH_RAM), ROM (SMH_ROM): Are implemented as banks, but cannot be changed.
- no-ops (SMH_NOP), unmapped space (SMH_UNMAP): unused memory, writes go nowhere, reads return 0.


TODO: Just as reminder:
~~~
[MAME]> for k,v in pairs(manager.machine.devices["maincpu"].spaces["program"].map.entries) do print(k,v,v.address_start,v.address_end,v.region, v.read.handlertype, v.read.tag) end
1       sol.address_map_entry *: 0x7fea3b1f3a68 0       32767   :maincpu        rom     nil
2       sol.address_map_entry *: 0x7fea3b1c3078 32768   49151   nil     bank    bank1
3       sol.address_map_entry *: 0x7fea0b156c08 49152   56831   nil     ram     nil
4       sol.address_map_entry *: 0x7fea0b1b6368 56832   57343   nil     ram     nil
5       sol.address_map_entry *: 0x7fea0b1bead8 57344   59391   nil     ram     nil
6       sol.address_map_entry *: 0x7fea0b1c77b8 59392   61439   nil     ram     nil
~~~
I.e. ```mapentries = manager.machine.devices["maincpu"].spaces["program"].map.entries``` contains the 'slots' in entry.address_start/address_end.
The type (rom, ram, bank) is in v.read.handlertype and the current bank ("bank1") contains an address space that covers all "banks".
I.e. from ```bank = manager.machine.memory.banks[":bank1"]``` I get the index of the bank (inside "bank1") via bank.entry (0-based).
Use ```print(manager.machine.memory.banks[":bank1"].entry)``` to access it.
~~~
space = manager.machine.devices[":maincpu"].spaces["program"]
reg = manager.machine.memory.regions[":maincpu"]
bank = manager.machine.memory.banks[":bank1"]
bank.entry = 0
print("bank.entry: ", bank.entry)
print("space: 0x8000: ", space:read_u8(0x8000))
print("region: 0x8000: ", reg:read_u8(0x8000))
print("region: 0x10000: ", reg:read_u8(0x10000))
print("region: 0x14000: ", reg:read_u8(0x14000))
bank.entry = 1
print("bank.entry: ", bank.entry)
print("space: 0x8000: ", space:read_u8(0x8000))
print("region: 0x8000: ", reg:read_u8(0x8000))
print("region: 0x10000: ", reg:read_u8(0x10000))
print("region: 0x14000: ", reg:read_u8(0x14000))

~~~

```manager.machine:soft_reset()``` does not reload the ROMs.
```manager.machine:hard_rest()``` does, but also restarts the plugin.

write handler: If the bank is read-only simply no handler is available for 'write':
~~~
MAME]> for k,v in pairs(manager.machine.devices["maincpu"].spaces["program"].map.entries) do print(k,v,v.address_start,v.address_end,v.region, v.read.handlertype, v.read.tag) end
1       sol.address_map_entry *: 0x7fea5b895428 0       32767   :maincpu        rom     nil
2       sol.address_map_entry *: 0x7fea5b8e2918 32768   49151   nil     bank    bank1
3       sol.address_map_entry *: 0x7fea0b07c728 49152   56831   nil     ram     nil
4       sol.address_map_entry *: 0x7fea0b0fa478 56832   57343   nil     ram     nil
5       sol.address_map_entry *: 0x7fea0b06a638 57344   59391   nil     ram     nil
6       sol.address_map_entry *: 0x7fea0b08b9a8 59392   61439   nil     ram     nil
~~~

### Address Map

~~~c++
 static ADDRESS_MAP_START( main_map, ADDRESS_SPACE_PROGRAM, 8 )
     AM_RANGE(0x8000, 0x83ff) AM_RAM AM_SHARE(1)
     AM_RANGE(0x8400, 0x87ff) AM_RAM
     AM_RANGE(0x8800, 0x8bff) AM_READNOP   /* 6850 ACIA */
     AM_RANGE(0x8c00, 0x8c00) AM_MIRROR(0x3fe) AM_READWRITE(qix_video_firq_r, qix_video_firq_w)
     AM_RANGE(0x8c01, 0x8c01) AM_MIRROR(0x3fe) AM_READWRITE(qix_data_firq_ack_r, qix_data_firq_ack_w)
     AM_RANGE(0x9000, 0x93ff) AM_READWRITE(pia_3_r, pia_3_w)
     AM_RANGE(0x9400, 0x97ff) AM_READWRITE(pia_0_r, qix_pia_0_w)
     AM_RANGE(0x9800, 0x9bff) AM_READWRITE(pia_1_r, pia_1_w)
     AM_RANGE(0x9c00, 0x9fff) AM_READWRITE(pia_2_r, pia_2_w)
     AM_RANGE(0xa000, 0xffff) AM_ROM
 ADDRESS_MAP_END
~~~

- 'main_map': is the (compiled) name of the map (name of the variable).
- AM_READ, AM_WRITE, AM_READWRITE: The read/write handlers get the offset from the start address in the AM_RANGE macro.
- AM_REGION: Can override a RAM/ROM assignment (?)
- AM_SHARE: Used to share the same RAM between 2 CPUs. For each CPU the shared memory can have different ranges (different start addresses).

Runtime modifications:
It is possible to change the memory configuration afterwards.
E.g. it is possible to install different read/write handlers:
~~~c++
memory_install_read8_handler(machine, cpu, space, start, end, mask, mirror, rhandler)
memory_install_write8_handler(machine, cpu, space, start, end, mask, mirror, rhandler)
memory_install_readwrite8_handler(machine, cpu, space, start, end, mask, mirror, rhandler, whandler)
~~~


If executing ```map <address>``` in the debugger one can see the read/write handlers attached to the memory.


### Conclusion

I have tried a lot but at the end I failed.
Lua is very limited when it comes to implement a useful interface to DeZog.

Here are a few problems:
- socket implementation: The mame socket implementation is also used for Lua. It is not possible to determine that a socket has been closed.
As a workaround the DZRP close command could be used. That at least would work on graceful terminations.
- I also thought about using the lua as a mediator to the gdbstub and implement only additional functionality in Lua. But this is not possible, wwhen the mame debugger stops the Lua is not served anymore.
- Stopping: Mame does not react on setting the ```manager.machine.debugger.execution_state``` to "stop". Or better: only for a short time. Then it turns "run" on by itself. Therefore it is necessary to block mame from running in the lua script with a busy loop (there is no "sleep" command available).
- But the main problem in the end: There is no reliable way to get the banking information. I thought I found a way and it was working with lwings, but e.g. with spec128 it was failing, showing no banks.

The last problem was were I stopped further development.
I.e. MAME will continue to be supported, but through the gdbstub as before.
Thus it will not include any slot/banking information.

If I should ever try to continue on this:
Look into the 'mame_lua' branch of DeZog.
The plugin can be found in the 'mame/dezog/' folder.
The dezog folder needs to be places in mame in the 'mame/plugins/' folder.
Mame needs to be started with e.g.:
~~~
./mame spec128 -resolution 640x480  -window  -debug -debugger none -console -plugin dezog
~~~

The mame remote for lua is in 'remotes/dzrpbuffer/mameremote.ts'.


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



