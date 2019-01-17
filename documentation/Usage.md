# Usage of the VS Code Z80 Debug Adapter

This document describes the feature of z80-debug and how they can be used.


## Sample Program

I provide a simple sample assembler program to demonstrate the features of z80-debug.

You can find it here:
https://github.com/maziac/z80-sample-program

It includes the sources and the binaries (.list, .sna files). So, if you don't want to change the sources, you can try debugging even without building from the sources.


## Configuration

### launch.json

After installing you need to add the configuration for "z80-debug".

A typical configuration looks like this:
~~~
    "configurations": [
        {
            "type": "z80-debug",
            "request": "launch",
            "name": "Z80 Debugger",
            "zhostname": "localhost",
            "zport": 10000,
            "listFiles": [
                // "../rom48.list",
                { "path": "z80-sample-program.list", "sources": "." }
            ],
            "startAutomatically": true,
            "skipInterrupt": true,
            "commandsAfterLaunch": [
                //"-sprites",
                //"-patterns"
            ],
            "disassemblerArgs": {
                "esxdosRst": true
            },
            "rootFolder": "${workspaceFolder}",
            "topOfStack": "stack_top",
            "load": "z80-sample-program.sna",
            "smallValuesMaximum": 513,
            "tmpDir": ".tmp"
       }
~~~

- name: The (human readable) name of the Z80-Debug-Adapter as it appears in vscode.
- zhostname: The host's name. I.e. the IP of the machine that is running ZEsarUX. If you are not doing any remote debugging this is typically "localhost". Note: remote debugging would work, but has not been tested yet. There is also no mechanism included to copy the.sna file to a remote computer. So better stick to local debugging for now.
- zport: The ZEsarUX port. If not changed in ZEsarUX this defaults to 10000.
- listFiles: An array of list files. Typically it includes only one. But if you e.g. have a
list file also for the ROM area you can add it here.
Please have a look at the (Listfile)[#listfile] section.
- startAutomatically: If true the program is started directly after loading. If false the program stops after launch. (Default=false).
- skipInterrupt: Is passed to ZEsarUX at the start of the debug session.
    If true ZEsarUX does not break in interrupts (on manual break)
- commandsAfterLaunch: Here you can enter commands that are executed right after the launch and connection of the debugger. These commands are the same as you can enter in the debug console. E.g. you can use "-sprites" to show all sprites in case of a ZX Next program. See [Debug Console](#debug-console).
- disassemblerArgs: Arguments that can be passed to the internal disassembler. At the moment the only option is "esxdosRst". If enabled the disassembler will disassemble "RST 8; defb N" correctly.
- rootFolder: Typically = workspaceFolder. All other file paths are relative to this path.
- topOfStack: This is an important parameter to make the callstack display convenient to use. Please add here the label of the top of the stack. Without this information z80-debug does not know where the stack ends and may show useless/misleading/wrong information. In order to use this correctly first you need a label that indicates the top of your stack. Here is an example how this may look like:

~~~assembly
Your assembler file:
stack_bottom:
    defs    STACK_SIZE*2, 0
stack_top:

In your launch.json:
"topOfStack": "stack_top"
~~~

Note: instead of a label you can also use a fixed number.
- load: The snapshot (or tap) file to load. On start of the debug session ZEsarUX is instructed to load this file.
Note 1: you can also omit this. In that case the z80-debug attaches to the emulator without loading a program. Breakpoints and the list/assembler files can still be set. This can be useful to e.g. debug dot commands, i.e. programs that are started on the ZX Next command line.
Note 2: If ZEsarUX is used with the --tbblue-fast-boot-mode loading of tap files won't work.
- smallValuesMaximum: z80-debug format numbers (labels, constants) basically in 2 ways depedning on their size: 'small values' and 'big values'. Small values are typically consants like the maximum number of somethign you defined in your asm file.
Big values are typically addresses. Here you can give the boundary between these 2 groups. bigValues usually also show their contents, i.e. the value at the address along the address itself. Usually 512 is a good boundary value.
- tmpDir: A temporary directory used for files created during the debugging. At the moment this is only used to create the file for the disassembly if the PC reaches areas without any associated assembler listing.
- "memoryViewer: The following properties configure the memory viewer (used to show memory dumps).
	- addressColor: The first column shows the address. You can change the color here.
	- asciiColor: You can change the color of the ascii field here.
	- addressHoverFormat: Format for the address when hovering.
	- valueHoverFormat: Format for the value when hovering.
	- registerPointerColors: An array with register/color pairs. All selected register will appear with the corresponden color in the memory view. Registers not chosen will not appear. E.g. ["HL", "darkgreen", "DE", "darkcyan", "BC", "darkgray" ]
	- registersMemoryView: An array of register to show in the register memory view. This view is automatically opened at startup and shows the memory the registers point to. E.g. select [ 'HL', 'DE', 'IX' ].


### Listfile

#### z80asm vs. z80asm

z80asm was and is still a very popular name for a Z80 assembler. There are especially 2 of them that I have used in the past and despite the name doesn't share very much.
To distinguish them I will call them
a) the **Savannah-z80asm** (or z80asm) from Bas Wijnen, see https://savannah.nongnu.org/projects/z80asm/ and the
b) the **z88dk-z80asm** (or z88dk) hosted here https://github.com/z88dk/z88dk (Note: on the site they host even another z80asm project which is a respawn of the original one.)

The z80-debug supports the list file formats of both of them and additionally the sjasmplus (https://github.com/z00m128/sjasmplus).


#### The list file

The most important configuration to do is the *.list file. The list file contains
all the information required by z80-debug. While reading this file z80-debug
- associates addresses with line numbers
- associates addresses with files
- reads in labels and constants

An example how this works:
When you do a 'step-over' in the debugger, z80-debug request the new PC (program counter) value from ZEsarUX.
The address of the PC is looked up to find the line in the list file.
Now depending on the value of 'sources'
- (false): the corresponding line in the list file is shown or
- (true): the originating asm-file is searched together with the associated line and the asm-file is shown at the right line.

Configuration (**Savannah-z80asm**):
You need to enter the list files under "listFiles":
{ "path": "z80-sample-program.list", "sources": "" }
    - path: the path to the list file (relative to the 'rootFolder').
    - srcDirs (default=[""]):
        - [] = Empty array. Use .list file directly for stepping and setting of breakpoints.
        - string = Use the (original source) files mentioned in the .list file. I.e. this allows you to step through .asm source files. The sources are located in the directory given here. Is relative to the 'rootFolder'.
        - array of strings = Non-empty. Use the (original source) files mentioned in the .list file. I.e. this allows you to step through .asm source files. The sources are located in the directories given here. They are relative to the 'rootFolder'. Several sources directories can be given here. All are tried.
        - If you build your .list files from .asm files then use 'sources' parameter. If you just own the .list file and not the corresponding .asm files don't use it.
    - filter: A string with a reg expression substitution to pre-filter the file before reading. Used to read-in other formats than Savannah-z80asm, z88dk or sjasmplus.
    E.g. "/^[0-9]+\\s+//": This is a sed-like regular expression that removes the first number from all lines.
    Default: undefined. If you use Savannah-z80asm, z88dk or sjasmplus you should omit this field.
    - addOffset: (defualt=0): The number given here is added to all addresses in the list file. Useful for z88dk format.


Here is an example to use for the **z88dk-z80asm**:
{ "path": "currah_uspeech_tests.lis", "srcDirs": [], "asm": "z88dk", "addOffset": 32768 }
Explanation:
- "path": is the path to the list file. z88dk list file use the extension .lis.
- "srcDirs": set to an empty array. This means that z80-debug will not try to find the original source files but uses the list (.lis) file instead for debugging. All stepping etc. will be done showing the list file.
- "addOffset": The z88dk .lis file might not start at an absolute address (ORG). If it e.g. starts at address 0000 you can add the address offset here.

And here an example to use for the **sjasmplus**:
{ "path": "zxngfw.list", "mainFile": "main.asm", "srcDirs": ["src"], "asm": "sjasmplus" }
Explanation:
- "path": is the path to the list file.
- "mainFile": the name of the file used to create the list file.
- "srcDirs": set to an array with one entry "src". Alls .asm files are searched here.


Other assemblers:
I haven't tested other assemblers but if your assembler is able to generate a list file you should be able to use z80-debug. Most probably the source-file-feature will not work as this uses the special syntax of the Savannah-z80asm, z88dk or sjasmplus but you should be able to step through the list file at least during debugging.
The required format for z80-debug is that
- each line starts with the address
- labels are terminated by an ':' and
- constants look like: 'some_constant: EQU value'
- Lower or uppercase does not matter.

The key to use other assemblers is the 'filter' property. Here you can define a search pattern and a replacement: "/search/replacement/"
The pattern "/^[0-9]+\\s+//" e.g. replaces all numbers at the start of the line with an empty string, i.e. it deltes the numbers from the line.


#### Without a listfile

If you don't setup any list file then you can still start z80-debug and it will work.
The internal disassembler [z80dismblr](https://github.com/maziac/z80dismblr) will be used for immediately disassembly.
Whenever the progrma is stopped or after each step it checks if a disassembly (or asm/list source) at the current PC already exists.
If not a short amount of memory is added to the disassembly.
Hence the disassembly will grow the more you step through the code.
For performance reasons a new disassembly is only done if the memory at the PC is unknown or if a few bytes that follow the PC value have changed.
I.e. the disassembly at the current PC is always correct while an older disassembly (at a different address) might be outdated. This may happen in case a memory bank has been switched or the code was modified meanwhile (self modifying code).


#### Assemblers And Labels

The following table lists the diferences of the different assemblers in respect to the labels:

| Feature | Savannah/z80asm | z88dk/z80asm | sjasmplus |
|-|-|-|-|
| Local lables | no | no | yes |
| Needs a ':' | yes | yes | no
| Dots (.) are allowed (also at start of label) | no | no | yes |
| Misc | | | @ for global labels, numbers for labels |

sjasmplus:
    - local labels: start with a dot. Are prefixed by the previous non-local label.
    - "global" labels, e.g. @label
    - dot notation, e.g. main.sub.label1
    - "global" labels: @label or @label.sublabel
    - modules definition: automatically prefixes the labels with the modules name.
    - Labels may end with or without ":"
    - temporary labels, e.g. labels that are just called "1" or "2".

z80-debug supports most of them but with some restrictions:
- local labels: when hovering above a (local) label the current program counter is used to dissolve the context. I.e. the shown value is only correct if the PC is lower than the associated previous non-local label and no other non-local label is between the PC and the hover location.
- dot-notation: You have to hover over the last part of the dot notation to dissolve the complete label.
- labels with out a trailing ":" are not supported.
- temporary (number) labels: are not supported.
- sjasmplus: labels inside macros are not supported.


### Usage

Before you start z80-debug in vscode make sure that you have started ZEsarUX.
In ZEsarUX enable the socket ZRCP protocol either by commandline ("--enable-remoteprotocol")
or from the ZEsarUX UI ("Settings"->"Debug"->"Remote protocol" to "Enabled").

Important: Make sure that there is no UI window open in ZEsarUX when you try to connect it from vscode.
Sometimes it works but sometimes ZEsarUX will not connect.
You might get an error like "ZEsarUX did not communicate!" in vscode.

Now start z80-debug by pressing the green arrow in the debug pane (make sure that you chose the right debugger, i.e. "Z80 Debug").

z80-debug will now
- open the socket connection to ZEsarUX
- instruct ZEsarUX to load the snapshot file (or tap file)
- set breakpoints (if there are breakpoints set in vscode)
- put ZEsarUX into step mode ('enter-cpu-step') and stop/break the jst started assembler program

z80-debug/vscode will now display the opcode of the current PC (program counter) in the right position in your .asm file.
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


#### Useful ZEsarUX commandline options.

To ease the usage of ZEsarUX and the Z80 Debug Adapter you can use several ZEsarUX command line options.
I have collected a few that I found useful:

~~~bash
# Start a "normal" ZX Spectrum (48k) and listen for connection from the Z80 Debug Adapter.
./zesarux --enable-remoteprotocol &
~~~

~~~bash
# Start in ZX Next configuration. ZEsarUX skips the booting and emulates the esxdos rst routines.
# The file system is mounted via "--esxdos-root-dir".
# With this configuration ZX Next programs can be very easily developed and debugged.
# The Z80 program is passes as SNA file. "--sna-no-change-machine" disables the ZEsarUX automatic change to a 48k Spectrum machine.
#./zesarux --noconfigfile --machine tbblue --realvideo --enabletimexvideo --tbblue-fast-boot-mode --sna-no-change-machine --enable-esxdos-handler --esxdos-root-dir "\<path-to-your-z0-programs-dir\>" --enable-remoteprotocol &
~~~

~~~bash
# ZX Next: Start from MMC.
# To change an mmc file (e.g. on Mac) take the original tbblue.mmc, change the extension
# to .iso (tbblue.iso). Mount the iso image. Add your files. Unmount the image.
# Rename back to .mmc (optional).
./zesarux --machine tbblue --sna-no-change-machine --enable-mmc --enable-divmmc-ports --mmc-file "<your-mmc-image>"  --enable-remoteprotocol &
~~~


### Stop Debugging

To stop debugging press the orange square button in vscode. This will stop the z80-debug adapter and disconnect from ZEsarUX.
After disconnecting ZEsarUX, ZEsarUX will also leave cpu-step mode and therefore continue running the program.


### WPMEM

WPMEM offers a way to put watch points persistently into your sources.

WPMEM is put into a comment in your assembler source files. As the comments also appear in the .list file these comments will be parsed when the .list file is read.

Here are some examples how this looks like in code:

~~~assembly
fill_colors:    ; WPMEM, 5, w
    defb RED, YELLOW, BLUE, GREEN, MAGENTA
fill_colors_end:
~~~
~~~assembly
; WPMEM 0x0000, 0x4000
~~~
~~~assembly
; WPMEM fill_colors, 5, r
~~~

Syntax:
~~~
WPMEM [addr [, length [, access]]]
~~~
with:
- addr = address (or label) to observe (optional). Defaults to current address.
- length = the count of bytes to observe (optional). Default = 1.
- access = Read/write access (optional). Possible values: r, w or rw. Defaults to rw.

I.e. if you omit all values a watch-point will be created for the current address.
E.g. in the first example a watchpoint is created that checks that the array (fill_colors) is not overwritten with something else.

The most often used form of WPMEM is to put a WPMEM simply after an byte area that is used for reading/writing. E.g. like this:
~~~assembly
scratch_area:
    defs 10
    defb 1      ; WPMEM
~~~
In this example it is assumed that your algorithm uses the 'scratch_area' to write some data. You defined that this area is 10 bytes in size. Thus if someone would write after
these 10 bytes it would mean that the algorithm is wrong.
Please note that we waste 1 byte (defb 1) for this safety check. This byte is not to be used by any pointer in our program. So writing/reading to it is a failure and teh program will break if this happens.

Caveats:
- Other than for sjasmplus WPMEMs are evaluated also in not assembled areas, e.g. in case the surrounding IF/ENDIF is not valid.
- The 'memory breakpoints' used in ZEsarUX have a specific limiting behaviour:
Imagine you have set a watchpoint WPMEM at address 4000h.
If a byte is written to 4000h, e.g. with "LD (4000h),A" the break will occur, no problem.
But if a word (i.e. 2 bytes) is written to 4000h like in "LD (4000h),HL" the lower address is not checked. I.e. a break will not happen. Only the upper address is checked. If the word would be written to 3FFFh e.g. with "LD (3FFFh),HL" then a break would happen.

Note: WPMEMs are disabled by default. If you want to have WPMEMs enabled after launch then put "-WPMEM enabled" in the "commandsAfterLaunch" settings.


### Asserts

Similar to WPMEM you can use ASSERTs in comments in the assembler sources.
An ASSERT is translated by z80-debug into a breakpoints with an "inverted" condition.
For all ASSERTs in your source code z80-debug will set the correspondent breakpoints automatically at startup.

The ASSERT syntax is:
~~~
; [.*] ASSERT var comparison expr [concat var comparison expr] [;.*]
~~~
with:
- var: a variable, i.e. a register like A or HL
- comparison: one of '<', '>', '==', '!=', '<=', '=>'.
- expr: a mathematical expression that resolves into a constant
- concat: one of '&&' or '||'

Examples:
~~~
; ASSERT HL <= LBL_END+2
ld a,b  ; Check that index is not too big ASSERT B < (MAX_COUNT+1)/2
ld de,hl    ; ASSERT A < 5 && hl != 0 ; Check that pointer is alright
~~~

As an ASSERT converts to a breakpoint it is always evaluated **before** the instruction.
I.e. the following check will most probably not work as expected.
~~~
ld a,c  ; ASSERT a < 7
~~~
A is not loaded yet when the ASSERT is checked. So use
~~~
ld a,c
; ASSERT a < 7
~~~
instead: The ASSERT is on the next line i.e. at the address after the "LD" instruction abd thus A is checked correctly.

Notes:
- The asserts are checked in the list file. I.e. whenever you change an ASSERT it is not immediately used. You have to assemble a new list file and start the debugger anew.
- ASSERTs are disabled by default. If you want to have asserts enabled after launch then put "-ASSERT enabled" in the "commandsAfterLaunch" settings.
- Other than for sjasmplus ASSERTs are evaluated also in not assembled areas, e.g. in case the surrounding IF/ENDIF is not valid.
- As a special form you can also define an ASSERT without any condition. This will act as a breakpoint that will always be hit when the program counter reaches the instruction.


### Breakpoint conditions

Along with breakpoints you can also use breakpoint conditions. The breakpoint condition is checked additionally whenever a breakpoint is fired at a certain address.
Only if also the breakpoint condition is met the program execution will stop.
The breakpoint conditions are for example used for the ASSERTs.

Breakpoint conditions use a special syntax
~~~
var comparison expr [concat var comparison expr]
~~~
with:
- var: a variable, i.e. a register like A or HL
- comparison: one of '<', '>', '==', '!=', '<=', '=>'.
- expr: a mathematical expression that resolves into a constant
- concat: one of '&&' or '||'

Examples:
- HL > LBL_END
- B >= (MAX_COUNT+1)/2
- A >= 6 || hl == 0

So on the left side you have to use a register and of the left side an expression that evaluates to a number, you can use labels and maths in the expression, but you can't put registers there.
Several var-comparison-expr might be combined with a "&&" or "||". But you can't use any complex combinations that would require parenthesis.

The breakpoint conditions are translated into conditions that are understood by ZEsarUX automatically.


### Debug Console

You can add commands directly at the debug console. E.g. you can pass commands directly to ZEsarUX or you can enable/disable WPMEM.

Enter '-help' in the debug console to see all available commands.

The debug console can normally be found in the bottom of vscode after successfu kaunch of the debugger:
![](images/debug_console.jpg)


#### Execute emulator commands

Withe "-exec" you can directly pass emulator commands to the emulator.
The response is send to the debug console.
If you add the argument "-view" the output is redirected into a view.
E.g. for ZEsarUX you can use
~~~
-exec -view help
~~~
to put the ZEsarUX zrcp help documetation in a view in vscode.
You see the result here:
![](images/exec_view_help.jpg)


#### State Save/Restore

It is possible to save/restore the current machine state (mainly RAM, Z80 registers) during a debug session.
I.e. you can save the state before an errors happens then run the code to see what caused the error. If you then notice that you have gone too far you can restore the previous state and debug again from that point.

Use
~~~
-state save
~~~
to save the current state.
And
~~~
-state restore
~~~
to restore the state.

Note: Status is only experimental. I.e. it just save/restores the memory contents and max. the 48K RAM. ZX Next support will be added as soon it is available in ZEsarUX.
Note: The state is stored to RAM only. I.e. it will not persist a relaunch of the debug session.


#### Memory Dumps

If you enter
~~~
-md <address> <size>
~~~
in the debug console you open a memory viewer.

Here an example:
z80
![](images/memoryviewer1.gif)

The memory viewer will offer a few extra infos:
- The address is printed on the left side.
- The selected area (address, size) is emphasized, the other area is grayed out.
- Any address for which a label exists is underlined.
- Addresses that are pointed to by registers (e.g HL, DE, IX) are displayed with a colored background (here HL got green).
- Any changed value is highlighted in red.
- Hovering over values reveals more information. In the picture above the move was hovering over the red "42". You can see the associated address, label(s) and (since the value was changed) also the previous value.

You can also open multiple memory dumps at once by adding more address/size ranges to the command, e.g.:
~~~
-md 0 0x100 0x8000 0x40 0x8340 0x10
~~~
This opens a memory dump view 3 memory blocks.
Please note that if you enter overlapping blocks the dump will merge them in the display.

z80-debug opens a special memory viewer by itself on startup: it shows the locations around some registers. I.e. you can directly see where the registers are pointing at and what the values before and after are. This memory will change its range automatically if the associated register(s) change.

The register memory view:

![](images/memoryviewer2.jpg)


##### Memory Editor

In the memory viewer you can edit indivdual memory values with a double-click on the value.
You can now enter the new value as hex, decimal, bin or even as a math formula.

Any changed value wil be updated automatically in all memory views.
Note: The changed value is not updated immediately in the WATCH area. There you need to 'step' once to get the updated values.


##### Configuration

The visualization of the memory viewer can be configured. All values are collected under the 'memoryViewer' setting. You can change the registers in the registers-memory-viewer, the colors of the register pointers and the format of values that is shown when you hover over the memory values.


#### Sprites & Patterns

You can open a view which displays the current sprite slots by entering
~~~
-sprites
~~~

This will display all 'visible' sprites in a table with all associated attributes like mirroring, rotation, palette offset and pattern id.

Furthermore it also offers a simplified screen view which displays the border, the screen area and the sprites clipping rectangle (in red if enabled).

![](images/zxnextspritesviewer1.jpg)

Each sprite is shown by a rectangle and it's image. Additional you see it's slot number at the right bottom.

If you only want to watch specific sprites you can add the slot numbers as arguments.

Example: "-sprite 10-15 20+3 33" will observe sprite slots 10, 11, 12, 13, 14, 15, 20, 21, 22, 33 only.

The view will update the sprite's position and attributes on every 'step' in the debugger.
If a new sprite appears the corresponding  sprite pattern will be loaded as well. But for performance reasons: On a 'step' the sprite patterns for already existing sprites are not updated. On a 'break' the sprite patterns will always be updated.
So in most of the cases the sprite patterns will show correctly.
However for special situations it is also possible to reload the patterns with a button.

If the background color does not offer enough contrast for the sprite pattern it is possible to change the background color with the dropdown menu.

To see just the sprite patterns you can use
~~~
-patterns
~~~
with the same syntax.

It will display the sprite patterns.
It is also possible to change the palette if the current palette is not suitable.

![](images/zxnextspritepatternsviewer1.jpg)


### WATCHES

If you select a label with the mouse in the source code and do a right-click you can add it to the watches. The watches show a memory dump for that label.
The dump is updated on each step.
z80-debug cannot determine the "type" and size the data associated with the label therefore it assumes 100 bytes or words and shows both,
a byte array and a word array, on default.
However you have a few options if you add more parameters to the label.

If you double-click on the label in the WATCHES area you can edit it. You can tell z80-debug the number of elements to show and if it should show bytes, words or both.
The format is:
~~~
label,size,types
~~~
with
- label: The label, e.g. LBL_TEXT or just a number e.g. 0x4000
- size: The number of elements to show. Defaults to 100 if omitted.
- types: Determines if a byte array ('b'), a word array ('w') or both ('bw') should be shown. Defaults to 'bw'.

Here is an example:
~~~
fill_colors,5,b
~~~
It shows an array of 5 bytes beginning at label fill_colors.


### Change the Program Counter

The PC can be changed via the menu. Click in the source line. Do a right-click
and choose "Move Program Counter to Cursor".

See [Notes](#Notes).


## Differences to ZEsarUX

Stepping works slightly different to stepping in ZEsarUX.

- step-over: A step-over always returns. step-over should work like you would intuitively expect it to work (at least for me :-) ). You can step-over a 'jp' opcode and it will break on the next opcode, the jump address. z80-debug does so by looking at the current opcode: If a 'call' or a 'ldir/lddr' is found a ZEsarUX 'cpu-step-over' is done, in all other case a 'cpu-step' (into) is done.

- step-out: This is not available in ZEsarUX, but in z80-debug you can make use of a step-out. z80 debug examines the call stack and sets a temporary breakpoint to the return address. So step-out should work as expected. Note: if the stack pointer is already at the top of the call stack a step-out will do nothing because there is nothing to step-out from.



## Known Issues

- "ASSERT"s are set on startup but if for the same address an breakpoint already exists (e.g. from a previous session) it is not changed. If e.g. the ASSERT / breakpoint condition is changed it is not updated. Workaround: Remove all breakpoints manually before debugging the assembler program.

- sjasmplus: Stepping through instructions separated by a colon:
The following code
~~~
  inc hl : inc hl
~~~
might appear in the list file as
~~~
376+  814A
376+  814A 23              inc hl
377+  814B 23            inc hl
~~~
The first column is the line number. Please note that the line number of the 2 inc hl instructions is not the same. Therefore z80-debug might sometimes not display the right line during stepping.
This seems to happen only seldomly.


## Notes

- Don't use "-exec run" in the debug console. It will lead to a disconnection of ZEsarUX. Instead use the continue button (the green arrow).



