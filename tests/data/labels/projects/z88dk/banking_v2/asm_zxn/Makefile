# Variations can be tested from the command line, e.g.:
#   make ASMFLAGS="-mz80n -b -m -l -DFOO"
ASM      ?= z88dk-z80asm
ASMFLAGS ?= -mz80n -b -m -l
APPMAKE  ?= z88dk-appmake

all: main.nex

main.map: main.asm
	$(ASM) $(ASMFLAGS) main.asm

# appmake takes the bank/page of each binary (e.g. main_PAGE_20_CODE.bin)
# from the BANK_n or PAGE_n in its name, and the start address and the stack
# from the map file (__crt_org_code, __register_sp).
main.nex: main.map
	$(APPMAKE) +zxn --nex -b main -c main -o main.nex

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.lis main.nex main.map

.PHONY: all clean
