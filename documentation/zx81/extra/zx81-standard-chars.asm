
; The standard ZX81 character set

        ORG     0x1E00

; 0x00: ' '
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x01: Graphics
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x02: Graphics
        DEFB    00001111b
        DEFB    00001111b
        DEFB    00001111b
        DEFB    00001111b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x03: Graphics
        DEFB    11111111b
        DEFB    11111111b
        DEFB    11111111b
        DEFB    11111111b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x04: Graphics
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b

; 0x05: Graphics
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b

; 0x06: Graphics
        DEFB    00001111b
        DEFB    00001111b
        DEFB    00001111b
        DEFB    00001111b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b

; 0x07: Graphics
        DEFB    11111111b
        DEFB    11111111b
        DEFB    11111111b
        DEFB    11111111b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b
        DEFB    11110000b

; 0x08: Graphics
        DEFB    10101010b
        DEFB    01010101b
        DEFB    10101010b
        DEFB    01010101b
        DEFB    10101010b
        DEFB    01010101b
        DEFB    10101010b
        DEFB    01010101b

; 0x09: Graphics
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    10101010b
        DEFB    01010101b
        DEFB    10101010b
        DEFB    01010101b

; 0x0A: Graphics
        DEFB    10101010b
        DEFB    01010101b
        DEFB    10101010b
        DEFB    01010101b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x0B: '"'
        DEFB    00000000b
        DEFB    00100100b
        DEFB    00100100b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x0B: '£'
        DEFB    00000000b
        DEFB    00011100b
        DEFB    00100010b
        DEFB    01111000b
        DEFB    00100000b
        DEFB    00100000b
        DEFB    01111110b
        DEFB    00000000b

; 0x0B: '$'
        DEFB    00000000b
        DEFB    00001000b
        DEFB    00111110b
        DEFB    00101000b
        DEFB    00111110b
        DEFB    00001010b
        DEFB    00111110b
        DEFB    00001000b

; 0x0B: ':'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00010000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00010000b
        DEFB    00000000b

; 0x0B: '?'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00000000b
        DEFB    00001000b
        DEFB    00000000b

; 0x10: '('
        DEFB    00000000b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00000100b
        DEFB    00000000b

; 0x11: ')'
        DEFB    00000000b
        DEFB    00100000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00100000b
        DEFB    00000000b

; 0x12: '>'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00010000b
        DEFB    00001000b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00010000b
        DEFB    00000000b

; 0x13: '<'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00010000b
        DEFB    00001000b
        DEFB    00000100b
        DEFB    00000000b

; 0x14: '='
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00111110b
        DEFB    00000000b
        DEFB    00111110b
        DEFB    00000000b
        DEFB    00000000b

; 0x15: '+'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00111110b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00000000b

; 0x16: '-'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00111110b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b

; 0x17: '*'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00010100b
        DEFB    00001000b
        DEFB    00111110b
        DEFB    00001000b
        DEFB    00010100b
        DEFB    00000000b

; 0x18: '/'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000010b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00010000b
        DEFB    00100000b
        DEFB    00000000b

; 0x19: ';'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00010000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00100000b

; 0x1A: ','
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00010000b

; 0x1B: '"'
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00000000b
        DEFB    00011000b
        DEFB    00011000b
        DEFB    00000000b

; 0x1C: '0'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000110b
        DEFB    01001010b
        DEFB    01010010b
        DEFB    01100010b
        DEFB    00111100b
        DEFB    00000000b

; 0x1D: '1'
        DEFB    00000000b
        DEFB    00011000b
        DEFB    00101000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00111110b
        DEFB    00000000b

; 0x1E: '2'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    00000010b
        DEFB    00111100b
        DEFB    01000000b
        DEFB    01111110b
        DEFB    00000000b

; 0x1F: '3'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    00001100b
        DEFB    00000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x20: '4'
        DEFB    00000000b
        DEFB    00001000b
        DEFB    00011000b
        DEFB    00101000b
        DEFB    01001000b
        DEFB    01111110b
        DEFB    00001000b
        DEFB    00000000b

