TARGET   = zx
SUBTYPE ?= -subtype=sna
COMPILER ?= -compiler=sdcc
DEBUG   ?= -debug
CFLAGS_EXTRA ?=
STACK    = -pragma-define:REGISTER_SP=0xC000
NOLOADER = -pragma-define:CRT_DISABLELOADER=1
ZCC      = zcc +$(TARGET) $(SUBTYPE) $(COMPILER) $(DEBUG) $(CFLAGS_EXTRA) $(STACK) $(NOLOADER)
# The sections have no bank in their name, mmap.asm puts them in bank 6
BANKFLAGS = --codeseg banked_code --constseg banked_const

all: main.sna

banked.o: banked.c
	$(ZCC) -c --list $(BANKFLAGS) banked.c -o banked.o

# mmap.asm has to be linked first, see there
main.sna: mmap.asm main.c banked.o
	$(ZCC) -m --list mmap.asm main.c banked.o -o main -create-app

clean:
	rm -f *.o *.bin *.sna main *.lis *.map 

.PHONY: all clean
