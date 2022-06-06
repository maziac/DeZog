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
4. The reverse engineer understood a subroutine and copies the code from the disassembly file to the reversed engineered list file (rev.list, a self made file).
As this is in list file format every line starts with an address.
5. The reverse engineer adds comments and **changes labels**.
6. The reverse engineer **presses a button to re-read the list file** without loosing machine state.
7. DeZog throws away any former labels and address/file associations and re-reads this information from the list file.
8. DeZog's disassembly will not show the part of the list file anymore as this now has an address/file association.
9. The reverse engineer will now go on to the next subroutine.
10. Goto 3


Note:
- *changes labels* is more difficult than it seems: It's easy to change the label itself at the start of the line. But the problem is that there might already be references to that label. So instead of simply editing the label the ASM Code Lens renaming function could be used.


# Additional use of Banking Information

If zsim is used the banking information is available for a dynamic analysis.
Maybe the MAME gdbstub could be extended to provide that information as well (memory model + current bank/paging information).

So for a certain "snapshot" z80dsmblr could do a static analysis.
Addresses that belong to a certain page are put into different files.

E.g. if the area 0xC000-0xFFFF is once used for bank1 this area is disassembled into "file_bank1.list".
If the next time 0xC000-0xFFFF is used by bank2 it is disassembled into "file_bank2.list".

Note: it is not required to really use different files. But it is important that the list file contains addresses with bank info, e.g.:
~~~asm
C000.B1	3E 05		LD A,5
C002.B1  C9			RET
~~~

or for bank 2:
~~~asm
C000.B2  01 00 00	LD BC,0
C002.B2  C3 00 C1	JP $C100.B2
~~~


These files/line numbers can be associated with "long" addresses. I.e. an address which contains also the bank information.
Breakpoints and stepping through the list file would be no problem.

If the reverse engineer takes part of the code into the reverse engineered list file (rev.list) the banking info is copied as well.

Any code in some of the other banks (e.g. at 0x8020) that refers to a bank will get that label, e.g.:
~~~asm
8020	01 00 00	CALL $C000.B1
~~~

As the code is in a non-paged area it has a simple 64k address (i.e. 8020) only.

At the time the code is disassembled (or better: executed by single step) it is known which bank is paged in.
The call address could be assigned to the long address C000.B1.

If the reverse engineer had given a label name to it already in the ref.list file, the label could be used:
~~~asm
C000.B1			MYSUB_BANK1:
C000.B1	3E 05		LD A,5
C002.B1  C9			RET
~~~

~~~asm
8020	01 00 00	CALL MYSUB_BANK1
~~~

A problem arises if the same code at e.g. 8020 is used for different banks.
E.g. if it is the entry point to any code/bank put into the 0xC000-0xFFFF area.
E.g. if the first time in dynamic analysis bank 1 was paged in and the next time bank 2.
In this case the 64k address should be used instead, e.g.:
~~~asm
8020	01 00 00	CALL $C000
~~~



# MAME

## MAME trace files

Mame trace files do not include banking information as well. I.e., again, this can be used only in a system without banking.
With this limitation they can be used already when creating the initial list file by z80dsmblr.

It would also be possible to add them to the launch.json so that the information is available during DeZog on-the-fly disassembly.

Giving both (z80dsmblr and DeZog) the information is probably redundant, but should also not harm.


## MAME gdb overlays

Maybe contribute to the MAME project by implementing overlay support to the gdbstub.


