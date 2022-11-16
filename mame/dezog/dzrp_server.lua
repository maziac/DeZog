
-- This file handles the basic receiving and sending for the DZRP proptocol.


local dzrp_server = {
    -- The used port
    port = nil
}

-- The timeoout (accuracy is seconds)
local TIMEOUT = 5 -- 2 TODO: set to 2


-- Constants for the header parameters.
local HEADER_LEN_LENGTH = 4
local HEADER_CMD_SEQNO_LENGTH = 2
local HEADER_SEQNO_LENGTH = 1


-- The connected client.
local socket = nil  -- StateObject

-- Stores the received sequence number.
local received_seqno = 0

-- State object for reading client data asynchronously
local state = {}


-- Load the command handling
local commands = require("dezog/dzrp_commands")
commands.send_response = send_response



-- Returns the DZRP version as a string.
function dzrp_server.get_dzrp_version()
    return commands.get_dzrp_version()
end


-- Call this to start listiening on 'Port'.
-- Is asynchronous, i.e. not blocking.
function dzrp_server.start_listening()
    -- Reset
    state = {
        -- Receive buffer.
        buffer = "", -- A string instead of a byte buffer
        -- The length of the currently received message
        msgLength = 0,
        -- The time the message was started to be received (for timeout) in secs
        start_time = 0,
        -- Set if some communication error occurred.
        error = false
    }

    -- Open socket for listening
    socket = emu.file("", 7)
    socket:open("socket.127.0.0.1:"..dzrp_server.port)
end


-- Accesses the recieved data by index and byte value.
-- index starts at 0.
function get_buffer_at(index)
    local val = string.byte(state.buffer, index+1)
--    print("get_buffer_at("..index..") = "..val)
    return val
end

-- Strips everything after length bytes from state.buffer and
-- returns it.
function get_remaining_buffer(length)
    if length >= #state.buffer then
        -- Just return nothing
        return ""
    else
        -- Get the reminaing part
        local remaining = string.sub(state.buffer, length + 1)
        -- Strip from buffer
        state.buffer = string.sub(state.buffer, 1, length)
        return remaining
    end
end


-- Data from the client is read.
-- Returns:
--   0 if nothing has been received.
--   >0 the number of bytes received
--   -1 some error occurred (see state.error). Socket has been closed.
function dzrp_server.read_data()
    -- read data
    data = socket:read(100000)
    if #data > 0 then
        print("Received: " .. #data)
        -- Start timeout ?
        local time = os.time()
        print(" Received, start_time = " .. state.start_time)
        if state.start_time == 0 then
            -- Start time
            state.start_time = time
        elseif time - state.start_time > TIMEOUT then
            -- error: timeout
            state.error = "Timeout occurred during receiving of message."
        print("Error/timeout: Closing socket.")
            socket:close()
            return -2
        end
        -- Concatenate data
        state.buffer = state.buffer .. data
        while #state.buffer >= HEADER_LEN_LENGTH+HEADER_CMD_SEQNO_LENGTH  do
            local len = #state.buffer
        print("len: " .. len)
            -- Check if still the header is received
            if state.msgLength == 0 then
                -- Header received -> Decode length
                local length = get_buffer_at(0) + (get_buffer_at(1) << 8) + (get_buffer_at(2) << 16) + (get_buffer_at(3) << 24)
        print("length: " .. length)
                state.msgLength = HEADER_LEN_LENGTH + HEADER_CMD_SEQNO_LENGTH + length
            end

        print("state.msgLength: " .. state.msgLength)

            -- Check if complete message has been received
            if (len >= state.msgLength) then
                -- Message completely received.
                local remaining = get_remaining_buffer(state.msgLength)
                -- Get sequence number
                received_seqno = get_buffer_at(HEADER_LEN_LENGTH)
                -- Parse
                if commands.parse_message(state.buffer) then
                    -- Close
                    socket:close()
                    return -1
                end

                -- Next
                state.buffer = remaining
                state.msgLength = 0
                -- Set timeout time
                if #remaining == 0 then
                    state.start_time = 0
                else
                    state.start_time = time
                end
                print("(len >= state.msgLength), start_time = " .. state.start_time)
            end
        end -- while
    end

    return #data
end


-- Sends the response.
-- Use only 'data' for normal responses.
-- Use 'data' and 'notification'=true for notifications.
function send_response(data, notification)
    print_buffer("send_response:", data)
    -- Default
    data = data or ""
    -- Sequence number
    local seq_no = received_seqno
    if notification then
        seq_no = 0
    end
    -- Length
    local length = #data + HEADER_SEQNO_LENGTH
    local resp_buffer = string.char((length & 0xFF), (length >> 8) & 0xFF, (length >> 16) & 0xFF, length >> 24, seq_no)
    -- Add payload
    local resp_buffer = resp_buffer .. data
    -- Ready for next message.
    received_seqno = 0;
    -- Send the data to the remote device.
    send(resp_buffer);
end


-- Used to send bytes to the socket.
function send(packet)
    print_buffer("send:", #packet, packet)
    socket:write(packet)
    print_buffer("  sent:", #packet)
end

-- For debugging: Print a string as bytes.
function print_buffer(title, data)
    local len = #data
    print(title .. " length: "..len)
    if len > 20 then len = 20 end
    for i = 1, len, 1 do
        local val = string.byte(data, i)
        print(string.format("  %.2X (%d) '%s'", val, val, string.sub(data, i, i)))
    end
    if len ~= #data then
        print("  ...")
    end
end

return dzrp_server
