
## NTF_LOG=2
Notification (Length=6+s+t):
| Index | Size      | Value         | Description                                 |
| ----- | --------- | ------------- | ------------------------------------------- |
| 0     | s=0-65535 | Format string | A null-terminated format string, see below. |
| s     | t         | data          | The binary data to display.                 |

Since a remote running the DZRP might be almost headless (e.g. in case of the ZX Next) with limited logging capabilities it can use this logging notification.
DeZog will log any received NTF_LOG message for the remote.
The format string mainly consist of ASCI characters but uses a few special characters to allow transmitting e.g. byte or word values.

| Special sequence | Size | Description                |
| ---------------- | ---- | -------------------------- |
| '$'              | 1    |                            |
| type             | 1    | 's'=int, 'u'=uint, 'h'=hex |
| size             | 1    | '1' = byte, '2' = word     |

I.e. when DeZog receives the NTF_LOG it will print the "normal" characters and if it encounters a '$' it will interpret the data as above. Afterwards ASCII characters or another '$' sequence may follow.

Example:
A string like `"Value of A=$u1 and BC=$h2",0` followed by data `0x12, 0xAB, 0x71` will be displayed as "Value of A=18 and BC=71AB".

