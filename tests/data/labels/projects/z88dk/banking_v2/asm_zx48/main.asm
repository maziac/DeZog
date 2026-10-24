SECTION CODE
org $8000
SECTION code_user

SECTION code_user
PUBLIC _main
_main:
	call sub
	ret
sub:
	nop
	ret
