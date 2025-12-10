# Introduction

This document addresses the challenges associated with memory paging in the context of DeZog.

Historically, DeZog operated within a 64k address space, as this aligns with the address space directly accessible by a Z80 CPU. When additional memory is required, it needs to be paged in using specific commands. Typically, this involves writing to a port or register (as seen with ZX Next).

Several issues arise when memory is managed in this manner:

- Ambiguity in Address <-> File/Line Number Association: Multiple files or line numbers may share the same address, making it challenging for DeZog to determine which file/line number to display for a given program counter (PC).
- File/Line Number <-> Breakpoint Association: If a breakpoint is set by a 64k address in one file, it will apply to all sources (i.e., memory banks).
- Code Coverage: The addresses provided by the emulator for code coverage must include memory bank information to ensure proper file coloring. Without this information, the wrong file might be colored, or if multiple files are candidates, it may be unclear which file to color.
- History (CPU History): Similar to code coverage, CPU history requires the emulator to return both the address and memory bank of an instruction.
- History (Lite History): Independent of the emulator, if the current PC address and bank number can be retrieved, it becomes possible to store it.


# Long Address, Slots, Bank

## Slots, Banks, Paging

A slot represents a memory range, e.g. 0x0000-0x3FFF or 0xC000-0xFFFF

Each slot has an index. For example, the ZX128K has four slots:
- Slot 0: 0x0000-0x3FFF
- Slot 1: 0x4000-0x7FFF
- Slot 2: 0x8000-0xBFFF
- Slot 3: 0xC000-0xFFFF

In a ZXNext, there are eight slots:
- Slot 0: 0x0000-0x1FFF
- Slot 1: 0x2000-0x3FFF
- Slot 2: 0x4000-0x5FFF
- Slot 3: 0x6000-0x7FFF
- Slot 0: 0x8000-0x9FFF
- Slot 1: 0xA000-0xBFFF
- Slot 2: 0xC000-0xDFFF
- Slot 3: 0xE000-0xFFFF


Certain slots can be assigned to certain memory areas.
For instance:
- Slot 0: 0x0000-0x3FFF:  ROM
- Slot 1: 0x4000-0x7FFF:  Bank 2
- Slot 2: 0x8000-0xBFFF:  Bank 5
- Slot 3: 0xC000-0xFFFF:  Bank 0

slot sizes can vary; they don't need to be of equal size. For example, the ZX16K would use:
- Slot 0: 0x0000-0x3FFF:  ROM
- Slot 1: 0x4000-0x7FFF:  RAM
- Slot 2: 0x8000-0xFFFF:  Unassigned

A slot can be pageable but doesn't have to be. Paging allows different memory banks to be swapped into a slot. For example, Slot 1 could contain Bank 4, Bank 7, or Bank 12. Whether a slot is pageable and which banks can be used depends on the Memory Model employed.
E.g. ZX16K and ZX128K use different MemoryModels: MemoryModelZx16k and MemoryModelZx128k.

The term bank is used here for memory that can be bank switched but also for memory that can't. E.g. the ZX48K has 2 banks: 16k ROM and 48k RAM. These banks cannot be switched.

Unassigned slots are internally set to a special bank, which has a bank number one higher than the maximum bank number used. This special bank is hidden in the user interface. It simplifies the handling.

## Long Addresses Representation

To store a "long address," which includes bank number information, the bank size must first be known. For ZXNext, this is typically 8k, and the examples here assume this size.

To distinguish between long addresses and normal addresses, all addresses up to 0xFFFF are treated as normal 64k addresses. Anything greater is considered a long address and is coded as follows:
~~~
(bank_nr+1)<<16 + address
~~~

Here, the address includes the upper bits for the slot index. Adding 1 to the bank number is necessary to leave room for normal addresses (0 is reserved for these).

Note: Long addresses are used consistently in DeZog 3.x, even for non-banked systems. In this case, a pseudo bank is employed, so all addresses are long addresses, eliminating the need for differentiation.


# SLD (sjasmplus)

sjsasmplus has an option to create SLD (Source Level Debug) information.
For each label it not only codes the used address but also the bank (page) it is located.
The address is 64k, i.e. for the ZXNext it not only codes the address inside the bank but also the used slot.
In other words the upper 3 bits (bit 13, 14, 15) can be interpreted as slot address.

If working with long addresses, the slot information is not needed. However, if some of the involved entities (e.g., emulator) cannot handle long addresses, the full 64k address information could be useful. For example, in ZEsarUX, for working with breakpoints, it is necessary to know the slot as well.


# Remotes

## PC <-> File/Line Association

Additionally to the PC the slot/bank association needs to be retrieved.


## File/line number <-> Breakpoint Association

Breakpoints also use long addresses.

