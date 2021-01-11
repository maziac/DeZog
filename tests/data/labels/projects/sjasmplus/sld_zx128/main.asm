

    DEVICE ZXSPECTRUM128



	ORG 0x8000  ; Bank 2


main:
    ; Disable interrupts
    di
    ld sp,stack_top
    ld bc,0x7FFD

    ;jp 0x6000

    ;ld a,010000b : out (c),a    ; ROM1
    ;ld a,000000b : out (c),a    ; ROM0
    ;ld a,010000b : out (c),a    ; ROM1

    ld a,1 : out (c),a
    call sub_b1
    nop


    ld a,3 : out (c),a
    call sub_b3
    nop

.loop:
    ; Bank 1
    ld a,1 : out (c),a
    call sub_b1
    nop
    nop

    ; Bank 3
    ld a,3 : out (c),a
    call sub_b3
    nop
    nop

    ; Bank 7
    ld a,7 : out (c),a
    call sub_b7
    nop
    nop

	nop
	nop
	jr .loop


; Stack: this area is reserved for the stack
STACK_SIZE: equ 100    ; in words


; Reserve stack space
    defw 0  ; WPMEM, 2
stack_bottom:
    defs    STACK_SIZE*2, 0
stack_top:
    ;defw 0
    defw 0  ; WPMEM, 2




    MMU 3, 1, 0xC000
sub_b1:
    ld a,1
.plus1:
    ld a,1
    ret

data_b1:
    defb 0, 1, 2, 3, 4


    MMU 3, 3, 0xC000
sub_b3:
    ld a,3
    ld a,3
    ret

data_b3:
    defb 5, 6, 7, 8, 9



    include "subfolder/sub1.asm"



    SAVESNA "sld1.sna", main
