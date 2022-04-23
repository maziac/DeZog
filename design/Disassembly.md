# Disassembly

The disassembly used in Dezog is derived from the [z80dismblr](https://github.com/maziac/z80dismblr) project.
DeZo uses 2 kinds of disassemblies:
1. The SimpleDisassembly: a brute force disassembly used in the VARIABLEs pane and for the 'dasm' command.
It is "brute force" because it disassemmbles a small amount (about 10) of instructions and just converts the opcodes into instructions.
2. A more intelligent disassembly (DisassemblyClass) which uses z80dismblr features to distinguish code labels from data labels etc. E.g. the disassembly will not necessarily go on with the disassembly after a RET is found.

This document discusses the 2nd (intelligent) disassembly.

# Glossary

| Name | Description |
|------|-------------|
| reverse engineered list file | The list file maintained by the user. Code that the user has reverse engineered and understood is out here. Normally the user will copy part of the disassembly here, change the labels to meaningful names and add comments. |


# Intelligent Disassembly (z80dismblr)

Basically the disassembler works on own 'memory', 64k address block.
The memory can have attributes attached to each address.
When nothing is known yet about the memory all is UNKNOWN (0).
But ass soon as something gets known more flags are added.
If anything (what ever) is known at least the ASSIGNED flag is set.
If it gets known that the memory location is used for code it gets the CODE flag.
If it is the first byte of an opcode additionally it receives the CODE_FIRST flag.
If it is data it gets the DATA flag.

Note: as these are flags combinations are unlikely but possible. e.g. an address with CODE could also have the DATA attribute if it is e.g. self-modifying code.

The other important structure is the 'addressQueue' which holds a number of known addresses that have been stepped through. I.e. addresses that for sure share the CODE|CODE_FIRST attribute.

When starting a disassembly these addresses are used as entry points into the disassembly.

The original z80dismblr works only on 64k without paging/memory banks.
There are some strategies to overcome the limitation.

As the disassembly takes a little time it is not done on every step.
Instead some memory (at the entry addresses) is retrieved and compared to the existing memory.
If it is new or differs a new disassembly is done.


# When to disassemble

In general a disassembly needs to be done if the underlying memory changes.
Since not all of the memory is retrieved only part of the memory is to be disassembled.
On each step it would be necessary to compare this memory with the retrieved memory.
If different memory areas are used or if the memory contents has changed, a new disassembly is required.

Also if banking occurred a new disassembly is required.
Even if the banking is not even in range of the disassembled memory there could be references to it, e.g. a LD A,(...) from that area, that would require to display the labels differently (with a different bank information).

At the moment, with only a small area being disassembled, a disassembly is simply done on each step.

Note: for optimizations: If it is known that an area is ROM the whole checks could be omitted. Even the memory could be preloaded at the beginning.


# ROM

How to handle (optimize) areas that are known to be ROM?


# Strategies

## Everything anew

With this strategy the memory is cleared for each new disassembly.
The disassembly only shows a small area of the complete memory.
The user should focus and understand a (small) part of the code and then move it into the reverse engineered list file.

Without banking:
1. Clear disassembly memory
2. Collect all entry addresses (from the stack + 0000h) (Call stack + step history)
3. Read the current memory from these addresses (size e.g. 100)
4. Copy read memory into disassembly memory
5. Disassemble with entry-addresses
6. Filter (remove) addresses/lines that appear in the reverse engineering list file already.

With banking:
The same.
Simply the long addresses would be shown with a different bank.


## Persistent Memory

This is similar but mainly the old disassembly memory is not cleared and also the known entry addresses are remembered.
For performance reasons it would be beneficial to read not all of the memory on every step.
It becomes problematic if the memory changed in unread/not compared areas.

An advantage could be that larger blocks could be disassembled and maybe a disassembly is not necessary on each step.

Maybe an optimization to "Everything anew" would also be to read-in all ROM areas.
These are known not to change and could be used for disassembly.
Some re-disassembly would be required if the bank changes, of course.