Still the remote (e.g. emulator) might not support "long address" breakpoints.
In this case the emulator would set a normal 64k address instead.
When the break happens, as a fallback, DeZog will check the long BP address on it's own. If the bank is not the correct one (the one from the long BP) then DeZog will send a 'continue' to the remote (emulator).
This fallback comes with a performance penalty, of course.

Note: If the remote supports long breakpoints DeZog would still additionally do a check but the check would always be 'true'.


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



# Label Parser / Target Combinations

The label parser already uses a memory model (bank schema). When this is loaded into an emulator, the emulator might have the same or another one. For example, a ZX48K program could be loaded into a ZXNext.

Therefore, the label addresses are converted into the target/emulator memory model/banking scheme.

##  Message Sequence Charts

~~~puml
hide footbox
title Long Addresses
participant da as "DebugAdapter"
participant lbls as "Labels"
participant Remote
participant Z80Registers
participant DecodeRegisterData

note over da, Z80Registers: disassemble
da -> Remote: getSlots()
Remote -> Z80Registers: getSlots()
Z80Registers -> Z80Registers: decoder.parseSlots\n(RegisterCache)
Remote <-- Z80Registers
da <-- Remote

...
note over da, Z80Registers: dzrpbufferremote
Remote -> Remote: receivedMsg()
note over Remote: Calculate the break address\ndifferently


...
note over da, DecodeRegisterData: disassemble
da -> Z80Registers: getSlots()
da <-- Z80Registers
da -> Z80Registers: createLongAddress()
da <-- Z80Registers

...
note over da, DecodeRegisterData: zesaruxremote
da -> Remote: stepInto etc.
Remote -> Remote: handleCodeCoverage()
Remote -> Z80Registers: getSlots()
Remote <-- Z80Registers
Remote -> Z80Registers: createLongAddress()
Remote <-- Z80Registers

...
note over da, DecodeRegisterData: zsimremote
da -> Remote: z80CpuContinue()
Remote -> Z80Registers: getSlots()
Remote <-- Z80Registers
Remote -> Z80Registers: createLongAddress()
Remote <-- Z80Registers

...
note over da, DecodeRegisterData: stepHistory\ncpuHistory
da -> DecodeRegisterData: parsePCLong()
Z80Registers <- DecodeRegisterData: createLongAddress
Z80Registers --> DecodeRegisterData
da <-- DecodeRegisterData: PC or PCLong

...
note over da, DecodeRegisterData: zxnextserialremote\n
Remote -> Remote: sendDzrpCmdContinue()

Remote -> Z80Registers: getSlots()
Z80Registers -> Z80Registers: decoder.parseSlots\n(RegisterCache)
Remote <-- Z80Registers

note over Remote: For breakpoints:
Remote -> Z80Registers: createLongAddress()
Remote <-- Z80Registers

da <-- DecodeRegisterData: PC or PCLong

...
note over da, DecodeRegisterData: CallStack\n
da -> Remote: getCallStackFromEmulator()
Remote -> Remote: getStackEntryType()

Remote -> Z80Registers: getSlots()
Z80Registers -> Z80Registers: decoder.parseSlots\n(RegisterCache)
Remote <-- Z80Registers

Remote -> Z80Registers: createLongAddress\n(calledAddress)
Remote <-- Z80Registers

Remote -> lbls: getLabelsForLongAddress
Remote <-- lbls
da <-- Remote: call stack
~~~

~~~puml
hide footbox
title Main Flow
participant da as "Debug Adapter"
participant remote as "Remote"
participant emulator as "Emulator"
participant lbls as "Labels"
participant model as "Memory Model"

da -> remote: createRemote
da -> remote: init()
activate remote
remote -> emulator: Connect
remote -> emulator: read memory model
remote <-- emulator
remote -> model
activate model
note over model: Instantiate\nMemoryModelXXX
da <-- remote: emit('initialized')
da -> remote: readListFiles()
remote -> lbls: readListFiles(MemoryModelXXX)
lbls -> model:
lbls <-- model
note over lbls: Calculate long address\nwith memory model


note over lbls: Write all (long)\nlabels to store
remote <-- lbls

-> da: Step
da -> remote: Step
remote -> emulator: getSlots
remote <-- emulator:
note over remote: Calculate long address\nfrom addr64k and slots
remote -> lbls: Get label for\nlong address
remote <-- lbls
~~~

Note: The main order has changed. In DeZog 2.7, the label files were read first, and then the emulator was connected. The banking information was required to be known before connecting. However, this is not always the case. For example, a ZX128K list file could be used, but only a ZX48K is connected. What makes it even more complicated is that each of the list files could have a different bank model in mind.

Now the memory model is read from the emulator prior to reading the labels. While reading the labels, it can be directly checked if the model allows the banking used in the SLD/list file. If there are compatible memory models, e.g., the list file is for a ZX48K (no banks), and this is used in a ZX128K memory model, there will also be a conversion from the list file addresses to the memory model addresses.

