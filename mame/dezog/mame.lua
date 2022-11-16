-- The interface to MAME.
local mame = {
	system_name = nil,
	cpu = nil,
	slots = nil,
	slot_ranges = nil,
	prgm_space = nil,
	debugger = nil,
	running = true
}



-- The slot ranges and the current slots
mame.slots = {}

-- The bank info { name, short_name, size, type (0 = UNKNOWN, 1 = ROM, 1 = RAM) }
mame.bank_info = {}



-- Address/slot association, size = 0x10000
local addrSlots = {}

-- Gets the mame structures.
-- Has to be called after the hard reset.
-- It is called during cmd_init.
function mame.init()
	mame.system_name = manager.machine.system.name
	mame.cpu = manager.machine.devices[":maincpu"]
	mame.prgm_space = mame.cpu.spaces["program"]
	mame.debugger = manager.machine.debugger
	-- Clear all breakpoints
	mame.cpu.debug:bpclear()
	mame.cpu.debug:wpclear()
end



-------------------------------------------------------------------------
-- Starts or stops the debugger.
function mame.run(run)
	if run then
		mame.running = true
		manager.machine.debugger.execution_state = "run"
	else
		mame.running = false
		manager.machine.debugger.execution_state = "stop"
	end

	-- print("mame.run, running=", mame.running, ", execution_state=", manager.machine.debugger.execution_state)
end


-------------------------------------------------------------------------
-- Returns an array with slot ranges of the structure:
--   address, size, type, bank_group (if bank)
function get_slot_ranges()
	-- Get 'slots'
	local slot_ranges = {}
	local prev_address = 0
	local pscace_map = manager.machine.devices[":maincpu"].spaces["program"].map
	for i,v in ipairs(pscace_map.entries) do
		-- print(i, string.format("%.4X", v.address_start), string.format("%.4x", v.address_end), v.read.handlertype, v.read.tag, v.write.handlertype, v.write.tag)
		type = v.read.handlertype
		if type == 'rom' or type == 'ram' or type == 'bank' then
			local next_address = v.address_end + 1
			local address = v.address_start
			local bank_tag
			if type == 'bank' then
				bank_tag = ":" .. v.read.tag
			end
			-- Assign an empty slot?
			if prev_address < address then
				table.insert(slot_ranges, {
					address = prev_address,
					size = address - prev_address,
					type = 'unassigned'
				})
			end
			-- Assign this slot
			table.insert(slot_ranges, {
				address = address,
				size = next_address - address,
				type = type,
				bank_tag = bank_tag
			})
			-- Next
			prev_address = next_address
		end
	end
	-- Last entry
	if prev_address < 0x10000 then
		table.insert(slot_ranges, {
			address = prev_address,
			size = 0x10000 - prev_address,
			type = 'unassigned'
		})
	end

	return slot_ranges
end


-------------------------------------------------------------------------
-- Print slot ranges
function print_slot_ranges(slot_ranges)
	for i,v in ipairs(slot_ranges) do
		print(i - 1, string.format("%.4X", v.address), string.format("%.4x", v.size), v.type)
		if v.bank_tag then
			print(' bank_tag = ', v.bank_tag)
		end
		print("  Banks:   bank_start_index:", v.bank_start_index)
		for k,b in pairs(v.banks) do
			print("    "..b)
		end
	end
end

-------------------------------------------------------------------------
-- Returns the number of banks insde a bank group (MAME bank).
function get_number_of_banks(bank_group)
	-- A note
	print("The following ignored exception is desired:")
	-- Assume the index starts at 0
	local bank_start = 0

	-- Set entry and check if it is not allowed
	while not pcall(function() bank_group.entry = bank_start end) do -- The exception is always logged
		-- print("bank_start:", bank_start)
		bank_start = bank_start + 1
	end

	-- Set entry and check if it is still allowed
	local bank_end = bank_start + 1
	while pcall(function() bank_group.entry = bank_end end) do -- The exception is always logged
		-- print("bank_end:", bank_end)
		bank_end = bank_end + 1
	end

	local bank_count = bank_end - bank_start
	-- print("bank_start:", bank_start, "bank_end:", bank_end, "bank_count:", bank_count)

	return { bank_start = bank_start, bank_count = bank_count }


end


