# ZX Next Interface

Here I collect first ideas to connect DeZog remotely with a real ZX Next Spectrum.

It basically has to communicate with the ZX Next similarly as with ZEsarUX, but there are, of course, specific problems.

Certain commands are not working at all because the ZX Next has no special debugging HW.
E.g. I can't get any cpu history/trace information. So reverse debugging is not possible at all.

Breakpoints don't have HW support so I need to deal with it in SW.

The document deals with the main problems/solutions.

# Communication

The ZX Next has a UART, e.g. to connect to Wifi.
It is available at the WIFI connector CN9.
![](images/Next_ESP_Port.png)

It is possible to connect a serial/USB adapter cable to it.
The UART can be programmed via port registers 0x133B and 0x143B.
The baudrate is connected to the video timing. This needs to be taken into account when setting the baudrate.
Unfortunately there is **no interrupt connected to the UART**. I.e. it is required to poll it.

Nowadays it is also possible to put the UART on pins 7 (Tx) and 9 (Rx) of the joystick port. I.e. no need for soldering or even to open the case.
Drawback is only that the joystick are not usable anymore.


# Break

If the PC would like to do "break" a running program it is necessary that the ZX Next program cooperates.
This can be done by checking the UART Rx status in the main loop or by checking it from the IM1 (vert. interrupt).

Another possibility is to use DIVMMC. The DIVMMC will switch in a RAM bank for the ROM bank if certain addresses are executed or if the NMI button is pressed.

So instead of a pressing "break" in the IDE (on the PC) the user could press the NMI button. The DIVMMC SW would then check transmit the status to the PC so that the PC knows the user "breaked".

There are other possibilities:

**Cooperation**: The debugged program checks the (RX) UART in the main loop or from an interrupt.
Whenever something is received a special routine is called which stops the running program and communicates with the PC until the next "run" command is received.

**DIVMMC interrupt**: When an interrupt (38h) is executed the DIVMMC swaps in the DICMMC memory. At address 38h it would first check the (RX) UART state and if something has been received wait until the next command from the PC.
If nothing has been received it would then continue with the normal (user) interrupt routine.
Problem here:
a) The interrupt routine takes a little bit longer.
b) If the debugged program does not use any IM1 interrupt (38h) then the UART is never checked.

So apart form the NMI button there is no method that would always work.


# ZX Next SW

The ZX Next requires a program to be executed on the Next to communicate with the PC with DeZog.
The SW has the following main tasks:
- communication with DeZog
- read/write registers
- break the execution
- set SW breakpoints


