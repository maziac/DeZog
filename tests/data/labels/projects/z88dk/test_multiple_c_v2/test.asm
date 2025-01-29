SECTION code_user

PUBLIC _test

_test:
    ld hl, 0x4000
    ld bc, 6912
    ld d, 255
vicloop:
    ld (hl), d
    inc hl
    dec bc
    ld a, b
    or c
    jr nz, vicloop
    ret