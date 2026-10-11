	SECTION code_user
	PUBLIC _util_add

_util_add:
	ld hl,1
	ret

util_local:
	nop	; LOGPOINT [UTIL] util_local reached
	ret

	SECTION BANK_5
bank5_data:
	defb 1, 2, 3	; WPMEM
