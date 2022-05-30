# Reverse Engineering with DeZog

Up to version 2.x DeZog's primary goal was to develop **new** Z80 SW and debug it.

Beginning with version 3 another way to use DeZog is for reverse engineering of existing SW.


When reverse engineering existing SW the whole object code already exists whereas the source code, i.e. the commented assembler sources normally do not exist.
The goal of reverse engineering is to discover the purpose of the binary code by disassembling and debugging it.
Once a sub routine has been understood it can be commented, labels can be renamed to more meaningful names and the disassembly can be saved.

These commented disassembly is reloaded and taken as source for the further stepping. Also the new labels are used.

The more of the binary is understood the more complete the list file becomes until at the end hopefully all code is commented and understood.


To make it more clear: there are 2 main differences to developing a new program with an assembler.
- Instead of running the assembler on your .asm file(s) you have to write the reverse engineered assembler file, **a list file**, yourself. DeZog supports you b providing a disassembly of the source code portion that you are currently investigating. This disassembly can be copied to your list file together with comments and renamed labels to make it human readable.
- While the debug session is running you can re-read the list file and it's labels. I.e. as soon as you have commented the disassembly or renamed labels they are immediately taken into use. This improves the turn-around cycle a lot.


# Exemplary Process

The process is shown here with MAME as an example.

This example assumes that MAME is started manually or in a while loop with a ROM (pacman in this case).
~~~bash
while true; do ./mame pacman -window -debugger gdbstub -debug -debugger_port 12000 -verbose ; sleep 2 ; done
~~~


The launch.json for DeZog is:
~~~json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "dezog",
            "request": "launch",
            "name": "MAME",
            "remoteType": "mame",
            "mame": {
                "port": 12000
            },
            "startAutomatically": false,
            "z80asm": [
                {
                    "path": "pacman.list",
                    "srcDirs": []
                }
            ],
            "rootFolder": "${workspaceFolder}"
        }
    ]
}
~~~


Start with an empty pacman.list file.

1. Start MAME (while loop)
2. Start a DeZog debug session
3. Step, understand code
4. Copy understood code from disasm.list to pacman.list
5. Work on the code in pacman.list
	- Comment the code
	- Exchange label names with more meaningful names.
6. Save pacman.list
7. Reload the list file. In the command palette type: ```DeZog: reload the list file(s).```
At that point DeZog will re-read the symbols and also do a new disassembly: The code from the pacman.list is removed from the disassembly. So, when stepping the pacman.list is used whenever the PC points to code in that file.
The rest of the disassembly will also use the new labels.
7. Goto 3

Note: The re-load of the list file takes place while the debug session is still active. I.e. you can simply continue with the debugging.


# Disassembly

The disassembly shows only part of the code: I.e. the disassembly around the current PC and also disassembly from the addresses on the call stack.

If one of these addresses is not associated with a file (either a list file or an asm source) then a disassembly is done.

The disassembly contains only the addresses where no association to another file exists.


# Breakpoints

Breakpoints can be set via the vscode editor as normal.
Breakpoints can be set either in the disassembly or in the list file.

Breakpoints will most of the time "survive" in the disassembly even if the file is created anew.
Breakpoints are only removed if there does not exist any correspondent file/line/address for that breakpoint anymore after a disassembly has taken place.

If you need to set a breakpoint to some location that does not exist in either the disassembly or the list file then you can do the following:
1. In the list file just type in the address (in hex) at a start of a line.
2. In the command palette type: ```DeZog: reload the list file(s).```
3. Set a breakpoint at the line of the address. The picture shows this for a breakpoint at address 0x8000:
![](images/rev_eng_bp_in_listfile.jpg)


