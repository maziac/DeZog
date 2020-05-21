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


# SW Breakpoints

When a breakpoint is set the opcode at the breakpoint address is saved and instead a one byte opcode RST is added.
Chris uses RST 38h which makes the interrupts unusable but if the ROM is exchanged then it should be possible to use also other values.
If DIVMMC is used it depends on what addresses it reacts on.

So, at the RST position there is code located which jumps into the debug-program and the program informs DeZog via UART, then waits on input from DeZog.

This is the easy part.

Now if DeZog sends a 'continue' command the original breakpoint location is re-stored with the original opcode and the debug-program jumps here.

Now it becomes hairy. Normal program execution would work but what if the program passes the same location again. It should stop there again but instead it does nothing because the breakpoint (the RST opcode) was not restored.

So we need a way to execute the one instruction at the breakpoint location and afterwards restore the breakpoint.

Current idea is to get support from DeZog. For each breakpoint DeZog should add additional info. This info contains:
- length of the opcode
- an optional branch address

The 'length' is used to set an artificial breakpoint right after the instruction and is sued for all instruction. for non-branching isntructions this would already do.
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

