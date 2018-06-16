# Usage of the VS Code Z80 Debug Adapter

This document describes the feature of z80-debug and how they can be used.


## Sample Program

I provide a simple sample assembler program to demonstrate the features of z80-debug.

You can find it here:
https://github.com/maziac/z80-sample-program

It includes the sources and the binaries (.list, .labels, .sna files). So, if you don't want to change the sources, you can try debugging even without building from the sources.


## Configuration

### launch.json

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
                // "../rom48.list",
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
Please have a look at the (Listfile)[#Listfile] section.
- labelsFiles: The paths (relative to the 'rootFolder') of the labels files. Typically
this is only one file created during building. But you could add multiple files here.
You can also completely omit the label files but in that case the z80-debug support is very limited because it cannot help in resolving any labels to numbers and vice versa.
- startAutomatically: see [Notes](#Notes)
- skipInterrupt: Is passed to ZEsarUX at the start of the debug session.
    If true ZEsarUX does not break in interrupts (on manual break)
- rootFolder: Typically = workspaceFolder. All other file paths are relative to this path.
- topOfStack: This is an important parameter to make the callstack display convenient to use. Please add here the label of the top of the stack. Without this information z80-debug does not know where the stack ends and may show useless/misleading/wrong information. In order to use this correctly first you need a label that indicates the top of your stack. Here is an example how this may look like:

~~~
Your assembler file:
stack_bottom:
    defs    STACK_SIZE*2, 0
stack_top:

In your launch.json:
"topOfStack": "stack_top"
~~~

Note: instead of a label you can also use a fixed number.
- loadSnap: The snaphsot file to load. On start of the debug session ZEsarUX is instructed to load this file.
- smallValuesMaximum: z80-debug format numbers (labels, constants) basically in 2 ways depedning on their size: 'small values' and 'big values'. Small values are typically consants like the maximum number of somethign you defined in your asm file.
Big values are typically addresses. Here you can give the boundary between these 2 groups. bigValues usually also show their contents, i.e. the value at the address along the address itself. Usually 512 is a good boundary value.
- tmpDir: A temporary directory used for files created during the debugging. At the moment this is only used to create files for the disassemblies given in 'disassemblies'.
- "memoryViewer: The following proprties configure the memory viewer (used to show memory dumps).
	- addressColor: The first column shows the address. You can change the color here.
	- asciiColor: You can change the color of the ascii field here.
	- addressHoverFormat: Format for the address when hovering.
	- valueHoverFormat: Format for the value when hovering.
	- registerPointersToShow: You can select here which registers should appear in the memory view if their value is in range of the memory view. Additionally you select also the background color for the register. E.g. select [ 'HL', 'green', 'DE', 'blue', 'IX', 'red' ].
	- registersMemoryView: An array of register to show in the register memory view. This view is automatically opened at startup and shows the memory the registers point to. E.g. select [ 'HL', 'DE', 'IX' ].


### Listfile

#### z80asm vs. z80asm

z80asm was and is still a very popular name for a Z80 assembler. There are especially 2 of them that I have used in the past and despite the name doesn't share very much.
To distinguish them I will call them
a) the **Savannah-z80asm** from Bas Wijnen, see https://savannah.nongnu.org/projects/z80asm/ and the
b) the **z88dk-z80asm** hosted here https://github.com/z88dk/z88dk (Note: on the site they host even another z80asm project which is a respawn of the original one.)

Both assemblers can produce list file but in my z80-debug project I'm targeting the Savannah's format because the z88dk's format lacks a few information which makes it hard/impossible to parse for some information. I.e. in z88dk format it is not always possible to distinguish the originating source file 100%.
Therefore the z88dk format can still be used (see below) but with some drawbacks only.


#### The list file

The most important configuration to do is the *.list file. The list file contains
all the information required by z80-debug. While reading this file z80-debug
- associates addresses with line numbers
- associates addresses with files
- reads in labels and constants

An example how this works:
When you do a 'step-over' in the debugger, z80-debug request the new PC (program counter) value from ZEsarUX.
The address of the PC is looked up to find the line in the list file.
Now depending on the value of 'useFiles'
- (false): the corresponding line in the list file is shown or
- (true): the originating asm-file is searched together with the associated line and the asm-file is shown at the right line.

