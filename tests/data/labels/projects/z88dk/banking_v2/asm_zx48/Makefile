# Variations can be tested from the command line, e.g.:
#   make ASMFLAGS="-b -m -l -DFOO"
ASM      ?= z88dk-z80asm
ASMFLAGS ?= -b -m -l
APPMAKE  ?= z88dk-appmake

all: main.sna

# The assembler produces main.bin, main.map and main.lis in one run
main.bin main.map: main.asm
	$(ASM) $(ASMFLAGS) main.asm

# 48K snapshot
main.sna: main.bin
	$(APPMAKE) +zx -b main.bin --org 0x8000 --sna -o main.sna

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.sna

.PHONY: all clean
