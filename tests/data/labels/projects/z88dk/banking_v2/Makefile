# Rebuilds the banking test projects by calling the Makefile of each subfolder.
# Requires a z88dk version that writes the block of each section into the
# map file (z88dk/z88dk#3197).
#   make          rebuild everything and reduce the map files to what the tests use
#   make c_zx128  rebuild a single project (unreduced output)
#   make clean    remove the build products (the tracked .lis and .map files are kept)
PROJECTS = c_zx48 c_zx128 c_zxn asm_zx48 asm_zx128 asm_zxn

all: $(PROJECTS)
	# Reduce the map files to the symbols of the project modules and the section heads
	for m in */main.map; do \
		grep -E '^__[A-Za-z0-9_]+_head |; [a-z]+, [a-z]+, [a-z]*, (main|main_c|banked_c), |^__register_sp ' $$m > $$m.tmp; \
		mv $$m.tmp $$m; \
	done

# -B: always rebuild, the reduced map files would otherwise look up to date
$(PROJECTS):
	$(MAKE) -B -C $@

clean:
	for d in $(PROJECTS); do $(MAKE) -C $$d clean; done

.PHONY: all clean $(PROJECTS)
