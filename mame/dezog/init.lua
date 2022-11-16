-- The DeZog Plugin.
-- Will connect the DeZog Z80 debugger with the MAME debugger to
-- allow debugging from within vscode.

local exports = {
	name = "dezog",
	version = "1.0.0",
	description = "DeZog DZRP plugin",
	license = "MIT",
	author = { name = "maziac" },
	-- Default port to use
	port = 13000,
}

local dezog = exports

-- For the display of messages in the MAME screen.
local display_message_stack = {}
last_displayed_message_time = 0


-- Import other components
local mame = require("dezog/mame")
local dzrp_commands = require("dezog/dzrp_commands")
local dzrp_server = require("dezog/dzrp_server")
dzrp_server.port = dezog.port


-------------------------------------------------------------------------
function dezog.startplugin()
	local debugger

	local STATE = {
		FIRST_STARTING = 0,
		SECOND_STARTING = 1,
		OPEN_SOCKET = 2,
		LISTENING = 3,
		CONNECTED = 4
	}
	local state


	function change_state(new_state)
		state = new_state
		-- log
		local state_name;
		if(state == STATE.FIRST_STARTING) then
			state_name = "STATE.FIRST_STARTING"
		elseif(state == STATE.SECOND_STARTING) then
			state_name = "STATE.SECOND_STARTING"
		elseif(state == STATE.OPEN_SOCKET) then
			state_name = "STATE.OPEN_SOCKET"
		elseif(state == STATE.LISTENING) then
			state_name = "STATE.LISTENING"
			show_message("plugin "..exports.version.."\nDZRP "..dzrp_server.get_dzrp_version().."\nListening on port "..dzrp_server.port)
		elseif(state == STATE.CONNECTED) then
			state_name = "STATE.CONNECTED"
			show_message("Connected.")
		else
			state_name = state
		end
		print("State changed to: "..state_name)
	end

	change_state(STATE.FIRST_STARTING)


	emu.register_start(function ()
		if state == STATE.FIRST_STARTING then
			debugger = manager.machine.debugger
			if not debugger then
				show_message("debugger not enabled")
				return
			end
			local maincpu = manager.machine.devices[":maincpu"]
			if not maincpu then
				show_message("maincpu not found")
				return
			end
			cpuname = maincpu.shortname
			if cpuname ~= "z80" then
				show_message("No support for "..cpuname..". Only z80 is supported.")
				cpuname = nil
				return
			end

			-- Init
			dzrp_server.send_response = send_response
			mame.init_slots()

			-- Reload the ROMs
			manager.machine:hard_reset()

			-- Next state
			change_state(STATE.SECOND_STARTING)
			return
		end

		if state == STATE.SECOND_STARTING then
			-- Now open the socket
			change_state(STATE.OPEN_SOCKET)
		end
	end)

	emu.register_stop(function()
	end)


	emu.register_periodic(function()
		display_message()

		-- if manager.machine.debugger then
		-- 	print("periodic: mame.run, running=", mame.running, ", execution_state=", manager.machine.debugger.execution_state)
		-- end

--print("addr=0: ", manager.machine.devices[":maincpu"].spaces["program"]:read_u8(0))

		if state < STATE.OPEN_SOCKET then
			return
		end

		if state == STATE.OPEN_SOCKET then
			dzrp_server.start_listening()
			change_state(STATE.LISTENING)
			dzrp_commands.init()
		end

		if state == STATE.LISTENING or state == STATE.CONNECTED then

			if state == STATE.CONNECTED then
				print("PC=", mame.cpu.state["PC"].value)
			end

			if manager.machine.debugger.execution_state == "stop" then
				mame.running = false
				if state == STATE.CONNECTED then
					-- Send pause notification
					mame.update_slots()
					dzrp_commands.send_pause_notification_on_break()
				end
			end

			-- Busy-loop as long as the cpu should be stopped.
			-- Unfortunately there is no way to 'sleep' or similar from
			-- lua so this busy-loop is required.
			-- The whole problem comes from the fact that when setting
			-- "-debugger none" the 'debugger.execution_state="stop"' is
			-- automatically followed by a 'device:go'. I.e. it is not possible
			-- to stop the debugger.
			repeat
				local data_count = dzrp_server.read_data()

				if data_count < 0 then
					if data_count <= -2 then
						-- Error
						show_message("Error.\nDisconnected.")
					end
					change_state(STATE.OPEN_SOCKET)
					break -- leave loop
				end

				if state == STATE.LISTENING and data_count > 0 then
					change_state(STATE.CONNECTED) -- Note: Because of busy-loop this state is not shown.
				end

			until( mame.running == true )

		end
	end)
end


-------------------------------------------------------------------------
-- Shows a string on the screen and prints it as well in the console.
function show_message(text)
	print("dezog plugin: "..text)
	-- Add to stack
	table.insert(display_message_stack, 1, text)
end

-------------------------------------------------------------------------
-- Shows a string on the screen and prints it as well in the console.
-- Works with a stack of messages to show only one message at a time.
-- The function is called periodically.
function display_message()
	-- Check if there is something to display
	if #display_message_stack > 0 then
		-- Check if the last displayed message has been shown long enough
		local cur_time = os.time()
		if cur_time - last_displayed_message_time > 2 then
			-- Use new time
			last_displayed_message_time = cur_time
			-- Display last message
			local message = table.remove(display_message_stack)
			manager.machine:popmessage("DeZog: "..message)
		end
	end
end


-------------------------------------------------------------------------
-- Busy wait in seconds.
-- function sleep(s)
--   local ntime = os.time() + s
--   repeat until os.time() > ntime
-- end

return exports
