

    DEVICE ZXSPECTRUMNEXT



	ORG 0x8000

main:
    ; Disable interrupts
    di
    ld sp,stack_top


    nextreg 0x50+5,94
    nextreg 0x50+5,95
    nextreg 0x50+5,96
    nextreg 0x50+5,97
    nextreg 0x50+5,111


.loop:
    ; Bank 100
    nextreg 0x50+5,100
    call sub_b100
    nop
    nop

    ; Bank 101
    nextreg 0x50+5,101
    call sub_b101
    nop
    nop

    ; Bank 110
    nextreg 0x50+5,110
    call sub_b110
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




    MMU 5, 100, 0xA000
sub_b100:
    ld a,100
    ld a,100
    ret


    MMU 5, 101, 0xA000
sub_b101:
    ld a,101
    ld a,101
    ret


    include "subfolder/sub1.asm"


    SAVENEX OPEN "sld1.nex", main, stack_top
    SAVENEX CORE 2, 0, 0        ; Next core 2.0.0 required as minimum
    SAVENEX CFG 7   ; Border color
    SAVENEX AUTO
    SAVENEX CLOSE
