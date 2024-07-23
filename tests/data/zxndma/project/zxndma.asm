;-----------------------------------------------------------
; zxndma.asm
;
; Routines to program the ZX Next DMA controller.
;-----------------------------------------------------------


	MODULE zxndma

;------------------------------------------------------------------------------
; Fills a memory area with a constant value.
; DE = dest, A = fill value, BC = lenth
;------------------------------------------------------------------------------
fill:
	di
	ld (.fill_value),a
	ld (.dma_dest),de
	ld (.dma_length),bc
	ld hl,.dma_code
	ld b,.dma_len
	ld c,ZXN_DMA_PORT
	otir
	ei
	ret

.fill_value:	db 0
.dma_code:		db DMA_DISABLE
				db 0b01111101
.dma_source:	dw .fill_value
.dma_length:	dw 0
				db 0b00100100
				db 0b00010000
				db 0b10101101
.dma_dest:		dw 0
				db DMA_LOAD
				db DMA_ENABLE
.dma_len:		equ $-.dma_code

	ENDMODULE