-------------------------------------------------------------------------
-- Associate bank numbers
-- Adds a banks array with associated bank indices to the slot ranges.
-- Every slot gets an array with bank number (banks), even unassigned.-- (All unassigned get the same bank index).
function associate_bank_numbers(slot_ranges)
	local bank_number = 0
	local bank_map = {}
	local pspace = manager.machine.devices[":maincpu"].spaces["program"]
	mame.bank_info = {}
	for i,v in ipairs(slot_ranges) do
		v.banks = {} -- Array with bank numbers
		v.bank_start_index = 0
		if v.type == "rom" or v.type == "ram" then
			table.insert(v.banks, bank_number)
			-- Set bank info
			local btype = 1 -- ROM
			if v.type == "ram" then
				btype = 2 -- RAM
			end
			table.insert(mame.bank_info, {
				name = "ROM" .. bank_number,
				short_name = "R" .. bank_number,
				size = v.size,
				type = btype
			})
			-- Next
			bank_number = bank_number + 1
		elseif v.type == "bank" then
			local bank_group = manager.machine.memory.banks[v.bank_tag]
			local bank_start_count = get_number_of_banks(bank_group)
			v.bank_start_index = bank_start_count.bank_start
			local bank_count = bank_start_count.bank_count
			local name_prefix = "BANK"
			local short_name_prefix = "B"
			for b = 0, bank_count-1, 1 do
				bank_group.entry = b
				local key_addr = pspace:read_u32(v.address)
				local bn = bank_map[key_addr]
				-- print("b=", b, bank_group.entry, v.address, key_addr, bn)
				if bn == nil then
					-- Set the new bank
					bn = bank_number
					bank_map[key_addr] = bn
					-- Set bank info
					table.insert(mame.bank_info, {
						name = name_prefix..bn,
						short_name = short_name_prefix..bn,
						size = v.size,
						type = 0	-- unknown
					})
					-- Next
					bank_number = bank_number + 1
				end
				table.insert(v.banks, bn)
			end
		end
	end

	-- Assign the unassigned
	local unassigned_size = 0
	for i,v in ipairs(slot_ranges) do
		if #v.banks == 0 and v.size > 0 then
			table.insert(v.banks, bank_number)
			if v.size > unassigned_size then
				unassigned_size = v.size
			end
		end
	end
	-- Also add a bank info for unassigned
	print("unassigned ", unassigned_size, bank_number)
	if unassigned_size > 0 then
		print("unassigned !")
		table.insert(mame.bank_info, {
			name = "UNASSIGNED",
			short_name = "U",
			size = unassigned_size,
			type = 3	-- UNASSIGNED
		})
	end
end


-------------------------------------------------------------------------
-- Updates 'slots' so that they contain the current bank numberss.
function mame.update_slots()
	for i,v in ipairs(mame.slot_ranges) do
		-- Update only the parts that have more than 1 bank attached
		if #v.banks > 1 then
			-- Get MAME bank
			local bank_group = manager.machine.memory.banks[v.bank_tag]
			-- Convert to DeZog bank index
			local bank_number = v.banks[1] + bank_group.entry - v.bank_start_index
			mame.slots[i] = bank_number
		end
	end
end


-- Sets a bank for a slot
-- slot: zero based index
-- bank_number: zero based index
-- Note: mame.slots is NOT automatically updated.
function mame.set_slot_bank(slot, bank_number)
	--print_slot_ranges(mame.slot_ranges)
	local v = mame.slot_ranges[slot + 1]

	if #v.banks > 1 then
		-- Get MAME bank
		local bank_group = manager.machine.memory.banks[v.bank_tag]
		-- Convert DeZog bank index to MAME index
		local entry = bank_number - v.banks[1] + v.bank_start_index
		bank_group.entry = entry
		--print("set_slot, slot:", slot, "bank:", bank_number, "mame_bank_entry:", entry)
	end
end


-------------------------------------------------------------------------
-- Print the slots
function print_slots(slots)
	print("slots:")
	for i,v in ipairs(slots) do
		print("  ["..(i-1).."] -> "..v)
	end
end


-------------------------------------------------------------------------
-- Initialize the slot_ranges and slots.
function mame.init_slots()
	local region = manager.machine.memory.regions[":maincpu"]
	-- Get size of memory region
	local size = region.size
	-- and fill with numbers (overwrite ROM)
	for addr = 0, size - 4, 4 do
		region:write_u32(addr, addr)
	end
	-- print("dezog: region size: ", size)

	-- Get slot ranges
	mame.slot_ranges = get_slot_ranges()

	-- Associate bank numbers
	associate_bank_numbers(mame.slot_ranges)

	-- Print slot ranges
	print_slot_ranges(mame.slot_ranges)

	-- Prepare current slots (fill all fixed banks)
	for i,v in ipairs(mame.slot_ranges) do
		table.insert(mame.slots, v.banks[1])
		--print(i,v.banks[1])
	end

	-- Associate addresses with slots
	for i,v in ipairs(mame.slot_ranges) do
		local endAddr = v.address + v.size - 1
		for addr = v.address, endAddr, 1 do
			addrSlots[addr] = i
		end
	end

	-- Print address slot associations
	-- for i = 0, 0xFFFF, 128 do
	-- 	local text = ""
	-- 	for j = 0, 126, 2 do
	-- 		text = text .. addrSlots[i+j] .. ", "
	-- 	end
	-- 	print(string.format("%.4X:", i), text)
	-- end

	-- Print slot ranges
	-- print_slot_ranges(mame.slot_ranges)

	-- -- Print current slots
	-- print_slots(slots) -- TODO: Remove

	-- -- Update the current slots
	-- mame.update_slots(slots, mame.slot_ranges) -- TODO: Remove

	-- -- Print current slots
	-- print_slots(slots) -- TODO: Remove
end


-- Returns the long address for an address.
-- Uses the current slot/banks.
-- addr64k is a 64k address.
function mame.get_long_address(addr64k)
	-- Get slot
	local slot = addrSlots[addr64k]
	-- Get bank
	local bank = mame.slots[slot]
	-- Construct long address
	local long_address = addr64k + (bank << 16)
	return long_address
end


return mame
