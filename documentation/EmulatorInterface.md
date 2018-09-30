
# TODO

- Interface von ShallowVar ändern. Die sollen über Machine gehen.
So dass ich in Machine alle Emulator spezifischen Dinge habe.
- Ich muss wohl eigenes lua script bauen, um erweiterte Befehle wie 'disassemble, step-over, change driver' zu benutzen. Dann kann ich auch gleich eigenes definieren. Wenn ich das gleiche wie bei ZEsarux verwende müsste ich nichts ändern! (Wunschdenken, e.g. unterschiedliches Breakpoint Nummer handling. Das funktioniert nicht: Machine abstrahiert den Emulator.).
- Register parsing muss nach 'Machine'.
- Vielleicht 'Machine' umbenennen nach 'Emulator'.


# Emulator Interface

This document describes the messages used to interface with the emulator(s).


# General

To interface to different emulators (e.g. MAME, ZEsarUX) the Machine classes are used. The specific 'Machine' implementations abstracts the emulator interface and the used "HW" (e.g. Spectrum 48, Spectrum 128, ...).

In general the following interfaces are required:
- start, stop, stepping
- reading, setting registers
- reading, setting memory

The 'Machine' instance is created in the 'create' function. Here a different Machine is chosen depending on the configuration.

The Machine interface to vscode via the 'EmulDebugAdapter'. The main interfaces are:
- init: Initialization of the Machine.
- continue, next, pause, stepOver, stepInto, stepOut, (reverseContinue, stepBack): Stepping through code. Called as reaction to clicking the correspondent vscode buttons.
- getRegisters, getRegisterValue: Returns register values. Called if the registers are updated, e.g. in the VARIABLES area on every step.
- setProgramCounter: Change the program counter. Used when the program counter is changed from the menu.
- stackTraceRequest: Retrieves the call stack. Called on every step.
- setBreakpoints: Called on startup and on every user change to the breakpoints.
- setWPMEM, enableWPMEM: setWPMEM is called at startup to set all memory watchpoints ("WPMEM") in the assmbly sources. enableWPMEM is a debug console command to enable/disable these watchpoints.
- getDisassembly: Returns a disassembly of the code.
- dbgExec: Executes a command on the emulator.
- getMemoryDump: Retrieves a memory dump.
- writeMemory: Changes memory values.
- state save/restore: Saves and restores the complete machine state.

Apart from Machine there is another class collection that communicate with the emulator, the ShallowVar classes.
The ShallowVar classes represent variables shown e.g. in vscode's VARIABLES section ot the WATCHES section. Examples are: Disassembly, registers, watches.
Whenever the value should be updated, vscode requests the value and the ShallowVar sends teh request to the emulator and receives the value as response.


## MAME

### gdbstub

The Machine communicates with MAME via the gdb remote protocol via a  socket. Mame needs to be started with the gdbstub lua script for this to work.

I.e. MAME uses gdb syntax for communicaton with z80-debug.

Here are the available commands:
- CTRL-C: Break (stop debugger execution)
- c: Continue
- s: Step into
- g: Read register
- G: Write register
- m: Read memory
- M: Write memory
- X: Load binary data
- z: Clear breakpoint/watchpoint
- Z: Set breakpoint/watchpoint

Missing:
- step-over, disassemble: not in serial protocol. done in gdb.
- machine info: not available.
- Possibility to change the 'driver', e.g. Spectrum 48k or Spectrum 128k


### Mame debugger (accessible through lua)

Init:
[MAME]>
debugger = manager:machine():debugger()
cpu = manager:machine().devices[":maincpu"]
space = cpu.spaces["program"]
consolelog = debugger.consolelog
errorlog = debugger.errorlog


consolelog can be read to retrieve the result of the commands (consolelog[#consolelog]).
errorlog is inclear how to use it.

- Get the state of the debugger: debugger.execution_state:
	- "stop"
	- "run"

Commands:
- Step:
	- cpu:debug():step()
	- debugger:command("step")
- Continue:
	- cpu:debug():go()
	- debugger:command("go")
- Stop:
	- cpu:debug():step() (yes, step) or
	- debugger.execution_state = "stop" or
	- debugger:command("gvblank")
- Get register: e.g.
	- print(cpu.state["HL"].value)
	- debugger:command("print hl")
	- Value is in consolelog which can be retrieved such: print(consolelog[#consolelog])
- Set register:
	- cpu.state["BC"].value = tonumber("8000",16)
- disassemble:
	- debugger:command("dasm file.asm,0, 10") - **does only write disassembly to a file. Unusable!**
- set-breakpoint / enable breakpoint
	- debugger:command("bps 8000") - return it's number
	- cpu:debug():bpset(0x8000)
- disable-breakpoint
	- cpu:debug():bpclr(1)
	- debugger:command("bpclear 1")
- watchpoint:
	- cpu:debug():wpset(cpu.spaces["program"], "w", addr, 1)
	- cpu:debug():wpclear(1)
- read-memory:
	- print(space:read_log_u8(addr))
	- there is no memory dump function: only saving to file. Could maybe done in lua.
- write-memory
	- space:write_log_u8(32768,15)

- get-stack-backtrace: not as suchneed to be constructed through register and mem read.

- breakpoint action, i.e. bp logs: MAME can do a printf to console. That could be transmitted to z80-debug.

### Open (MAME)

- state save/restore: I haven't checked if that is availablethrough lua.


## ZEsarUX

The Machine communicates with the emulator via the ZEsaruxSocket.
The following commands are used.

### Machine

Initialization (after connection setup):
- about
- get-version
- get-current-machine
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


### ShallowVar

- disassemble
- set-register
- write-memory-raw
- read-memory



