# Variations can be tested from the command line, e.g.:
#   make CLIB=sdcc_ix
#   make DEBUG=
#   make CFLAGS_EXTRA=-O2
TARGET   = zx
SUBTYPE ?= -subtype=sna
CLIB    ?= sdcc_iy
DEBUG   ?= -debug
CFLAGS_EXTRA ?=
ZCC      = zcc +$(TARGET) $(SUBTYPE) -clib=$(CLIB) $(DEBUG) $(CFLAGS_EXTRA)
BANKFLAGS = --codesegBANK_6 --constsegBANK_6

all: main.sna

banked.o: banked.c
	$(ZCC) -c --list $(BANKFLAGS) banked.c -o banked.o

# 128K snapshot, contains bank 6. Also creates main.map and the listings.
main.sna: main.c banked.o
	$(ZCC) -m --list main.c banked.o -o main -create-app

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.sna main main.lis

.PHONY: all clean
