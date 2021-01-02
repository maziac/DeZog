# DZRP - DeZog Remote Protocol

Note: This document contains [plantuml](https://plantuml.com/de/sequence-diagram) message sequence charts. On github these are not rendered. Use e.g. vscode with a suitable plugin to view the file correctly.

The DZRP, or Dezog Remote Protocol, defines the messages exchanged between DeZog and a remote program.
The remote program is typically an emulator or e.g. real ZX Next HW.
It is used to send commands to the remote program to e.g. get the register or memory values or to step through the code.

It is a simple Request-Response protocol, i.e. DeZog sends a command and the remote program responds to it.
The next command is not sent before the response for the previous one has been received.

~~~puml
hide footbox

participant dezog as "DeZog"
participant program as "Remote Program"

dezog -> program: Command
dezog <- program: Response
~~~

In the other direction (remote program to DeZog) there are notifcations.
Notifications are not acknowledged, i.e. there is no response on a notification.

There is only one notification at the moment.
It is used after a 'continue' command to indicate that the program run was paused, e.g. because a breakpoint has been hit.

~~~puml
hide footbox

participant dezog as "DeZog"
participant program as "Remote Program"

== Case A ==
dezog -> program: 'continue' command
dezog <- program: 'continue' response
...
dezog -> program: 'pause' command
dezog <- program: 'pause' response
dezog <- program: 'pause' notification

== Case B ==
dezog -> program: 'continue' command
dezog <- program: 'continue' response
...
note over program: Breakpoint hit
dezog <- program: 'pause' notification
~~~

## Important Note

Beginning with version 1.3.0 the DZRP has become more of a "toolkit" rather than a specific protocol.

I.e. different remotes may use a different subset of commands. For one this is because different remotes do support a different feature set. But this is especially true for the breakpoint implementation which very much differs on a real ZXNext from the ones available in the emulators.

The table below shows which commands are used with what remote:

| Command               | zsim    | CSpect | ZXNext |
|-----------------------|---------|--------|--------|
| CMD_INIT              | -       | X      | X      |
| CMD_CLOSE             | -       | X      | X      |
| CMD_GET_REGISTERS     | X       | X      | X      |
| CMD_SET_REGISTER      | X       | X      | X      |
| CMD_WRITE_BANK        | X       | X      | X      |
| CMD_CONTINUE          | X       | X      | X      |
| CMD_PAUSE             | X       | X      | -      |
| CMD_READ_MEM          | X       | X      | X      |
| CMD_WRITE_MEM         | X       | X      | X      |
| CMD_SET_SLOT          | X       | X      | X      |
| CMD_GET_TBBLUE_REG    | X       | X      | X      |
| CMD_SET_BORDER        | X       | X      | X      |
| CMD_SET_BREAKPOINTS   | -       | -      | X      |
| CMD_RESTORE_MEM       | -       | -      | X      |
| CMD_LOOPBACK	        | -       | -      | X      |
| CMD_GET_SPRITES_PALETTE | X     | X      | X      |
| CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL | X | X | X |
| CMD_GET_SPRITES       | X       | X      | -      |
| CMD_GET_SPRITE_PATTERNS | X     | X      | -      |
| CMD_ADD_BREAKPOINT    | X       | X      | -      |
| CMD_REMOVE_BREAKPOINT | X       | X      | -      |
| CMD_ADD_WATCHPOINT    | X       | -      | -      |
| CMD_REMOVE_WATCHPOINT | X       | -      | -      |
| CMD_READ_STATE        | X       | -      | -      |
| CMD_WRITE_STATE       | X       | -      | -      |

DeZog knows with which remote it communicates and chooses the right subset.


## History

### 2.0.0

Changed:
- CMD_INIT: Added memory model.
- CMD_GET_REGISTERS: Added slot/bank information.
- NTF_PAUSE: Added long address.
- CMD_ADD_BREAKPOINT: Added long address.
- CMD_SET_BREAKPOINTS: Changed to send additionally the bank info for all breakpoints.
- CMD_RESTORE_MEM: Changed to send additionally the bank info for all restored locations.
Removed:
- CMD_GET_SLOTS: Now done with CMD_GET_REGISTERS.

### 1.6.0
- Added CMD_CLOSE for closing a debug session.

### 1.5.0
- Added CMD_LOOPBACK for testing the serial connection.

### 1.4.0
- Numbering changed.

### 1.3.0
- Special breakpoint commands added: CMD_SET_BREAKPOINTS and CMD_RESTORE_MEM.

### 1.2.0
- CMD_SET_SLOT added.

### 1.1.0
- CMD_INIT + response now contain string (program name + version).

### 1.0.1
- A lot of size and length values corrected.

### 1.0.0
- Officially released.

### 0.4.1
- Extended SET_REGISTERS by I and R.

### 0.4.0
- Extended CMD_CONTINUE to allow optimizes StepOver and StepOut which also overcomes the CSpect stepping problem.

### 0.3.0
- CMD_GET_SPRITES_CLIP_WINDOW(_AND_CONTROL) extended to return also the control byte.

### 0.2.0
- PAUSE notification: returns break address now instead of the breakpoint ID.

### 0.1.0
- Initial experimental version.


# Data Format

The message format is very simple. It starts with the length information followed by a byte containing the sequence number.
For commands a byte with the command ID will follow.
And then the payload follows.

Length is the length of all bytes folowing Length.

Command:

| Index | Size | Description |
|-------|------|-------------|
| 0     | 4    | Length of the payload data. (little endian) |
| 4     | 1    | Sequence number, 1-255. Increased with each command |
| 5     | 1    | Command ID |
| 6     | 1    | Payload: Data[0] |
| ...   | ...  | Data[...] |
| 6+n-1 | 1    | Data[n-1] |


Response:

| Index | Size | Description |
|-------|------|-------------|
| 0     | 4    | Length of the following data beginning with the sequence number. (little endian) |
| 4     | 1    | Sequence number, same as command. |
| 5     | 1    | Payload: Data[0] |
| ...   | ...  | Data[...] |
| 5+n-1 | 1    | Data[n-1] |

The numbering for Commands starts at 1. (0 is reserved, i.e. not used).
The numbering for notifications starts at 255 (counting down).
So in total there are 255 possible commands.

There is one notification defined which uses the seqeunce number 0.

Notification:

| Index | Size | Description |
|-------|------|-------------|
| 0     | 4    | Length of the following data beginning with the sequence number. (little endian) |
| 4     | 1    | Sequence number = 0. |
| 5     | 1    | Payload: Data[0] |
| ...   | ...  | Data[...] |
| 5+n-1 | 1    | Data[n-1] |


# Long addresses

With DZRP 2.0.0 (and Dezog 2.0.0) 'long addresses' have been introduced. These are addresses that not only carry the 64k address but additionally 1 byte for the memory bank information.

The stored bank info is the bank number plus 1.
This is because of the special meaning of ```bank==0``` in DeZog.
```bank==0``` in DeZog means that not a long address is used but a "normal" 64k address. Since DeZog can work in both modes it is necessary to distinguish those also in the DZRP.


# Commands and Responses

## CMD_INIT=1

This is the first command sent after connection.
The command sender will evaluate the received version and disconnect if versions do not match.

Command (Length=4+n):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 3    | 0-255, 0-255, 0-255 | Version (of the command sender): 3 bytes, big endian: Major.Minor.Patch |
| 3     | 1-n  | 0-terminated string | The program name + version as a string. E.g. "DeZog v1.4.0" |


Response (Length=7+n):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0/1-255 | Error: 0=no error, 1=general (unknown) error. |
| 2     | 3    | 0-255, 0-255, 0-255 | Version (of the response sender) : 3 bytes, big endian: Major.Minor.Patch |
| *5    | 1    | 0-255 | Machine type (memory model): 1 = ZX16K, 2 = ZX48K, 3 = ZX128K, 4 = ZXNEXT. Note: Only ZXNEXT is supported. |
| 6    | 1-n  | 0-terminated string | The responding program name + version as a string. E.g. "dbg_uart_if v2.0.0" |


## CMD_CLOSE=2

This is the last command. It is sent when the debug session is closed gracefully.
There is no guarantee that this command is sent at all, e.g. when the connection is disconnected ungracefully.
But the receiver could use it e.g. to show the (assumed) connection status.

Command (Length=0):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| -     | -    | -     | -          |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


## CMD_GET_REGISTERS=3

Command (Length=0):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| -     | -    | -     | -          |


Response (Length=30+Nslots):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0    | 1    |       | Sequence number |
| 1     | 2    | PC   | All little endian |
| 3     | 2    | SP   |   |
| 5     | 2    | AF   |   |
| 7     | 2    | BC   |   |
| 9     | 2    | DE   |   |
| 11    | 2    | HL   |   |
| 13    | 2    | IX   |   |
| 15    | 2    | IY   |   |
| 17    | 2    | AF2  |   |
| 19    | 2    | BC2  |   |
| 21    | 2    | DE2  |   |
| 23    | 2    | HL2  |   |
| 25    | 1    | R    |   |
| 26    | 1    | I    |   |
| 27    | 1    | IM   |   |
| 28    | 1    | reserved |   |
| 29    | 1    | 1-255 | Nslots. The number of slots that will follow.  |
| *30   | slot[0] | 0-255 | The slot contents, i.e. the bank number |
| ...   | ...  | ...  | " |
| *29+Nslots | slot[Nslots-1] | 0-255 | " |


## CMD_SET_REGISTER=4

Command (Length=3):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | i     | Register number: 0=PC, 1=SP, 2=AF, 3=BC, 4=DE, 5=HL, 6=IX, 7=IY, 8=AF', 9=BC', 10=DE', 11=HL', 13=IM, 14=F, 15=A, 16=C, 17=B, 18=E, 19=D, 20=L, 21=H, 22=IXL, 23=IXH, 24=IYL, 25=IYH, 26=F', 27=A', 28=C', 29=B', 30=E', 31=D', 32=L', 33=H', 34=R, 35=I |
| 1     | 2  | n  | The value to set. Little endian. If register is one byte only the lower byte is used but both bytes are sent. |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |


## CMD_WRITE_BANK=5

Command (Length=1+N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-255 | Bank number |
| 1     | 1    | [0]   | First byte of memory block |
| ..    | ..   | ...   | ... |
| *N   | 1    | [N-1] | Last byte of memory block |


Example for ZXNext with 8K memory banks:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-223 | 8k bank number |
| 1     | 1    | [0]   | First byte of memory block |
| ..    | ..   | ...   | ... |
| 8191  | 1    | [0x1FFF] | Last byte of memory block |


Response (Length=2+n):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| *1     | 1    | 0-255 | Error: 0=no error, 1 = error. |
| *2     | 1-n  | 0-terminated string | Either 0 or a string which explains the error. E.g. one could have tried to overwrite ROM or the DezogIf program. |


## CMD_CONTINUE=6

Command (Length=11):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0/1   | Enable Breakpoint1 |
| 1     | 2    | 0-0xFFFF | Breakpoint1 address |
| 3     | 1    | 0/1   | Enable Breakpoint2 |
| 4     | 2    | 0-0xFFFF | Breakpoint2 address |
| 6     | 1    | 0/1/2 | Alternate command: 0=no alternate command, 1=step-over, 2=step-out. The following range is only defined for 1 (step-over) |
| 7     | 2    | 0-0xFFFF | range start (inclusive) for step-over |
| 9     | 2    | 0-0xFFFF | range end (exclusive) for step-over |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |


Note 1:
Normally the remote will simply do a Continue (run) when it receives this command unitl one of the breakpoints is hit.
If an 'alternate command' is given the remote might execute the alternate ommand instead. I.e. in that case the breakpoints are ignored, i.e. not set.
The alternate commands are optimization to allow to execute the commands more effectively, i.e. faster.

Alternate commands:
- **1=step-over**: A PC range is given. The remote will carry out a loop of internal step-overs until the PC is not inside the range anymore.
The idea behind this is to step over e.g. macros or several instructions in one line.
- **2: step-out**: On start the current SP value is saved. Then a loop of internal step-overs is executed until the current SP value is bigger than the saved one.


Note 2:
- The response is sent immediately.
- The breakpoints are meant for when the 'continue' commmand is called for step-over, step-into or step-out.
- The breakpoints are temporary. They will be removed automatically after the command is finished.


## CMD_PAUSE=7

Command (Length=0):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| -     | -    | -     | -          |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |



## CMD_READ_MEM=8

Command (Length=6):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 8     | CMD_READ_MEM |
| 1     | 1    | 0     | reserved  |
| 2     | 2    | addr  | Start of the memory block |
| 4     | 2    | n     | Size of the memory block |


Response (Length=N+1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | addr[0] | First byte of memory block |
| ..    | ..   | ...   | ... |
| 1+n-1 | 1    | addr[n-1] | Last byte of memory block |


## CMD_WRITE_MEM=9

Command (Length=4+N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 9     | CMD_WRITE_MEM |
| 1     | 1    | 0     | reserved  |
| 2     | 2    | addr  | Start of the memory block |
| 4     | 1    | addr[0] | First byte of memory block |
| ...   | ...  | ...   | ... |
| 4+n-1 | 1    | addr[n-1] | Last byte of memory block |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |


## CMD_SET_SLOT=10

Command (Length=2):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-255 | The slot to set. |
| 1     | 1    | 0-255 | The 8k bank to use. |

Example for ZXNext:
Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-7   | The slot to set. |
| 1     | 1    | 0-223, 0xFE, 0xFF | The 8k bank to use. |

Note:
- ROM0 = 254
- ROM1 = 255
On real HW this is the same, 0xFE and 0xFF will both be interpreted as 0xFF.


Response (Length=2):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0/1   | Error code. 0 = No error. 1 = could not set slot. At the moment this should return always 0. |


## CMD_GET_TBBLUE_REG=11

Command (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-255 | The register |

Response (Length=2):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0-255 | Value of the register |


## CMD_SET_BORDER=12

Command (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 6     | 1    | Bits 0-2: color | The color for the border |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 4     | 1    | 1-255 | Same seq no |


## CMD_SET_BREAKPOINTS=13

Command (Length=3*N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 0-65535 | Breakpoint[0].address |
| *2     | 1    | 0-255 | Breakpoint[0].bank+1 |
| 3     | 2    | 0-65535 | Breakpoint[1].address |
| 5    | 1    | 0-255 | Breakpoint[1].bank+1 |
| ...   | ...  | ...   | ... |
| 3*(N-1) | 2    | 0-65535 | Breakpoint[N-1].address |
| 2+3*(N-1) | 1  | 0-255 | Breakpoint[N-1].bank+1 |


Response (Length=1+N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0-255 | Memory at breakpoint address[0] |
| 2     | 1    | 0-255 | Memory at breakpoint address[1] |
| ...   | ...  | ...   | ... |
| N     | 1    | 0-255 | Memory at breakpoint address[N-1] |

Notes:
- This command is only used by the ZX Next, not by the emulators.
- N is max. 16383 ((65536-2)/4), see CMD_RESTORE_MEM.
- long addresses (with bank info are passed, bank=0: 64k address)


## CMD_RESTORE_MEM=14

Restores the memory previously overwritten by CMD_SET_BREAKPOINTS.

Command (Length=4*N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 0-65535 | [0].address |
| *2     | 1    | 0-255 | [0].bank+1 |
| 3     | 1    | 0-255 | Value to restore |
| 4     | 2    | 0-65535 | [1].address |
| 6     | 1    | 0-255 | [1].bank+1 |
| 7    | 1    | 0-255 | Value to restore |
| ...   | ...  | ...   | ... |
| 4*(N-1) | 2    | 0-65535 | [N-1].address |
| 1+4*(M-1) | 1    | 0-255 | [N-1].bank+1 |
| 2+4*(N-1) | 1    | 0-255 | Value to restore |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |

Notes:
- This command is only used by the ZX Next, not by the emulators.
- N is max. 16383 ((65536-2)/4)
- long addresses (with bank info) are passed, bank=0: 64k address


## CMD_LOOPBACK=15

Command (Length=N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-255 | Data[0] |
| ...   | ...  | ...   | ...       |
| N-1   | 1    | 0-255 | Data[N-1] |

Response (Length=N+1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0-255 | Data[0]    |
| ...   | ...  | ...   | ...        |
| N     | 1    | 0-255 | Data[N-1]  |

N is max. 8192.

Loops back the received data. Used for testing purposes.


## CMD_GET_SPRITES_PALETTE=16

Command (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0/1   | Palette index |

Response (Length=513):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 512  | 0-255 | The 256 palette values, 9bit values, little endian, the 2nd byte bit 0 contains the lowest bit of the blue 3-bit color. RRRGGGBB, 0000000B |



## CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL=17

Command (Length=0):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| -     | -    | -     | -          |

Response (Length=6):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0-255 | x-left     |
| 2     | 1    | 0-255 | x-right    |
| 3     | 1    | 0-255 | y-top      |
| 4     | 1    | 0-255 | y-bottom   |
| 5     | 1    | 0-255 | control byte (from register 0x15) |



## CMD_GET_SPRITES=18

Command (Length=2):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0-128 | Sprite index |
| 1     | 1    | 0-128 | N. Count of sprites |

Response (Length=1+5*N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 5*N  | 0-255 | 5 bytes per sprite: Attribute 0, 1, 2, 3, 4 |


## CMD_GET_SPRITE_PATTERNS=19

Command (Length=4):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 0-63  | index of 256 byte pattern. |
| 2     | 2    | 0-64  | N. Number of patterns to retrieve |

Note: It is not possible to read just a 128 byte pattern, instead always 256 patterns are read.

Response (Length=1+256*N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 2     | N*256| 0-255 | Pattern memory data. |

Note: 512 = 16x16x2.


## CMD_ADD_BREAKPOINT=40

Command (Length=3+n):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 0-65535 | Breakpoint address |
| *2    | 1    | 0-255 | The bank+1 of the breakpoint. |
| 3     | 1-n  | 0-terminated string | Breakpoint condition. Just 0 if no condition. |


Response (Length=3):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 2    | 1-65535/0 | Breakpoint ID. 0 is returned if no BP is available anymore. |


Note: long addresses (with bank info) are passed, bank=0: 64k address

## CMD_REMOVE_BREAKPOINT=41

Command (Length=2):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 1-65535 | Breakpoint ID |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 4     | 1    | 1-255 | Same seq no |


## CMD_ADD_WATCHPOINT=42

Command (Length=6):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 0-65535 | Start of watchpoint address range |
| 2     | 1    | 0-255 | bank+1 info |
| 3     | 2    | 0-65535 | Size of watchpoint address range |
| 5     | 1    | Bit 0: read, Bit 1: write | Access type: read, write or read/write |


Response (Length=2):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 1-255 | Same seq no |
| 1     | 1    | 0/1   | 0=success, other=error, e.g. no watchpoints available |

Note: long addresses (with bank info) are passed, bank=0: 64k address

## CMD_REMOVE_WATCHPOINT=43

Command (Length=6):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 2    | 0-65535 | Start of watchpoint address range |
| 2     | 1    | 0-255 | bank+1 info |
| 3     | 2    | 0-65535 | Size of watchpoint address range |
| 5     | 1    | Bit 0: read, Bit 1: write | Access type: read, write or read/write |


Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 4     | 1    | 1-255 | Same seq no |


## CMD_READ_STATE=50

Command (Length=0):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| -     | -    | -     | -          |


Response (Length=1+N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 4     | 1    | 1-255 | Same seq no |
| 5     | N    |       | Arbitrary data. The format is up to the remote. |


## CMD_WRITE_STATE=51

Command (Length=N):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 6     | N    |       | Arbitrary data. This is data that has previously been retrieved via CMD_READ_STATE. |

Response (Length=1):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 4     | 1    | 1-255 | Same seq no |


# Notifications

## NTF_PAUSE

Notification (Length=6+n):
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 1    | 0     | Instead of Seq No. |
| 1     | 1    | 1     | NTF_PAUSE  |
| 2     | 1    | 0-255 | Break reason: 0 = no reason (e.g. a step-over), 1 = manual break, 2 = breakpoint hit, 3 = watchpoint hit read access, 4 = watchpoint hit write access, 255 = some other reason: the reason string might have useful information for the user |
| 3     | 2    | 0-65535 | Breakpoint or watchpoint address. |
| *5    | 1    | 0-255 | The bank+1 of the breakpoint or watchpoint address. |
| 6    | 1-n  | reason string | Null-terminated break reason string. Might in theory have almost 2^32 byte length. In practice it will be normally less than 256.
If error string is empty it will contain at least a 0. |

