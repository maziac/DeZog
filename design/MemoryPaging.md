# Introduction

This documents deals with the problems of memory paging.

Traditionally DeZog was working on an address space of 64k only.
As this is the address space a Z80 CPU can directly address.

If more memory is to be used the memory has to be paged in with certain commands.
Usually a write to some port or register (see ZX Next).

Several problems arise if memory is used in this way.
- Address <-> file/line number association is not unambigious anymore. I.e. several files or line numbers could share the same address. When DeZog needs to find the file/line number to display for a certain PC it may find several files to display.
- File/line number <-> breakpoint association: If a breakpoint is set by 64k address in one file this breakpoint would be true for all sources, i.e. all memory banks.
- Code coverage: The addresses returned by the emulator for code coverage need to contain the memory bank. Otherwise the wrong file might be colored. Or if several files are candidates it is not clear what file to color.
- History (cpu history): A similar problem. The emulator needs to return address and memory bank of the instruction.
- History (lite history): This is independent of the emulator. I.e. if the current PC address and bank number can be retrieved it is possible to store it.


# Long Address, Slots, Bank

## Slots, Banks, Paging

A slot is a memory range.
E.g. 0x0000-0x3FFF or 0xC000-0xFFFF

Slots have indices, e.g. for the ZX128K there exist 4 slots:
- Slot 0: 0x0000-0x3FFF
- Slot 1: 0x4000-0x7FFF
- Slot 2: 0x8000-0xBFFF
- Slot 3: 0xC000-0xFFFF

In a ZXNext we have 8 slots:
- Slot 0: 0x0000-0x1FFF
- Slot 1: 0x2000-0x3FFF
- Slot 2: 0x4000-0x5FFF
- Slot 3: 0x6000-0x7FFF
- Slot 0: 0x8000-0x9FFF
- Slot 1: 0xA000-0xBFFF
- Slot 2: 0xC000-0xDFFF
- Slot 3: 0xE000-0xFFFF


Certain slots can be assigned to certain memory.
Eg.
- Slot 0: 0x0000-0x3FFF:  ROM
- Slot 1: 0x4000-0x7FFF:  Bank 2
- Slot 2: 0x8000-0xBFFF:  Bank 5
- Slot 3: 0xC000-0xFFFF:  Bank 0

Slot sizes don't need to be equal in size, e.g. the ZX16K would use:
- Slot 0: 0x0000-0x3FFF:  ROM
- Slot 1: 0x4000-0x7FFF:  RAM
- Slot 2: 0x8000-0xFFFF:  Unassigned

A slot can be paged but does not have to.
Paging means that different memory banks can be paged into a slot.
E.g. slot 1 could either contain bank 4, bank 7 or bank 12.
If a slot is pageable and what banks are usable depends on the MemoryModel used.
E.g. ZX16K and ZX128K use different MemoryModels: MemoryModelZx16k and MemoryModelZx128k.

The term bank is used here for memory that can be bank switched but also for memory that can't. E.g. the ZX48K has 2 banks: 16k ROM and 48k RAM.

Slots that are not assigned will internally be set to a special bank (bank number is 1 higher than the maximum bank number used).
This bank is not seen in the UI.
This "trick" makes the handling easier and faster.


## Long Addresses Representation

To store a "long address", i.e. an address with bank number information, it is necessary to know the bank size at first.
For the ZXNext this is usually 8k and any examples here will use this as assumption.

<!--
The long address will consist of the address inside the bank plus the bank number (shifted appropriately).
E.g. an address in bank 107 and an address inside the bank of 0x10B0 with bank size of 8k will be calculated like:
~~~
long_address = (107)<<13 + 0x10B0
~~~
-->

To easily distinguish between long address and normal addresses all addresses <= 0xFFFF will be normal 64k addresses.
Everything bigger is a long address with the coding:
~~~
(bank_nr+1)<<16 + address
~~~
where address includes the upper bits for the slot index.
It is necessary to increase the bank_nr by 1 because 0 is left for normal addresses.

Note: long addresses are (with DeZog 3.x) used in any case. Even for a 64k only non-banked system.
In this case a pseudo bank is used.
So internally all addresses are long addresses. There is no need anymore to distinguish.


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

If the file/line to address association is using long addresses then long addresses are also used for breakpoints.
If not then normal 64k addresses are used.

For long addresses:

Still the remote (e.g. emulator) might not support long breakpoints.
In this case the emulator would set a normal 64k address instead.
When the break happens, as a fallback, DeZog will check the long BP address on it's own. If the bank is not the correct one (the one from the long BP) then DeZog will send a 'continue' to the remote (emulator).

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



# Parser / Target Combinations

The parser already uses a memory model (bank schema).
When this is loaded into an emulator the emulator might have the same or an other one.
E.g. a ZX48K program could be loaded into a ZXNext.

Therefore the label addresses are converted into the target/emulator memory model/banking scheme.

##  puml


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

<!--
~~~puml
hide footbox
title zsim
participant da as "Debug Adapter"
participant lbls as "Labels"
participant model as "Memory Model"
participant remote as "Remote\nzsim"
participant simmemory as "SimulatedMemory"

da -> remote: Connect
model -> remote:
remote -> simmemory:
note over simmemory: Instantiate banks.\nAlso non-bank-switched.
remote -> lbls: readListFiles()

da -> remote: Step
remote -> simmemory
remote <- simmemory: getSlots
~~~
-->

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

Note: The main order has changed. In Dezog 2.7 the labels (list) files were read and afterwards the emulator has been connected.
The banking was required to be known before connecting.
But in fact this is not always the case.
E.g. a ZX128K could have been used for the sld (list) file but connected is only a ZX48K.
What makes it even more complicated: each of the list files could have a different bank model in mind.

Now the memory model is read from the emulator prior to reading the labels.
While reading the labels it can be directly checked if the model allows the banking used in the sld/list file.
If there are compatible memory models, e.g. the list file is for a ZX48K (no banks) and this is used in a ZX128K memory model, there could also be a conversion from the list file addresses to the memory model addresses.

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

The z80asm and z88dk list files (which are 64k only) would convert the 64k addresses to (banked) long addresses.
This would also distinguish them from other EQU which reside only in the 64k area.
The reverse engineering list file is a mix. It contains 64k addresses (for non bank switched slots) and long (banked) addresses.
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
Is a problem:
The Memory Model would have no knowledge of banks and could not convert to long addresses.
3 possible solutions:
- non-banked slots get a 'special' 'slots' array which contains the non-bank-switched banks.
These banks would not change so they can be local to the simulated memory.
- The simulated memory reports 64k address only. On converting long addresses to labels the fallback to 64k addresses is used.
- Labels.convertLabelsTo() is called to convert long addresses to 64k addresses.


### sjasmplus, ZX48K, zesarux

Combination
- sjasmplus (sld, long addresses)
- Memory Model ZX48K
- zesarux

sjasmplus uses long addresses.
Memory Model uses 2 (non-switched) banks.
zesarux uses 64k addresses.

Is maybe no problem since Labels.convertLabelsTo() is called to convert long addresses to 64k addresses.






# CPU History

## Step History

The Remote.getCallStack returns long addresses if used.
This call stack is saved to history on each step.
It is already enough to get the correct file <-> address association.
The last frame of the call stack is also used as (long) PC address instead of the value from the Z80 registers.
As the breakpoints are also long addresses the BP address can be directly compared to the call stack PC.


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


