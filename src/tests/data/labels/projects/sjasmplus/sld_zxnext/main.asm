

    DEVICE ZXSPECTRUMNEXT

big_number: EQU 0x1FFFF

	ORG 0x8000

main:
    ; Disable interrupts
    di
    ld sp,stack_top

  jp 0x6000
  
    ld a,1 : ld a,2 : ld a,3 : ld a,4

    nextreg 0x50+5,60
    call sub_b60
    nop

    nextreg 0x50+5,65
    call sub_b65
    nop

    ld bc,big_number&0xFFFF
    ld de,main+2
    ld hl,.loop+5

.loop:
    ; Bank 60
    nextreg 0x50+5,60
    call sub_b60
    nop
    nop

    ; Bank 65
    nextreg 0x50+5,65
    call sub_b65
    nop
    nop

    ; Bank 70
    nextreg 0x50+5,70
    call sub_b70
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




    MMU 5, 60, 0xA000
sub_b60:
    ld a,60
    ; LOGPOINT TADA
    ld a,60
    ret

data_b60:
    defb 0, 1, 2, 3, 4


    MMU 5, 65, 0xA000
sub_b65:
    ld a,65
    ld a,65
    ret

data_b65:
    defb 5, 6, 7, 8, 9



    include "subfolder/sub1.asm"


    SAVENEX OPEN "sld1.nex", main, stack_top
    SAVENEX CORE 2, 0, 0        ; Next core 2.0.0 required as minimum
    SAVENEX CFG 7   ; Border color
    SAVENEX AUTO
    SAVENEX CLOSE
