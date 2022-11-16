-- dzrp_commands reacts on incoming commands from dezog,
-- it executes them and sends a response via the given 'send_response'
-- function.

-- The DZRP version
local DZRP_VERSION = { 2, 1, 0 };

-- Temporary filename for saving/loading of the machine state.
local tmp_state_filename = "__dezog_state_filename__"

-- Handles the socket commands, responses and notifications.
local dzrp_commands = {
    -- Function which is used to send the response
    send_response = nil,
    -- The program name used in response to CMD_INIT
    prgm_name = nil
}

-- The header length (length + seqno + command byte)
local CMD_HEADER_LENGTH = 6


-- Include the mame and breakpoint functionality.
local mame = require("dezog/mame")
local breakpoints = require("dezog/breakpoints")


-- The break reason.
local BreakReason = {
    NO_REASON = 0,
    MANUAL_BREAK = 1,
    BREAKPOINT_HIT = 2,
    WATCHPOINT_READ = 3,
    WATCHPOINT_WRITE = 4,
    OTHER = 255,
}

-- The alternate command for CMD_CONTINUE.
local AlternateCommand = {
    CONTINUE = 0,   -- I.e. no alternate command
    STEP_OVER = 1,
    STEP_OUT = 2
}


-- The command enums.
local DZRP = {
    CMD_INIT = 1,
    CMD_CLOSE = 2,

    CMD_GET_REGISTERS = 3,
    CMD_SET_REGISTER = 4,
    CMD_WRITE_BANK = 5,
    CMD_CONTINUE = 6,
    CMD_PAUSE = 7,
    CMD_READ_MEM = 8,
    CMD_WRITE_MEM = 9,
    CMD_SET_SLOT = 10,
    CMD_GET_TBBLUE_REG = 11,
    CMD_SET_BORDER = 12,
    CMD_SET_BREAKPOINTS = 13,
    CMD_RESTORE_MEM = 14,
    CMD_LOOPBACK = 15,
    CMD_GET_SPRITES_PALETTE = 16,
    CMD_GET_SPRITES_CLIP_WINDOW_AND_CONTROL = 17,

    -- Sprites: not used by MAME
    CMD_GET_SPRITES = 18,
    CMD_GET_SPRITE_PATTERNS = 19,

    -- Breakpoint
    CMD_ADD_BREAKPOINT = 40,
    CMD_REMOVE_BREAKPOINT = 41,

    CMD_ADD_WATCHPOINT = 42,
    CMD_REMOVE_WATCHPOINT = 43,

    -- State
    CMD_READ_STATE = 50,
    CMD_WRITE_STATE = 51,

    -- Retrieve the memory model information from the remote (e.g. the custom memory model)
    CMD_GET_MEMOY_MODEL = 60,
}

-- The notifications
local DZRP_NTF = {
    NTF_PAUSE = 1
}


-- Indices of the command.
local INDEX = {
    CMD_ID = 5
}


-- Defines the machine type that is returned in CMD_INIT.
-- It is required to determine the memory model.
local DzrpMachineType = {
    UNKNOWN = 0,
    ZX16K = 1,
    ZX48K = 2,
    ZX128K = 3,
    ZXNEXT = 4,
    CUSTOM = 255
}


-- Used for cmd_set_register.
local REGS = { "PC", "SP", "AF", "BC", "DE", "HL", "IX", "IY", "AF2", "BC2", "DE2", "HL2" }


-- The data of the command is temporarily stored here
local command_data = nil

-- The data for the response is prepared here.
local response_data = ""

-- Temporary breakpoint addresses (64k) for Continue. -1 = unused.
local tmp_breakpoint1
local tmp_breakpoint2
-- And correspondent MAME ids
local tmp_bp1_id
local tmp_bp2_id


-- The debugger instance
local debugger


-- General initalization function.
function dzrp_commands.init()
    debugger = manager.machine.debugger
    last_breakpoint_id = 0
    tmp_breakpoint1 = -1
    tmp_breakpoint2 = -1
