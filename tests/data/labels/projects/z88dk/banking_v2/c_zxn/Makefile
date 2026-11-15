TARGET   = zxn
SUBTYPE ?= -subtype=nex
CLIB    ?= sdcc_iy
DEBUG   ?= -debug
CFLAGS_EXTRA ?=
STACK    = -pragma-define:REGISTER_SP=0xC000
# zpragma.inc appends mmap.inc to the memory map of the CRT
PRAGMAS  = -pragma-include:zpragma.inc
ZCC      = zcc +$(TARGET) $(SUBTYPE) -clib=$(CLIB) $(DEBUG) $(CFLAGS_EXTRA) $(STACK) $(PRAGMAS)
# The sections have no page in their name, mmap.inc puts them in page 20
BANKFLAGS = --codeseg banked_code --constseg banked_const

all: main.nex

banked.o: banked.c
	$(ZCC) -c --list $(BANKFLAGS) banked.c -o banked.o

main.nex: main.c banked.o mmap.inc zpragma.inc
	$(ZCC) -m --list main.c banked.o -o main -create-app

clean:
	rm -f *.o *.bin *.nex *.lis *.map

.PHONY: all clean
