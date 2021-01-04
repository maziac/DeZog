# Usage of DeZog - the VS Code Z80 Debug Adapter

This document describes the features of DeZog and how they can be used.

## Support

If you like DeZog please consider supporting it.

<a title="PayPal" href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=8S4R8HPXVCXUL&source=url">
	<img src="images/btn_donate_SM.gif" />
</a>


If you would like to contribute, e.g. by adding a new assembler or adding other remotes/emulators, see "Contribution" [here](https://github.com/maziac/DeZog/blob/master/README.md#contribution).



## Migration from DeZog 1.5
If you installed DeZog 1.5 before [here](https://github.com/maziac/DeZog/blob/master/documentation/Migration.md) are a few tips to migrate to 2.0.


## General Usage

A typical debug session with DeZog looks as follows:
1. Create a binary of your assembler program together with a list or SLD file for DeZog
2. Start DeZog (therefore you need a working launch.json config file)
3. Debug, i.e. set breakpoints, run, step through your code, evaluate registers and memory
4. Stop DeZog
5. Loop to 1

When using the internal Z80 simulator "zsim" that's basically it.

When using an external [remote](#what-is-a-remote), i.e. an emulator or the ZX Next, you need to start that as well.

I have noticed that this part, the interaction between DeZog and the emulator, often confuses people.
So I would like to sketch out the intended/main usage scenario.

Many people try to start the emulator while starting DeZog and close it when stopping the DeZog debug session.
This is **not required**.
If you work with an emulator you would start the emulator once and then let it running.
When you start a debug session DeZog will connect to it, **transfer the program to the emulator** and start the program.
When you stop the debug session DeZog will disconnect from the emulator.
(Disconnecting from the emulator may have the effect of keeping the program running in the emulator. This is simply because the emulator now continues execution).

I.e. your workflow is as follows:
1. Start vscode
2. Start the emulator (or even several emulators/remotes)
3. Create a binary of your assembler program
4. Start DeZog
5. Debug memory
6. Stop DeZog
7. Loop to 3

You normally need to re-start the emulator only if it behaves weird, does not connect to DeZog anymore or crashes.


## Sample Program

With DeZog a simple assembler program is provided to demonstrate the features of DeZog.

You can find it here:
https://github.com/maziac/z80-sample-program

It includes the sources and the binaries (.list, .sna files). So, if you don't want to change the sources, you can try debugging even without building from the sources.


## Configuration
### launch.json

After installing you need to add the configuration for "DeZog".

A typical configuration looks like this:

~~~json
    "configurations": [
        {
            "type": "dezog",
            "request": "launch",
            "name": "DeZog",
            "remoteType": "zsim",
            "zsim": {
                "loadZxRom": true
            },
            "sjasmplus": [
                {
                    "path": "z80-sample-program.list",
                }
            ],
            "startAutomatically": false,
            "history": {
                "reverseDebugInstructionCount": 10000,
                "codeCoverageEnabled": true
            },
            "commandsAfterLaunch": [
                //"-sprites",
                //"-patterns"
            ],
            "disassemblerArgs": {
        		"numberOfLines": 20,
                "esxdosRst": true
            },
            "rootFolder": "${workspaceFolder}",
            "topOfStack": "stack_top",
            "load": "z80-sample-program.sna",
            "smallValuesMaximum": 513,
            "tmpDir": ".tmp"
       }
~~~

- name: The (human readable) name of DeZog as it appears in vscode.
- unitTests: Only required if the configuration contains unit tests. Leave empty if you don't provide unit tests. Only one configuration can have this attribute set to true.
- remoteType: For DeZog to work it is necessary to connect it to some 'Remote'. This can be an emulator like ZEsarUX, the internal Z80 simulator or real ZX Next HW connected via serial interface.
    - "zsim": Use the internal simulator. See [Internal Z80 Simulator](#the-internal-z80-simulator).
    - "zrcp": Use ZEsarUX through the ZRCP (ZEsarUX Remote Control Protocol) via a socket. See [ZEsarUX](#zesarux).
    - "cspect": Use of CSpect emulator with the DeZog plugin. See [CSpect](#cspect).
    - "zxnext": Use a (USB-) serial connection connected to the UART of the ZX Next. See [Serial Interface](#serial-interface).
- sjasmplus (or z80asm or z88dk): The assembled configuration. An array of list files. Typically it includes only one. But if you e.g. have a
list file also for the ROM area you can add it here.
Please have a look at the [Listfile](#listfile) section.
- startAutomatically: If true the program is started directly after loading. If false the program stops after launch. (Default=true). Please note: If this is set to true and a .tap file is loaded it will stop at address 0x0000 as this is where ZEsarUX tape load emulation starts.
- reverseDebugInstructionCount: The number of lines you can step back during reverse debug. Use 0 to disable.
- codeCoverageEnabled: If enabled (default) code coverage information is displayed. I.e. all source codes lines that have been executed are highlighted in green. You can clear the code coverage display with the command palette "dezog: Clear current code coverage decoration".
- commandsAfterLaunch: Here you can enter commands that are executed right after the launch and connection of the debugger. These commands are the same as you can enter in the debug console. E.g. you can use "-sprites" to show all sprites in case of a ZX Next program. See [Debug Console](#debug-console).
- disassemblerArgs: Arguments that can be passed to the internal disassembler.
    - numberOfLines: The number of lines displayed in the disassembly.
    - esxdosRst: true/false. Default to false. If enabled the disassembler will disassemble "RST 8; defb N" correctly.
- rootFolder: Typically = workspaceFolder. All other file paths are relative to this path.
- topOfStack: This is an important parameter to make the callstack display convenient to use. Please add here the label of the top of the stack. Without this information DeZog does not know where the stack ends and may show useless/misleading/wrong information. In order to use this correctly first you need a label that indicates the top of your stack. Here is an example how this may look like:

Your assembler file:
~~~assembly
stack_bottom:
    defs    STACK_SIZE*2, 0
stack_top:
~~~

In your launch.json:
~~~json
"topOfStack": "stack_top"
~~~

Note:
- topOfStack: instead of a label you can also use a fixed number.
- load: The .nex, .sna (or .tap) file to load. On start of the debug session ZEsarUX is instructed to load this file.
Note: you can also omit this. In that case DeZog attaches to the emulator without loading a program. Breakpoints and the list/assembler files can still be set.
- loadObjs: Instead of a .nex, .sna or .tap file you can also directly load binary object files. You can load several object files and you have to give path and start address for each file, e.g.:
~~~json
"loadObjs": [
    { "path": "out/main.bin", "start": "0x6000" },
    { "path": "out/graphics.bin", "start": "0x8000" }
],
~~~
- execAddress: for object files you can set the PC (program counter) start address. I.e. after loading the program will start at this address.
- smallValuesMaximum: DeZog format numbers (labels, constants) basically in 2 ways depending on their size: 'small values' and 'big values'. Small values are typically constants like the maximum number of something you defined in your asm file.
Big values are typically addresses. Here you can give the boundary between these 2 groups. bigValues usually also show their contents, i.e. the value at the address along the address itself. Usually 512 is a good boundary value.
- tmpDir: A temporary directory used for files created during the debugging. This is e.g. used for the file to show the disassembly PC reaches areas without any associated assembler listing or for the save states.
- memoryViewer: The following properties configure the memory viewer (used to show memory dumps).
	- addressColor: The first column shows the address. You can change the color here.
	- asciiColor: You can change the color of the ascii field here.
	- addressHoverFormat: Format for the address when hovering.
	- valueHoverFormat: Format for the value when hovering.
	- registerPointerColors: An array with register/color pairs. All selected register will appear with the correspondent color in the memory view. Registers not chosen will not appear. E.g. ["HL", "darkgreen", "DE", "darkcyan", "BC", "darkgray" ]
	- registersMemoryView: An array of register to show in the register memory view. This view is automatically opened at startup and shows the memory the registers point to. E.g. select [ 'HL', 'DE', 'IX' ].
- unitTestTimeout: the timeout for each unit test. Default is 1s. Change this only if one of your unit test lasts longer.


If you just restart a debug session with
![](images/vscode_restart_button.jpg)
the launch.json is not re-read.
That means in order to make sure that your changed launch.json is used, save it and make sure the current debug session is stopped with
![](images/vscode_stop_button.jpg)
then start it via
![](images/vscode_continue_button.jpg)


### Assembler Configuration

Depending on your assembler you use a different configuration names:
- 'sjasmplus' for sjasmplus
- 'z80asm' for the Savannah-z80asm
- 'z88dk' for z88dk-z80asm

You basically define which listfile is used (or several listfiles) and depending on the assembler you may need to add certain parameters.


#### z80asm vs. z80asm

z80asm was and is still a very popular name for a Z80 assembler. There are especially 2 of them that I have used in the past and despite the name doesn't share very much.
To distinguish them I will call them
a) the **Savannah-z80asm** (or z80asm) from Bas Wijnen, see https://savannah.nongnu.org/projects/z80asm/ and the
b) the **z88dk-z80asm** (or z88dk) hosted here https://github.com/z88dk/z88dk (Note: on the site they host even another z80asm project which is a respawn of the original one.)

DeZog supports the list file formats of both of them and additionally the sjasmplus (https://github.com/z00m128/sjasmplus).


#### Background info: The list file

The most important configuration to do is the *.list file (or *.sld file). The list file contains
all the information required by DeZog. While reading this file DeZog
- associates addresses with line numbers
- associates addresses with files
- reads in labels and constants

An example how this works:
When you do a 'step-over' in the debugger, DeZog request the new PC (program counter) value from the emulator, e.g. ZEsarUX.
The address of the PC is looked up to find the line in the list file.
Now depending on the value of 'srcDirs'
- []: Empty array. The corresponding line in the list file is shown or
- otherwise: The originating asm-file is searched together with the associated line and the asm-file is shown at the right line.


**sjasmplus configuration:**

Note: sjasmplus can generate a list file but since DeZog version 2.0.0 DeZog does not use the sjasmplus list file anymore but the SLD file. You need sjasmplus >= 1.18.0 for DeZog to parse the SLD file correctly.

SLD stands for "Source Level Debugging" and is an format with similar information as the list file.
List files are meant to be read by humans whereas the SLD file format is optimized for reading by a machine, i.e. DeZog, which makes parsing much easier.
Apart from that the list file is lacking information about ['long addresses'](#long-addresses-explanation). I.e. addresses that not only include the address it self (0-0xFFFF) but also information about the paging/banking.
With this information DeZog is able to correctly associate files that are assembled for the same address but for different memory banks. It is also possible to place breakpoints correctly as not only the 64k address of a breakpoint is checked but also it's bank.

In order to let sjasmplus create an SLD file you need to set the following option on the command line:
~~~bash
--sld=your-program.sld
E.g.:
sjasmplus --sld=main.sld --fullpath main.asm
~~~

Inside one of your asm files you need to set a few more options:
- Use ```DEVICE something``` to set a device. Otherwise the SLD file will be empty. You can e.g. use ```ZXSPECTRUM48```, ```ZXSPECTRUM128```, ```ZXSPECTRUMNEXT``` or for a non-spectrum pure Z80 system without any banking: **```NOSLOT64K```**
- Add a line ```SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION``` to use DeZog's WPMEM, LOGPOINT and ASSERTION features. If ```SLDOPT ...``` is omitted sjasmplus will remove the info from the SLD file.

E.g. you could start your main.asm with:
~~~asm
    DEVICE ZXSPECTRUMNEXT
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION
~~~

or
~~~asm
    DEVICE NOSLOTDEVICE
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION
~~~

Then for the launch.json file you simply have to set the path to the SLD file. E.g.:
~~~json
"sjasmplus": [{
    "path": "z80-sample-program.sld"
    }]
~~~

Note: If for some reason you want to turn the banking information, i.e. the long addresses you can do so by setting ```disableBanking``` to true.
~~~json
"sjasmplus": [{
    "path": "z80-sample-program.sld"
    }],
    "disableBanking": true
~~~

**Savannah-z80asm configuration:**

Same as sjasmplus but use: ```z80asm```, e.g.:
~~~json
"z80asm": [{
    "path": "z80-sample-program.list",
    "srcDirs": [""],
    "excludeFiles": [ "some_folder/*" ]
    }]
~~~

- path: The path to the list file.
- srcDirs (default=[""]):
    - [] = Empty array. Use .list file directly for stepping and setting of breakpoints.
    - array of strings = Non-empty. Use the (original source) files mentioned in the .list file. I.e. this allows you to step through .asm source files. The sources are located in the directories given here. They are relative to the 'rootFolder'. Several sources directories can be given here. All are tried. If you don't arrange your files in subfolders just use '[""]' here or omit the parameter to use the default.
    - If you build your .list files from .asm files then use 'srcDirs' parameter. If you just own the .list file and not the corresponding .asm files don't use it.
- excludeFiles (default=[]): an array of glob patterns with filenames to exclude. The filenames (from the 'include' statement) that do match will not be associated with executed addresses. I.e. those source files are not shown during stepping. You normally only need this if you have multiple source files that share the same addresses. In that case one of the source files is shown. If that is the wrong one you can exclude it here. In the example above all files from "some_folder" are excluded.


**z88dk-z80asm configuration:**

~~~json
"z88dk": [{
    "path": "currah_uspeech_tests.lis",
    "srcDirs": [""],
    "mapFile": "currah_uspeech_tests.map",
    "mainFile": "currah_uspeech_tests.asm",
    "excludeFiles": [ "some_folder/*" ]
    }]
~~~

For 'path', 'srcDirs' nad 'excludeFiles' see z80asm configuration.

- mapFile: The map file is required to correctly parse the label values and to get correct file/line to address associations.
- mainFile: The relative path of the file used to create the list file.



**Other assemblers:**

If you use an assembler which produces a different file format you may convert it via a script to the one of the supported formats.
But this makes sense only if the format is very similar.

It is a better choice either to switch the assembler (e.g. I recommend sjasmplus) or write a new parser the assembler and add it to Dezog.

The process of writing a parser is described in detail here: [AddingNewAssemblers.md](https://github.com/maziac/DeZog/blob/master/design/AddingNewAssemblers.md)

You can create a pull request so I can add it to the official release.


#### Without a listfile

If you don't setup any list file or any assembler configuration then you can still start DeZog and it will work.
The internal disassembler [z80dismblr](https://github.com/maziac/z80dismblr) will be used for an on-the-fly disassembly.
Whenever the program is stopped or after each step it checks if a disassembly (or asm/list source) at the current PC already exists.
If not a short amount of memory is added to the disassembly.
Hence the disassembly will grow the more you step through the code.
For performance reasons a new disassembly is only done if the memory at the PC is unknown or if a few bytes that follow the PC value have changed.
I.e. the disassembly at the current PC is always correct while an older disassembly (at a different address) might be outdated. This may happen in case a memory bank has been switched or the code was modified meanwhile (self modifying code).


#### Assemblers and Labels

The following table lists the differences of the different assemblers in respect to the labels:

| Feature | Savannah/z80asm | z88dk/z80asm | sjasmplus |
|:--|:--|:--|:--|
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

DeZog supports most of them but with some restrictions:

- local labels: when hovering above a (local) label the current program counter is used to dissolve the context. I.e. the shown value is only correct if the PC is lower than the associated previous non-local label and no other non-local label is between the PC and the hover location.
- dot-notation: You have to hover over the last part of the dot notation to dissolve the complete label.
- temporary (number) labels: are not supported.
- sjasmplus: labels inside macros are not supported.


<!--
## Formatting

In the launch.json you can use another property to control the formatting of the registers done in the VARIABLES area.

~~~json
"formatting": [
    "AF", "AF: ${hex}h, F: ${flags}",
    "AF'", "AF': ${hex}h, F': ${flags}",
    "PC", "${hex}h, ${unsigned}u${, :labelsplus|, }",
    "SP", "${hex}h, ${unsigned}u${, :labelsplus|, }",
    "HL", "(${hex}h)b=${b@:unsigned}, ${unsigned}u, ${signed}i${, :labelsplus|, }",
    "IM", "${unsigned}u",
    "..", "${hex}h, ${unsigned}u, ${signed}i${, :labelsplus|, }",
    "F", "${flags}",
    "R", "${unsigned}u",
    "I", "${hex}h",
    ".", "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}"
]
~~~

Defines the formatting of the registers when displayed in the VARIABLES area. E.g. as hex value or as integer. Also allows to display labels and various other formats. Use:\n${name} = the name of the register, e.g. HL\n${hex} = value as hex, e.g. A9F5\n${dhex} = value as hex with space between bytes, e.g. A9 F5\n${unsigned} = value as unsigned, e.g. 1234\n$(signed) = value as signed, e.g. -59\n$(bits) = value as bits , e.g. 10011011\n$(flags) = value interpreted as status flags (only useful for F and F'), e.g. ZNC\n${labels} = value as label (or several labels)\n{labelsplus} = value as label (or several labels) plus an index/offset\n${pre:labels:join} = value as label (or several labels). If no label is found nothing is printed. If at least 1 label is found the 'pre' string is printed followed by the label(s). If more than 1 label is found they are concatenated with the 'join' string.\n${b@:...} = This prefix to hex, unsigned, signed or bits allows to show the memory content of the value, i.e. it uses the value as address and shows it's contents. E.g. you can use ${b@:bits} to show the memory contents of the address the register is pointing at as a bit value.",
-->



## Remote Types

With DeZog you have the option to use different remotes.
They are distinguished via the "remoteType":
- "zsim": Internal Z80 Simulator
- "zrcp": ZEsarUX (or ZesaruxExt) emulator
- "cspect": CSpect emulator
- "zxnext": ZX Next connected via serial cable.


### What is a 'Remote'?

A Remote is normally an external emulator that is running independently of DeZog.
ZesarUX e.g is such a Remote.
It is connected via some interface (for ZEsarUX this is a socket) and a protocol (for ZEsarUX ZRCP - ZEsarUX Remote Communication Protocol).

But a Remote could also be real HW. E.g. real ZX Next hardware.
The ZX Next can be connected via a serial interface to the PC.
Via a USB-to-Serial Interface the serial data is available e.g. at /dev/tty.usbserial (macOS).


### Remote capabilities

The different Remotes have different capabilities in conjunction with DeZog.
The following table gives an overview.

|                     | Internal Z80 Simulator | ZEsarUX | ZesaruxExt | ZX Next  | CSpect   |
|:------------------------|:-------------------|:--------|:-----------|:---------|:---------|
| State                   | stable             | stable  | stable     | stable   | stable   |
| Breakpoints             | yes                | yes     | yes/fast   | yes      | yes      |
| Break reason output     | yes                | no      | yes        | yes      | yes      |
| Conditional Breakpoints | yes                | yes     | yes/fast   | yes/slow | yes/slow |
| WPMEM (Watchpoints) support | yes            | yes 2)  | yes/fast 2) | no      | no       |
| ASSERTION support       | yes                | yes      | yes        | yes/slow | yes/slow |
| LOGPOINT support        | yes                | no      | yes        | yes/slow | yes/slow |
| Long addresses/breakpoints | yes             | yes     | yes        | yes      | yes      |
| Extended callstack      | no                 | yes     | yes        | no       | no       |
| Code coverage           | yes                | yes 1)  | yes        | no       | no       |
| Reverse debugging       | true               | true    | true       | lite     | lite     |
| ZX Next capable         | no                 | yes     | yes        | yes      | yes      |
| Save/restore the state  | yes                | yes     | yes        | no       | no       |
| Output of T-States      | yes                | yes     | yes        | no       | no       |
| Display of sprite attributes/patterns | yes  | yes     | yes        | no       | yes      |
| Load .sna/.nex/.obj file through DeZog | yes | yes     | yes        | yes      | yes      |
| Load .tap file through DeZog | no            | yes     | yes        | no       | no       |
| Run Z80 Unit Tests      | yes                | yes     | yes        | no       | no       |
| Comments     | slower than ZEsarUx or CSpect |         | Breakpoints are faster than in ZEsarUX | |

Notes:
- State:
    - stable: Works reliable
    - experimental: may or may not work
    - started: Development has started but is not ready, i.e. not usable.
    - planned: Development has not yet started.
- slow/fast: "slow" means that the evaluation is done by DeZog. This involves stopping the emulator (the remote) at a break point and evaluating the breakpoint in DeZog. If the condition is false the emulator is 'continued'. "fast" mens that the evaluation is done by the remote (the emulator) itself. Thus no communication with DeZog is involved and therefore it is much faster.
- ZesaruxExt is not available at the moment.
- 1 ) ZEsarUX code coverage uses 16 bit addresses only. I.e. if slots are changed during execution the shown info might be wrong. But in most cases the output will be just fine.
- 2 ) ZEsarUX memory breakpoints use 16bit only. I.e. no support for long addresses. You may experience that a memory breakpoint is hit in a wrong bank if banking is used.

### The Internal Z80 Simulator

![](images/zsim_starwarrior.gif)

This is a special remote type ('zsim') as it is not really 'remote' but the simulator is included in Dezog and thus doesn't need to be connected via sockets or what ever.
It's the easiest setup. You just need DeZog (and vscode):

~~~
┌───────────────┐              ┌────────────────────┐
│               │              │DeZog               │
│               │              │                    │
│               │              │       ┌───────────┐│
│    vscode     │              │       │           ││
│               │◀────────────▶│       │ Internal  ││
│               │              │       │ Simulator ││
│               │              │       │           ││
│               │              │       └───────────┘│
└───────────────┘              └────────────────────┘
~~~

'zsim' is a very simple Z80/ZX Spectrum simulator.
It allows to test programs that does not make use of special HW features like the [z80-sample-program](https://github.com/maziac/z80-sample-program).

'zsim' is basically just a Z80 simulator. But you can add a few ZX Spectrum related features so that it is possible to use for debugging ZX48 and ZX128 programs.

'zsim' supports:
- Display of the ZX Spectrum ULA screen
- The ports of the keyboard
- The ZX128 memory banks
- Loading of (48 and 128) .sna and .nex files

It specifically does not support:
- ZX Next HW (other than memory bank switching)
- Loading of .tap/.tzx files
- Audio


Performance:
- Don't expect accurate timings.
The interrupt (IM1 and IM2) is executed after about 20ms * 3.5 MHz T-states.
- Simulation speed, of course, depends on your PC but don't expect it to run at the normal speed of a ZX Spectrum. You can expect something about 5x slower.

One thing to mention that can be an advantage during development:

Emulators (like ZEsarUX) normally try to accurately emulate the exact behaviour.
The included simulator does not. This means: if you step through your assembly code and e.g. write to the screen an emulator would normally show the result after the raybeam has passed the position on the screen. I.e. you normally don't see directly what's happening on the screen.
The simulator on the other hand immediately displays any change to the screen while stepping. This can also be an advantage during debugging.

Example launch.json configuration:
~~~json
    "remoteType": "zsim",
    "zsim": {
        "Z80N": true,
        "zxKeyboard": true,
	    "ulaScreen": true,
	    "visualMemory": true,
        "cpuLoadInterruptRange": 1,
        "vsyncInterrupt": true,
        "cpuFrequency": 3500000.0,
        "memoryModel": "RAM",
        "customCode": {
            "debug": true,
            "jsPath": "myPeripheral.js",
            "uiPath": "myUi.html",
            "timeStep": 1000
        }
    }
~~~

With all options disabled zsim behaves just as a Z80 CPU with 64k RAM without any ZX Spectrum features.

If you need to define a ZX48K machine you could use
~~~json
    "zsim": {
        "zxKeyboard": true,
	    "ulaScreen": true,
	    "visualMemory": true,
        "vsyncInterrupt": true,
        "memoryModel": "ZX48K"
    }
~~~

For a ZX128K:
~~~json
    "zsim": {
        "zxKeyboard": true,
	    "ulaScreen": true,
	    "visualMemory": true,
        "vsyncInterrupt": true,
        "memoryModel": "ZX128K"
    }
~~~

For a ZX Next like system (note: this simulates only the Next's memory paging):
~~~json
    "zsim": {
        "Z80N": true,
        "zxKeyboard": true,
	    "ulaScreen": true,
	    "visualMemory": true,
        "vsyncInterrupt": true,
        "memoryModel": "ZXNEXT"
    }
~~~

Here is the explanations of all the options:
- "Z80N": true/false. Defaults to false. Enables the Z80N (ZX Next) instruction set. See https://wiki.specnext.dev/Extended_Z80_instruction_set .
- "zxKeyboard": true/false. Defaults to false. If enabled the simulator shows a keyboard to simulate keypresses.
![](images/zsim_keyboard.jpg)
- "visualMemory": If true the simulator shows the access to the memory (0-0xFFFF) visually while the program is running. Default is true.
![](images/zsim_visual_memory.jpg)
- "memoryModel": The used memory model (defaults to "RAM"), i.e.
    - "RAM": One memory area of 64K RAM, no banks.
	- "ZX48": ROM and RAM as of the ZX Spectrum 48K.
	- "ZX128": Banked memory as of the ZX Spectrum 48K (16k slots/banks).
	- "ZXNEXT": Banked memory as of the ZX Next (8k slots/banks).
- "ulaScreen": true/false. Defaults to false. If enabled it shows the contents of the ZX Spectrum screen.
![](images/zsim_ula_screen.jpg)
- "cpuLoadInterruptRange": Default is 1. The number of interrupts to calculate the CPU-load average from. 0 to disable. The CPU load is calculated by the number of executed t-states of all instructions without the HALT instruction divided by the number of all executed t-states. I.e. the time the CPU executes just HALT instructions is not considered as CPU load. Naturally, if you have turned off interrupts the CPU load is always 100%. Normally the average is calculated from interrupt to interrupt but you can extend the range to 2 or more interrupts. To disable the display choose 0.
![](images/zsim_cpu_load.jpg)
- "vsyncInterrupt": Default is false. Enable it if you use zsim to emulate a ZX Spectrum. If enabled an interrupt is generated after ca. 20ms (this assumes a CPU clock of 3.5MHz).
- "cpuFrequency": The CPU frequency is only used for output. I.e. when the t-states are printed there is also a printout of the correspondent time. This is calculated via the CPU frequency here. It does not affect in any way the simulation speed.
- "customCode": This enables the custom code to run inside the simulator, e.g. to simulate additional ports. See [zsimPeripherals.md](https://github.com/maziac/DeZog/blob/master/documentation/zsimPeripherals.md) for more details.


### ZEsarUX

The setup is slightly more complicated as it involves communication with another program: the ZEsarUX emulator.

~~~
┌───────────────┐              ┌─────────────────┐          ┌────────────────────┐
│               │              │                 │          │                    │
│               │              │                 │          │                    │
│               │              │                 │          │                    │
│    vscode     │              │      DeZog      │          │      ZEsarUX       │
│               │◀─────────────│                 │          │                    │
│               │              │                 │          │                    │
│               │              │                 │          │                    │
│               │              │                 │          └────────────────────┘
└───────────────┘              └─────────────────┘                     ▲
                                        ▲                              │
                                        │                              │
                               ┌────────▼──────────────────────────────▼─────────┐
                               │  ┌──────────┐                   ┌──────────┐    │
                               │  │  Socket  │◀─────────────────▶│  Socket  │    │
                               │  └──────────┘                   └──────────┘    │
                               │              macOS, Linux, Windows              │
                               └─────────────────────────────────────────────────┘
~~~

The remote type is "zrcp".
ZEsarUX needs to run before the debug session starts and needs to be connected via a socket interface (ZRCP).
You need to enable the ZRCP in ZEsarUX. In ZEsarUX enable the socket zrcp protocol either by command-line ("--enable-remoteprotocol")
or from the ZEsarUX UI ("Settings"->"Debug"->"Remote protocol" to "Enabled").

You need to enable ZEsarUX in your Z80 program's launch.json configuration, e.g.:
~~~json
    "remoteType": "zrcp",
    "zrcp": {
        "port": 10000
    }
~~~

The "zrcp" configuration allows the following additional parameters:
- "port": The ZEsarUX port. If not changed in ZEsarUX this defaults to 10000.
- "hostname": The host's name. I.e. the IP of the machine that is running ZEsarUX. If you are not doing any remote debugging this is typically "localhost". Note: Real remote debugging (emulator running on another PC) does work, but requires a mechanism to copy the .sna/nex file to the remote computer.
You don't have to enter a hostname, the default is "localhost".
- skipInterrupt: Is passed to ZEsarUX at the start of the debug session. If true (default is false) ZEsarUX does not break in interrupts (on manual break).
- "loadDelay": Some people encounter a crash (rainbow/kernel panic) of ZEsarUX at the start of a debug session when running under Windows. If that is true for you as well you can experiment with the "loadDelay" option which adds an additional delay at startup. This mitigates the problem.
The default for Windows is 100 (ms). If you run into this problem you can try to increase the value to 400 or even 1000. (You can also try smaller values than 100).




Notes:
- If ZEsarUX is used with the --tbblue-fast-boot-mode loading of tap files won't work.
- Important: Make sure that there is no UI window open in ZEsarUX when you try to connect it from vscode.
Sometimes it works but sometimes ZEsarUX will not connect.
You might get an error like "ZEsarUX did not communicate!" in vscode.
- If the DeZog functionality is not sufficient for you, you also have have full access to the ZEsarUX ZRCP through vscode's debug console.
Enter "-help" in the debug console to see all available commands.
Enter e.g. "-e h 0 100" to get a hexdump from address 0 to 99.



### Useful ZEsarUX command-line options.

To ease the usage of ZEsarUX with DeZog you can use several ZEsarUX command line options.
I have collected a few that I found useful:

```bash
## Try this if the ZEsarUX screen is not updated during debugging.
./zesarux --disable-autoframeskip &
```

```bash
## Start a "normal" ZX Spectrum (48k) and listen for connection from DeZog.
./zesarux --enable-remoteprotocol &
```

```bash
## Start in ZX Next configuration. ZEsarUX skips the booting and emulates the esxdos rst routines.
## The file system is mounted via "--esxdos-root-dir".
## With this configuration ZX Next programs can be very easily developed and debugged.
## The Z80 program is passes as SNA file. "--sna-no-change-machine" disables the ZEsarUX automatic change to a 48k Spectrum machine.
##./zesarux --noconfigfile --machine tbblue --realvideo --enabletimexvideo --tbblue-fast-boot-mode --sna-no-change-machine --enable-esxdos-handler --esxdos-root-dir "\<path-to-your-z0-programs-dir\>" --enable-remoteprotocol &
```

```bash
## ZX Next: Start from MMC.
## To change an mmc file (e.g. on Mac) take the original tbblue.mmc, change the extension
## to .iso (tbblue.iso). Mount the iso image. Add your files. Unmount the image.
## Rename back to .mmc (optional).
./zesarux --machine tbblue --sna-no-change-machine --enable-mmc --enable-divmmc-ports --mmc-file "<your-mmc-image>"  --enable-remoteprotocol &
```

Please note: Normally you can set the commandline option also directly in the ZEsarUX Settings GUI.


### CSpect

For this setup you need 2 additional programs: the CSpect emulator and the DeZog/CSpect Plugin.

~~~
┌───────────────┐              ┌─────────────────┐          ┌────────────────────┐
│               │              │                 │          │                    │
│               │              │                 │          │       CSpect       │
│               │              │                 │          │                    │
│    vscode     │              │      DeZog      │          │                    │
│               │◀────────────▶│                 │          └────────────────────┘
│               │              │                 │                     ▲
│               │              │                 │                     │
│               │              │                 │                     ▼
└───────────────┘              └─────────────────┘          ┌────────────────────┐
                                        ▲                   │    DeZog Plugin    │
                                        │                   └────────────────────┘
                                        │                              ▲
                                        │                              │
                               ┌────────▼──────────────────────────────▼─────────┐
                               │  ┌──────────┐                   ┌──────────┐    │
                               │  │  Socket  │◀─────────────────▶│  Socket  │    │
                               │  └──────────┘                   └──────────┘    │
                               │              macOS, Linux, Windows              │
                               └─────────────────────────────────────────────────┘
~~~


The remote type is "cspect".
CSpect needs to run before the debug session starts and needs to be connected via a socket interface ([DZRP](https://github.com/maziac/DeZog/blob/master/design/DeZogProtocol.md)).
CSpect does not offer a socket interface to DeZog by itself it needs the help of the [Dezog CSpect Plugin](https://github.com/maziac/DeZogPlugin).

You need to install it first. Please see [here](https://github.com/maziac/DeZogPlugin/blob/master/Readme.md#plugin-installation).


You need to enable CSpect in your Z80 program's launch.json configuration, e.g.:
~~~json
    "remoteType": "cspect",
~~~

That should normally do.
If you need to configure the port use:
~~~json
    "remoteType": "cspect",
    "cspect": {
        "port": 11000
    }
~~~

The "cspect" configuration allows the following additional parameters:
- "port": The CSpect DeZog plugin port. If not changed  this defaults to 10000.
- "hostname": The host's name. I.e. the IP of the machine that is running CSpect. If you are not doing any remote debugging this is typically "localhost".
You don't have to enter a hostname, the default is "localhost".

Note: You can start CSpect with the "-remote" option. In that case CSpect will not show it's debugger screen when stopped.


### macOS

To run CSpect under macOS or Linux you need to install Mono first.
A typical commandline to start CSpect looks like:
~~~
mono CSpect.exe -w4 -zxnext -nextrom -exit -brk -tv -r -v -debug
~~~



### ZX Next / Serial Interface

#### Overview

The serial interface is the most complex setup as it requires communication with a real ZX Spectrum Next (HW):

~~~
                                                                                         ┌──────────────────────────┐
                                                                                         │         ZX Next          │
                                                                                         │ ┌──────────────────────┐ │
┌───────────────┐     ┌─────────────────┐                                                │ │   Debugged Program   │ │
│               │     │                 │                                                │ └──────────▲───────────┘ │
│               │     │                 │                                                │            │             │
│               │     │                 │                                                │ ┌──────────▼───────────┐ │
│    vscode     │     │      DeZog      │                                                │ │       dezogif        │ │
│               │◀───▶│                 │                                                │ │          SW          │ │
│               │     │                 │                                                │ └──────────▲───────────┘ │
│               │     │                 │                                                │            │             │
│               │     │                 │     ┌──────────────────────────┐               │          ┌─▼──┐          │
└───────────────┘     └─────────────────┘     │  DeZog Serial Interface  │               │          │UART│          │
                               ▲              │            SW            │               │          │HW  │          │
                               │              └──────────────────────────┘               └──────────┴────┴──────────┘
                               │                    ▲                ▲                                ▲
                               │                    │                │                                │
                      ┌────────▼────────────────────▼────────────────▼───────────────┐                ▼
                      │  ┌──────────┐         ┌──────────┐     ┌──────────────┐      ├────┐     ┌──────────┐
                      │  │  Socket  │◀───────▶│  Socket  │     │    Serial    │      │USB │     │USB/Serial│
                      │  └──────────┘         └──────────┘     │COM, /dev/tty │◀────▶│HW  │◀───▶│Converter │
                      │                                        └──────────────┘      ├────┘     │HW        │
                      │                    macOS, Linux, Windows                     │          └──────────┘
                      └──────────────────────────────────────────────────────────────┘
~~~

DeZog does not directly talk to the USB/UART interface of your OS. Instead it uses another program, the [DeZogSerialInterface](https://github.com/maziac/DeZogSerialInterface) which offers a socket and translates all communication to the serial interface USB/UART.
(Background: The reason for this additional program is that the node.js serialport binary package tends to break with new releases of vscode, see [here](https://cultivatehq.com/posts/how-we-built-a-visual-studio-code-extension-for-iot-prototyping/) for more details.)

The serial interface needs to be connected to the UART of a [ZX Spectrum Next](https://www.specnext.com).
In order to communicate with the ZX Next special SW needs to run on the Next, the [dezogif](https://github.com/maziac/dezogif).


Example launch.json configuration:
~~~json
    "remoteType": "zxnext",
    "zxnext": {
        "port": 12000
    }
~~~

The "zxnext" configuration allows the following additional parameters:
- "port": The CSpect DeZog plugin port. If not changed  this defaults to 12000.
- "hostname": The host's name. I.e. the IP of the machine that is running CSpect. If you are not doing any remote debugging this is typically "localhost".
You don't have to enter a hostname, the default is "localhost".

The default port is anyway 12000. So, if you don't change it, you just have to add:
~~~json
    "remoteType": "zxnext"
~~~


#### Setup

Prerequisites:
1. Install at least core 3.1.5 on the ZX Next.
2. You need an USB/Serial converter and a D-Sub female connector (9 pins). See next chapter on HW.


Setup a debug session:
1. In your ZX Next SD card exchange the ```enNextMf.rom``` in directory ```machines/next``` with the one from the [dezogif](https://github.com/maziac/dezogif) project. You find the ```enNextMf.rom``` binary in the [releases](https://github.com/maziac/dezogif/releases) section.
(Don't forget to make a backup of the original ```enNextMf.rom```.)
2. Add a configuration as shown above in your launch.json (For an example look at the [z80-sample-program](https://github.com/maziac/z80-sample-program)).
3. Connect your PC/Mac with the ZX Next via a serial connection. On the ZX Next use the joystick ports for the UART connection (preferable Joy 2).
4. Start the [DeZogSerialInterface](https://github.com/maziac/DeZogSerialInterface) in a terminal. For macos e.g. use:
./dezogserialinterface-macos -socket 12000 -serial /dev/cu.usbserial-AQ007PCD
Notes:
    - Change the serial port ("-serial ...") to your needs.
    - There exist also binaries for Linux and Windows.
    - Check the [DeZogSerialInterface](https://github.com/maziac/DeZogSerialInterface) project for more options to test the connection.
4. On the ZX Next press the yellow NMI button once to initialize the debugger on the ZX Next.
![](images/dezog_zxnext_main.jpg)
(If you later need to re-initialize press "Symbol Shift", or CTRL on a PS2 keyboard, and while being pressed hit the yellow NMI button.)
5. In vscode start the debug session.
6. Step through your code.

You should see that the debugged program is transmitted to the ZX Next: the border colors change similar as when you would load a program from tape.
![](images/dezog_zxnext_loading.jpg)

Please use the [z80-sample-program](https://github.com/maziac/z80-sample-program) for your first tries. It already contains a working "ZXNext" launch.json configuration.

You can now step through your code and set breakpoints.
The debugger will stop at a breakpoint.


#### Pausing the Debugged Program

While the debugged program is running there is no communication between DeZog and the ZX Next.
I.e. it is also not possible to pause the program through the serial cable.
For pausing your program you need to press the yellow M1 button at the left side of your ZX Next.


#### HW

**Disclaimer**

**As you will probably have to construct your own cable which involves HW, there is always a small risk that you damage your ZX Next or your PC/Mac.
You should only try to do this yourself if you already have experience with electronics and at least basically know what you are doing.**

**IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM THE USE OF THE HW, SW OR ANYTHING ELSE PRESENTED HERE.**

You require a USB/Serial converter like this [one](https://www.amazon.com/Serial-Adapter-Female-FT232RL-Windows/dp/B07R45QJVR/ref=sr_1_1_sspa?__mk_de_DE=ÅMÅŽÕÑ&dchild=1&keywords=Serial+UART-Konverterkabel+USB+TTL+3.3+V&qid=1595515176&sr=8-1-spons&psc=1&spLa=ZW5jcnlwdGVkUXVhbGlmaWVyPUEyR1M0VFUzR0tGVkgmZW5jcnlwdGVkSWQ9QTA0Mzk4NDYzVUkySkE0S0ZGS0MwJmVuY3J5cHRlZEFkSWQ9QTA3NzU0NDQzRU85R05FQkJMMEFSJndpZGdldE5hbWU9c3BfYXRmJmFjdGlvbj1jbGlja1JlZGlyZWN0JmRvTm90TG9nQ2xpY2s9dHJ1ZQ==):
![](images/usb_serial_cable.jpg)

It needs to be capable of 921600 Baud.

(Note: I also used a cable from Adafruit. It's working as well. It was faster for small packets but I had to disconnect it physically from my mac more often to get it back working.)

On the other side only 3 wires are required:
![](images/usb_serial_connectors.jpg)
- GND
- TX (TXD)
- RX (RXD)

These wires have to be connected to the UART.

Easiest way, without opening the ZX Next case, is to use one of the joy ports of the ZX Next.

You need to attach a female D-SUB 9 connector to your serial cable:
![](images/dsub9.jpg)

You need to connect:
| Serial cable | connected to | D-Sub 9 |
|:------------:|:------------:|:-------:|
| GND          | <->          | 8 (Next GND) |
| RX           | <->          | 7 (Next Tx) |
| TX           | <->          | 9 (Next Rx) |

Note: You connect the serial cable's Tx to the Next's Rx and the Rx with the Tx.

![](images/dsub9_connected.jpg)


Alternatively, if you need to use both joysticks while debugging you directly connect the ESP UART:
![](images/uart_cn9.jpg)

You need to connect:
| Serial cable | connected to | CN9        |
|:------------:|:------------:|:----------:|
| GND          | <->          | 4 (GND)    |
| RX           | <->          | 1 (ESP RX) |
| TX           | <->          | 5 (ESP_TX) |

You can solder it directly or use the socket that is already available on the board:
![](images/uart_socket.jpg)

![](images/uart_pin_header.jpg)


#### Caveats

##### Joystick ports

As the joystick ports are shared by the joysticks and by the UART/serial cable the communication with DeZog can happen only when the debugged program is being paused.
E.g. you can't set a breakpoint while your program is running. You need to pause it first, set a new breakpoint and then continue the program.


##### Memory banks

The dezogif program on the ZX Next needs some space. It uses the MF ROM/RAM and bank 94.
For your program it means you mustn't use bank 94 otherwise DeZog will not work.


##### Stack

A) This is more a note: If you watch the stack while stepping you can see that some values below the SP are changing on each step. This is additional info (e.g. for breakpoint addresses) used by DeZog. The values are below SP so they should not harm normal program operation.

B) Performance: If you have a large stack or a **wrong topOfStack** setting in the launch.json stepping might become sluggish. This is because DeZog does a lot of analysis on the stack, e.g. it reads not only the stack but also memory that a stack entry points to. If the topOfStack is wrong many false reading is done after each step which slows down the system.


##### SW Breakpoints

A) For SW breakpoints internally the instruction is replaced with a RST instruction. I.e. when a breakpoint is hit the PC is placed on the stack.
Thus, if a breakpoint is placed at a location where the SP has been manipulated the stack is corrupted when the breakpoint is hit.
~~~assembly
		push bc
		inc sp
BP->	inc sp
BP->	do something
BP->	...
BP->	...
BP->	dec sp
BP->	dec sp
	pop bc
~~~
Placing a BP at any of the above location will destroy the pushed BC value if the BP is hit.

Workaround: Don't place a breakpoint at these locations.

Furthermore the debugger program requires 8 bytes on the debugged program's stack.

So take care to use a stack that can hold these additional bytes at any time.

B) Memory Paging
The ZX Next SW Breakpoints do not work very well with memory paging.
If you place a breakpoint in your source file the address for the source file line is taken and a breakpoint is put at that address.
If at this moment a bank is paged in that does not correspondent to the source file a breakpoint is placed in the wrong bank.
As for the ZX Next a breakpoint means to change the code at the address it means that the code/data in the wrong bank is changed.
This could either
- be at instruction start by accident with no further consequences
- destroying instructions if placed in the middle of a multi-byte instructions
- corrupt some data

Therefore you need to place the breakpoints carefully if you are placing them in an area that is shared between different memory banks.

Furthermore you should note that all breakpoints are put in just before a debugger step or continue and removed afterwards.
I.e. if you have a "stale" breakpoint in some file it could make problems if this location changes the used bank.


C) As SW breakpoints replace the code at the breakpoint address you cannot place any SW breakpoint inside ROM code.


D) You cannot set a breakpoint while the debugged program is running. This is because no communication between deZog and the debugged program takes place while it is running.
To set a breakpoint first pause your program by pressing the yellow NMI button. Then set the breakpoint and continue.


E) Stepping over RST 8 is possible. However if RST 8 is used for the ESXDOS file operations you should enable **esxdosRst** with
~~~json
"disassemblerArgs": {
    "esxdosRst": true
},
~~~


##### Layer 2

DeZog can work with "Layer 2 write-only paging", i.e. bit 0 of port 0x123B being set.
For bit 2, "read-only paging" it is different as DeZog needs a few bytes in the area 0x0000-0x1FFF for execution, i.e. for breakpoints and stepping. If "read-only paging" is enabled this area is blocked for DeZog.
If you e.g. try to step when "read-only paging" is enabled then the system will crash.
However, you can still use "read-only paging" in your program, you just shouldn't put a breakpoint somewhere where it is enabled or step in such code.


##### NMI

To interrupt the debugged program an NMI can be used (pressing the yellow NMI button).
As an NMI places the current PC on the stack and can occur anytime it can and will corrupt the stack **if** it happens while the debugged program is manipulating the SP.

There is nothing to do about it other than
- never increase the SP if the value on the stack is still required
- disable the M1 (NMI) button via the Next register 0x06 during these critical sections

For the debugged program this means
- If your program heavily relies on SP manipulation (increasing SP **while values below SP are still required**) then take care to guard the code section with NMI disable/enable via disabling/enabling the M1 button in register 0x06. You could also re-write the code such that it loads the SP into another register (e.g. IX) and access the stack values through that register.
- If you don't manipulate the SP in that way you don't have to bother with disabling the NMI M1 button.
- If you only rarely use the SP in that way: the probability for the scenario above is certainly quite low. I.e. you can simply ignore it. But you should keep in mind that if something odd happens when you press the NMI M1 button that it could be the reason described above.


## Usage

If you use any Remote other than the internal Simulator please make sure that it is started before you start the debug session with DeZog.

Now start DeZog by pressing the green arrow in the debug pane.

DeZog will now

- connect to the remote (e.g. open the socket connection to ZEsarUX)
- instruct the Remote (e.g. ZEsarUX) to load the nex, snapshot file or tap file
- set breakpoints (if there are breakpoints set in vscode)
- stop/break the just started assembler program

DeZog/vscode will now display the current PC (program counter) with a yellow arrow in the left side of your .asm file.
Left to that you see the VARIABLES section and the
call stack in the CALL STACK section.

You can now try the following:

- hover over registers in your source code -> should display the value of the register
- step-over, step-in etc.
- click in the call stack -> will navigate you directly to the file
- set breakpoints, press continue to run to the breakpoints




### Reverse Debugging

A special feature of DeZog is the possibility to reverse debug your program.
(Sometimes this is referred to as "[Time travel debugging](https://en.wikipedia.org/wiki/Time_travel_debugging)", "Historical debugging" or "Replay debugger".)
This means you can go "back in time" and inspect program flow and register values from the past.

The number of instructions you can step back is configurable and just a matter of memory.
E.g. one instruction line will occupy ca. 40 bytes of memory. So to store 1 second you need approx. 1 million instructions with a Z80 CPU that uses 4Mhz. This results in about 40MB.
Or in other words: if you would like to spend 1GB RAM you could store 25 secs.

The number of instructions is set in
~~~json
"history": {
    "reverseDebugInstructionCount": 20000,
}
~~~
The default is set to 10000 instructions and should be more than enough for most use cases. (Use 0 to disable.)

Reverse debugging is basically done via the 2 red circled buttons in vscode:
![](images/revdbg_buttons.jpg)

The first does a single step back (one instruction) and the 2nd runs through the whole recorded history until it hits a breakpoint or until the end of the history is reached.

When you step back the lines in the source code are visually marked with a slight gray background so you know that you are in reverse debugging mode:
![](images/revdbg_visualization.jpg)

When you are in reverse debugging mode and do a forward continue/step-over/step-into/step-out the commands operate on the instruction history.
I.e. you can step back and forward in the code as you like.
Registers and the callstack are updated accordingly.

But please note: The history stores only the register values and stack contents. I.e. the memory or other HW state is not stored.
So whenever a memory location is changed from the program code in reverse debugging this will not be reflected in e.g. the memory view.
You can only rely on the register values.


#### History Spot

You can enable/disable a history spot around the current PC:
~~~json
"history": {
    "spotCount": 10
}
~~~

If enabled (!= 0) you see the historic indices of the instructions. E.g. here:
![](images/spot_count1.jpg)

The indices are shown in brackets to the right.
The PC is currently in line 32.
The previous executed instruction is at index -1. Before at line 30 is index -2.

With the *History Spot* you can see what has just happened before without having to back step.

After the ":" you can see register values of changed registers. The displayed value is the register(s) that have been changed after the instruction was executed.
Some explanations:
- line 25: SP is shown because it was changed from the previous line which called the function (not shown here).
- line 26: No register value has changed
- line 27: In previous instruction register e has been loaded from l. But because e and l were already equal no value was changed. Therefore no register is displayed.
- line 28: In previous line register D was changed.
- line 29: In previous line register DE was incremented.
- line 30: In previous line register BC was decremented.
- line 31: In previous line LDIR has been executed. This is a block command. I.e. several registers are changed at once. After LDIR has been executed BC is 0 and you see the last values of DE and HL.

In case a line/instruction has been executed more than once you will find several indices in the brackets. E.g.:
![](images/spot_count2.jpg)

When you step back you can also see the next instructions i.e. where you came from.
If 'spotCount' is e.g. 10 you see a maximum of 10 previous and next indices.

Note: Changed registers are not shown for the first line of the spot.

Display of changed registers is enabled by default. You can turn it off by setting 'spotShowRegisters' to false:
~~~json
"history": {
    "spotCount": 10,
    "spotShowRegisters": false
}
~~~

Here is an animated gif to illustrate the history spot behavior while stepping (with register display turned off):
![](images/spot_count_animated.gif)


#### Breakpoints etc. in Reverse Debug Mode

You can also use breakpoints during reverse debugging.
The normal (program counter related) breakpoints work just as you would expect.

It is also possible to add a condition. I.e. you can additionally test for certain register values.

But please note that during reverse debugging the memory contents is not evaluated. A breakpoint that checks for memory is not evaluated correctly. In such a case the breakpoint will fire always.
E.g. a condition like this
~~~
b@(HL) == 0
~~~
will be evaluated to true always so that you don't miss such a breakpoint.


Logpoints (LOGPOINT), watchpoints (WPMEM) and ASSERTIONs are not evaluated during reverse debugging.


### Code Coverage

Code coverage can be enabled/disabled via:
~~~json
"history": {
    "codeCoverageEnabled": true
}
~~~

The default is 'true'.

If code coverage is enabled all executed lines in your source code are visually marked with a green background.
![](images/coverage_visualization.jpg)

You can use the code coverage feature in several ways. E.g. in unit tests you can directly see which lines of code are not covered. I.e. for which conditions you still need to write a test.
Or during debugging you can clear the code coverage (palette command "dezog: Clear current code coverage decoration") and then step over a function (a CALL). Afterwards you can navigate into the function and see what has been executed and which branches have not.


### Stop Debugging

To stop debugging press the orange square button in vscode. This will stop DeZog and disconnect from ZEsarUX.
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
Please note that we waste 1 byte (defb 1) for this safety check. This byte is not to be used by any pointer in our program. So writing/reading to it is a failure and the program will break if this happens.

Another useful scenario is to secure the stack for over- or underrun:

~~~assembly
; Reserve stack space
stack_bottom:
    defw    0   ; WPMEM, 2
    defs    50*2, 0
stack_top:
    defw 0  ; WPMEM, 2
~~~
This will observe 2 addresses at the bottom and 2 addresses at the top.


Caveats:

- Other than for sjasmplus WPMEMs are evaluated also in not assembled areas, e.g. in case the surrounding IF/ENDIF is not valid.
- The 'memory breakpoints' used in ZEsarUX have 2 specific limitations:
    - Imagine you have set a watchpoint WPMEM at address 4000h.
If a byte is written to 4000h, e.g. with "LD (4000h),A" the break will occur, no problem.
But if a word (i.e. 2 bytes) is written to 4000h like in "LD (4000h),HL" the lower address is not checked. I.e. a break will not happen. Only the upper address is checked. If the word would be written to 3FFFh e.g. with "LD (3FFFh),HL" then a break would happen.
    - You need to make sure that the debug settings for the memory breakpoints are set to "Settings->Debug->Breakp. behaviour" to "On Change". Otherwise a break will be done on every instructions following the memory access until another different memory access happens.
    But even if set to "On Change" it's problematic. If afterwards another access to the same address happens no break will occur.

Notes:

- WPMEMs are disabled by default. If you want to have WPMEMs enabled after launch then put "-WPMEM enable" in the "commandsAfterLaunch" settings.
- (sjasmplus) If you use label names make sure to use the global name (i.e. full dot notation).


### ASSERTION

Similar to WPMEM you can use ASSERTIONs in comments in the assembler sources.
An ASSERTION is translated by DeZog into a breakpoints with an "inverted" condition.
For all ASSERTIONs in your source code DeZog can set the correspondent breakpoints automatically at startup.

The ASSERTION syntax is:

~~~
; [.*] ASSERTION expr [;.*]
~~~
'expr' is just like the expressions in [breakpoints](#vscode-breakpoint).

Examples:
~~~
; ASSERTION HL <= LBL_END+2
ld a,b  ; Check that index is not too big ASSERTION B < (MAX_COUNT+1)/2
ld de,hl    ; ASSERTION A < 5 && hl != 0 ; Check that pointer is alright
~~~

As an ASSERTION converts to a breakpoint it is always evaluated **before** the instruction.
I.e. the following check will most probably not work as expected.

~~~
ld a,c  ; ASSERTION a < 7
~~~
A is not loaded yet when the ASSERTION is checked. So use

~~~
ld a,c
; ASSERTION a < 7
~~~
instead: The ASSERTION is on the next line i.e. at the address after the "LD" instruction and thus A is checked correctly.

Notes:

- ASSERTION is not available in ZEsarUX.
- you can use "ASSERTION" only, which evaluates to "ASSERTION false". I.e. this is equivalent to an unconditional break.
- The assertions are checked in the list file. I.e. whenever you change an ASSERTION it is not immediately used. You have to assemble a new list file and start the debugger anew.
- ASSERTIONs are disabled by default. If you want to have assertions enabled after launch then put "-ASSERTION enable" in the "commandsAfterLaunch" settings.
- Other than for sjasmplus ASSERTIONs are evaluated also in not assembled areas, e.g. in case the surrounding IF/ENDIF is not valid.
- As a special form you can also define an ASSERTION without any condition. This will act as a breakpoint that will always be hit when the program counter reaches the instruction.
- sjasmplus: If you use label names make sure to use the global name (i.e. full dot notation).


### LOGPOINT

Another special keyword is LOGPOINT in comments in the assembler sources.
A LOGPOINT is translated by DeZog into a breakpoint that does not stop execution but instead prints a log message.

The LOGPOINT syntax is:

~~~
; LOGPOINT [group] text ${(var):signed} text ${reg:hex} text ${w@(reg)} text ${b@(reg):unsigned}
~~~
with:

- [group]: (Note: the [ ] are meant literally here) The log group. Separate log groups might be turned on/off separately. E.g. "[SPRITES]". If omitted "DEFAULT" is used as group.
- reg: a register name, e.g. A, BC, HL, IX, H, IXL.
- var: a label.
- text: A simple text that may include variables. Here are a few examples for variables:
    - ```LOGPOINT [SPRITES] Status=${A}, Counter=${(sprite.counter):unsigned}```
    - ```LOGPOINT Status=${w@(HL)}, ${(DE)}, ${b@(DE)}```
Note: ${(DE)} is equal to ${b@(DE)} and prints the byte value at DE.

Notes:

- The LOGPOINTs are checked in the list file. I.e. whenever you change a LOGPOINT it is not immediately used. You have to assemble a new list file and start the debugger anew.
- LOGPOINTs are disabled by default. If you want to have logpoints enabled after launch then put "-LOGPOINT enable" in the "commandsAfterLaunch" settings. Note: you can also turn on only specific groups.
- LOGPOINTs are not available in ZEsarUX.
- sjasmplus: If you use label names make sure to use the global name (i.e. full dot notation).
- LOGPOINTs can do math with fixed labels but not with registers. I.e. "${b@(my_data+5)}" will work. It will statically calculate my_data+5 and lookup the memory value. But "${b@(IX+1)}" will not work as it would have to dynamically calculate "IX+1" at runtime.


### vscode breakpoint

You simply set a breakpoint by clicking left to the line where you want the breakpoint to be.
A red dot indicates the presense of a breakpoint.

Breakpoints can be set only per line. I.e. it is not possible to have multiple breakpoints in one line.


__Breakpoint conditions:__

Along with breakpoints you can also use breakpoint conditions. The breakpoint condition is checked additionally whenever a breakpoint is fired at a certain address.
Only if also the breakpoint condition is met the program execution will stop.

Breakpoint conditions can be any valid expression including labels, registers and parenthesis.
Examples:
~~~
BC==0x12FA
DE==HL+1
(A&7Fh) >= 10
D==5 || B==0 && C==1
B >= (MAX_COUNT+1)/2
b@(mylabel) == 50
w@(mylabel) == 0x34BC
b@(mylabel+5) == 50
b@(mylabel+A) == 50
b@(HL) > 10
~~~

Note 1: "&&" has higher priority than "||".

Note 2: Brackets, "()", are used only for prioritization of the expression. To read the contents of an address use "b@(...)" or "w@(...)". "b@(address)" and "w@(address)" return the byte and word contents at 'address'

Note 3: Some of the operators (like "!=", "||" or "b@(...)" are converted to the ZEsarUX format style (i.e. "=", "OR", "peek(...)") but you can also use the ZEsarUX style directly.


__Breakpoints in interrupts:__

You can also set breakpoints in interrupts.

But when you also set the launch.json option "skipInterrupt" to true you will feel that the behavior is somewhat strange for ZEsarUX:
If the breakpoint is hit the program will stop, but because of "skipInterrupt" it will stop after the interrupt finished.

Although the behavior is correct it looks like the program is randomly stopping.



### vscode logpoints

You can set vscode logpoints on the fly during debugging with the vscode logpoint feature.

The log message that you enter will appear in the "Debug Console" if the logpoint is hit.
You can also use variables similar to the description in chapter [LOGPOINT].
E.g. use "Counter=${(sprite.counter)}" as a log message.

Note: logpoints are not available in ZEsarUX.


### Debug Console

The debug console prints out useful information and might be used to enter additional commands and communicate with the emulator.

E.g. on every step-over you get an info about the used T-states and time. This can be used to measure the performance of sub routines. (Note: the calculation of the time uses the CPU frequency, if the CPU frequency changes during execution the calculated time will be wrong.)
![](images/debug_console_tstates.jpg)


You can add commands directly at the debug console. E.g. you can pass commands directly to ZEsarUX or you can enable/disable WPMEM.

Enter '-help' in the debug console to see all available commands.

The debug console can normally be found in the bottom of vscode after successful launch of the debugger:
![](images/debug_console.jpg)


#### Execute emulator commands

Withe "-exec" you can directly pass emulator commands to the emulator.
The response is send to the debug console.
If you add the argument "-view" the output is redirected into a view.
Currently this is only available to ZEsarUX.
For ZEsarUX you can e.g. use

~~~
-exec -view help
~~~
to put the ZEsarUX zrcp help documentation in a view in vscode.
You see the result here:
![](images/exec_view_help.jpg)


#### State Save/Restore

It is possible to save/restore the current machine state (mainly RAM, Z80 registers) during a debug session.
I.e. you can save the state prior to a problem and reload the state to investigate the problem once again.

Use

~~~
-state save state_name
~~~
to save the current state.
And

~~~
-state restore state_name
~~~
to restore the state.


With state_name being a name or number of your choice, e.g.:

~~~
-state save 1
or
-state save just-before-crash
~~~

are valid names.


Note: What is saved depends solely on the Remote, i.e. ZEsarUx or the internal simulator.



#### Memory Dumps

If you enter

~~~
-mv <address> <size>
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
-mv 0 0x100 0x8000 0x40 0x8340 0x10
~~~
This opens a memory dump view 3 memory blocks.
Please note that if you enter overlapping blocks the dump will merge them in the display.

DeZog opens a special memory viewer by itself on startup: it shows the locations around some registers. I.e. you can directly see where the registers are pointing at and what the values before and after are. This memory will change its range automatically if the associated register(s) change.

The register memory view:

![](images/memoryviewer2.jpg)


Note:
The memory views always work in the 64k area. I.e. they don't use 'long addresses' (banks).


##### Memory Editor

In the memory viewer you can edit individual memory values with a double-click on the value.
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

Note: When hovering over a column title you will also get an explanation.

Furthermore it also offers a simplified screen view which displays the border, the screen area and the sprites clipping rectangle.
Here you can see all sprites from the list above with right offsets and rotation, no matter if they are visible or clipped.
(Of course, if the list shows only visible sprites, you will also only see visible sprites in the screen view.)

![](images/zxnextspritesviewer1.jpg)

Each sprite is shown by a rectangle and it's image. Additional you see it's slot number at the right bottom.

The viewer is also capable to display 4 bit color pattern sprites and relative sprites.

Here is an example view from [ped7g's](https://github.com/MrKWatkins/ZXSpectrumNextTests/tree/develop/Tests/Sprites/BigSprite4b) sprite test programs that show anchor and relative uniform sprites in different rotations.

![](images/zxnextspritesviewer2.jpg)

The last 2 columns show the composition: Relative sprites show 'Relative' here and have a reference to the anchor sprite index.
The anchor sprites are either 'Composite' or 'Uniform' which selects how the following relative sprites are used in respect to mirroring, rotation and scaling.
All sprites belonging to the same anchor get the same background color so you can easily spot where the next "big" sprite begins.
![](images/zxnextspritesviewer3.jpg)

If you only want to watch specific sprites you can add the slot numbers as arguments.

Example: "-sprite 10-15 20+3 33" will observe sprite slots 10, 11, 12, 13, 14, 15, 20, 21, 22, 33 only.

The view will update the sprite's position and attributes on every 'step' in the debugger.
If a new sprite appears the corresponding  sprite pattern will be loaded as well. But for performance reasons: On a 'step' the sprite patterns for already existing sprites are not updated. On a 'break' the sprite patterns will always be updated.
So in most of the cases the sprite patterns will show correctly.
However for special situations it is also possible to reload the patterns with a button.
If the sprite pattern might be outdated you see a '*' left to the 'Reload' button.
![](images/zxnextspritesviewer_reload_star.jpg)


If the background color does not offer enough contrast for the sprite pattern it is possible to change the background color with the dropdown menu.

To see just the sprite patterns you can use

~~~
-patterns
~~~
with the same syntax.

It will display the sprite patterns.
It is also possible to change the palette if the current palette is not suitable.

For each of the 64 indices 3 patterns are shown:
- the 8bit color pattern (256 bytes)
- the 4bit color pattern for N6=0 (128 bytes)
- the 4bit color pattern for N6=1 (128 bytes)

Note: From the pattern memory it cannot be known if the pattern is used as 8bit or 4bit pattern so all possible patterns are shown in this view.
This, of course, means that normally only the 8bit or the 4bit color pattern is valid. Decision is done by the sprite.

![](images/zxnextspritepatternsviewer1.jpg)


### WATCHES

If you select a label with the mouse in the source code and do a right-click you can add it to the watches. The watches show a memory dump for that label.
The dump is updated on each step.
Example:
![](images/watches.jpg)
DeZog cannot determine the "type" and size the data associated with the label therefore it assumes 100 bytes or words and shows both,
a byte array and a word array, on default.
However you have a few options if you add more parameters to the label.

If you double-click on the label in the WATCHES area you can edit it. You can tell DeZog the number of elements to show and if it should show bytes, words or both.
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

If you like you can also "comment" to your watches which e.g. further explains the use. You can separate it with a e.g. a ";" or a space, e.g.:

~~~
fill_colors,1,b; Red
or
fill_colors Red
~~~

results in

![](images/watches_comment.jpg)


Note:
Watches always work in the 64k area. I.e. they don't use 'long addresses' (banks).


### Change the Program Counter

The PC can be changed via the menu. Click in the source line. Do a right-click
and choose "Move Program Counter to Cursor".


### 'Long Addresses' Explanation

In DeZog the term 'long address' is used to distinguish an address with banking information from a 'normal' 64k address.

A Z80 CPU can address only 64k of address space, i.e. addresses 0x0000 to 0xFFFF.
For big programs this is too small.
Therefore banking/paging mechanisms have been invented which swap the memory of certain address ranges (e.g. 0xC000-0xDFFF) and exchange it with memory contents of another bank.
E.g. the ZX 128K has 8 different memory banks. The ZX Next has more than 100.
The size of a bank may also differ. E.g. a ZX 128K has 8 banks a 16K byte. The ZX Next (in assembler) uses 8K byte banks (often also referred to as a page).

A 'long address' refers to an address (0x0000-0xFFFF) plus its bank information. I.e. even if an address points to an address in the Z80 64k address space, DeZog can determine the correct memory by additionally evaluating what memory is currently paged in.


## Unittests

You can use DeZog to execute unit tests.
Please see [here](https://github.com/maziac/DeZog/blob/master/documentation/UnitTests.md).


## Known Issues

- **General**
  - **Hovering** does work only on the file that is currently debugged, i.e. where the PC (program counter) is. This seems to be a restriction of vscode. debug-adapter-protocol issue #86 https://github.com/microsoft/debug-adapter-protocol/issues/86
- **ZEsarUX** (found with v8.1)
    - **Windows** only: Some people encounter a crash (rainbow/kernel panic) of ZEsarUX at the start of a debug session. If that is true for you as well you can experiment with the "[loadDelay](#zesarux)" option which adds an additional delay at startup. This mitigates the problem.
The default for Windows is 100 (ms). If you run into this problem you can try to increase the value to 400 or even 1000. (You can also try smaller values than 100).
    - Watchpoint (**WPMEM** aka memory breakpoints) and reverse debugging: There is a subtle problem with the memory breakpoints in ZEsarUX. The cpu-history command (used when reverse debugging) does access the memory the same way as the Z80 cpu emulation does. Thus a read might fire a memory breakpoint in the same way. This results in breaks of the program execution when you would not expect it. The memory read is 4 byte at PC (program counter) and 2 bytes at SP. Often you don't even notice because you don't place a watchpoint (WPMEM) at those places but in case you guard your **stack** with WPMEM you need to be aware of it: You shouldn't guard the top of the stack directly but at least grant 2 extra bytes at the top of the stack that are unguarded. See the [z80-sample-program](https://github.com/maziac/z80-sample-program) for placing the WPMEM correctly.
- **CSpect** (found with v2.13.0)
  - Watchpoints do not work and are therefore disabled.


