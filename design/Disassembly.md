# Disassembly

The disassembly used in Dezog is derived from the [z80dismblr](https://github.com/maziac/z80dismblr) project.
DeZog uses 2 kinds of disassemblies:
1. The SimpleDisassembly: a brute force disassembly used in the VARIABLEs pane and for the 'dasm' command.
It is "brute force" because it disassembles a small amount (about 10) of instructions and just converts the opcodes into instructions.
2. A more intelligent disassembly (AnalyzeDisassembler and DisassemblyClass) which uses z80dismblr features to distinguish code labels from data labels etc. E.g. the disassembly will not necessarily go on with the disassembly after a RET is found.

This document discusses the 2nd (intelligent) disassembly.

# Glossary

| Name | Description |
|------|-------------|
| reverse engineered list file (rev-eng.list)| The list file maintained by the user. Code that the user has reverse engineered and understood is out here. Normally the user will copy part of the disassembly here, change the labels to meaningful names and add comments. |


# Intelligent Disassembly (z80dismblr)

Basically the disassembler works on own 'memory', a 64k address block.
The memory can have attributes attached to each address.
When nothing is known yet about the memory all is UNKNOWN (0).
But as soon as something gets known more flags are added.
If anything (what ever) is known at least the ASSIGNED flag is set.
If it gets known that the memory location is used for code it gets the CODE flag.
If it is the first byte of an opcode additionally it receives the CODE_FIRST flag.
If it is data it gets the DATA flag.

Note: as these are flags, combinations are unlikely, but possible. e.g. an address with CODE could also have the DATA attribute if it is e.g. self-modifying code.

The other important structure is the 'addressQueue' which holds a number of known addresses that have been stepped through. I.e. addresses that for sure share the CODE|CODE_FIRST attribute.

When starting a disassembly these addresses are used as entry points into the disassembly.

The original z80dismblr works only on 64k without paging/memory banks.
There are some strategies to overcome the limitation.

The disassembly takes a little time, not much but too much to do it on every step.

The disassembly works on the complete 64k memory space.
At start the 64k memory is fetched from the remote and disassembled.
A new fetch is done if either the slots change, if the memory at the current PC has changed or if the user presses the refresh button.
A new disassembly is done if the memory is refreshed or if there are new addresses to disassemble.
If the disassembly is not recent the refresh button is enabled for indication.

The last PC values are stored because these values are known to be code locations and are used for the disassembly.
A special handling is done for the callstack: The caller of the current subroutine cannot be determined to 100%.

I.e. the stack might be misinterpreted.
Therefore the stack addresses are stored in a different array. This array is cleared when the refresh button is pressed.
I.e. if something looks strange the user can reload the disassembly.

(On a reload only the call stack history is cleared but the current call stack is used for disassembly.)


# AnalyzeDisassembler and DisassemblyClass

The AnalyzeDisassembler and the DisassemblyClass are derived from the Disassembler (z80dismblr).
It modifies the behavior to be more suited for DeZog and (interactive) reverse engineering.

It hooks into the disassembler to change the output:
- funcAssignLabels: to assign labels for addresses. These labels are taken from the Labels instance (which was built from the reverse engineering list file).
- funcFilterAddresses: removes any line from the disassembly output that is already available in the  reverse engineering list file.
- funcFormatAddress: Formats the addresses in the output. Used to add the bank information to the hex address.

The DebugAdapter calls the DisassemblyClass to check for a new memory fetch and disassembly by calling 'setNewAddresses' on each stackTraceRequest.

Breakpoints:
When the disassembly text changes it is also necessary to remove the breakpoints from the disassembly and to add the adjusted values after the new disassembly is available because the line numbers might have been changed.

At the end it is also required to update the decorations for the code coverage info.

There is an additional button in the disasm.list editor that allows the user to manually fetch memory and do a disassembly.
The button is disabled when a disassembly just happened and enabled on each step no disassembly is done.
This is achieved via the context variable 'dezog:disassembler:refreshEnabled' used in package.json and in the Debug Adapter.


On debug session termination the disassembly list file itself stays there and is not removed. Maybe the user would want to continue with reverse engineering after the debug session.
But the breakpoints associated with the disassembly list files are removed.
Otherwise these would show up as error (not associated breakpoints), and would be removed, at the next start of an debug session.

