; hello.asm - Simple TRS-80 "Hello World" program
; This demonstrates basic TRS-80 programming with the DeZog extension

        org     $6000           ; Start at memory location $6000

main:   call    $01c9           ; Call ROM to clear the screen
        ld      hl, hello_msg   ; Load address of message into HL
        call    $021B           ; Call ROM routine to output zero-terminated string
        jp      $402D           ; Return to operating system

; Data section
hello_msg:
        defb    "Hello, TRS-80 World!", 13, 0  ; Message with CR and null terminator
        end     main            ; End of assembly, entry point is main