end


-- Returns the DZRP version as a string.
function dzrp_commands.get_dzrp_version()
    local version = "" .. DZRP_VERSION[1] .. '.' .. DZRP_VERSION[2] .. '.' .. DZRP_VERSION[3];
    return version;
end


-- Appends a byte to 'response_data'.
function response_add_byte(value)
    response_data = response_data .. string.char(value & 0xFF)
end

-- Appends a dword to 'response_data'.
function response_add_word(value)
    response_data = response_data .. string.char(value & 0xFF) .. string.char((value >> 8) & 0xFF)
end

-- Appends a 32 bit long to 'response_data'.
function response_add_long(value)
    response_data = response_data .. string.char(value & 0xFF) .. string.char((value >> 8) & 0xFF) .. string.char((value >> 16) & 0xFF) .. string.char((value >> 24) & 0xFF)
end

-- Appends a string to 'response_data'.
function response_add_string(s)
    response_data = response_data .. s
end


-- Clears the temporary breakpoints if any set.
function remove_tmp_breakpoints()
    if tmp_breakpoint1 >= 0 then
        mame.cpu.debug:bpclear(tmp_bp1_id)
    end
    if tmp_breakpoint2 >= 0 then
        mame.cpu.debug:bpclear(tmp_bp2_id)
    end
    tmp_breakpoint1 = -1;
    tmp_breakpoint2 = -1;
end


-- Returns the configuration.
function cmd_init()
    log("cmd_init")
    -- Init
    mame.init()
    -- Stop debugger and reset
    mame.run(false)
    local registers = mame.cpu.state
    registers["PC"].value = 0
    -- Clear breakpoints
    remove_tmp_breakpoints()
    breakpoints.init()
    -- Return values
    local prgm_name = "DeZog MAME Plugin"
    -- No error
    response_data = ""
    response_add_byte(0);
    -- DZRP version
    response_add_byte(DZRP_VERSION[1])
    response_add_byte(DZRP_VERSION[2])
    response_add_byte(DZRP_VERSION[3])
     -- machine type = CUSTOM
    response_add_byte(DzrpMachineType.CUSTOM)
    -- the program name
    response_add_string(prgm_name .. "\0")
    send_response(response_data)
end

