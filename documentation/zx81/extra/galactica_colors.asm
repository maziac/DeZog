; The colors for Galactica for the chroma 81.
; Each character has an associated color array of 8 bytes:
; paper_color * 16 + ink_color each.
; 8 bytes for the 8 lines of a character.
; There are 64 characters plus 64 inverse characters.
; I.e. a total of 128 arrays for which colors are required.
	MACRO BLACK_ON_WHITE
	DEFB    $F0,$F0,$F0,$F0,$F0,$F0,$F0,$F0
	;DEFB    $0F,$0F,$0F,$0F,$0F,$0F,$0F,$0F
	ENDM
	ORG 0
;; char-set - begins with space character.
; $00 - Character: ' '	  CHR$(0)
LC000:  BLACK_ON_WHITE
; $01 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $02 - Character: mosaic       CHR$(2)
	BLACK_ON_WHITE
; $03 - Character: mosaic       CHR$(3)
	BLACK_ON_WHITE
; $04 - Character: mosaic       CHR$(4)
	BLACK_ON_WHITE
; $05 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $06 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $07 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $08 - Character: mosaic       CHR$(1)
	;BLACK_ON_WHITE
	DEFB $20,$20,$20,$20,$20,$20,$20,$20    ; red/black (rock)
; $09 - Character: mosaic       CHR$(1)
    BLACK_ON_WHITE
; $0A - Character: mosaic       CHR$(10)
	BLACK_ON_WHITE
; $0B - Character: '"'	  CHR$(11)
	BLACK_ON_WHITE
; $0B - Character:  £	   CHR$(12)
	BLACK_ON_WHITE
; $0B - Character: '$'	  CHR$(13)
	BLACK_ON_WHITE
; $0B - Character: ':'	  CHR$(14)
	BLACK_ON_WHITE
; $0B - Character: '?'	  CHR$(15)
	BLACK_ON_WHITE
; $10 - Character: '('	  CHR$(16)
	BLACK_ON_WHITE
; $11 - Character: ')'	  CHR$(17)
	BLACK_ON_WHITE
; $12 - Character: '>'	  CHR$(18)
	BLACK_ON_WHITE
; $13 - Character: '<'	  CHR$(19)
	BLACK_ON_WHITE
; $14 - Character: '='	  CHR$(20)
	BLACK_ON_WHITE
; $15 - Character: '+' / Cylon	 CHR$(21)
    ;BLACK_ON_WHITE
    DEFB $FA,$FA,$FA,$FA,$FA,$FA,$FA,$FA    ; red
; $16 - Character: '-'	  CHR$(22)
    BLACK_ON_WHITE
; $17 - Character: '*' / Fuel (inverse)	 CHR$(23)
	BLACK_ON_WHITE
; $18 - Character: '/'	  CHR$(24)
	BLACK_ON_WHITE
; $19 - Character: ';'	  CHR$(25)
	BLACK_ON_WHITE
; $1A - Character: ','	  CHR$(26)
	BLACK_ON_WHITE
; $1B - Character: '"'	  CHR$(27)
	BLACK_ON_WHITE
; $1C - Character: '0'	  CHR$(28)
	BLACK_ON_WHITE
; $1D - Character: '1'	  CHR$(29)
	BLACK_ON_WHITE
; $1E - Character: '2'	  CHR$(30)
	BLACK_ON_WHITE
; $1F - Character: '3'	  CHR$(31)
	BLACK_ON_WHITE
; $20 - Character: '4'	  CHR$(32)
	BLACK_ON_WHITE
; $21 - Character: '5'	  CHR$(33)
	BLACK_ON_WHITE
; $22 - Character: '6'	  CHR$(34)
	BLACK_ON_WHITE
; $23 - Character: '7'	  CHR$(35)
	BLACK_ON_WHITE
; $24 - Character: '8'	  CHR$(36)
	BLACK_ON_WHITE
; $25 - Character: '9'	  CHR$(37)
	BLACK_ON_WHITE
; $26 - Character: 'A'	  CHR$(38)
	BLACK_ON_WHITE
; $27 - Character: 'B'	  CHR$(39)
	BLACK_ON_WHITE
