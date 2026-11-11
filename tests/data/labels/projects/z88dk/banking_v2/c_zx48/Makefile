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

all: main.sna

# Tape with a BASIC loader. Also creates main.map and the listings.
main.sna: main.c banked.c
	$(ZCC) -m --list main.c banked.c -o main -create-app

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.sna main main.lis

.PHONY: all clean
