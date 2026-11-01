# Variations can be tested from the command line, e.g.:
#   make ASMFLAGS="-b -m -l -DFOO"
ASM      ?= z88dk-z80asm
ASMFLAGS ?= -b -m -l
APPMAKE  ?= z88dk-appmake

all: main.tap

main.map: main.asm
	$(ASM) $(ASMFLAGS) main.asm

# Tape with a BASIC loader
main.tap: main.map
	$(APPMAKE) +zx -b main --org 0x8000 -o main.tap

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.tap

.PHONY: all clean
