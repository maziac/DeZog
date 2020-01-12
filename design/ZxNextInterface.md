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

**Cooperation**: The user checks the (RX) UART in the main loop or from an interrupt.
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


There is another project [NDS-NextDevSystem](https://github.com/Ckirby101/NDS-NextDevSystem) by Chris Kirby which does already what I would like to achieve as well.
So I guess I can take that directly.

From what I have seen from the Z80 sources I need to modify them slightly for my purposes:

- There are only 10 breakpoints available. I probably need to increase this (100?)
- A breakpoint is cleared when hit. I need to remove this feature.
- 38h IM1 interrupt is turned off. So not usable with running interrupts (breakpoints use RST 38h). Seems Chris is working on this.
- No conditional breakpoint. I need to implement this on Z80 side.


# SW Breakpoints

When a breakpoint is set the opcode at the breakpoint address is saved and instead a one byte opcode RST is added.
Chris uses RST 38h which makes the interrupts unusable but if the ROM is exchanged then it should be possible to use also other values.
If DIVMMC is used it depends on what addresses it reacts.

## Breakpoint conditions

After a breakpoint is hit it needs to be checked if the condition is true.

Conditions like
```(A > 3) AND (PEEKW(SP) != PC)```
should be allowed.

Here is the algorithm to implement the math expression: https://en.wikipedia.org/wiki/Shunting-yard_algorithm


# Reverse Debugging

Real reverse debugging, i.e. collecting a trace of instruction on the ZX Next, is not possible because this would run far too slow.

But it is possible to implement a lite version:
While steping or running (and break stopping) through the code at each stop the stack is and the register values are saved.
Then, when back stepping, one can exactly step back through these stored values.
