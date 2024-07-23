
    DEVICE NOSLOT64K
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION

; DMA Constants:
DMA_DISABLE:    equ 0x83
DMA_ENABLE:     equ 0x87
DMA_LOAD:       equ 11001111b
ZXN_DMA_PORT:   equ 0x6b


	ORG 0x0000

	include "zxndma.asm"

	defs 0x1000-$

    ld a,0x12
    ld de,0x9000
    ld bc,0x100
    call zxndma.fill
	nop
