# Variations can be tested from the command line, e.g.:
#   make ASMFLAGS="-b -m -l -DFOO"
ASM      ?= z88dk-z80asm
ASMFLAGS ?= -b -m -l
APPMAKE  ?= z88dk-appmake

# Start address and stack of the image (hex)
ORG = 8000
SP  = 7FF0

all: main.sna

main.map main_extra.bin: main.asm
	$(ASM) $(ASMFLAGS) main.asm

# 128K snapshot.
# appmake does not understand sections with a 24 bit ORG, so it gets a copy
# of the output (image.map, image*.bin) in which the section 'extra'
# ($04xxxx) is renamed to BANK_4. The org and the stack, which appmake
# reads from the map file, are added to the copy.
main.sna: main.map main_extra.bin
	sed -e 's/= \$$04\(....\) \(.*\), extra,/= $$\1 \2, BANK_4,/' -e 's/^__extra_/__BANK_4_/' main.map > image.map
	echo '__crt_org_code = $$$(ORG) ; const, public, def, , ,' >> image.map
	echo '__register_sp = $$$(SP) ; const, public, def, , ,' >> image.map
	for f in main*.bin; do cp $$f image$${f#main}; done
	mv image_extra.bin image_BANK_4.bin
	$(APPMAKE) +zx --sna -b image -c image -o main.sna

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin main.sna image.map

.PHONY: all clean
