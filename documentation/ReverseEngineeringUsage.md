# Reverse Engineering with DeZog

DeZog primary goal is to develop new Z80 SW and debug it.

Another way to use DeZog is for reverse engineering of existing SW.

The process is shown here with MAME as an example.

When reverse engineering existing SW the whole object code already exists whereas the source code, i.e. the commented assembler sources normally do not exist.
The goal of reverse engineering is to discover the purpose of the binary code by disassembling and debugging it.
Once a sub routine has been understood it can be commented, labels can be renamed to more meaningful names and the disassembly can be saved.

These commented disassembly is reloaded and taken as source for hte further stepping. Also the new labels are used.

The more of the binary is understood the more complete the list file becomes until at the end hopefully all code is commented and understood.


# Exemplary Process

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

1. Start MAME while loop
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