; 0x21: '5'
        DEFB    00000000b
        DEFB    01111110b
        DEFB    01000000b
        DEFB    01111100b
        DEFB    00000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x22: '6'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000000b
        DEFB    01111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x23: '7'
        DEFB    00000000b
        DEFB    01111110b
        DEFB    00000010b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00000000b

; 0x24: '8'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x25: '9'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00111110b
        DEFB    00000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x26: 'A'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01111110b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00000000b

; 0x27: 'B'
        DEFB    00000000b
        DEFB    01111100b
        DEFB    01000010b
        DEFB    01111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01111100b
        DEFB    00000000b

; 0x28: 'C'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x29: 'D'
        DEFB    00000000b
        DEFB    01111000b
        DEFB    01000100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000100b
        DEFB    01111000b
        DEFB    00000000b

; 0x2A: 'E'
        DEFB    00000000b
        DEFB    01111110b
        DEFB    01000000b
        DEFB    01111100b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01111110b
        DEFB    00000000b

; 0x2B: 'F'
        DEFB    00000000b
        DEFB    01111110b
        DEFB    01000000b
        DEFB    01111100b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    00000000b

; 0x2C: 'G'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000000b
        DEFB    01001110b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x2D: 'H'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01111110b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00000000b

; 0x2E: 'I'
        DEFB    00000000b
        DEFB    00111110b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00111110b
        DEFB    00000000b

; 0x2F: 'J'
        DEFB    00000000b
        DEFB    00000010b
        DEFB    00000010b
        DEFB    00000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x30: 'K'
        DEFB    00000000b
        DEFB    01000100b
        DEFB    01001000b
        DEFB    01110000b
        DEFB    01001000b
        DEFB    01000100b
        DEFB    01000010b
        DEFB    00000000b

; 0x31: 'L'
        DEFB    00000000b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    01111110b
        DEFB    00000000b

; 0x32: 'M'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    01100110b
        DEFB    01011010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00000000b

; 0x33: 'N'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    01100010b
        DEFB    01010010b
        DEFB    01001010b
        DEFB    01000110b
        DEFB    01000010b
        DEFB    00000000b

; 0x34: 'O'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x35: 'P'
        DEFB    00000000b
        DEFB    01111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01111100b
        DEFB    01000000b
        DEFB    01000000b
        DEFB    00000000b

; 0x36: 'Q'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01010010b
        DEFB    01001010b
        DEFB    00111100b
        DEFB    00000000b

; 0x37: 'R'
        DEFB    00000000b
        DEFB    01111100b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01111100b
        DEFB    01000100b
        DEFB    01000010b
        DEFB    00000000b

; 0x38: 'S'
        DEFB    00000000b
        DEFB    00111100b
        DEFB    01000000b
        DEFB    00111100b
        DEFB    00000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x39: 'T'
        DEFB    00000000b
        DEFB    11111110b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00000000b

; 0x3A: 'U'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00111100b
        DEFB    00000000b

; 0x3B: 'V'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    00100100b
        DEFB    00011000b
        DEFB    00000000b

; 0x3C: 'W'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01000010b
        DEFB    01011010b
        DEFB    00100100b
        DEFB    00000000b

; 0x3D: 'X'
        DEFB    00000000b
        DEFB    01000010b
        DEFB    00100100b
        DEFB    00011000b
        DEFB    00011000b
        DEFB    00100100b
        DEFB    01000010b
        DEFB    00000000b

; 0x3E: 'Y'
        DEFB    00000000b
        DEFB    10000010b
        DEFB    01000100b
        DEFB    00101000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00010000b
        DEFB    00000000b

; 0x3F: 'Z'
        DEFB    00000000b
        DEFB    01111110b
        DEFB    00000100b
        DEFB    00001000b
        DEFB    00010000b
        DEFB    00100000b
        DEFB    01111110b
        DEFB    00000000b
