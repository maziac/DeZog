

    DEVICE ZXSPECTRUM128



	ORG 0x8000

main:
    ; Disable interrupts
    di
    ld sp,stack_top

    call sub_b0
    nop


    call sub_b2
    nop

.loop:
    ; Bank 0

    call sub_b0
    nop
    nop

    ; Bank 2

    call sub_b2
    nop
    nop

    ; Bank 7

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




    MMU 3, 0, 0xC000
sub_b0:
    ld a,0
    ld a,0
    ret

data_b0:
    defb 0, 1, 2, 3, 4

    MMU 3, 2, 0xC000
sub_b2:
    ld a,2
    ld a,2
    ret

data_b2:
    defb 5, 6, 7, 8, 9



    include "subfolder/sub1.asm"



    SAVESNA "sld1.sna", main
