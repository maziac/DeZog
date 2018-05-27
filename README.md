# VS Code Z80 Debug Adapter

**Note: the current implementation is still experimental. Most of the features have not been thoroughly tested. It may or may not work for you.**

The Z80-Debug-Adapter (z80-debug) lets you use Visual Studio Code (vscode) as IDE for ZEsarUX (a ZX Spectrum emulator).
With this extension it is possible to debug assembler programs built for the ZX Spectrum.
It's primary intention is to support building new programs, i.e. programs with existent assembler source code.
(It may also be used without source code to debug binaries but in that case the support is very limited and you could probably directly debug at ZEsarUX.)
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

## Constraints

- supports only ZEsarUX emulator
- build output must
	- create a .list file (format as of Z80 Assembler: http://savannah.nongnu.org/projects/z80asm/)
	- a .sna file containing the binary


## Using Z80 Debug Adapter

### Installation

#### Prerequisites

In order to use z80-debug you need
- vscode (of course)
- the ZEsarUX ZX Spectrum emulator (https://github.com/chernandezba/zesarux). Tested was version 7.

#### z80-debug

Installation is not (yet) possible through the Extension Marketplace.

Instead you have to install the vsix file directly:
- download the latest vsix file (under Releases)
- in vscode press F1 and enter "Extensions: Install from VSIX..."
- don't forget to press "Reload" in vscode



### Sample Program

You can find sample code here:
https://github.com/maziac/z80-sample-program

It includes the sources and the binaries (.list, .labels, .sna files). So, if you don't want to change the sources, you can try debugging even without building from the sources.


### Setup

After installing you need to add the configuration for "z80-debug".

A typical configuration looks like this:
~~~~
    "configurations": [
        {
            "type": "z80-debug",
            "request": "launch",
            "name": "Z80 Debugger",
            "zhostname": "localhost",
            "zport": 10000,
            "disassemblies": [
              //  [ 0, 16384 ]    // Spectrum ROM disassembly
            ],
            "listFiles": [
                //{ "path": "rom48.list", "useFiles": false },
                { "path": "z80-sample-program.list", "useFiles": true }
            ],
            "labelsFiles": [
                //"rom48.labels",
                "z80-sample-program.labels"
             ],
            "startAutomatically": true,
            "skipInterrupt": true,
            "rootFolder": "${workspaceFolder}",
            "topOfStack": "stack_top",
            "loadSnap": "z80-sample-program.sna",
            "disableLabelResolutionBelow": 513,
            "tmpDir": ".tmp"
       }
~~~~

- name: The (human readable) name of the Z80-Debug-Adapter as it appears in vscode.
- zhostname: The host's name. I.e. the IP of the machine that is running ZEsarUX. If you are not doing any remote debugging this is typically "localhost". Note: remote debugging would work, but has not been tested yet. There is also no mechanism included to copy the.sna file to a remote computer. So better stick to local debugging for now.
- zport: The ZEsarUX port. If not changed in ZEsarUX this defaults to 10000.
- disassemblies: You can add address/length tuples here that are disassmbled before startup. Can be used e.g. to disassemble ROM areas. Don't expect too much as the disassembly is not aware of data areas and will disassemble them as they were code.
- listFiles: An array of list files. Typically it includes only one. But if you e.g. have a
list file also for the ROM area you can add it here.
    - path: the path to the list file (relative to the 'rootFolder').
    - useFiles:
        - false = Use .list file directly for stepping and setting of breakpoints.
        - true = Use the (original source) files mentioned in the .list file. I.e. this allows you to step through .asm source files.
        - If you build your .list files from .asm files then use 'true'. If you just own the .list file and not the corresponding .asm files use 'false'.
- labelsFiles: The paths (relative to the 'rootFolder') of the labels files. Typically
this is only one file created during building. But you could add multiple files here.
You can also completely omit the label files but in that case the z80-debug support is very limited because it cannot help in resolving any labels to numbers and vice versa.
- startAutomatically: see [Notes](#Notes)
- skipInterrupt: Is passed to ZEsarUX at the start of the debug session.
    If true ZEsarUX does not break in interrupts (on manual break)
- rootFolder: Typically = workspaceFolder. All other file paths are relative to this path.
- topOfStack: This is an important parameter to make the callstack display convenient to use. Please add here the label of the top of the stack. Without this information z80.debug does not know when the stack ends and may show useless/misleading/wrong information. In order to use this correctly first you need a label that indicates the top of your stack. Here is an example how this can look:
~~~
Your assembler file:
stack_bottom:
    defs    STACK_SIZE*2, 0
stack_top:

In your launch.json:
"topOfStack": "stack_top"
~~~
Note: instead of a label you can also use a fixed number.
- loadSnap": The snaphsot file to load. On start of the debug session ZEsarUX is instructed to load this file.
- disableLabelResolutionBelow: z80-debug will try to resolve numbers into labels. This is fine most of the time, but for very low numbers this can also be annoying because z80-debug will normally find a load of matching labels whcih are all shown. You can disable it here if the label is below a certain value. Disabling it for all values 0-512 seems to be a good choice.
- tmpDir: A temporary directory used for files created during the debugging. At the moment this is only used to create files for the disassemblies given in 'disassemblies'.


### Usage

After configuring you are ready to go.
But before you start z80-debug in vscode make sure that you started ZEsarUX.
In ZEsarUX enable the socket ZRCP protocol either by commandline ("--enable-remoteprotocol")
or from the ZEsarUX UI ("Settings"->"Debug"->"Remote protocol" to "Enabled").

Important: Make sure that there is no UI window open in ZEsarUX when you try to connect it from vscode. Sometimes it works but sometimes ZEsarUX will not connect. You might get an error like "ZEsarUX did not communicate!" in vscode.

Now start z80-debug by pressing the green arrow in the debug pane (make sure that you chose the right debugger, i.e. "Z80 Debug").

z80-debug will now
- open the socket connection to ZEsarUX
- instruct ZEsarUX to load the snapshot file
- set breakpoints (if there are breakpoints set in vscode)
- put ZEsarUX into step mode ('enter-cpu-step') and stop/break the jst started assembler program

z80-debug/vscode will now show you the opcode of the current PC (program counter) in the right position in your .asm file.
At the left side you see the disassembly and the registers in the VARIABLES section and the
call stack in the CALL STACK section.

You can now try the following:
- hover over registers in your source code -> should display the value of the register
- step-over, step-in etc.
- click in the call stack -> will navigate you directly to the file
- set breakpoints, press continue to run to the breakpoints

If that is not enough you also have full access to the ZEsarUX ZRCP through vscode's debug console.
Enter "-help" in the debug console to see all available commands.
Enter e.g. "-e h 0 100" to get a hexdump from address 0 to 99.


### Stop Debugging

To stop debugging press the orange square button in vscode. This will stop the z80-debug adapter and disconnect from ZEsarUX.
After disconnecting ZEsarUX, ZEsarUX will also leave cpu-step mode and therefore continue running the program.


## Differences to ZEsarUX

Stepping works slightly different to stepping in ZEsarUX.

- step-over: A step-over always returns. step-over should work like you would intuitively expect it to work (at least for me :-) ). You can step-over a 'jp' opcode and it will break on the next opcode, the jump address. z80-debug does so by looking at the current opcode: If a 'call' or a 'ldir/lddr' is found a ZEsarUX 'cpu-step-over' is done, in all other case a 'cpu-step' (into) is done.

- step-out: This is not available in ZEsarUX, but in z80-debug you can make use of a step-out. z80 debug examines the call stack and sets a temporary breakpoint to the return address. So step-out should work as expected. Note: if the stack pointer is already at the top of the call stack a step-out will do nothing because there is nothing to step-out from.






## Notes

- "startAutomatically" is ignored at the moment. ZEsarUX should be started manually before debugging
- vscode breakpoint conditions: those are directly passed to ZEsarUX. Conditions have not been tested at all.
- Don't use "-exec run" in the debug console. It will lead to a disconnection of ZEsarUX. Instead use the continue button (the green arrow).