Configuration (**Savannah-z80asm**):
You have 2 alternative forms to enter list files. The full form is e.g.:
{ "path": "z80-sample-program.list", "useFiles": true }
    - path: the path to the list file (relative to the 'rootFolder').
    - useFiles (default=false):
        - false = Use .list file directly for stepping and setting of breakpoints.
        - true = Use the (original source) files mentioned in the .list file. I.e. this allows you to step through .asm source files.
        - If you build your .list files from .asm files then use 'true'. If you just own the .list file and not the corresponding .asm files use 'false'.
    - filter: A string with a reg expression substitution to pre-filter the file before reading. Used to read-in other formats than Savannah-z80asm, e.g. z88dk. Default: undefined. If you use Savannah-z80asm you should omit this field.
    - useLabels: (default=true): If true the list file is also parsed for labels.
    - addOffset: (defulat=0): The number given here is added to all addresses in the list file. Useful for z88dk format.

The short form is simply a path, e.g.:
"z80-sample-program.list"
In this case the defaults for 'useFiles', 'filter' etc. are used.


Here is an example to use for the **z88dk-z80asm**:
{ "path": "currah_uspeech_tests.lis", "filter": "/^[0-9]+\\s+//", "useFiles": false, "addOffset": 32768 }
Explanation:
- "path": is the path to the list file. z88dk list file use the extension .lis.
- "filter": "/^[0-9]+\\s+//": This is a sed-like regular expression that removes the first number from all lines. In z88dk format the first number is the line number.
- "useFiles": false: This means that z80-debug will not try to find the original source files but uses the list (.lis) file instead for debugging. All stepping etc. will be done showing the list file.
- "addOffset": The z88dk .lis file might not start at an absolute address (ORG). If it e.g. starts at address 0000 you can add the address offset here.


Other assemblers:
I haven't tested other assemblers but if your assembler is able to generate a list file you should be able to use z80-debug. Most probably the source-file-feature will not work as this uses the special syntax of the Savannah-z80asm but you should be able to step through the list file at least during debugging.
The required format for z80-debug is that
- each line starts with the address
- labels are terminated by an ':' and
- constants look like: 'some_constant: EQU value'

Lower or uppercase does not matter.

The key to use other assemblers is the 'filter' property. Here you can define a search pattern and a replacement: "/search/replacement/"
The pattern "/^[0-9]+\\s+//" e.g. replaces all numbers at the start of the line with an empty string, i.e. it deltes the numbers from the line.


### Labelsfile

Because nowadays (>=0.4.0) the labels and constants are extracted directly from the list file there should normally no need to include a labels file anymore.
However, if you see strange results or missing labels/constants than you could add a label file.
You can further decide to turn label parsing off (useLabels=false) for the list file.


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
- instruct ZEsarUX to load the snapshot file
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


### Stop Debugging

To stop debugging press the orange square button in vscode. This will stop the z80-debug adapter and disconnect from ZEsarUX.
After disconnecting ZEsarUX, ZEsarUX will also leave cpu-step mode and therefore continue running the program.


### WPMEM

WPMEM offers a way to put watch points persistently into your sources.

WPMEM is put into a comment in your assembler source files. As the comments also appear in the .list file these comments will be parsed when the .list file is read.

Here are some examples how this looks like in code:
~~~
fill_colors:    ; WPMEM, 5, w
    defb RED, YELLOW, BLUE, GREEN, MAGENTA
fill_colors_end:
~~~
~~~
; WPMEM 0x0000, 0x4000
~~~
~~~
; WPMEM fill_colors, 5, r
~~~

Syntax:
~~~~
WPMEM [addr [, length [, access]]]
~~~~
with:
- addr = address (or label) to observe (optional). Defaults to current address.
- length = the count of bytes to observe (optional). Default = 1.
- access = Read/write access (optional). Possible values: r, w or rw. Defaults to rw.

