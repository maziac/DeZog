# Variations can be tested from the command line, e.g.:
#   make ASMFLAGS="-b -m -l -DFOO"
ASM      ?= z88dk-z80asm
ASMFLAGS ?= -b -m -l
APPMAKE  ?= z88dk-appmake

all: main.sna

main.map: main.asm
	$(ASM) $(ASMFLAGS) main.asm

# 128K snapshot. appmake takes the bank of each binary (main_BANK_n_CODE.bin)
# from the BANK_n in its name, and the start address and the stack from the
# map file (__crt_org_code, __register_sp).
main.sna: main.map
	$(APPMAKE) +zx --sna -b main -c main -o main.sna

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.lis main.sna main.map

.PHONY: all clean
