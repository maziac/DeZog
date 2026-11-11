# Variations can be tested from the command line, e.g.:
#   make ASMFLAGS="-mz80n -b -m -l -DFOO"
ASM      ?= z88dk-z80asm
ASMFLAGS ?= -mz80n -b -m -l
APPMAKE  ?= z88dk-appmake

# Start address and stack of the image (hex)
ORG = 6000
SP  = 5FF0

all: main.nex

main.map: main.asm
	$(ASM) $(ASMFLAGS) main.asm

# NEX file.
# appmake does not understand sections with a 24 bit ORG, so it gets a copy
# of the output (image.map, image*.bin) in which the section 'extra'
# ($14xxxx) is renamed to PAGE_20. The org and the stack, which appmake
# reads from the map file, are added to the copy.
main.nex: main.map
	sed -e 's/= \$$14\(....\) \(.*\), extra,/= $$\1 \2, PAGE_20,/' -e 's/^__extra_/__PAGE_20_/' main.map > image.map
	echo '__crt_org_code = $$$(ORG) ; const, public, def, , ,' >> image.map
	echo '__register_sp = $$$(SP) ; const, public, def, , ,' >> image.map
	for f in main*.bin; do cp $$f image$${f#main}; done
	mv image_extra.bin image_PAGE_20.bin
	$(APPMAKE) +zxn --nex -b image -c image -o main.nex

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin main.nex image.map

.PHONY: all clean
