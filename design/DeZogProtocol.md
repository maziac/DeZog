# DZRP - DeZog Remote Protocol

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


## History

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

The message format is very simple. It starts with the length information followed by a byte containing the command or response ID and then the data.

| Index | Size | Description |
|-------|------|-------------|
| 0     | 4    | Length of the following data beginning with 'Command ID' (little endian) |
| 4     | 1    | Sequence number, 1-255. Increased with each command |
| 4     | 1    | Command ID or Response ID |
| 5     | 1    | Data[0] |
| ...   | ...  | Data[...] |
| 5+n-1 | 1    | Data[n-1] |

The response ID is the same as the corresponding command ID.
The numbering for Commands starts at 1. (0 is reserved, i.e. not used).
The numbering for notifications starts at 255 (counting down).
So in total there are 255 possible commands and notifications.


# Commands and Responses

## CMD_INIT

This is the first command sent after connection.
The command sender will evaluate the received version and disconnect if versions do not match.

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x01  | CMD_INIT |
| 6     | 3    | 0-255, 0-255, 0-255 | Version (of the command sender): 3 bytes, big endian: Major.Minor.Patch |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 3    | 0-255, 0-255, 0-255 | Version (of the response sender) : 3 bytes, big endian: Major.Minor.Patch |
| 8     | 1    | 0/1-255 | Error: 0=no error, 1=general (unknown) error. |

<!--
| 9     | 2    | 16 bit | Supported features |


Supported features are bitwise:
| Bit | Description |
|-----|-------------|
| 0   | Supports ZX Next register reading |
| 1-7 | not used |


Other features could be:
- Supports coverage
- Supports cpu history
- Supports extended call stack
-->

## CMD_GET_REGISTERS

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x02  | CMD_GET_REGISTERS |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 29    | Length     |
| 4     | 1    | 1-255 | Same seq no     |
| 5     | 2    | PC   | All little endian    |
| 7     | 2    | SP   |   |
| 9     | 2    | AF   |   |
| 11    | 2    | BC   |   |
| 13    | 2    | DE   |   |
| 15    | 2    | HL   |   |
| 17    | 2    | IX   |   |
| 19    | 2    | IY   |   |
| 21    | 2    | AF2  |   |
| 23    | 2    | BC2  |   |
| 25    | 2    | DE2  |   |
| 27    | 2    | HL2  |   |
| 28    | 1    | R    |   |
| 39    | 1    | I    |   |
| 30    | 1    | IM   |   |
| 31    | 1    | reserved |   |


## CMD_SET_REGISTER

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x03  | CMD_SET_REGISTER |
| 6     | 1    | i  | Register number: 0=PC, 1=SP, 2=AF, 3=BC, 4=DE, 5=HL, 6=IX, 7=IY, 8=AF', 9=BC', 10=DE', 11=HL', 13=IM, 14=F, 15=A, 16=C, 17=B, 18=E, 19=D, 20=L, 21=H, 22=IXL, 23=IXH, 24=IYL, 25=IYH, 26=F', 27=A', 28=C', 29=B', 30=E', 31=D', 32=L', 33=H', 34=R, 35=I |
| 7     | 2  | n  | The value to set. Little endian. If register is one byte only the lower byte is used but both bytes are sent. |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


## CMD_WRITE_BANK

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 8195  | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x04  | CMD_WRITE_BANK |
| 6     | 1    | 0-111 | Bank number |
| 7     | 1    | [0]   | First byte of memory block |
| ..    | ..   | ...   | ... |
| 8194 | 1    | [0x1FFF] | Last byte of memory block |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


## CMD_CONTINUE

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x05  | CMD_CONTINUE |
| 6     | 1    | 0/1   | Enable Breakpoint1 |
| 7     | 2    | 0-0xFFFF | Breakpoint1 address |
| 9     | 1    | 0/1   | Enable Breakpoint2 |
| 10    | 2    | 0-0xFFFF | Breakpoint2 address |
| 12    | 1    | 0/1/2 | Alternate command: 0=no alternate command, 1=step-over, 2=step-out. The following range is only defined for 1 (step-over) |
| 13    | 2    | 0-0xFFFF | range start (inclusive) for step-over |
| 15    | 2    | 0-0xFFFF | range end (exclusive) for step-over |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


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


## CMD_PAUSE

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x06  | CMD_PAUSE    |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


## CMD_ADD_BREAKPOINT

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 4+n   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x07  | CMD_ADD_BREAKPOINT |
| 6     | 2    | 0-65535 | Breakpoint address |
| 8     | 1-n  | 0-terminated string | Breakpoint condition. Just 0 if no condition. |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 3     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 2    | 1-65535/0 | Breakpoint ID. 0 is returned if no BP is available anymore. |



## CMD_REMOVE_BREAKPOINT

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 4     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x08  | CMD_REMOVE_BREAKPOINT |
| 6     | 2    | 1-65535 | Breakpoint ID |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |



