# Reverse Engineering Ideas.

E.g. with MAME.

Major problem is the association between 64k addresses and banked programs.
- Static analysis (like in z80dsmblr) is not possible
- MAME:
	- The gdb (gdbstub) of MAME does not return the bank/paging information at all
- The Dezog internal z80dsmblr



# Reverse Engineering Approach

While reverse engineering the source code (*.asm) is, obviously, not available.
For the best the address space can be read by DeZog and disassembled.
The reverse engineer will understand the object code by examining.
Whenever some functionality is understood it should be documented, so that the next time he will look at it he doesn't have to remember what this subroutine was but gets support by the tool.

One possible approach to this already exists in DeZog but needs to be made more interactive:
DeZog can associate list files with PC addresses.
If there would be a list file DeZog could take it and present it to the reverse engineer.

At the moment list files are only read at the start of a debug session.
To make this useful for the reverse engineer the process can be made interactive.
E.g. a session could look like:
1. Start debug session (completely without list file, only object code).
2. DeZog disassembles part of the code.
3. The reverse engineer analyzes, steps through the code.
4. The reverse engineer understood a subroutine and copies the code from the disassembly file to the list file.
As this is in list file format every line starts with an address.
5. The reverse engineer adds comments and **changes labels**.
6. The reverse engineer **presses a button to re-read the list file** without loosing machine state.
7. DeZog throws away any former labels and address/file associations and re-reads this information from the list file.
8. DeZog's disassembly will not show the part of the list file anymore as this now has an address/file association.
9. The reverse engineer will now go on to the next subroutine.
10. Goto 3


Note:
- *changes labels* is more difficult than it seems: It's easy to change the label itself at the start of the line. But the problem is that there might already be references to that label. So instead of simply editing the label the ASM Code Lens renaming function could be used.


# Other ideas

If banking is anyway not supported, the z80dsmblr could be used for static analysis.
The reverse engineer can manually run a static analysis with z80dsmblr and use the result as starting point for the list file.

Once a subroutine is better understood it could be re-written and the list file could be re-read by DeZog.


# MAME

## MAME trace files

Mame trace files do not include banking information as well. I.e., again, this can be used only in a system without banking.
With this limitation they can be used already when creating the initial list file by z80dsmblr.

It would also be possible to add them to the launch.json so that the information is available during DeZog on-the-fly disassembly.

Giving both (z80dsmblr and DeZog) the information is probably redundant, but should also not harm.


## MAME gdb overlays

Maybe contribute to the MAME project by implementing overlay support to the gdbstub.


