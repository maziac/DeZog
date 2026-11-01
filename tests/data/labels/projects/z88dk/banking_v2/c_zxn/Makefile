# Variations can be tested from the command line, e.g.:
#   make CLIB=sdcc_ix
#   make DEBUG=
#   make CFLAGS_EXTRA=-O2
TARGET   = zxn
SUBTYPE ?= -subtype=nex
CLIB    ?= sdcc_iy
DEBUG   ?= -debug
CFLAGS_EXTRA ?=
ZCC      = zcc +$(TARGET) $(SUBTYPE) -clib=$(CLIB) $(DEBUG) $(CFLAGS_EXTRA)
BANKFLAGS = --codesegPAGE_20 --constsegPAGE_20

all: main.nex

banked.o: banked.c
	$(ZCC) -c --list $(BANKFLAGS) banked.c -o banked.o

# NEX file, contains page 20. Also creates main.map and the listings.
main.nex: main.c banked.o
	$(ZCC) -m --list main.c banked.o -o main -create-app

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.nex main main.lis

.PHONY: all clean