## CMD_ADD_WATCHPOINT

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 6+n   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x09  | CMD_ADD_WATCHPOINT |
| 6     | 2    | 0-65535 | Start of watchpoint address range |
| 6     | 2    | 0-65535 | Size of watchpoint address range |
| 6     | 1    | Bit 0: read, Bit 1: write | Access type: read, write or read/write |
| 8     | 1-n  | 0-terminated string | Breakpoint condition. Just 0 if no condition. |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 1    | 0/1   | 0=success, other=error, e.g. no watchpoints available |



## CMD_REMOVE_WATCHPOINT

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0A  | CMD_REMOVE_WATCHPOINT |
| 6     | 2    | 0-65535 | Start of watchpoint address range |
| 6     | 2    | 0-65535 | Size of watchpoint address range |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |



## CMD_READ_MEM

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 7     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0B  | CMD_READ_MEM |
| 6     | 1    | 0     | reserved  |
| 7     | 2    | addr  | Start of the memory block |
| 9     | 2    | n     | Size of the memory block |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1+n   | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 1    | addr[0] | First byte of memory block |
| ..    | ..   | ...   | ... |
| 5+n-1 | 1    | addr[n-1] | Last byte of memory block |


## CMD_WRITE_MEM

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5+n   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0C  | CMD_WRITE_MEM |
| 6     | 1    | 0     | reserved  |
| 7     | 2    | addr  | Start of the memory block |
| 9     | 1    | addr[0] | First byte of memory block |
| ...   | ...  | ...   | ... |
| 9+n-1 | 1    | addr[n-1] | Last byte of memory block |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


## CMD_GET_SLOTS

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5+n   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0D  | CMD_GET_SLOTS |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 9     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 1    | slot[0] | The bank number associated with slot 0 |
| 6     | 1    | slot[1] | The bank number associated with slot 1 |
| ...   | ...  | ..      | ... |
| 5     | 1    | slot[7] | The bank number associated with slot 7 |

Note:
- ROM0 = 254
- ROM1 = 255


# CMD_READ_STATE

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0E  | CMD_READ_STATE |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1+N   | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | N    |       | Arbitrary data. The format is up to the remote. |


# CMD_WRITE_STATE

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2+N   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0F  | CMD_WRITE_STATE |
| 6     | N    |       | Arbitrary data. This is data that has previously been retrieved via CMD_READ_STATE. |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


# CMD_GET_TBBLUE_REG

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 3    | 2+N   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x10  | CMD_GET_TBBLUE_REG |
| 6     | 1    | 0-255 | The register |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 1    | 0-255 | Value of the register |


# CMD_GET_SPRITES_PALETTE

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 3    | 2+N   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x11  | CMD_GET_SPRITES_PALETTE |
| 6     | 1    | 0/1   | Palette number |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 512  | 0-255 | The 256 palette values, 9bit values, little endian, the 2nd byte bit 0 contains the lowest bit of the blue 3-bit color. RRRGGGBB, 0000000B |


# CMD_GET_SPRITES

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 3    | 4     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x12  | CMD_GET_SPRITES |
| 6     | 1    | 0-128 | Sprite index |
| 7     | 1    | 0-128 | N. Count of sprites |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1+5*N | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 5*N  | 0-255 | 5 bytes per sprite: Attribute 0, 1, 2, 3, 4 |



# CMD_GET_SPRITE_PATTERNS

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 4     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x13  | CMD_GET_SPRITE_PATTERNS |
| 6     | 2    | 0-63  | index of 256 byte pattern. |
| 7     | 2    | 0-64  | N. Number of patterns to retrieve |

Note: It is not possible to read just a 128 byte pattern, instead always 256 patterns are read.

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1+N*256 | Length   |
| 4     | 1    | 1-255 | Same seq no |
| 5     | N*256| 0-255 | Pattern memory data. |

Note: 512 = 16x16x2.



# CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x14  | CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 6     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | 1    | 0-255 | x-left     |
| 6     | 1    | 0-255 | x-right    |
| 7     | 1    | 0-255 | y-top      |
| 8     | 1    | 0-255 | y-bottom   |
| 9     | 1    | 0-255 | control byte (from register 0x15) |



# CMD_SET_BORDER

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x15  | CMD_SET_BORDER |
| 6     | 1    | Bits 0-2: color  | The color for the border |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5     | Length     |
| 4     | 1    | 1-255 | Same seq no |



# Notifications

## NTF_PAUSE

Notification:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5+n     | Length     |
| 4     | 1    | 0     | Instead of Seq No. |
| 6     | 1    | 1     | NTF_PAUSE  |
| 7     | 1    | 0-255 | Break reason: 0 = no reason (e.g. a step-over), 1 = manual break, 2 = breakpoint hit, 3 = watchpoint hit read access, 4 = watchpoint hit write access, 255 = some other reason, the error string might have useful information for the user |
| 8     | 2    | 0-65535 | Breakpoint or watchpoint address. |
| 10    | 1-n  | error string | Null-terminated error string. Might in theory have almost 2^32 byte length. In practice it will be normally less than 256.
If error string is empty it will contain at least a 0. |

