# Introduction

This documents deals with the problems of memory paging.

Traditionally DeZog was working on an address space of 64k only.
As this is the address space a Z80 PU can directly address.

If more memory is to be used the memory has to be paged in with certain commands.
Usually a write to some port or register (see ZX Next).

Several problems arise if memory is used in this way.
- Address <-> file/line number association is not unambigious anymore. I.e. several files or line numbers could share the same address. When DeZog needs to find the file/line number to display for a certain PC it may find several files to display.
- File/line number <-> breakpoint association: If a breakpoint is set by 64k address in one file this breakpoint would be true for all sources, i.e. all memory banks.
- Code coverage: The addresses returned by the emulator for code coverage need to contain the memory bank. Otherwise the wrong file might be colored. Or if several files are candidates it is not clear what file to color.
- History (cpu history): A similar problem. The emulator needs to return address and memory bank of the instruction.
- History (lite history): This is independet of the emulator. I.e. if the current PC address and bank number can be retrieved it is possible to store it.


# Long Addresses Representation

To store a "long address", i.e. an address with bank number information, it is necessary to know the bank size at first.
For the ZXNext this is usually 8k and any examples here will use this as assumption.

The long address will consist of the address inside the bank plus the bank number (shifted appropriatedly).
E.g. an address in bank 107 and an address inside the bank of 0x10B0 with bank size of 8k will be calcualted like:
~~~
long_address = (107)<<13 + 0x10B0
~~~


Maybe I better use this representation:
~~~
(bank_nr)<<16 + address
~~~
where address includes the upper 3 bits for the slot.


# Is it necessary to distinguish if long addresses or 64k addresses are used ?

Unclear yet.

Open:
- What if e.g. ZEsarUX is used as ZX48k? Is the slot/bank association still available?


# SLD (sjasmplus)

sjsasmplus has an option to create SLD (Source Level Debug) information.
For each label it not only codes the used address but also the bank (page) it is located.
The address is 64k, i.e. it not only codes the address inside the bank but also the used slot.
In other words the upper 3 bits (bit 13, 14, 15) can be interpreted as slot address.

If working with long addresses the slot information is not needed.
But if some of the involved entities (e.g. emulator) would be not able to handle long addresses the full 64k address information could be useful though.
E.g. In ZEsarUX for working with the breakpoints it is necessary to know the slot as well.


# Remotes

## PC <-> File/Line Association

Is possible with all Remotes.
Additionally to the PC the slot/bank association needs to be retrieved.
But this is done already anyway.

Questionable is maybe OpenMSX?


## File/line number <-> Breakpoint Association

Open: Another way how to handle long address breakpoints more generally, i.e. independent of the Remote would be to use the 64k address as before. Then when a break occurs additionally the slot/bank is checked by DeZog not by the emulator. e.g. ZEsarUX could still use the fast memory breakpoints.

Open: Decision: Either let the Remote handle the long address breakpoints or let DeZog handle it.
performance may vary. In general DeZog could be slower if a 64k address is hit very often. In other cases (ZEsarUX memory breakpoints) performance should be better.

Or: I could do both: DeZog handles the bank number always as fallback. But the long address is also passed to the Remote. If it can handle it: fine. If not (ZEsarUX mem breakpoints) the normal address is used by the Remote and Dezog does the fallback test.

But it seems that is a problem only for WPMEM. Breakpoints, Asserts, Logpoints can be handled by all in the long version.



### ZEsarUX

A breakpoint is set with
~~~
set-breakpoint index condition
~~~

In 'condition' the PC and the slot register could be checked. E.g. for address 0x30B0 in bank 107
~~~
set-breakpoint 1 PC&1FFFH=10B0H AND SEG1=107
~~~
Explanation:
address=0x30B0 means slot 1 and address 0x10B0 in that bank.


**Watchpoints:**
Fast watchpoint (```set-membreakpoint```) are not possible anymore.
Instead we need to fallback on normal breakpoints.


### CSpect

CSpect offers ```SetPhysicalBreakpoint```which should allow for breakpoints even without slot information.



# WPMEM, ASSERT, LOGPOINT

These are comment annotations.
I.e. not present in SLD parsing.
It is possible to parse the list file in parallel but then the bank information is missing for these breakpoints.

Open: How to handle. Ped7g proposes to include this somehow into the SLD. Open.


# Label Evaluation

If a long label/address is found the slot/bank information should be used additionally.

Open: how to accurately display the used bank.


# Misc

- 24bit addresses:
  - sld-parsing:
    - Ask ped7g
  - Parsing:
    - Adjust the mem address for the sld file
    - store 24bit addresses for file <-> address association
    - store 16bit addresses for labels
  - Stepping:
    - Get slots
    - Calculate 24bit address: bank[slot]*page.size+PC
    - Use this address to get source file location
  - Code coverage:
    - Zesarux: still 16bit, not possible to change (check)
    - zsim: for now 16bit, could be changed to 24bit
    - cspect: NA
    - zxnext: NA
  - Breakpoints
    - Zesarux: still 16bit, could be changed to 24bit
    - zsim: for now 16bit, could be changed to 24bit
    - cspect: Check if it allows for 24bit breakpoints directly, otherwise an additional condition could be added.
    - zxnext: change of DZRP, change of dezogif required, but possible.
  - History
    - Zesarux: still 16bit, check if slot is included in trace
    - zsim: for now 16bit, could be changed to 24bit
    - cspect: Lite history could also save the slot
    - zxnext: same as cspect


## labelsForNumber Array

~~~
/// An element contains either the offset from the last
/// entry with labels or an array of labels for that number.
~~~

The idea was to show address values like ```my_array+12```.
With an array of 64k size this was do-able.
Now with an array of 256*64k some other routine is required.

Task is to find the label with the smallest diff bigger than 0 with diff=searched_addr-label.

But maybe I can still use the 64k array and only look at the address without bank number.