There is another project [NDS-NextDevSystem](https://github.com/Ckirby101/NDS-NextDevSystem) by Chris Kirby which also aims at the same goal.
So I guess I can get some inspiration from it.

However, from what I have seen so far there are a few challenges for use for my purposes:

- There are only 10 breakpoints available. I probably need to increase this (100?)
- A breakpoint is cleared when hit. I need to "re-install" the breakpoint after execution. This sounds simpler than it is (!)
- 38h IM1 interrupt is turned off. So not usable with running interrupts (breakpoints use RST 38h).
- No conditional breakpoint. Not a real problem as this can be handled inside DeZog nowadays.


# DZRPN - DeZog Remote Protocol Next


# SW Breakpoints

When a breakpoint is set the opcode at the breakpoint address is saved and instead a one byte opcode RST is added.
Chris uses RST 38h which makes the interrupts unusable but if the ROM is exchanged then it should be possible to use also other values.
If DIVMMC is used it depends on what addresses it reacts on.

So, at the RST position there is code located which jumps into the debug-program and the program informs DeZog via UART, then waits on input from DeZog.

This is the easy part.

Tehn, if DeZog sends a 'continue' command the original breakpoint location is re-stored with the original opcode and the debug-program jumps here.

Now it becomes hairy. Normal program execution would work but what if the program passes the same location again. It should stop there again but instead it does nothing because the breakpoint (the RST opcode) was not restored.

So we need a way to execute the one instruction at the breakpoint location and afterwards restore the breakpoint.

Current idea is to get support from DeZog. For each breakpoint DeZog should add additional info. This info contains:
- length of the opcode
- an optional branch address

The 'length' is used to set an artificial breakpoint right after the instruction and is used for all instruction. For non-branching isntructions this would already do.
For the branching (and conditional branching) instruction we need also the branch location.

Now the debug-program adds 2 artificial breakpoints. One at the breakpoint address + len and one at the branch address.

So, after our original breakpoint was hit the debug-program restores the original opcode and then adds the 2 temporary artificial breakpoints.
The debug-program then jumps to the breakpoint location and after the instruction is executed immediately the next RST is done (because of the artificial breakpoints.
Now the debug-program removes the artificial breakpoints and restores the original breakpoints and then continues.

Seems complicated but doable.

The data structure for one breakpoint needs the following fields:
- instruction length
- original opcode at breakpoint address
- breakpoint address (to identify the breakpoint)
- the branch address

I.e. 6 bytes in total.


## More complex

In order to reduce complexity on the ZX Next SW side  many of the breakpoint functionality is moved to DeZog.

This reduces the need especially for memory at the ZX next part.
following functionality is done by DeZog:
- Calculation of the length of the instruction
- Storing of the original opcode
- Taking care of artificial (temporary) breakpoints
- State management to decide if a breakpoint was hit and if we need to restore the original breakpoint and later restore the breakpoint itself.

No memory for tables or code is required on ZX side to:
- calculate the length of an instruction
- store any breakpoints, i.e. there are up to 655356 (-3) breakpoints possible

Here is a sequence hart which helps to explain:

~~~puml
hide footbox
title Continue
participant dezog as "DeZog"
participant zxnext as "ZXNext"

== Add breakpoint ==
dezog -> zxnext: CMD_READ_MEM(bp_address)
dezog <-- zxnext
note over dezog: Store opcode along\nbreakpoint
dezog -> zxnext: CMD_ADD_BREAKPOINT(bp_address)
note over zxnext: Overwrite opcode with RST
...

== Stop at breakpoint ==
dezog <- zxnext: NTF_PAUSE(bp_address)
note over dezog: If BREAK_REASON==HIT then\nset restoreBreakpointId

== Continue ==
alt restoreBreakpointId != undefined
	note over dezog: Get opcode of\nbp_address from list
	dezog -> zxnext: CMD_WRITE_MEM(bp_address, opcode)
	note over zxnext: Overwrites the\nRST (breakpoint),\ni.e. restores the opcode
	dezog <-- zxnext

	note over dezog: Calculate two bp\naddresses for stepping
	dezog -> zxnext: CMD_CONTINUE(tmp_bp_addr1, tmp_bp_addr2)
	note over zxnext: Exchange the opcodes at\nthe both addresses\nand store them
	dezog <-- zxnext
	note over zxnext: Breakpoint hit:\nRestore the 2 opcodes
	dezog <- zxnext: NTF_PAUSE(tmp_bp_addr1 || tmp_bp_addr2)

	note over dezog: Restore breakpoint
	dezog -> zxnext: CMD_ADD_BREAKPOINT(bp_address)
	note over zxnext: Sets the breakpoint\n(RST) again
	dezog <-- zxnext
end

dezog -> zxnext: CMD_CONTINUE(next_bp_addr1, next_bp_addr2)
dezog <-- zxnext
~~~


## Even more complex - DZRPN

To save even more memory on ZX Next side and furthermore be much more flexible with the exchange data and protocol the idea is to use DZRPN.

DZRPN is the "DeZog Remote Protocol Next" and it does not define any commands anymore like DZRP.
Instead only a wrapper format is defined which carries arbitrary data.
On ZX Next side the data is written into code memory **and executed**.

I.e. DeZog send sort machine code program to the ZX Next whcih the ZX Next executes.

These short machine code programs do very much what the DZRP Command would do but are, of course, much more flexible.
I.e. if I would need to define another parameter with DZRP I can just change the Z80 program  at DeZog. The protocol does not need any change and also the ZX Next program does not need any change.

The ZX Next program basically just does the communication and the basic breakpoint handling (RST).
Everything else is done by DeZog.

Of course, this drastic change need major changes in DeZog:
- ZXNextRemote and ZXNextSocketRemote cannot be derived from DZRP anymore.
- CSpectRemote cannot be derived from ZxNextRemote
- The build process of DeZog need to include (sjasmplus) compilation of the small assembler programs.
- DeZog needs to read the assembler programs labels to inject parameters (e.g. the breakpoint addresses) in the machine code directly.

Other problems involve:
- Debugging the assembler source is more difficult. This is only possible at menmonic level, no source code debugging.
- To see/log the message flow it is necessary to identify each sent block with a number. Otherwise it's completely invisible what is sent. Anyhow, parameters that are sent are mainly invisible at all. But on the other hand it is also not possible to misinterpret them on remote side.

The aproach is complex, demanding, very flexible and interesting.
I think I shoudl do it but first I need to investigate more on the real serial interfacing with the ZX Next:
This interface usually needs to send more data per command as DZRP.
E.g. ADD_BREAKPOINT requires about 30 bytes as program and about only 5 (additional) bytes as DZRP.

At a baudrate of 230400 about 20 bytes can be transferred in a ms.
I.e. it requires about 1 ms more per message.
I suspect that not the baudrate but the communication latencies are main repsonsible for the usage speed but anyhow it is most probably wise to test it before I do such significant changes.

I.e. I need to test the serial connection with a real ZX Next and then insert e.g. an extra DZRP message to each message just to slow it down and to see if it affects usage speed.






## Breakpoint conditions

After a breakpoint is hit it needs to be checked if the condition is true.

Conditions like
```(A > 3) AND (PEEKW(SP) != PC)```
should be allowed.

I don'T need to take care inside the Z80 program. Nowadays DeZog can take care of the conditions without help of the remote.


# Reverse Debugging

Real reverse debugging, i.e. collecting a trace of instruction on the ZX Next, is not possible because this would run far too slow.

But still the lite history will work in DeZog.


# Code Coverage

Similar to trace history. Is not possible or would be far to slow in SW.

So code coverage is not available.


# ROM vs. DivMMC

Putting the debug code into the ROM area is straightforward.
The other way is to use DivMMC which can automatically be paged in if e.g. a RST, i.e. address 0x0000 is executed. (Unfortunately delayed after the next instruction!)
If ROM would be used a special code would be required at 0x0000 which switches the banks.
I.e. at address 0x0000 about 20 bytes of code would be unusable for the debugged program.
With DivMMC this area can be used by the debugged program.
Only restrictions (but this is true for ROM as well), the debugged program is not allowed to
- do a RST (this is reserved for breakpoints)
- do a CALL 0x0000 (same reason)

Furthermore using DivMMC has the advantage that no memory bank is used, just the one for DivMMC. Obviously no DivMMC program could be debugged.

I guess I start with a ROM version without banking and later add the DivMMC version.


References:
https://velesoft.speccy.cz/zx/divide/divide-memory.htm
https://velesoft.speccy.cz/zx/divide/doc/pgm_model-en.txt
https://gitlab.com/SpectrumNext/ZX_Spectrum_Next_FPGA/-/blob/master/cores/zxnext/ports.txt#L370


# DivMMC

My current favorite.

RST is used for breakpoints. With divMMC a trap can be enabled at address 0x0000.
I.e. once a breakpoint is hit the DivMMC memory will be enabled automatically.
Unfortunately this does nto happen immediately but only after one instruction fetch from the original memory paged into slot 0 (normally the ROM).
If the debugged program has put in here something else than the ROM the instruction could be everything.
But even with the ROM the first instruction would be "DI", giving me no chance to check the interrupt enable state to restore it later.

I.e. it is necessary to occupy at least a few bytes in the slot 0 area.

The pseudo code would be something like this:
~~~asm
	ORG 0x0000
	Store current interrupt state (e.g. LD A,I)
	DI
	Jump to main
~~~
~~~asm
	ORG 0x000?-0x3FFF (somewhere in the DivMMC or ROM area)
main:
	Store the registers
	Setup stack
.loop:
	Wait on command
	Execute command
	Jump to .loop
~~~

Whenever a CMD_CONTINUE is executed:
~~~asm
cmd_continue:
	Restore registers
	Restore interrupt state
	RET  ; return from RST
~~~

I.e. the debugged program must make sure that a few bytes are occupied in slot 0 at address 0.
E.g.
~~~
	ORG 0x0000
	push af
	ld a,i
    jp pe,go_on     ; IFF was 1 (interrupts enabled)

	; if P/V read "0", try a 2nd time
    ld a,i

go_on:
	di
    push af	; Store P/V flag
	jp main
~~~



Problem:
- The original idea was to use RST for the breakpoints. In the original ROM there is a DI located at 0x0000. Unfortunately I think I need to keep it there because programs may use it as relative backwards jump when using IM2. On the other hand I cannot execute DI first because I need to know the state of the interrupt beforehand.
Also if I would use nextreg 0x22 to disable the interrupts, I cannot leave DI at 0x0000 because I wouldn't know if how to restore it.
So either a different RST address or disallow this special interrupt usage.
-  I could use **RST 66h instead**. That one will be occupied anyway for the Drive button. I would only need a way to distinguish a RST 66 from the button being pressed...


# Memory Bank Switching

If DivMMC or ROM, both get problems with the banking in some cases.
The debugger program resides in another memory bank than the debugged code but during the debugger program being executed it is difficult to access the memory of a debugged program in the same area.

Particular problematic is
- setting breakpoints
- reading memory
- writing memory


## Setting Breakpoints

The debugger program resides in the ROM area at 0x0000-0x3FFF (or maybe 0x1FFF).
If a breakpoint should be set in this area it would be set in the debugger program.
Setting a breakpoint involves to exchange the opcode at the breakpoint address with RST opcode. I.e. a memory read and write.

To do this the debugged program memory bank need to be paged in another slot (slot 2-7). Then the memory is read and set. Afterwards the original bank paging is restored.

## Reading/Writing Memory

The problem is the same as for breakpoints. It's a little bit more tricky because whole memory areas are involved that can also overlap the 0x3FFF and 0x0000 boundaries. So the memory reading/writing need to be partitioned.
But the principle is the same.


# Measurements

I did a few measurements through the Joystick UART interface.

Loopback without ZXNext (directly at the USB serial device) and with ZXNext.

Adafruit Part Number 954, Joy 2:

| baud      | packet size | Bytes/ms wo ZXN | Bytes/ms with ZXN |
|-----------|-------------|-----------------|-------------------|
| 230400    | 2000        | 21              | 21                |
| 230400    | 200         | 16.5            | 15.9              |
| 230400    | 20          | 4.79            | 4.68              |
| 230400    | 10          | 2.71            | 2.65              |
| 460800    | 2000        | 40              | 40                |
| 460800    | 200         | 25.4            | 25.2              |
| 460800    | 20          | 5.51            | 5.42              |
| 460800    | 10          | 2.935           | 2.915             |
| 614400    | 2000        | 52              | 51                |
| 614400    | 200         | 30.1            | 29.7              |
| 614400    | 20          | 5.72            | 5.63              |
| 614400    | 10          | 3.025           | 2.955             |
| 921600    | 2000        | 67              | 66                |
| 921600    | 200         | 34.8            | 34.2              |
| 921600    | 20          | 5.9             | 5.81              |
| 921600    | 10          | 3.08            | 3.05              |
| 1228800   | 2000        | 83              | -                 |
| 1228800   | 200         | 38.6            | -                 |
| 1228800   | 20          | 5.87            | -                 |
| 1228800   | 10          | 3.125           | -                 |
| 1958400   | 2000        | 140             | -                 |
| 1958400   | 200         | 48.5            | -                 |
| 1958400   | 20          | 6.26            | -                 |
| 1958400   | 10          | 3.2             | -                 |



FTDI chip, Joy 2:

| baud      | packet size | Bytes/ms wo ZXN | Bytes/ms with ZXN |
|-----------|-------------|-----------------|-------------------|
| 921600    | 2000        | 52.99           | -                 |
| 921600    | 1500        | 45.9            | 38.65             |
| 921600    | 200         | 11              | 10.59             |
| 921600    | 20          | 1.25            | 1.25              |
| 921600    | 10          | 0.625           | 0.63              |
| 2000000   | 2000        | 76.99           | -                 |
| 2000000   | 200         | 11.79           | -                 |
| 2000000   | 20          | 1.25            | -                 |
| 2000000   | 10          | 0.625           | -                 |


## Direct comparison:

Adafruit:
| baud      | packet size | Bytes/ms direct loopback |
|-----------|-------------|-----------------|
| 921600    | 2000        | 67              |
| 921600    | 200         | 34.8            |
| 921600    | 20          | 5.9             |
| 921600    | 10          | 3.08            |

FTDI-Chip:
| baud      | packet size | Bytes/ms direct loopback |
|-----------|-------------|-----------------|
| 921600    | 2000        | 52.99           |
| 921600    | 200         | 11              |
| 921600    | 20          | 1.25            |
| 921600    | 10          | 0.625           |
| 2000000   | 2000        | 76.99           |
| 2000000   | 200         | 11.79           |
| 2000000   | 20          | 1.25            |
| 2000000   | 10          | 0.625           |

FTDI slower for small packet sizes.