The 'slots' returned by the emulator also need conversion.
E.g. the format is different as in zesarux. But also the numbering could be different.
Maybe for some memory models no slot information is sent.
In these cases the Remote has to convert bank numbers or 'invent' the slots.



**"Calculate long address with memory model":**
Often this would just check if the same memory model was used for creating the sld/list file as the emulator is using.
In case of a problem an error would be returned.
E.g. if the list/sld file uses a bank that does not exist.
Some combinations might be compatible.
E.g. a ZX128K list/sld file can be converted into long addresses for a ZXNext memory model.
Or a ZXNext sld file that uses only certain banks could be converted into a ZX128K memory model.

The parsers for the z80asm and z88dk list files (which are 64k only) would convert the 64k addresses to (banked) long addresses.
This would also distinguish them from other EQU which reside only in the 64k area.

The parser for the reverse engineering list file is a mix. It contains 64k addresses (for non bank switched slots) and long (banked) addresses.
The long addresses are checked if they are the same as the memory model. (They cannot be converted as the new banking number scheme would confuse the user.)
The 64k addresses are converted to long (banked) addresses according the memory model.


## Example Combinations

### sjasmplus, ZXNext, zsim

Combination
- sjasmplus (sld, long addresses)
- Memory Model ZXNext
- zsim
- Simulated Memory

All capable of long addresses.
There are only bank switched slots.
No problem.

### sjasmplus, ZX48K, zsim

Combination
- sjasmplus (sld, long addresses)
- Memory Model ZX48K
- zsim
- Simulated Memory

sjasmplus uses long addresses.
Memory Model uses 2 (non-switched) banks.
The simulated memory uses only 64k since no bank-switched banks are found.
This would be a problem: The Memory Model would have no knowledge of banks and could not convert to long addresses.
Therefore, the memory areas which cannot be switched are treated similar to the ones which can be paged to several different banks.
I.e. we use a memory area (slot) which can contain only one bank and use this to generate long addresses.

### sjasmplus, ZX48K, zesarux

Combination
- sjasmplus (sld, long addresses)
- Memory Model ZX48K
- zesarux

sjasmplus uses long addresses.
Memory Model uses 2 (non-switched) banks.
zesarux uses 64k addresses. But by reading the paging information from zesarux we can generate long addresses.


# Classes

~~~
                                                                                                                        ┌ ─ ─ ─ ─ ─ ─ ┐
                                                                                                                         Serializable
                                                                                                                        └ ─ ─ ─ ─ ─ ─ ┘
                                                                                                                               ▲
                                                                                                                               │
                                          ┌─────────────────────┐                                                   ┌─────────────────────┐
                                          │     MemoryModel     │──────────────────────────────────────────────────■│   SimulatedMemory   │
                                          └─────────────────────┘                                                   └─────────────────────┘
                                                     ▲
           ┌──────────────────────────┬──────────────┴──────────────┬─────────────────────────────┬─────────────────────┐
           │                          │                             │                             │                     │
┌─────────────────────┐    ┌─────────────────────┐     ┌─────────────────────────┐    ┌───────────────────────┐         │
│ MemoryModelUnknown  │    │  MemoryModelAllRam  │     │MemoryModelZxSpectrumBase│    │MemoryModelColecoVision│         │
└─────────────────────┘    └─────────────────────┘     └─────────────────────────┘    └───────────────────────┘         │
                                                                    ▲                                                   │
                                                                    │                                                   │
                    ┌────────────────────────┬──────────────────────┴─┬────────────────────────┐                        │
                    │                        │                        │                        │                        │
                    │                        │                        │                        │                        │
         ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐             │
         │  MemoryModelZx16k   │  │  MemoryModelZx48k   │  │  MemoryModelZx128k  │  │  MemoryModelZxNext  │             │
         └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘             │
                                                                                                                        │
                    ┌────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────┼────────────────────────┐
                    │                        │                        │                        │                        │                        │
                    │                        │                        │                        │                        │                        │
         ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
         │ MemoryModelZX81_1k  │  │ MemoryModelZX81_2k  │  │ MemoryModelZX81_16k │  │ MemoryModelZX81_32k │  │ MemoryModelZX81_48k │  │ MemoryModelZX81_56k │
         └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
~~~

The MemoryModel is the base class. This is also used to create custom memory models.


# CPU History

## Step History

The Remote.getCallStack returns long addresses if used.
This call stack is saved to history on each step.
It is already enough to get the correct file <-> address association.
The last frame of the call stack is also used as (long) PC address instead of the value from the Z80 registers.
As the breakpoints are also long addresses the BP address can be directly compared to the call stack PC.