; $28 - Character: 'C'	  CHR$(40)
	BLACK_ON_WHITE
; $29 - Character: 'D'	  CHR$(41)
	BLACK_ON_WHITE
; $2A - Character: 'E'	  CHR$(42)
	BLACK_ON_WHITE
; $2B - Character: 'F'	  CHR$(43)
	BLACK_ON_WHITE
; $2C - Character: 'G'	  CHR$(44)
	BLACK_ON_WHITE
; $2D - Character: 'H'	  CHR$(45)
	BLACK_ON_WHITE
; $2E - Character: 'I' / Rocket	 CHR$(46)
	;BLACK_ON_WHITE
    DEFB $F9,$F9,$F9,$F9,$F9,$F9,$F9,$F9    ; blue
; $2F - Character: 'J'	  CHR$(47)
	BLACK_ON_WHITE
; $30 - Character: 'K'	  CHR$(48)
	BLACK_ON_WHITE
; $31 - Character: 'L'	  CHR$(49)
	BLACK_ON_WHITE
; $32 - Character: 'M'	  CHR$(50)
	BLACK_ON_WHITE
; $33 - Character: 'N'	  CHR$(51)
	BLACK_ON_WHITE
; $34 - Character: 'O' / Meteor	 CHR$(52)
	BLACK_ON_WHITE
; $35 - Character: 'P'	  CHR$(53)
	BLACK_ON_WHITE
; $36 - Character: 'Q'	  CHR$(54)
	BLACK_ON_WHITE
; $37 - Character: 'R'	  CHR$(55)
	BLACK_ON_WHITE
; $38 - Character: 'S'	  CHR$(56)
	BLACK_ON_WHITE
; $39 - Character: 'T'	  CHR$(57)
	BLACK_ON_WHITE
; $3A - Character: 'U'	  CHR$(58)
	BLACK_ON_WHITE
; $3B - Character: 'V'	  CHR$(59)
	BLACK_ON_WHITE
; $3C - Character: 'W'	  CHR$(60)
	BLACK_ON_WHITE
; $3D - Character: 'X' / Base	 CHR$(61)
	;BLACK_ON_WHITE
	DEFB $FA,$FA,$FA,$FA,$FA,$FA,$FA,$FA    ; red
; $3E - Character: 'Y'	  CHR$(62)
	BLACK_ON_WHITE
; $3F - Character: 'Z'	  CHR$(63)
	BLACK_ON_WHITE


; =============================================
; The Colors for the inverse character set:
; $00 - Character: ' '	  CHR$(0)
LC200:  BLACK_ON_WHITE
; $01 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $02 - Character: mosaic       CHR$(2)
	BLACK_ON_WHITE
; $03 - Character: mosaic       CHR$(3)
	BLACK_ON_WHITE
; $04 - Character: mosaic       CHR$(4)
	BLACK_ON_WHITE
; $05 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $06 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $07 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $08 - Character: mosaic       CHR$(1)
	BLACK_ON_WHITE
; $09 - Character: mosaic       CHR$(1)
    BLACK_ON_WHITE
; $0A - Character: mosaic       CHR$(10)
	BLACK_ON_WHITE
; $0B - Character: '"'	  CHR$(11)
	BLACK_ON_WHITE
; $0B - Character:  £	   CHR$(12)
	BLACK_ON_WHITE
; $0B - Character: '$'	  CHR$(13)
	BLACK_ON_WHITE
; $0B - Character: ':'	  CHR$(14)
	BLACK_ON_WHITE
; $0B - Character: '?'	  CHR$(15)
	BLACK_ON_WHITE
; $10 - Character: '('	  CHR$(16)
	BLACK_ON_WHITE
; $11 - Character: ')'	  CHR$(17)
	BLACK_ON_WHITE
; $12 - Character: '>'	  CHR$(18)
	BLACK_ON_WHITE
; $13 - Character: '<'	  CHR$(19)
	BLACK_ON_WHITE
; $14 - Character: '='	  CHR$(20)
	BLACK_ON_WHITE
