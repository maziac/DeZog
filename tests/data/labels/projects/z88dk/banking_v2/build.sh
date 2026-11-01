#!/bin/sh
# Rebuilds the banking test projects.
# Requires a z88dk version that writes the block of each section into the
# map file (z88dk/z88dk#3197).
set -e
cd "$(dirname "$0")"

# C: zx48 (no banking), zx128 (BANK_6), zxn (PAGE_20)
(cd c_zx48 && zcc +zx -clib=sdcc_iy -debug -m --list main.c banked.c -o main -create-app)
(cd c_zx128 \
	&& zcc +zx -clib=sdcc_iy -c -debug --list --codesegBANK_6 --constsegBANK_6 banked.c -o banked.o \
	&& zcc +zx -clib=sdcc_iy -debug -m --list main.c banked.o -o main -create-app)
(cd c_zxn \
	&& zcc +zxn -clib=sdcc_iy -c -debug --list --codesegPAGE_20 --constsegPAGE_20 banked.c -o banked.o \
	&& zcc +zxn -clib=sdcc_iy -debug -m --list main.c banked.o -o main -create-app)

# Assembler
for d in asm_zx48 asm_zx128 asm_zxn; do
	(cd $d && z88dk-z80asm -b -m -l main.asm)
done

# Only the .lis and .map files are used by the tests
find . -type f ! -name '*.c' ! -name '*.asm' ! -name '*.lis' ! -name '*.map' ! -name build.sh -delete
# Remove the listing of the crt (C projects)
rm -f c_*/main.lis
# Reduce the map files to the symbols of the project modules and the section heads
for m in */main.map; do
	grep -E '^__[A-Za-z0-9_]+_head |; [a-z]+, [a-z]+, [a-z]*, (main|main_c|banked_c), |^__register_sp ' $m > $m.tmp
	mv $m.tmp $m
done
