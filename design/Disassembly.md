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
| reverse engineered list file (rev-eng.list)| The list file maintained by the user. Code that the user has reverse engineered and understood is out here. Normally the user will copy part of the disassembly here, change the labels to meaningful names and add comments. |


# Intelligent Disassembly (z80dismblr)

Basically the disassembler works on own 'memory', a 64k address block.
The memory can have attributes attached to each address.
When nothing is known yet about the memory all is UNKNOWN (0).
But ass soon as something gets known more flags are added.
If anything (what ever) is known at least the ASSIGNED flag is set.
If it gets known that the memory location is used for code it gets the CODE flag.
If it is the first byte of an opcode additionally it receives the CODE_FIRST flag.
If it is data it gets the DATA flag.

Note: as these are flags, combinations are unlikely, but possible. e.g. an address with CODE could also have the DATA attribute if it is e.g. self-modifying code.

The other important structure is the 'addressQueue' which holds a number of known addresses that have been stepped through. I.e. addresses that for sure share the CODE|CODE_FIRST attribute.

When starting a disassembly these addresses are used as entry points into the disassembly.

The original z80dismblr works only on 64k without paging/memory banks.
There are some strategies to overcome the limitation.

As the disassembly takes a little time and is done on every step it is not done on the complete memory but only a portion of it.
This portion contains of the last stepped addresses and the call stack addresses.
The call stack addresses could potentially be wrong but they have to be used otherwise a mouse-click on the call-stack would lead nowhere.

These addresses plus some range of about 100 bytes (in total this will on average sum up to ~1000 bytes) is retrieved and disassembled on each step.


# DisassemblyClass

The DisassemblyClass is derived from the Disassembler (z80dismblr).
It modifies the behavior to be more suited for DeZog and (interactive) reverse engineering.

It hooks into the disassembler to change the output:
- funcAssignLabels: to assign labels for addresses. These labels are taken from the Labels instance (which was built from the reverse engineering list file).
- funcFilterAddresses: removes any line from the disassembly output that is already available in the  reverse engineering list file.
- funcFormatAddress: Formats the addresses in the output. Used to add the bank information to the hex address.

The DebugAdapter (DebugSessionClass) holds the last stepped PC addresses in 'longPcAddressesHistory'.
About 20 addresses of last steps. As these are PC values it is assured that these are entry points for the disassembler.
The history is independent of the StepHistory so that is is filled even if StepHistory is not available.
Also the size can be adjusted independently.
Size is about 20 entries.
This list of addresses is concatenated with the address from the call stack.
Before a disassembly is done the list is filtered by current banking, i.e. only addresses are used that are currently reachable.

This list of addresses is used for fetching the memory (+100 byte for each address) and past to the disassembly. (Note: the disassembly only works on 64k.)

Breakpoints:
As the disassembly text changes on each step it is also necessary to remove the breakpoints from the disassembly and to add the adjusted values after the new disassembly is available.

The new disassembly is not simply added to the vscode disasm.list document as one change as this would result in flickering in vscode.
To mitigate flickering a diff between old and new disassembly is created and the changes are applied to the vscode disasm.list.

At the end it is also required to update the decorations for the code coverage info.

If no callstack address needs to be disassembled then no disassembly takes place.
To visualize the situation the disassembly is not removed but stays.
But it's decoration is changed to _italic_ and it's dimmed.
This indicates the disassembly is not up-to-date.

On debug session termination the disassembly list file itself stays there and is not removed. Maybe the user would want to continue with reverse engineerig after the debug session.
But the breakpoints associated with the disassembly list files are removed.
Otherwise these would show up as error (not associated breakpoints), and would be removed, at the next start of an debug session.



# When to disassemble

Disassembly is done on every step if at least one call stack address is found without file association.
The memory is read and that memory portion is disassembled.
If in one step no disassembly is done the disassembly file is shown in italic to visualize that.

