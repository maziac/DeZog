
;====================================================

; Some ZX81 useful ROM routines address

SCANKEYB equ $02BB
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

ROMPAUSE  equ $0F35 ; bc=number of tv frames to wait for

RESET     equ $0000
SLOWFAST  equ $0207
SETFAST   equ $02E7
NEXTLINE  equ $0676
DECODEKEY equ $07bd
PRINTAT   equ $08f5
MAKEROOM  equ $099e
CLS       equ $0a2a
STACK2BC  equ $0bf5
STACK2A   equ $0c02
CLASS6    equ $0d92
FINDINT   equ $0ea7
FAST      equ $0f23
SLOW      equ $0f2b
DEBOUNCE  equ $0f4b
SETMIN    equ $14BC

; NEW ROM
;
;      +------------------+-- Top of memory (bigger address)
;  .   | Reserved area    |
;  .   +------------------+-- (RAMTOP)
;  .   | GOSUB stack      |
;  |   +------------------+-- (ERR_SP)
;  |   | Machine stack    |
; \|/  +------------------+-- SP
;  .   | ...              |
;      | Spare memory     |
;  .   | ...              |
; /|\  +------------------+-- (STKEND)
;  |   | Calculator stack |
;  |   +------------------+-- (STKBOT)
;  .   | Edit line        |
;  .   +------------------+-- (E_LINE)
;  .   | User variables   |
;  .   +------------------+-- (VARS)
;  .   | Screen           |
;  .   +------------------+-- (D_FILE)
;  .   | User program     |
;  .   +------------------+-- 407Dh (16509d)
;  .   | System variables |
;      +------------------+-- 4000h (16384d)

; ZX81 Memory Map and System Area (from http://www.problemkaputt.de/zxdocs.htm)
;
; Overview
;   0000-1FFF   BIOS ROM (8KBytes)
;   2000-3FFF   not used
;   4000-43FF   Internal RAM (1 KByte)
;   4000-7FFF   External RAM (16 KBytes)
; 
; ZX81 RAM Map
;   4000      System Area (see below)
;   407D      BASIC Program
;   D_FILE    Video Memory (BG Map)
;   VARS      BASIC Variables
;   E_LINE-1  Byte 80h
;   E_LINE    Input Buffer/Workspace
;   STKBOT    BASIC Calculator Stack
;   STKEND    Machine Stack/Free Memory
;   SP        Machine Stack/In Use (SP is meant to be the CPUs SP register)
;   ERR_SP    GOSUB Stack
;   RAMTOP    USR Programs (begin of unused/reserved memory)
; 
; ZX81 System Area
;   Addr.  Name    Expl
;   4000   ERR_NR  Errorcode-1
;   4001   FLAGS   Various BASIC Control flags
;            Bit0=used (purpose unknown)
;           Bit1=Redirect Output to printer
;            Bit2=used (purpose unknown)
;            Bit3-5=not used
;            Bit6=used (purpose unknown)
;            Bit7=used (purpose unknown)
;   4002   ERR_SP  Pointer to top of Machine Stack / Bottom of GOSUB Stack
;   4004   RAMTOP  Pointer to unused/free memory (Changes realized at next NEW or CLS)
;   4006   MODE    Selects [K], [L], [F], or [G] Cursor
;   4007   PPC     Line Number of most recently executed BASIC line
;   (here start the saved area in .p files)
;   4009   VERSN   Should be 00h to identify ZX81 cassette files (FFh=Lambda)
;   400A   E_PPC   Line Number of currently selected line [>] Cursor
;   400C   D_File  Pointer to Video Memory (BG Map) / End of Basic Program
;   400E   DF_CC   Pointer to VRAM Address for PRINT
;   4010   VARS    Pointer to BASIC Variables Area
;   4012   DEST    Pointer to Variable when assigning a value to it
;   4014   E_LINE  Pointer to Input Buffer/Workspace, and to --End of Save Area--
;   4016   CH_ADD  Pointer to next interpreted character
;   4018   X_PTR   Pointer to character prior to [S] Symbol (=Syntax Error) (or ptr to aborted/breaked line)
;   401A   STKBOT  Pointer to BASIC Calculator Stack / End of Input Buffer/Workspace
;   401C   STKEND  Pointer to bottom of Machine Stack / End of Calculator Stack
;   401E   BERG    Calculator B-Register
;   401F   MEM     Pointer to Calculator Memory (usually same as MEMBOT)
;   4021   -       Not used
;   4022   DF_SZ   Number of lines in lower display section (including 1 blank line)
;   4023   S_TOP   Line Number of first line for automatic LISTing
;   4025   LAST_K  Keyboard - Recently pressed key (4025=row, 4026=shift/column)
;   4027   DEBOUN  Keyboard - Debounce State (key release delay)
;   4028   MARGIN  Vertical Border Height (55 lines at top/bottom for 50Hz, 31 for 60Hz)
;   4029   NXTLIN  Address of next BASIC line which is to be executed, pointing to a byte >=40h when stopped, indicates autostart address in cassette files.
;   402B   OLDPPC  Line Number for CONT
;   402D   FLAGX   Various Flags
;                    Bit0-1 used (purpose unknown)
;                    Bit2-4 not used
;                    Bit5-6 used (purpose unknown)
;                    Bit7   not used
;   402E   STRLEN  Length of string during assignment
;   4030   T_ADDR  Pointer to next item in Syntax Table (or INPUT's old S_POSN)
;   4032   SEED    Random Number Seed
;   4034   FRAMES  Decrementing Video Frame Counter (Bit15: 0=PAUSE, ie. display ON, program PAUSEd)
;   4036   COORDS  X-Coordinate of last PLOT, Y-Coordinate of last PLOT
;   4038   PR_CC   Least significant byte of PRBUFF printer buffer pointer
;   4039   S_POSN  X-Coordinate for PRINT, Y-Coordinate for PRINT
;   403B   CDFLAG  Various Flags
;                    Bit0   Keystroke (0=None, 1=Yes)
;                    Bit1-5 not used
;                    Bit6   Requested Speed (or old speed during pause/cassette io, etc)
;                    Bit7   Current Speed (1=SLOW (Display Enable), 0=FAST)
;   403C   PRBUFF  Printer Buffer 32 characters + NEWLINE (76h)
;   405D   MEMBOT  Default workspace for BASIC Calculator
;   407B   -       Not used (2 bytes)

