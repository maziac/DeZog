-- Handles the breakpoints by id and also the watchpoints.


-- Handles the socket commands, responses and notifications.
local breakpoints = {
}

local mame = require("dezog/mame")

-- The map with breakpoint ids -> { long address, mame id }.
local breakpoint_map




-- The last given breakpoint id.
local last_breakpoint_id

-- The map with mame's watchpoint ids. Required to delete the watchpoint.
local watchpoint_mame_map



-- Initializes
function breakpoints.init()
	local cpu = manager.machine.devices[":maincpu"]
	-- if breakpoint_map ~= nil then
	-- 	-- Unfortunately it does not work to remove teh whole breakpoints at once.
	-- 	for k, v in pairs(breakpoint_map) do
	-- 		cpu.debug:bpclear(v.mame_id)
	-- 	end
	-- end
	-- if watchpoint_mame_map ~= nil then
	-- 	-- Unfortunately it does not work to remove teh whole breakpoints at once.
	-- 	for k, v in pairs(watchpoint_mame_map) do
	-- 		cpu.debug:wpclear(v)
	-- 	end
	-- end
	print("bpclear")
	cpu.debug:bpclear()
	cpu.debug:wpclear()
print("end")

	last_breakpoint_id = 0
	breakpoint_map = {}
	bp_addr_map = {}
	watchpoint_mame_map = {}
end


-- Adds a breakpoint and returns its id (>0).
-- bp_address is a long address.
function breakpoints.add(bp_address)
	-- Set real breakpoint
	local mame_bpid = mame.cpu.debug:bpset(bp_address & 0xFFFF, "", "") -- Note: The bank is evaluated by DeZog
	-- Add to map
	last_breakpoint_id = last_breakpoint_id + 1
	breakpoint_map['' .. last_breakpoint_id] = {
		address = bp_address,
		mame_id = mame_bpid
	}

	return last_breakpoint_id
end


-- Removes a breakpoint by id (also from the map).
function breakpoints.remove(bp_id)
	-- Remove from map
	local bp = breakpoint_map['' .. bp_id]
	breakpoint_map['' .. bp_id] = nil
	-- Remove real breakpoint
	if bp then
		mame.cpu.debug:bpclear(bp.mame_id)
	end
end


-- Creates a key for the watchpoint map from the address, range and access_type (e.g. "rw").
-- Returns e.g. "165342-10-rw"
function wp_get_key(wp_address, range, access_type)
	local key = "" .. wp_address .. "-" .. range .. "-" .. access_type
	return key
end


-- 'access' is read (1), write (2) or read/write (3).
-- Returns "r", "w" or "rw"
function get_string_from_access(access)
	-- type
	local access_type = "rw"
	if access == 1 then
		access_type = "r"
	elseif access == 2 then
		access_type = "w"
	end
	return access_type
end


-- Adds a watchpoint with access type and range.
-- wp_address is a long address. but only the 64k address part is used.
-- range is the site of the area to watch. This is converted into mame individual watchpoints.
-- access is read (1), write (2) or read/write (3).
function breakpoints.wp_add(wp_address, range, access)
	-- type
	local access_type = get_string_from_access(access)
	-- Create key for map
	local key = wp_get_key(wp_address, range, access_type)

	-- Set real watchpoint
	local addr64k = wp_address & 0xFFFF
	local mame_wpid = mame.cpu.debug:wpset(mame.prgm_space, access_type, addr64k, range, "", "") -- Note: The bank is evaluated by DeZog

	-- Add to map
	watchpoint_mame_map[key] = mame_wpid

	-- local wps = mame.cpu.debug:wplist(mame.prgm_space)
	-- for k,v in pairs(wps) do print("  wp: ", k, v.index, v.address, v.length, v.type) end
end

-- Removes a breakpoint by id (also from the map).
-- wp_address is a long address.
-- range is the site of the area to watch. This is converted into mame individual watchpoints.
-- access is read (1), write (2) or read/write (3).
function breakpoints.wp_remove(wp_address, range, access)
	-- type
	local access_type = get_string_from_access(access)
	-- Create key for map
	local key = wp_get_key(wp_address, range, access_type)
	-- Remove from map
	local wp_id = watchpoint_mame_map[key]
	watchpoint_mame_map[key] = nil
	-- Remove real breakpoint
	if wp_id then
		mame.cpu.debug:wpclear(wp_id)
	end

	-- local wps = mame.cpu.debug:wplist(mame.prgm_space)
	-- for k, v in pairs(wps) do print("  wp: ", k, v.index, v.address, v.length, v.type) end
end



--breakpoints.init()

return breakpoints