-- Returns the used memory model. E.g. the slots and the banks configuration.
function cmd_get_memory_model()
    log("cmd_get_memory_model")

    response_data = ""
    -- name (machine name)
    response_add_string(mame.system_name .. "\0")
    -- slots
    response_add_byte(#mame.slot_ranges);
    for i, v in pairs(mame.slot_ranges) do
        -- Start and end of slot
        response_add_word(v.address)
        response_add_word(v.address + v.size - 1)
        -- Number of used banks and banks
        response_add_byte(#v.banks)
        print("cmd_get_memory_model", i, "slot-start:", string.format("%.4X", v.address), " slot-end:",
            string.format("%.4X", (v.address + v.size - 1)))
        for k, b in pairs(v.banks) do
            print("cmd_get_memory_model", i, " bank", b, v.name, " size ", v.size)
            response_add_byte(b)
        end
    end

    -- banks
    response_add_byte(#mame.bank_info);
    for i, v in pairs(mame.bank_info) do
        print("cmd_get_memory_model bank ", i, " bank", v.name, v.short_name)
        response_add_string(v.name .. "\0")
        response_add_string(v.short_name .. "\0")
        response_add_word(v.size)
        response_add_byte(v.type)
    end

    -- Send response
    send_response(response_data)
end


-- Responds and closes the connection.
function cmd_close()
    log("cmd_close")
    remove_tmp_breakpoints()
    send_response("")
end


-- Retrieves registers and slots.
function cmd_get_registers()
    log("cmd_get_registers")
    response_data = ""

    -- Registers
    local registers = mame.cpu.state
    response_add_word(registers["PC"].value)
    response_add_word(registers["SP"].value)
    response_add_word(registers["AF"].value)
    response_add_word(registers["BC"].value)
    response_add_word(registers["DE"].value)
    response_add_word(registers["HL"].value)
    response_add_word(registers["IX"].value)
    response_add_word(registers["IY"].value)
    response_add_word(registers["AF2"].value)
    response_add_word(registers["BC2"].value)
    response_add_word(registers["DE2"].value)
    response_add_word(registers["HL2"].value)
    response_add_byte(registers["R"].value)
    response_add_byte(registers["I"].value)
    response_add_byte(registers["IM"].value)
    response_add_byte(0) -- Reserved

    -- Slots
    mame.update_slots()
    local slots = mame.slots
    local slot_len = #slots
    response_add_byte(slot_len)
    for i = 1, slot_len, 1 do
        response_add_byte(slots[i])
    end

    -- Response
    send_response(response_data)
end


-- Sets a register.
function cmd_set_register()
    log("cmd_set_register")

    -- All available registers:
    -- A       00
    -- C       00
    -- AF      0054
    -- E       04
    -- D       11
    -- BC2     0000
    -- CURPC   02C8
    -- HALT    0
    -- CURFLAGS        .Z.H.P..
    -- IFF2    1
    -- PC      02CA
    -- IFF1    1
    -- IM      1
    -- HL      4801
    -- IY      3039
    -- IX      3253
    -- DE2     0000
    -- R       00
    -- WZ      02C8
    -- AF2     0000
    -- DE      1104
    -- HL2     0000
    -- I       00
    -- H       48
    -- BC      0000
    -- B       00
    -- L       01
    -- SP      37FE

    -- Get register number and value
    local reg_number = get_byte_at(CMD_HEADER_LENGTH)
    local value = get_word_at(CMD_HEADER_LENGTH + 1)
    local value_byte = value & 0xFF

    if reg_number <= 11 then
        local reg = REGS[reg_number + 1]
        mame.cpu.state[reg].value = value
    elseif reg_number == 13 then
        mame.cpu.state["IM"].value = value_byte
    elseif reg_number <= 33 then
        -- Just one half of the reg
        local index = reg_number - 14
        local reg = REGS[(index >> 1) + 3]
        local old_value = mame.cpu.state[reg].value
        -- Lower or upper half
        print("index:", index, index & 0x01)
        if (index & 0x01) == 1 then
            -- upper half
            mame.cpu.state[reg].value = (value_byte << 8) + (old_value & 0x00FF)
        else
            -- lower half
            mame.cpu.state[reg].value = value_byte + (old_value & 0xFF00)
        end
    elseif reg_number == 34 then
        mame.cpu.state["R"].value = value_byte
    elseif reg_number == 35 then
        mame.cpu.state["I"].value = value_byte
    end

    -- Response
    send_response("")
end


-- Writes a memory bank.
function cmd_write_bank()
    log("cmd_write_bank")

    -- Read bank
    local bank_nr = get_byte_at(CMD_HEADER_LENGTH) -- 0-255
    local size = #command_data - CMD_HEADER_LENGTH - 1

    -- Write memory (write_range is unfortunately not available)
    for i = 0, size, 1 do
        local val = get_byte_at(CMD_HEADER_LENGTH + i + 1)
        mame.prgm_space:write_u8((address + i) & 0xFFFF, val)
    end

    -- Response
    send_response("")
end


-- Reads a portion of the memory.
function cmd_read_mem()
    log("cmd_read_mem")
    -- Read address and size
    local address = get_word_at(CMD_HEADER_LENGTH + 1)
    local size = get_word_at(CMD_HEADER_LENGTH + 3)
    local end_address = address + size - 1

    -- Read memory
    --log("cmd_read_mem: "..address..": "..mame.prgm_space:read_u8(address))
	--local pspace = manager.machine.devices[":maincpu"].spaces["program"]
    --log("cmd_read_mem2: "..address..": "..pspace:read_u8(address))
    -- Check if 2nd half required
    local memory
    if end_address < 0x10000 then
        -- Only one chunk
        memory = mame.prgm_space:read_range(address, end_address, 8)
    else
        -- 2 chunks
        memory = mame.prgm_space:read_range(address, 0xFFFF, 8) .. mame.prgm_space:read_range(0, end_address & 0xFFFF, 8)

    end

    -- Response
    send_response(memory)
end


-- Writes a portion of the memory.
function cmd_write_mem()
    log("cmd_write_mem")

    -- Read address and size
    local address = get_word_at(CMD_HEADER_LENGTH + 1) - 1
    local total_length = get_long_at(0)
    local size = total_length - 3
    local start_index = CMD_HEADER_LENGTH + 3 - 1

    -- Write memory (write_range is unfortunately not available)
    for i = 1, size, 1 do
        local val = get_byte_at(start_index + i)
        mame.prgm_space:write_u8((address + i) & 0xFFFF, val)
    end

    -- Response
    send_response("")
end



-- Continues program execution
function cmd_continue()
    log("cmd_continue")

    tmp_breakpoint1 = -1
    tmp_breakpoint2 = -1
    if get_byte_at(CMD_HEADER_LENGTH) ~= 0 then
        tmp_breakpoint1 = get_word_at(CMD_HEADER_LENGTH + 1)
        tmp_bp1_id = mame.cpu.debug:bpset(tmp_breakpoint1, "", "")
      --  mame.cpu.debug:bpenable(tmp_breakpoint1) -- not required
    end
    if get_byte_at(CMD_HEADER_LENGTH + 3) ~= 0 then
        tmp_breakpoint2 = get_word_at(CMD_HEADER_LENGTH + 4)
        tmp_bp2_id = mame.cpu.debug:bpset(tmp_breakpoint2, "", "")
     --   mame.cpu.debug:bpenable(tmp_breakpoint2) -- not required
    end
    --local alternate_command = get_byte_at(CMD_HEADER_LENGTH + 6)
    -- TODO: For optimization use alternate command

   --print("cmd_continue", string.format("%.4X, %.4X", tmp_breakpoint1, tmp_breakpoint2))

    -- run
    mame.run(true)

    -- Send response
    send_response("")
end


-- Pauses program execution
function cmd_pause()
    log("cmd_pause")

    -- pause
    mame.run(false)

    -- Send response
    send_response("")

    -- Send notification
    dzrp_commands.send_pause_notification(0, BreakReason.MANUAL_BREAK, "")
end



-- Sets the bank for a slot.
function cmd_set_slot()

    -- slot and bank
    local slot = get_byte_at(CMD_HEADER_LENGTH)
    local bank = get_byte_at(CMD_HEADER_LENGTH + 1)
    log("cmd_set_slot, slot="..slot..", bank="..bank)

    -- Set it
    mame.set_slot_bank(slot, bank)

    -- Send response
    send_response("")
end


-- Adds a breakpoint
function cmd_add_breakpoint()
    log("cmd_add_breakpoint")

    -- Get long address
    local bp_address = get_word_at(CMD_HEADER_LENGTH)
    local bp_bank = get_byte_at(CMD_HEADER_LENGTH + 2)
    local bp_long = bp_address + (bp_bank << 16)

    -- Set breakpoint
    local bpid = breakpoints.add(bp_long)

    -- Send response
    local response = string.char(bpid & 0xFF, bpid >> 8)
    send_response(response)
end


-- Removes a breakpoint
function cmd_remove_breakpoint()
    log("cmd_remove_breakpoint")

    -- Get breakpoint id
    local bp_id = get_word_at(CMD_HEADER_LENGTH)

    -- Remove breakpoint
    breakpoints.remove(bp_id)

    -- Send response
    send_response("")
end


-- Adds a watchpoint
function cmd_add_watchpoint()
    log("cmd_add_watchpoint")

    -- Get long address
    local wp_address = get_word_at(CMD_HEADER_LENGTH)
    local wp_bank = get_byte_at(CMD_HEADER_LENGTH + 2)
    local wp_long = wp_address + (wp_bank << 16)
    local wp_range = get_word_at(CMD_HEADER_LENGTH + 3)
    local wp_access = get_byte_at(CMD_HEADER_LENGTH + 5)

    -- Set watchpoint
   breakpoints.wp_add(wp_long, wp_range, wp_access)

    -- Send response
    local response = "\0" -- Success
    send_response(response)
end


-- Removes a watchpoint
function cmd_remove_watchpoint()
    log("cmd_remove_watchpoint")

    -- Get long address
    local wp_address = get_word_at(CMD_HEADER_LENGTH)
    local wp_bank = get_byte_at(CMD_HEADER_LENGTH + 2)
    local wp_long = wp_address + (wp_bank << 16)
    local wp_range = get_word_at(CMD_HEADER_LENGTH + 3)
    local wp_access = get_byte_at(CMD_HEADER_LENGTH + 5)

    -- Set watchpoint
    breakpoints.wp_remove(wp_long, wp_range, wp_access)

    -- Send response
    send_response("")
end

-- Reads the machine state from MAME.
-- The state is saved to tmp_state_filename, read from the file
-- and send over DZRP to DeZog.
-- Afterwards the file remains because it is not possible to remove it.
function cmd_read_state()
    log("cmd_read_state")

    -- Save state
    manager.machine:save(tmp_state_filename)
    -- TODO: Is not working because MAME is not immediately storing the file but only schedules it.

    -- Read file
    local file = emu.file(tmp_state_filename, "r")
    local ret = file:open(tmp_state_filename)
    log("cmd_read_state, ret="..ret..", size="..file:size())
    local state_data = ""
    if not ret then
        state_data = file:read(file:size())
        file:close()
    end
    -- Transmit
    send_response(state_data)
end


-- Wrties the machine state to MAME.
-- The state is received over DZRP from DeZog, saved to tmp_state_filename, and restored from there to MAME.
-- Afterwards the file remains because it is not possible to remove it.
function cmd_write_state()
    log("cmd_write_state")

    -- Read state data
    local state_data = string.sub(command_data, CMD_HEADER_LENGTH)
    -- Write file
    log("cmd_write_state, " .. tmp_state_filename .. " state_data.size=" .. #state_data)
    -- TODO: Is not working because MAME is not immediately reading the state but only schedules it. I.e. if the debugger is halted, nothing will happen.

    local file = emu.file(tmp_state_filename, "wc")
    local ret = file:open(tmp_state_filename)
    if not ret then
    log("cmd_write_state, file opened")
        file:write(state_data)
        file:close()
        log("cmd_write_state, file closed")

        -- Read state
        manager.machine:load(tmp_state_filename)
        log("cmd_write_state, loaded")

    end
    -- Respond
    send_response("")
end


-- Returns the byte at 'index' from the command message.
-- index starts at 0.
function get_byte_at(index)
    return string.byte(command_data, index+1);
end

-- Returns the word at 'index' from the command message.
-- index starts at 0.
function get_word_at(index)
    return string.byte(command_data, index + 1) + (string.byte(command_data, index + 2) << 8);
end

-- Returns the long (32 bit) at 'index' from the command message.
-- index starts at 0.
function get_long_at(index)
    return string.byte(command_data, index + 1) + (string.byte(command_data, index + 2) << 8) + (string.byte(command_data, index + 2) << 16) + (string.byte(command_data, index + 2) << 24);
end



-- One complete message from the client has been received including header.
-- In state.buffer.
-- The message is interpreted.
-- returns true if the connection should be closed / after a cmd_close.
function dzrp_commands.parse_message(packet)
    print("dzrp_commands.parse_message: length: "..#packet)
    command_data = packet

    -- Interprete
    local command = get_byte_at(INDEX.CMD_ID);
    if command == DZRP.CMD_INIT then
        cmd_init()
    elseif command == DZRP.CMD_CLOSE then
        cmd_close()
        -- Close connection
        return true
    elseif command == DZRP.CMD_GET_REGISTERS then
        cmd_get_registers()
    elseif command == DZRP.CMD_SET_REGISTER then
        cmd_set_register()
    elseif command == DZRP.CMD_WRITE_BANK then
        cmd_write_bank()
    elseif command == DZRP.CMD_CONTINUE then
        cmd_continue()
    elseif command == DZRP.CMD_PAUSE then
        cmd_pause();
    elseif command == DZRP.CMD_READ_MEM then
        cmd_read_mem()
    elseif command == DZRP.CMD_WRITE_MEM then
        cmd_write_mem()
    elseif command == DZRP.CMD_SET_SLOT then
        cmd_set_slot();
    elseif command == DZRP.CMD_ADD_BREAKPOINT then
        cmd_add_breakpoint();
    elseif command == DZRP.CMD_REMOVE_BREAKPOINT then
        cmd_remove_breakpoint();
    elseif command == DZRP.CMD_ADD_WATCHPOINT then
        cmd_add_watchpoint();
    elseif command == DZRP.CMD_REMOVE_WATCHPOINT then
        cmd_remove_watchpoint();
    elseif command == DZRP.CMD_READ_STATE then
        cmd_read_state();
    elseif command == DZRP.CMD_WRITE_STATE then
        cmd_write_state();
    elseif command == DZRP.CMD_GET_MEMOY_MODEL then
        cmd_get_memory_model();
    else
        -- error: unknown command
        print("Unknown DZRP command.")
    end

    -- Do not close connection
    return false;
end


-- Sends the pause notification.
-- bp_address is a long address.
-- reason is the BreakReason.
-- reason_string is an additional text.
function dzrp_commands.send_pause_notification(bp_address, reason, reason_string)
    print("dzrp_commands.send_pause_notification", bp_address, reason, reason_string)

    -- Prepare data
    response_data = ""
    response_add_byte(DZRP_NTF.NTF_PAUSE) -- PAUSE
    response_add_byte(reason) -- Reason
    response_add_word(bp_address & 0xFFFF) -- bp address
    response_add_byte((bp_address >> 16) + 1) -- Bank bp address
    response_add_string(reason_string .. "\0") -- Reson string

    -- Send notification
    send_response(response_data, true);
end


-- Is called if some non-manual break occurred.
-- Tries to find the break reason by comparing with temporary and other
-- breakpoints.
function dzrp_commands.send_pause_notification_on_break() -- Get PC (convert to long)
    --print("dzrp_commands.send_pause_notification_on_break")
    mame.update_slots()
    local pc = mame.cpu.state["PC"].value
    local pc_long = mame.get_long_address(pc)
    local bp_address = 0

    -- Guess break reason
    local reason = BreakReason.MANUAL_BREAK
    local reason_string = ""
    -- Check for temporary breakpoints
    if pc == tmp_breakpoint1 or pc == tmp_breakpoint2 then
        reason = BreakReason.NO_REASON;
    -- Check for breakpoints
    else
        -- Read the debugger console and check if a breakpoint or watchpoint was hit
        -- E.g. "Stopped at watchpoint 1 reading 7F from 4801 (PC=012E)"
        local msg = debugger.consolelog[#debugger.consolelog]
        if msg then
            reason_string = msg;
        end
        reason = BreakReason.OTHER;
        bp_address = pc_long;
    end

    -- "Undefine" temporary breakpoints
    remove_tmp_breakpoints()

    -- Send notification
    dzrp_commands.send_pause_notification(bp_address, reason, reason_string)
end


-- A function used for logging.
function log(text)
    print("dzrp_commands: "..text)
end


return dzrp_commands
