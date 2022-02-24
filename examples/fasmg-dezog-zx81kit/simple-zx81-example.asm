; Example assembler program for ZX81 that maximaze the available usable space
; by Stefano Marago' 2018-2022

; to be compiled with fasmg

; compilation utils
format binary as 'p' ; default output file extension
include 'inc/z80.inc' ; Z80 instructions
include 'inc/makesld.alm' ; DeZog compatible listing
include 'inc/z80optmc.inc' ; jrp pseudo instruction

; ZX81 specific
include 'inc/romadd81.inc' ; rom addresses
include 'inc/charst81.inc' ; zx81 characters
include 'inc/tokens81.inc' ; basic tokens
include 'inc/pgmprefix.inc' ; system variables


;==========================================================================

PROGRAMSTART: ; <- the program will start here! (assuming no return to basic)


maincycle: 
    ld a,(LAST_K)
    inc a
    jrp nz,maincycle ; MACRO that is using JR if inside jump limits, else JP

gotkey:
    ld bc,(LAST_K)
    ld a,c
    inc a
    jr z,gotkey
    call DECODEKEY
    jr nc,gotkey

displaychar:
    ld a,(hl)
    ld (chardisplay),a

    jrp maincycle ; main loop


dfile: 
  db $76 ; needed to start collapsed display
chardisplay: db _iX ; a single character spacekeeper
  db 24 dup($76) ; empty lines


MAXSTACKAVAILABLE: ; ! <--- stack can't go before this

;==========================================================================


include 'inc/pgmsuffix.inc' ; program initialization routine (basic jusmp to PROGRAMSTART)
