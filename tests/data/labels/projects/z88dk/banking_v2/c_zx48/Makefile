# Variations can be tested from the command line, e.g.:
#   make CLIB=sdcc_ix
#   make DEBUG=
#   make CFLAGS_EXTRA=-O2
TARGET   = zx
SUBTYPE ?= -subtype=default
CLIB    ?= sdcc_iy
DEBUG   ?= -debug
CFLAGS_EXTRA ?=
ZCC      = zcc +$(TARGET) $(SUBTYPE) -clib=$(CLIB) $(DEBUG) $(CFLAGS_EXTRA)

all: main.tap

# Tape with a BASIC loader. Also creates main.map and the listings.
main.tap: main.c banked.c
	$(ZCC) -m --list main.c banked.c -o main -create-app

# Removes the build products (the .lis and .map files are tracked)
clean:
	rm -f *.o *.bin *.tap main main.lis

.PHONY: all clean
