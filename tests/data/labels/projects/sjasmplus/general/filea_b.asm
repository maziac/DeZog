

fab_label1:	nop
.localb:	nop

	MODULE modfileb

fab_label2:	nop
.local2b:	nop


@global_label1
	nop
@global_label2:
	nop
	ENDMODULE

fab_label2
	nop


fab_label_equ1:		equ 70
