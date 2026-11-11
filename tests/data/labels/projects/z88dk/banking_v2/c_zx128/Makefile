# Variations can be tested from the command line, e.g.:
#   make DEBUG=
#   make CFLAGS_EXTRA=-O2
TARGET   = zx
SUBTYPE ?= -subtype=sna
# Classic library: the newlib sdcc libraries for +zx have no banked_call
# (needed for __banked).
COMPILER ?= -compiler=sdcc
DEBUG   ?= -debug
CFLAGS_EXTRA ?=
# The stack must stay below $C000: banked_call pages the banked code in there.
STACK    = -pragma-define:REGISTER_SP=0xC000
# The banks are in the snapshot: no tape loader for them (it would wait for a tape).
NOLOADER = -pragma-define:CRT_DISABLELOADER=1
ZCC      = zcc +$(TARGET) $(SUBTYPE) $(COMPILER) $(DEBUG) $(CFLAGS_EXTRA) $(STACK) $(NOLOADER)
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
