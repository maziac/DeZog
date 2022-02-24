org $4000
MEMORYSTART:
MEMORY1KEND equ $4400

; SYSVARS which aren't saved on file
ERR_NR  equ $4000         ; usable memory after asm program start!
FLAGS   equ $4001         ;    /
ERR_SP  equ $4002         ;   /
RAMTOP  equ $4004         ;  /
MODE    equ $4006         ; /
PPC     equ $4007         ;/

org $4009 ; .p org (start of saved content on cassette)
; SYSVARS which are saved on .p file
VERSN    db $01           ; usable
E_PPC    dw $01           ; usable
D_FILE   dw dfile         ; !! not usable (if fixed to $4100 first byte will be 00)
DF_CC    dw $0101         ; usable if not using rst 10h or similar
VARS     dw $0101         ; usable if not using basic vars
DEST     dw $0101         ; usable
E_LINE   dw eline         ; ? usable after asm start?
CH_ADD   dw line1a4       ; ? usable after asm start?
X_PTR    dw eline         ; ? usable after asm start?
STKBOT   dw eline         ; ? usable after asm start?
STKEND   dw eline         ; ? usable after asm start?
BERG     db 0             ; ? usable if not floating point usage?
MEM      dw line1a4       ; ? usable after asm start?
NOTUSED  db $01           ; one byte free!
DF_SZ    db $01 ;2        ; usable
S_TOP    dw $0101         ; usable
LAST_K:                   ; last char pressed (not usable if slow mode used)
 .row    db $FF           ; !!
 .column db $FF           ; !!
DB_ST    db $FF           ; !x probably not usable
MARGIN   db 55            ; !! not usable
NXTLIN   dw line1a4 - 4   ; xx autorun (=dfile for no autorun), usable after asm start
OLDPPC   dw $0101         ; usable
FLAGX    db $01           ; usable
STRLEN   dw $0101         ; usable
T_ADDR   dw $0101         ; xx usable after asm start
SEED     dw $0101         ; usable
FRAMES   db $FF,$FF       ; !! not usable
COORDS   db $01,$01       ; usable
PR_CC    db $01           ; usable
S_POSN   db $01,$01       ; usable
CDFLAG   db 01000000B     ; ?? usable after program start?

assert $ eq $403c ; let's see if rom sysvars are ending correctly!

;---
;PRTBUF   db 33 dup (0)
;MEMBOT   db 30 dup (0)    
;NOTUSED2 dw 2
;=> 65 bytes! fully usable