I.e. if you omit all values a watch-point will be created for the current address.
E.g. in the first example a watchpoint is created that checks that the array (fill_colors) is not overwritten with something else.

The most often used form of WPMEM is to put a WPMEM simply after an byte area that is used for reading/writing. E.g. like this:
~~~~
scratch_area:
    defs 10
    defb 1      ; WPMEM
~~~~
In this example it is assumed that your algorithm uses the 'scratch_area' to write some data. You defined that this area is 10 bytes in size. Thus if someone would write after
these 10 bytes it would mean that the algorithm is wrong.
Please note that we waste 1 byte (defb 1) for this safety check. This byte is not to be used by any pointer in our program. So writing/reading to it is a failure and teh program will break if this happens.

Caveats:
- The parser of the list file is very simple. I.e. it cannot distinguish if
the comment is in an area that is conditionally not assembled. So even if the code is not assembled it would honor the WPMEM comment and assign a watch point.

### Debug Console

You can add commands directly at the debug console. E.g. you can pass commands directly to ZEsarUX or you can enable/disable WPMEM.

Enter '-help' in the debug console to see all available commands.


### Memory Dumps

If you enter
~~~~
-md <address> <size>
~~~~
in the debug console you open a memory viewer.

Here an example:

![](images/memoryviewer1.gif)

The memory viewer will offer a few extra infos:
- The address is printed on the left side.
- The selected area (address, size) is emphasized, the other area is grayed out.
- Any address for which a label exists is underlined.
- Addresses that are pointed to by registers (e.g HL, DE, IX) are displayed with a colored background (here HL got green).
- Any changed value is highlighted in red.
- Hovering over values reveals more information. In the picture above the move was hovering over the red "42". You can see the associated address, label(s) and (since the value was changed) also the previous value.

You can also open multiple memory dumps at once by adding more address/size ranges to the command, e.g.:
~~~~
-md 0 0x100 0x8000 0x40 0x8340 0x10
~~~~
This opens a memory dump view 3 memory blocks.
Please note that if ou enter overlapping blocks the dump will merge them in the display.

z80-debug opens a special memory viewer by itself on startup: it shows the locations around some registers. I.e. you can directly see where the registers are pointing at and what the values before and after are. This memory will change its range automatically if the associated register(s) change.

The register memory view:

![](images/memoryviewer2.jpg)


#### Memory Editor

In the memory viewer you can edit indivdual memory values with a double-click on the value.
You can now enter the new value as hex, decimal, bin or even as a math formula.

Any changed value wil be updated automatically in all memory views.
Note: The changed value is not updated immediately in the WATCH area. There you need to 'step' once to get the updated values.


#### Configuration

The visualization of the memory viewer can be configured. All values are collected under the 'memoryViewer' setting. You can change the registers in the registers-memory-viewer, the colors of the register pointers and the format of values that is shown when you hover over the memory values.


### WATCHES

If you select a label with the mouse in the source code and do a right-click you can add it to the watches. The watches show a memory dump for that label.
The dump is updated on each step.
z80-debug cannot determine the "type" and size the data associated with the label therefore it assumes 100 bytes or words and shows both,
a byte array and a word array, on default.
However you have a few options if you add more parameters to the label.

If you double-click on the label in the WATCHES area you can edit it. You can tell z80-debug the number of elements to show and if it should show bytes, words or both.
The format is:
~~~~
label,size,types
~~~~
with
- label: The label, e.g. LBL_TEXT or just a number e.g. 0x4000
- size: The number of elements to show. Defaults to 100 if omitted.
- types: Determines if a byte array ('b'), a word array ('w') or both ('bw') should be shown. Defaults to 'bw'.

Here is an example:
~~~~
fill_colors,5,b
~~~~
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

- The VARIABLES section sometimes gets mixed up. I.e. the registers and the disassembly might show the wrong data.
- "startAutomatically" is ignored at the moment. ZEsarUX should be started manually before debugging


## Notes

- vscode breakpoint conditions: those are directly passed to ZEsarUX. Conditions have not been tested at all.
- Don't use "-exec run" in the debug console. It will lead to a disconnection of ZEsarUX. Instead use the continue button (the green arrow).
