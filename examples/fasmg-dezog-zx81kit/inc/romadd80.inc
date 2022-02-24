
;====================================================

; Some ZX80 useful ROM routines address

; -----------------------------------------------------------------------------
;
; ---------------------
; THE 'ZX80 MEMORY MAP'
; ---------------------
;
; There are forty ($28) system variables followed by Program area
; These are located at the start of RAM.
;
; +---------+---------+-----------+---+-----------+-----------+-------+-------+
; |         |         |           |   |           |           |       |       |
; | SYSVARS | Program | Variables |80h| WKG Space | Disp File | Spare | Stack |
; |         |         |           |   |           |           |       |       |
; +---------+---------+-----------+---+-----------+-----------+-------+-------+
;           ^         ^               ^           ^     ^     ^       ^
;         $4024      VARS            E_LINE    D_FILE       DF_END   SP
;                                                     DF_EA
;
; ---------------------------------------------------------------------------


DISPANDREADKEY equ $01D4
; The routine returns a scan code in HL consisting of two parts:
; Register L identifies with a low bit which one of the 8 physical rows of the key matrix has any key (except SHIFT) down
; 11111111 = no key down
; 11111110 = row 0 = Z X C V (but not SHIFT!)
; 11111101 = row 1 = A S D F G  
; 11111011 = row 2 = Q W E R T
; 11110111 = row 3 = 1 2 3 4 5
; 11101111 = row 4 = 0 9 8 7 6
; 11011111 = row 5 = P O I U Y
; 10111111 = row 6 = N/L L K J H
; 01111111 = row 7 = SPACE . M N B
; Note that this is also the order in which 39 unshifted keycodes appear in the KEY TABLE starting at 007Eh
; Register H identifies with a low bit which one of (now) 6 columns of the key matrix has any key down
; 11111111 = no key down
; 11111110 = column 0 = shift key bit
; 1111110x = column 1 = A Q 1 0 P N/L SPACE
; 1111101x = column 2 = Z S W 2 9 O L .
; 1111011x = column 3 = X D E 3 8 I K M
; 1110111x = column 4 = C F R 4 7 U J N
; 1101111x = column 5 = V G T 5 6 Y H B 
; +-----------+-----------+
; | 1 2 3 4 5 | 6 7 8 9 0 |
; ++----------++----------++
;  | Q W E R T | Y U I O P |
;  ++----------++----------++
;   | A S D F G | H J K L cr|
;   ++-- ------++-----------+
; shf| Z X C V | B N M . sp|
;    +---------+-----------+

RESET     equ $0000

