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

## CMD_GET_CONFIG

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x01  | CMD_GET_CONFIG |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Same seq no     |
| 5     | 1    | ...   | Supported features    |

Supported features are bitwise:
| Bit | Description |
|-----|-------------|
| 0   | Supports ZX Next register reading |
| 1-7 | not used |


Other features could be:
- Supports stepOut
- Supports coverage
- Supports cpu history
- Supports extended call stack


## CMD_READ_REGS

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
| 28    | 1    | I    |   |
| 39    | 1    | R    |   |
| 30    | 1    | IM   |   |
| 31    | 1    | reserved |   |


## CMD_WRITE_REG

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x03  | CMD_SET_REGISTER |
| 6     | 1    | i  | Register number: 0=PC, 1=SP, 2=AF, 3=BC, 4=DE, 5=HL, 6=IX, 7=IY, 8=AF', 9=BC', 10=DE', 11=HL', 13=IM, 15=F, 16=A, 17=C, 18=B, 19=E, 20=D, 21=L, 22=H, 23=IXL, 24=IXH, 25=IYL, 26=IYH, 27=F', 28=A', 29=C', 30=B', 31=E', 32=D', 33=L', 34=H' |
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


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |

Notes:
- The response is sent immediately.
- The breakpoints are meant for when the 'continue' commmand is called for step-over, step-into or step-out.
- The breakpoints have priority, i.e. they will always be set.
- When the continue command finishes, e.g. because one of the 2 breakpoints (or any other breakpoint) was hit, the breakpoints are automatically removed.


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
| 0     | 4    | 2     | Length     |
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
| 0     | 4    | 2     | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x09  | CMD_ADD_WATCHPOINT |
| 6     | 2    | 0-65535 | Start of watchpoint address range |
| 6     | 2    | 0-65535 | Size of watchpoint address range |
| 8     | 1-n  | 0-terminated string | Breakpoint condition. Just 0 if no condition. |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
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
| 0     | 4    | 8     | Length     |
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
| 0     | 4    | 5+n   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0E  | CMD_READ_STATE |


Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |
| 5     | N    |       | Arbitrary data. The format is up to the remote. |


# CMD_WRITE_STATE

Command:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 5+n   | Length     |
| 4     | 1    | 1-255 | Seq no     |
| 5     | 1    | 0x0E  | CMD_READ_STATE |
| 6     | N    |       | Arbitrary data. This is data that has bpreviously been retrieved via CMD_READ_STATE. |

Response:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 1     | Length     |
| 4     | 1    | 1-255 | Same seq no |


# Notifications

## NTF_PAUSE

Notification:
| Index | Size | Value |Description |
|-------|------|-------|------------|
| 0     | 4    | 6     | Length     |
| 4     | 1    | 0     | Instead of Seq No. |
| 5     | 1    | 1-255 | Notification seq no |
| 6     | 1    | 1     | NTF_PAUSE  |
| 7     | 1    | 0-255 | Break reason: 0 = no reason (e.g. a step-over), 1 = manual break, 2 = breakpoint hit, 3 = watchpoint hit read access, 4 = watchpoint hit write access, 255 = some other error, the error string might have useful information for the user |
| 8     | 2    | 0/1-65535 | For breakpoints: Breakpoint ID or 0 if no breakpoint hit, for watchpoints: the address. |
| 10    | 1-n  | error string | Null-terminated error string. Might in theory have almost 2^32 byte length. In practice it will be normally less than 256.
If error string is empty it will contain at least a 0. |