; $15 - Character: '+' / Cylon	 CHR$(21)
    BLACK_ON_WHITE
    ;DEFB $FD,$FD,$FD,$FD,$FD,$FD,$FD,$FD    ; cyan
; $16 - Character: '-'	  CHR$(22)
    BLACK_ON_WHITE
; $17 - Character: '*' / Fuel (inverse)	 CHR$(23)
	;BLACK_ON_WHITE
	DEFB $FC,$FC,$FC,$FC,$FC,$FC,$FC,$FC    ; green
; $18 - Character: '/'	  CHR$(24)
	BLACK_ON_WHITE
; $19 - Character: ';'	  CHR$(25)
	BLACK_ON_WHITE
; $1A - Character: ','	  CHR$(26)
	BLACK_ON_WHITE
; $1B - Character: '"'	  CHR$(27)
	BLACK_ON_WHITE
; $1C - Character: '0'	  CHR$(28)
	BLACK_ON_WHITE
; $1D - Character: '1'	  CHR$(29)
	BLACK_ON_WHITE
; $1E - Character: '2'	  CHR$(30)
	BLACK_ON_WHITE
; $1F - Character: '3'	  CHR$(31)
	BLACK_ON_WHITE
; $20 - Character: '4'	  CHR$(32)
	BLACK_ON_WHITE
; $21 - Character: '5'	  CHR$(33)
	BLACK_ON_WHITE
; $22 - Character: '6'	  CHR$(34)
	BLACK_ON_WHITE
; $23 - Character: '7'	  CHR$(35)
	BLACK_ON_WHITE
; $24 - Character: '8'	  CHR$(36)
	BLACK_ON_WHITE
; $25 - Character: '9'	  CHR$(37)
	BLACK_ON_WHITE
; $26 - Character: 'A'	  CHR$(38)
	BLACK_ON_WHITE
; $27 - Character: 'B'	  CHR$(39)
	BLACK_ON_WHITE
; $28 - Character: 'C'	  CHR$(40)
	BLACK_ON_WHITE
; $29 - Character: 'D'	  CHR$(41)
	BLACK_ON_WHITE
; $2A - Character: 'E'	  CHR$(42)
	BLACK_ON_WHITE
; $2B - Character: 'F'	  CHR$(43)
	BLACK_ON_WHITE
; $2C - Character: 'G'	  CHR$(44)
	BLACK_ON_WHITE
; $2D - Character: 'H'	  CHR$(45)
	BLACK_ON_WHITE
; $2E - Character: 'I' / Rocket	 CHR$(46)
	BLACK_ON_WHITE
; $2F - Character: 'J'	  CHR$(47)
	BLACK_ON_WHITE
; $30 - Character: 'K'	  CHR$(48)
	BLACK_ON_WHITE
; $31 - Character: 'L'	  CHR$(49)
	BLACK_ON_WHITE
; $32 - Character: 'M'	  CHR$(50)
	BLACK_ON_WHITE
; $33 - Character: 'N'	  CHR$(51)
	BLACK_ON_WHITE
; $34 - Character: 'O' / Meteor	 CHR$(52)
	BLACK_ON_WHITE
; $35 - Character: 'P'	  CHR$(53)
	BLACK_ON_WHITE
; $36 - Character: 'Q'	  CHR$(54)
	BLACK_ON_WHITE
; $37 - Character: 'R'	  CHR$(55)
	BLACK_ON_WHITE
; $38 - Character: 'S'	  CHR$(56)
	BLACK_ON_WHITE
; $39 - Character: 'T'	  CHR$(57)
	BLACK_ON_WHITE
; $3A - Character: 'U'	  CHR$(58)
	BLACK_ON_WHITE
; $3B - Character: 'V'	  CHR$(59)
	BLACK_ON_WHITE
; $3C - Character: 'W'	  CHR$(60)
	BLACK_ON_WHITE
; $3D - Character: 'X' / Base	 CHR$(61)
	BLACK_ON_WHITE
; $3E - Character: 'Y'	  CHR$(62)
	BLACK_ON_WHITE
; $3F - Character: 'Z'	  CHR$(63)
	BLACK_ON_WHITE
