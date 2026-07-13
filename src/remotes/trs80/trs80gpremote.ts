import {Settings} from '../../settings/settings';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {Socket} from 'net';
import {PortManager} from './portmanager';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80Registers} from '../z80registers';
import {MemoryModelTrs80Model1, MemoryModelTrs80Model3} from '../MemoryModel/trs80memorymodels';
import {CmdFile} from './cmdfile';
import {Labels} from '../../labels/labels';
import {BREAK_REASON_NUMBER} from '../remotebase';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {Trs80EmulatorLauncher} from './trs80emlauncher';
import {Trs80MockServerLauncher} from './trs80mockserverlauncher';
import {LogTransport} from '../../log';
import {Utility} from '../../misc/utility';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Gets a timestamp string for logging.
 */
function getTimestamp(): string {
    const now = new Date();
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return `${now.toTimeString().split(' ')[0]}.${ms}`;
}

/**
 * JSON-RPC message interface for communication with trs80gp emulator.
 */
interface JsonRpcMessage {
    jsonrpc: string;  // Always "2.0"
    method?: string;  // For requests
    params?: any;     // Parameters for requests
    id?: number | string;  // Request ID
    result?: any;     // For responses
    error?: {         // For error responses
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Base trs80gp Remote class that handles communication with trs80gp emulator via JSON-RPC over TCP.
 * This class contains the common functionality for all TRS-80 models supported by the trs80gp emulator.
 * 
 * Model-specific implementations should extend this class and override methods as needed
 * for model-specific features like memory mapping, screen sizes, etc.
 */
export abstract class Trs80GpRemote extends DzrpQueuedRemote {
    
    // Socket connection to trs80gp emulator
    protected socket: Socket;
    
    // Allocated port for this emulator instance
    protected allocatedPort: number | undefined;
    
    // Request ID counter for JSON-RPC
    private requestId = 1;
    
    // Pending requests waiting for responses
    private pendingRequests = new Map<number, {resolve: Function, reject: Function}>();
    
    // Buffer for accumulating incoming data
    private dataBuffer = '';
    
    // Conversation log file handle for protocol debugging
    private conversationLogFile: number | undefined;
    private conversationLogPath: string | undefined;

    // Launchers for the real emulator or the mock server.
    protected emulatorLauncher: Trs80EmulatorLauncher | undefined;
    protected mockServerLauncher: Trs80MockServerLauncher | undefined;
    protected useMockServer = false;

    // Breakpoint bookkeeping: the trs80gp protocol only supports setting the
    // complete breakpoint list at once ('setBreakpoints'). DeZog's DzrpRemote
    // adds/removes breakpoints individually, so the current set is kept here
    // and re-sent as a whole on every change.
    protected bpIdCounter = 0;
    protected permanentBps = new Map<number, number>();	// bpId -> 64k address
    protected tmpStepBps: number[] = [];	// Temporary breakpoints for step-over/step-out


    /**
     * Creates a clean, professional hex dump with proper formatting and ASCII representation.
     * Features:
     * - Fixed 80-character lines with ~26 hex bytes per line
     * - ASCII representation with escape sequences for control characters
               * - Clean output without ANSI escape sequences
     * - Error highlighting when errors occur in the data
     */
    public createHexDump(data: Buffer | string, prefix: string = '', hasError: boolean = false): string {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const lines: string[] = [];
        const bytesPerLine = 16; // Standard hex dump format
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const slice = buffer.slice(i, i + bytesPerLine);
            
            // Create hex representation
            const hexBytes = Array.from(slice)
                .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
            
            // Pad hex bytes to consistent width (47 chars for 16 bytes)
            const paddedHex = hexBytes.padEnd(47, ' ');
            
            // Create ASCII representation with escape sequences for known control chars
            const asciiChars = Array.from(slice)
                .map(byte => {
                    if (byte >= 32 && byte <= 126) {
                        return String.fromCharCode(byte);
                    }
                    // Show common control characters as escape sequences
                    switch (byte) {
                        case 0x00: return '\\0';
                        case 0x07: return '\\a';
                        case 0x08: return '\\b';
                        case 0x09: return '\\t';
                        case 0x0A: return '\\n';
                        case 0x0B: return '\\v';
                        case 0x0C: return '\\f';
                        case 0x0D: return '\\r';
                        case 0x1B: return '\\e';
                        default: return '.';
                    }
                })
                .join('');
            
            // Create offset (address)
            const offset = i.toString(16).padStart(8, '0').toUpperCase();
            
            // Format line with consistent spacing
            const line = `${prefix}${offset}: ${paddedHex} |${asciiChars}|`;
            
            // Add error indicator if this dump contains error data
            if (hasError) {
                lines.push(`${line} << ERROR`);
            } else {
                lines.push(line);
            }
        }
        
        return lines.join('\n');
    }

    /**
     * Creates a clean summary of communication data for console output.
     * Shows just the essential information without cluttering the debug console.
     */
    public createDataSummary(data: Buffer | string, direction: 'SENT' | 'RECEIVED'): string {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const dataString = buffer.toString('utf8');
        
        // Clean up the string for display (remove excessive whitespace, newlines)
        const cleanString = dataString.replace(/\s+/g, ' ').trim();
        
        // Truncate if too long
        const maxLength = 200;
        const displayString = cleanString.length > maxLength 
            ? cleanString.substring(0, maxLength) + '...'
            : cleanString;
        
        return `${direction} (${buffer.length} bytes): ${displayString}`;
    }

    /**
     * Creates a compact hex dump for debug console output.
     * Shows 64 bytes per line with hex values and ASCII representation in 3-line format.
     * Format: 
     * Position: 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C 1D 1E 1F 20 21 22 23 24 25 26 27 28 29 2A 2B 2C 2D 2E 2F 30 31 32 33 34 35 36 37 38 39 3A 3B 3C 3D 3E 3F
     * Hex:      7B 22 6A 73 6F 6E 72 70 63 22 3A 22 32 2E 30 22 2C 22 6D 65 74 68 6F 64 22 3A 22 69 6E 69 74 69 61 6C 69 7A 65 22 2C 22 70 61 72 61 6D 73 22 3A 7B 22 63 6C 69 65 6E 74 4E 61 6D 65 22 3A 22
     * ASCII:    {  "  j  s  o  n  r  p  c  "  :  "  2  .  0  "  ,  "  m  e  t  h  o  d  "  :  "  i  n  i  t  i  a  l  i  z  e  "  ,  "  p  a  r  a  6  :  {  "  c  l  i  e  n  t  N  a  m  e  "  :  "
     */
    public createCompactHexDump(data: Buffer | string, direction: 'SENT' | 'RECV'): string {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const lines: string[] = [];
        const bytesPerLine = 64; // 64 bytes per line as requested
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const slice = buffer.slice(i, i + bytesPerLine);
            
            // Create position line (00 01 02 03 ...)
            const positions = Array.from(slice, (_, index) => 
                (i + index).toString(16).padStart(2, '0').toUpperCase()
            ).join(' ');
            
            // Create hex representation with spaces
            const hexBytes = Array.from(slice)
                .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
            
            // Create ASCII representation with escape sequences for control characters
            const asciiChars = Array.from(slice)
                .map(byte => {
                    if (byte >= 32 && byte <= 126) {
                        return String.fromCharCode(byte).padEnd(3, ' '); // Pad to 3 chars for alignment
                    }
                    // Show escape sequences for common control characters
                    switch (byte) {
                        case 0x07: return '\\a '; // bell
                        case 0x08: return '\\b '; // backspace
                        case 0x09: return '\\t '; // tab
                        case 0x0A: return '\\n '; // newline
                        case 0x0B: return '\\v '; // vertical tab
                        case 0x0C: return '\\f '; // form feed
                        case 0x0D: return '\\r '; // carriage return
                        case 0x1B: return '\\e '; // escape
                        default: return '   '; // 3 spaces for non-printable
                    }
                })
                .join('');
            
            // Add the three-line format with proper alignment
            lines.push(''); // Empty line to separate blocks
            lines.push(`${direction}: ${positions}`);
            lines.push(`      ${hexBytes}`);
            lines.push(`      ${asciiChars}`);
        }
        
        return lines.join('\n');
    }

    /**
     * Constructor.
     */
    constructor() {
        super();
        this.socket = new Socket();
        this.setupSocketHandlers();
        this.initConversationLog();
        // ASSERTIONs and LOGPOINTs are realized client-side via ordinary PC
        // breakpoints (like CSpect) and therefore work with this server.
        // WPMEM needs memory watchpoints which the trs80gp server does not
        // offer (yet) - see design/Trs80GpServerTodo.md.
        this.supportsASSERTION = true;
        this.supportsLOGPOINT = true;
        this.supportsWPMEM = false;
    }

    /**
     * Initialize the conversation log file for protocol debugging.
     * Creates a binary log file with timestamp that can be analyzed with hex dumpers.
     */
    private initConversationLog(): void {
        try {
            // Create log filename with timestamp.
            // Note: written to the OS temp dir, NOT the workspace (would pollute the user's project).
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.conversationLogPath = path.join(os.tmpdir(), `trs80gp-conversation-${timestamp}.log`);
            
            // Create the log file
            this.conversationLogFile = fs.openSync(this.conversationLogPath, 'w');
            
            // Write header with session information
            const header = `trs80gp Protocol Conversation Log\nSession started: ${new Date().toISOString()}\n\n`;
            fs.writeSync(this.conversationLogFile, Buffer.from(header, 'utf8'));
            
            console.log(`[trs80gp] Conversation log initialized: ${this.conversationLogPath}`);
        } catch (error) {
            console.warn(`[trs80gp] Failed to initialize conversation log: ${error.message}`);
            this.conversationLogFile = undefined;
            this.conversationLogPath = undefined;
        }
    }

    /**
     * Log protocol data to the conversation log file.
     * Records raw data with timestamp and direction markers for analysis.
     */
    public logToConversationFile(data: Buffer, direction: 'SEND' | 'RECV'): void {
        if (!this.conversationLogFile) {
            return;
        }
        
        try {
            const timestamp = new Date().toISOString();
            const header = `\n=== ${direction} ${timestamp} (${data.length} bytes) ===\n`;
            
            // Write header
            fs.writeSync(this.conversationLogFile, Buffer.from(header, 'utf8'));
            
            // Write raw data
            fs.writeSync(this.conversationLogFile, data);
            
            // Write separator
            fs.writeSync(this.conversationLogFile, Buffer.from('\n', 'utf8'));
            
            // Ensure data is written to disk
            fs.fsyncSync(this.conversationLogFile);
        } catch (error) {
            console.warn(`[trs80gp] Failed to write to conversation log: ${error.message}`);
        }
    }

    /**
     * Close the conversation log file.
     */
    private closeConversationLog(): void {
        if (this.conversationLogFile) {
            try {
                const footer = `\nSession ended: ${new Date().toISOString()}\n`;
                fs.writeSync(this.conversationLogFile, Buffer.from(footer, 'utf8'));
                fs.closeSync(this.conversationLogFile);
                console.log(`[trs80gp] Conversation log closed: ${this.conversationLogPath}`);
            } catch (error) {
                console.warn(`[trs80gp] Failed to close conversation log: ${error.message}`);
            } finally {
                this.conversationLogFile = undefined;
                this.conversationLogPath = undefined;
            }
        }
    }

    /**
     * Set up socket event handlers.
     */
    private setupSocketHandlers(): void {
        this.socket.on('connect', () => {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] [trs80gp] Socket connected successfully`);
            this.emit('debug_console', `[${timestamp}] Connected to trs80gp emulator`);
        });

        this.socket.on('data', (data: Buffer) => {
            this.handleSocketData(data);
        });

        this.socket.on('error', (err: Error) => {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] [trs80gp] Socket error: ${err.message}`);
            this.emit('debug_console', `[${timestamp}] Socket error: ${err.message}`);
            this.emit('warning', `[${timestamp}] trs80gp connection error: ${err.message}`);
        });

        this.socket.on('close', () => {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] [trs80gp] Socket closed`);
            this.emit('debug_console', `[${timestamp}] Disconnected from trs80gp emulator`);
        });
    }



    /**
     * Convert Buffer to string while filtering illegal characters during conversion.
     * This prevents issues with invalid UTF-8 sequences like 0xFF being converted to replacement characters.
     */
    private bufferToCleanString(buffer: Buffer): string {
        const timestamp = getTimestamp();
        let cleanedStr = '';
        let illegalChars: Array<{byte: number, position: number, hex: string}> = [];
        
        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];
            
            // Define legal JSON byte values:
            // - Printable ASCII: 32-126 (space through tilde)
            // - Control characters that are legal in JSON: \t (9), \n (10), \r (13)
            // - Valid UTF-8 start bytes and continuation bytes
            const isLegalJsonByte = (
                (byte >= 32 && byte <= 126) ||  // Printable ASCII
                byte === 9 ||   // \t
                byte === 10 ||  // \n  
                byte === 13 ||  // \r
                // For UTF-8, we allow valid start bytes and continuation bytes
                // But specifically exclude problematic values like 0xFF
                (byte >= 0xC2 && byte <= 0xF4) ||  // Valid UTF-8 start bytes
                (byte >= 0x80 && byte <= 0xBF)     // UTF-8 continuation bytes
                // Note: This excludes 0x80-0x9F (invalid in UTF-8) and 0xFF (invalid UTF-8)
            );
            
            if (isLegalJsonByte) {
                cleanedStr += String.fromCharCode(byte);
            } else {
                const hex = byte.toString(16).padStart(2, '0').toUpperCase();
                illegalChars.push({
                    byte: byte,
                    position: i,
                    hex: hex
                });
            }
        }
        
        // Log warnings if illegal bytes were found
        if (illegalChars.length > 0) {
            this.emit('debug_console', `[${timestamp}] WARNING: ${illegalChars.length} illegal bytes found in received data, filtered`);
            for (const illegal of illegalChars) {
                LogTransport.log(`TRS-80: Removed illegal byte at position ${illegal.position}: 0x${illegal.hex} (${illegal.byte})`);
            }
        }
        
        return cleanedStr;
    }

    /**
     * Handle incoming socket data and parse JSON-RPC messages.
     */
    private handleSocketData(data: Buffer): void {
        const timestamp = getTimestamp();
        
        // Convert buffer to string while filtering illegal characters during conversion
        const dataString = this.bufferToCleanString(data);
        
        // Log to conversation file for protocol debugging
        this.logToConversationFile(data, 'RECV');
        
        // Wire-level logging goes to the transport log only (enable via
        // launch.json "log": {"transport": ...}), not to the debug console.
        LogTransport.log(`TRS-80 RECV (${data.length} bytes): ${dataString.trimEnd()}`);

        this.dataBuffer += dataString;
        
        // Process complete JSON-RPC messages (newline-delimited)
        let newlineIndex;
        while ((newlineIndex = this.dataBuffer.indexOf('\n')) !== -1) {
            const messageStr = this.dataBuffer.substring(0, newlineIndex).trim();
            this.dataBuffer = this.dataBuffer.substring(newlineIndex + 1);
            
            if (messageStr.length > 0) {
                try {
                    const message: JsonRpcMessage = JSON.parse(messageStr);
                    this.handleJsonRpcMessage(message);
                } catch (err) {
                    // The real trs80gp server (development build) sends some
                    // malformed JSON lines (verified live):
                    // - The 'stopped' notification misses the final '}'.
                    // - The setBreakpoints response for >1 breakpoints is garbled.
                    // Try to repair; otherwise salvage the request id so the
                    // pending request does not hang until timeout.
                    const repaired = this.tryRepairJsonLine(messageStr);
                    if (repaired) {
                        LogTransport.log(`TRS-80: Repaired malformed JSON-RPC line from server.`);
                        this.handleJsonRpcMessage(repaired);
                    }
                    else {
                        const idMatch = messageStr.match(/"id"\s*:\s*(\d+)/);
                        const id = idMatch ? parseInt(idMatch[1]) : undefined;
                        const pendingReq = (id !== undefined) ? this.pendingRequests.get(id) : undefined;
                        if (pendingReq) {
                            // Resolve with an empty result: the payload of e.g. the
                            // setBreakpoints response is not used by the client.
                            this.pendingRequests.delete(id!);
                            LogTransport.log(`TRS-80: Unparseable JSON-RPC response (id ${id}), resolved without payload: ${messageStr.substring(0, 120)}`);
                            pendingReq.resolve({});
                        }
                        else {
                            this.emit('debug_console', `[${timestamp}] Failed to parse JSON-RPC message: ${messageStr}`);
                            LogTransport.log(this.createJsonParseErrorDisplay(messageStr, err));
                        }
                    }
                }
            }
        }
    }

    /**
     * Handle a parsed JSON-RPC message.
     */
    private handleJsonRpcMessage(message: JsonRpcMessage): void {
        const timestamp = getTimestamp();
        if (message.id !== undefined) {
            // This is a response to a request we sent
            const pending = this.pendingRequests.get(message.id as number);
            if (pending) {
                this.pendingRequests.delete(message.id as number);
                if (message.error) {
                    LogTransport.log(`TRS-80: Error response (id ${message.id}): ${JSON.stringify(message.error)}`);
                    pending.reject(new Error(`JSON-RPC error ${message.error.code}: ${message.error.message}`));
                } else {
                    LogTransport.log(`TRS-80: Response (id ${message.id}): ${JSON.stringify(message.result)}`);
                    pending.resolve(message.result);
                }
            } else {
                this.emit('debug_console', `[${timestamp}] No pending request found for id: ${message.id}`);
            }
        } else if (message.method) {
            // This is a notification/event from the emulator
            LogTransport.log(`TRS-80: Notification: ${message.method}`);
            this.handleTrs80GpNotification(message.method, message.params);
        }
    }

    /**
     * Tries to repair a malformed JSON line from the server by appending
     * missing closing braces/brackets (the known server bug truncates the
     * final '}' of the 'stopped' notification).
     * @returns The parsed message or undefined if unrepairable.
     */
    protected tryRepairJsonLine(line: string): JsonRpcMessage | undefined {
        let attempt = line;
        for (let i = 0; i < 3; i++) {
            attempt += '}';
            try {
                return JSON.parse(attempt);
            } catch {
                // Try with one more brace
            }
        }
        return undefined;
    }


    /**
     * Handle notifications from the trs80gp emulator.
     * Subclasses can override this method to handle model-specific notifications.
     */
    protected handleTrs80GpNotification(method: string, params: any): void {
        switch (method) {
            case 'stopped':
                // The real trs80gp server sends:
                // {"method":"stopped","params":{"reason":"breakpoint","address":...}}
                this.handleStoppedNotification(params);
                break;
            case 'paused':
                this.handleStoppedNotification({...params, reason: params?.reason ?? 'pause'});
                break;
            case 'breakpoint':
                this.handleStoppedNotification({...params, reason: 'breakpoint'});
                break;
            default:
                this.emit('debug_console', `Unknown trs80gp notification: ${method}`);
        }
    }


    /**
     * Handles a stop of the emulated CPU (breakpoint hit, pause, ...) and
     * feeds it into DeZog's continue/step machinery (funcContinueResolve).
     */
    protected handleStoppedNotification(params: any): void {
        // Parse address (may arrive as number or as "0x..." string)
        let addr64k = params?.address;
        if (typeof addr64k === 'string')
            addr64k = parseInt(addr64k, addr64k.startsWith('0x') ? 16 : 10);
        if (typeof addr64k !== 'number' || isNaN(addr64k))
            addr64k = undefined;

        // Map the reason:
        // - Stop at a temporary step breakpoint -> NO_REASON. DeZog's
        //   evalBpConditionAndLog then treats it as "temporary breakpoint hit"
        //   and breaks (a BREAKPOINT_HIT at an address without a registered
        //   breakpoint would silently continue instead).
        // - Stop at a real breakpoint -> BREAKPOINT_HIT (conditions/logpoints get evaluated).
        // - Everything else (pause etc.) -> MANUAL_BREAK.
        const reason = params?.reason;
        let reasonNumber = BREAK_REASON_NUMBER.MANUAL_BREAK;
        if (reason === 'breakpoint' && addr64k !== undefined) {
            const isTmpStepBp = this.tmpStepBps.includes(addr64k & 0xFFFF);
            const isPermanentBp = [...this.permanentBps.values()].includes(addr64k & 0xFFFF);
            reasonNumber = (isTmpStepBp && !isPermanentBp)
                ? BREAK_REASON_NUMBER.NO_REASON
                : BREAK_REASON_NUMBER.BREAKPOINT_HIT;
        }

        // The temporary step breakpoints are consumed by this stop
        this.tmpStepBps = [];

        const longAddr = (addr64k !== undefined) ? Z80Registers.createLongAddress(addr64k & 0xFFFF) : 0;

        // Hand over to the pending continue/step promise
        if (this.funcContinueResolve) {
            const continueHandler = this.funcContinueResolve;
            this.funcContinueResolve = undefined;
            (async () => {
                await continueHandler({reasonNumber, longAddr, reasonString: undefined as any});
            })();
        }
        else {
            this.emit('debug_console', `trs80gp stopped (${reason ?? 'unknown'}) without pending continue`);
        }
    }

    /**
     * Send a JSON-RPC request to trs80gp and return a promise for the response.
     */
    protected sendTrs80GpJsonRpcRequest(method: string, params?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            const message: JsonRpcMessage = {
                jsonrpc: '2.0',
                method,
                params,
                id
            };

            const messageStr = JSON.stringify(message) + '\n';
            const messageBuffer = Buffer.from(messageStr, 'utf8');

            const timestamp = getTimestamp();

            // Log to conversation file for protocol debugging
            this.logToConversationFile(messageBuffer, 'SEND');

            // Wire-level logging goes to the transport log only, not to the
            // debug console.
            LogTransport.log(`TRS-80 SEND: ${messageStr.trimEnd()}`);

            this.pendingRequests.set(id, {resolve, reject});
            this.socket.write(messageBuffer);

            // Set a timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    console.log(`[${timestamp}] [trs80gp] Request timeout for method: ${method}, id: ${id}`);
                    this.emit('debug_console', `[${timestamp}] Request timeout for method: ${method}, id: ${id}`);
                    reject(new Error(`trs80gp JSON-RPC request timeout for method: ${method}`));
                }
            }, 5000); // 5 second timeout
        });
    }

    /**
     * Connect to trs80gp emulator with intelligent port allocation.
     */
    /**
     * Connects to the trs80gp emulator (or mock server) at the given port.
     * The emulator/mock must already be listening there. Retries until
     * 'socketTimeout' expires because the emulator needs a moment to open
     * its remote-debug port after being launched.
     */
    public async connectSocket(port: number): Promise<void> {
        const hostname = Settings.launch.trs80?.hostname || 'localhost';
        const timeoutSecs = Settings.launch.trs80?.socketTimeout || 5;
        const endTime = Date.now() + timeoutSecs * 1000;
        let lastError: Error | undefined;
        for (;;) {
            try {
                await this.tryConnect(hostname, port);
                LogTransport.log(`TRS-80: Connected to ${hostname}:${port}`);
                return;
            }
            catch (err) {
                lastError = err;
                if (Date.now() >= endTime)
                    break;
                // Wait a little and retry
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
        throw new Error(`Could not connect to trs80gp at ${hostname}:${port} within ${timeoutSecs}s: ${lastError?.message}`);
    }


    /**
     * A single connect attempt. Creates a fresh socket (a failed connect
     * leaves the old socket unusable) and installs the protocol handlers.
     */
    protected tryConnect(hostname: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = new Socket();
            const onError = (err: Error) => {
                socket.destroy();
                reject(err);
            };
            socket.once('error', onError);
            socket.connect(port, hostname, () => {
                // Success: keep this socket, remove the temporary error handler
                // and install the permanent protocol handlers.
                socket.removeListener('error', onError);
                this.socket = socket;
                this.setupSocketHandlers();
                resolve();
            });
        });
    }

    /**
     * Override.
     * Initializes the machine.
     * When ready it emits this.emit('initialized') or this.emit('error', Error(...));
     * The successful emit takes place in 'onConnect' which should be called
     * by 'doInitialization' after a successful connect.
     */
    public async doInitialization(): Promise<void> {
        try {
            // Decide whether to use the real emulator or the mock server
            this.useMockServer = this.determineUseMockServer();

            // Determine the port. If we launch the emulator/mock ourselves the
            // configured port must still be free - otherwise pick another one
            // BEFORE launching, so that launcher and socket use the same port.
            const trs80Cfg = Settings.launch.trs80;
            let port = trs80Cfg?.port || 49152;
            const autoStart = this.useMockServer || (trs80Cfg?.emulator?.autoStart !== false);
            if (autoStart) {
                const isFree = await PortManager.isPortAvailable(port);
                if (!isFree) {
                    const altPort = await PortManager.findAvailablePort(port);
                    this.emit('warning', `trs80gp: Port ${port} is busy, using ${altPort} instead.`);
                    port = altPort;
                    if (trs80Cfg)
                        trs80Cfg.port = port;	// The launcher reads the port from the settings
                }
            }
            this.allocatedPort = port;

            // Launch the emulator or the mock server
            if (this.useMockServer) {
                this.mockServerLauncher = new Trs80MockServerLauncher(port);
                await this.mockServerLauncher.start();
                LogTransport.log(`TRS-80: Mock server started on port ${port}`);
            }
            else {
                this.emulatorLauncher = new Trs80EmulatorLauncher();
                await this.emulatorLauncher.launchEmulator();	// No-op if autoStart is false
            }

            // Connect to the emulator/mock (retries internally until timeout)
            await this.connectSocket(port);

            // Initialize the remote (sends init command and emits 'initialized' on success)
            await this.onConnect();
        } catch (err) {
            this.emit('debug_console', `trs80gp initialization failed: ${err.message}`);
            this.emit('error', err);
        }
    }


    /**
     * Decides whether to use the mock server or the real trs80gp emulator:
     * - trs80.useMock === true: always the mock server.
     * - An existing emulator executable (toolsPaths.trs80gp or trs80.emulator.path): the real emulator.
     * - useMock === false without a valid emulator: error.
     * - Otherwise: fall back to the mock server.
     * Side effect: writes the resolved absolute emulator path back into the settings
     * so that the launcher uses the same path.
     */
    protected determineUseMockServer(): boolean {
        const trs80Cfg = Settings.launch.trs80;
        if (trs80Cfg?.useMock === true) {
            LogTransport.log('TRS-80: Using mock server (useMock=true)');
            return true;
        }

        // Resolve the emulator path. toolsPaths.trs80gp takes precedence.
        const toolsPaths = (Settings.launch as any).toolsPaths;
        const configuredPath = toolsPaths?.trs80gp || trs80Cfg?.emulator?.path;
        if (configuredPath) {
            const absPath = Utility.getAbsFilePath(configuredPath, Settings.launch.rootFolder);
            if (fs.existsSync(absPath)) {
                // Write the absolute path back so the launcher uses it
                if (trs80Cfg) {
                    if (trs80Cfg.emulator)
                        trs80Cfg.emulator.path = absPath;
                    else
                        trs80Cfg.emulator = {path: absPath, model: 1};
                }
                LogTransport.log(`TRS-80: Using real emulator: ${absPath}`);
                return false;
            }
            LogTransport.log(`TRS-80: Emulator not found at: ${absPath}`);
        }

        if (trs80Cfg?.useMock === false)
            throw new Error("useMock=false but no valid emulator found. Check 'toolsPaths.trs80gp' or 'trs80.emulator.path' in launch.json.");

        LogTransport.log('TRS-80: Using mock server (no emulator path configured/found)');
        return true;
    }

    //---- DZRP Protocol Implementation ----

    /**
     * Call this from 'doInitialization' when a successful connection
     * has been opened to the Remote.
     * @emits this.emit('initialized') or this.emit('error', Error(...))
     */
    protected async onConnect(): Promise<void> {
        try {
            // Send the init command using the JSON-RPC protocol
            const result = await this.sendDzrpCmdInit();
            LogTransport.log(`TRS-80: Init command result: ${JSON.stringify(result)}`);
            if (result.error) {
                throw new Error(result.error);
            }

            // Initialize the Z80 registers decoder for TRS-80
            Z80Registers.decoder = this.createZ80RegistersDecoder();

            // Initialize the memory model based on machine type
            this.createAndInitializeMemoryModel(result.machineType);

            // Load the binary file (CMD file for TRS-80) if specified
            await this.load();

            // Emit 'initialized' event which the system is waiting for
            this.emit('initialized', `${result.programName} initialized`);

        } catch (err) {
            this.emit('debug_console', `Connection initialization failed: ${err.message}`);
            this.emit('error', err);
        }
    }

    /**
     * Override to create the appropriate Z80 registers decoder for TRS-80.
     */
    protected createZ80RegistersDecoder(): any {
        // Return the standard decoder for TRS-80
        return new Z80RegistersStandardDecoder();
    }

    /**
     * Create and initialize the appropriate memory model based on machine type.
     */
    protected createAndInitializeMemoryModel(machineType: DzrpMachineType): void {
        console.log(`[trs80gp] Creating memory model for machine type: ${machineType}`);
        
        // Create the appropriate memory model based on machine type
        switch (machineType) {
            case DzrpMachineType.TRS80_MODEL1:
                this.memoryModel = new MemoryModelTrs80Model1();
                console.log('[trs80gp] Created MemoryModelTrs80Model1');
                break;
            case DzrpMachineType.TRS80_MODEL3:
                this.memoryModel = new MemoryModelTrs80Model3();
                console.log('[trs80gp] Created MemoryModelTrs80Model3');
                break;
            default:
                // Default to Model 1 for unknown types
                console.log(`[trs80gp] Unknown machine type ${machineType}, defaulting to Model 1`);
                this.memoryModel = new MemoryModelTrs80Model1();
                break;
        }
        
        // Initialize the memory model - this sets up funcCreateLongAddress and funcGetSlotFromAddress
        console.log('[trs80gp] Calling memoryModel.init()');
        this.memoryModel.init();
        console.log('[trs80gp] Memory model initialization completed');
    }

    // Add DzrpMachineType reference for convenience
    protected get DzrpMachineType() {
        return DzrpMachineType;
    }

    /**
     * Disconnect from trs80gp emulator.
     */
    public async disconnect(): Promise<void> {
        if (this.socket) {
            this.socket.destroy();
        }
        // Close conversation log file
        this.closeConversationLog();
        // Terminate emulator / stop mock server if we launched it
        if (this.emulatorLauncher) {
            await this.emulatorLauncher.terminateEmulator();
            this.emulatorLauncher = undefined;
        }
        if (this.mockServerLauncher) {
            this.mockServerLauncher.stop();
            this.mockServerLauncher = undefined;
        }
    }

    /**
     * Initialize the connection to trs80gp.
     * Subclasses should override this to provide model-specific machine type.
     */
    public async sendDzrpCmdInit(): Promise<{error: string | undefined; programName: string; dzrpVersion: string; machineType: DzrpMachineType}> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('initialize', {
                clientName: 'DeZog',
                version: '1.0.0'
            });
            
            return {
                error: undefined,
                programName: result?.programName || 'trs80gp',
                dzrpVersion: result?.version || '1.0.0',
                machineType: this.getTrs80GpMachineType()
            };
        } catch (err) {
            return {
                error: `Failed to initialize trs80gp connection: ${err.message}`,
                programName: 'trs80gp',
                dzrpVersion: '1.0.0',
                machineType: this.getTrs80GpMachineType()
            };
        }
    }

    /**
     * Get the DZRP machine type for this TRS-80 model.
     * Must be implemented by subclasses.
     */
    protected abstract getTrs80GpMachineType(): DzrpMachineType;

    /**
     * Get all CPU registers (common Z80 functionality).
     */
    public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('getRegisters');
            if (result) {
                const regData = this.convertTrs80GpRegistersToDeZog(result);
                this.emitTrs80GpRegisterData(result);
                return regData;
            }
            return this.convertTrs80GpRegistersToDeZog(undefined);
        } catch (err) {
            throw new Error(`Failed to get registers from trs80gp: ${err.message}`);
        }
    }

    /**
     * Convert trs80gp register format to DeZog format.
     * Subclasses can override this for model-specific register handling.
     * 
     * This method handles both scenarios:
     * 1. When 16-bit registers are present in the emulator response
     * 2. When only 8-bit registers are present, constructing 16-bit values from 8-bit components
     */
    protected convertTrs80GpRegistersToDeZog(registers: any): Uint16Array {
        // Z80_REG.IM(13) + 1 + slotCount(1) + slots
        // The slots MUST match the memory model's initialSlots: the label
        // parser computes long addresses via initialSlots, and the decoder
        // computes them from these slot values - both must agree or no
        // address would ever match a source line.
        const initialSlots = this.memoryModel?.initialSlots || [0];
        const regData = new Uint16Array(15 + initialSlots.length);
        regData[14] = initialSlots.length;
        for (let i = 0; i < initialSlots.length; i++)
            regData[15 + i] = initialSlots[i];

        if (!registers) {
            return regData;
        }

        // Get the register format from configuration
        const registerFormat = Settings.launch.trs80?.registerFormat || 'hex';
        
        // Parse register values based on the configured format
        const parseRegisterValue = (value: any): number => {
            if (typeof value === 'number') {
                return value;
            }
            
            if (typeof value === 'string') {
                if (registerFormat === 'hex') {
                    // Parse as hexadecimal (supports "0x" prefix or plain hex)
                    return parseInt(value.replace(/^0x/i, ''), 16) || 0;
                } else {
                    // Parse as decimal
                    return parseInt(value, 10) || 0;
                }
            }
            
            return 0;
        };

        // Helper function to build 16-bit register from 8-bit components if needed
        const get16BitRegister = (reg16Name: string, highReg: string, lowReg: string, altName?: string): number => {
            // First try to get the 16-bit register directly
            if (registers[reg16Name] !== undefined) {
                return parseRegisterValue(registers[reg16Name]);
            }
            
            // Try alternative name (e.g., AF_ instead of AF2)
            if (altName && registers[altName] !== undefined) {
                return parseRegisterValue(registers[altName]);
            }
            
            // If 16-bit register not available, construct from 8-bit components
            const high = parseRegisterValue(registers[highReg]);
            const low = parseRegisterValue(registers[lowReg]);
            
            // Only build if both components are available
            if (registers[highReg] !== undefined && registers[lowReg] !== undefined) {
                return (high << 8) | low;
            }
            
            return 0;
        };

        // Standard Z80 register mapping according to Z80_REG enum
        // PC=0, SP=1, AF=2, BC=3, DE=4, HL=5, IX=6, IY=7, AF2=8, BC2=9, DE2=10, HL2=11, IR=12, IM=13
        regData[0] = parseRegisterValue(registers.PC);      // PC
        regData[1] = parseRegisterValue(registers.SP);      // SP
        
        // Handle composite 16-bit registers - try 16-bit first, fall back to 8-bit construction
        regData[2] = get16BitRegister('AF', 'A', 'F');      // AF
        regData[3] = get16BitRegister('BC', 'B', 'C');      // BC  
        regData[4] = get16BitRegister('DE', 'D', 'E');      // DE
        regData[5] = get16BitRegister('HL', 'H', 'L');      // HL
        regData[6] = parseRegisterValue(registers.IX);      // IX
        regData[7] = parseRegisterValue(registers.IY);      // IY
        
        // Handle alternate registers - try different naming conventions
        regData[8] = get16BitRegister('AF2', 'A2', 'F2', 'AF_');  // AF'
        regData[9] = get16BitRegister('BC2', 'B2', 'C2', 'BC_');  // BC'
        regData[10] = get16BitRegister('DE2', 'D2', 'E2', 'DE_'); // DE'
        regData[11] = get16BitRegister('HL2', 'H2', 'L2', 'HL_'); // HL'
        
        // Handle I and R registers - they might be separate or combined
        const iValue = parseRegisterValue(registers.I);
        const rValue = parseRegisterValue(registers.R);
        regData[12] = (iValue << 8) | rValue;  // IR combined
        
        // IM register
        regData[13] = parseRegisterValue(registers.IM);
        
        // Slot data was already set from the memory model's initialSlots above.
        return regData;
    }

    /**
     * Emit register data for DeZog.
     * Subclasses can override this for model-specific handling.
     */
    protected emitTrs80GpRegisterData(registers: any): void {
        this.emit('received-register-data', registers);
    }

    /**
     * Set a CPU register (common Z80 functionality).
     */
    public async sendDzrpCmdSetRegister(regIndex: number, value: number): Promise<void> {
        // Note: the current trs80gp build (development build) announces
        // supportssetRegisterRequest but rejects every parameter format tried
        // so far with {"error":"something wrong"} (verified live 2026-07-13,
        // see design/Trs80GpProtocol.md). Try anyway, but give a clear message.
        try {
            await this.sendTrs80GpJsonRpcRequest('setRegister', {
                register: this.getTrs80GpRegisterName(regIndex),
                value: '0x' + value.toString(16)
            });
        } catch (err) {
            throw new Error(`Setting registers is not supported by this trs80gp build (server said: ${err.message})`);
        }
    }

    /**
     * Map DeZog register index to TRS-80 register name (common Z80 functionality).
     * Subclasses can override this if they have model-specific register mappings.
     */
    protected getTrs80GpRegisterName(regIndex: number): string {
        const registerMap: {[key: number]: string} = {
            0: 'A',
            1: 'F',
            2: 'B',
            3: 'C',
            4: 'D',
            5: 'E',
            6: 'H',
            7: 'L',
            8: 'IX',
            9: 'IY',
            10: 'SP',
            11: 'PC'
        };
        
        return registerMap[regIndex] || 'A';
    }

    /**
     * Continue execution.
     * bp1Addr64k/bp2Addr64k are the temporary breakpoints DeZog uses to
     * implement step-over/step-out (see DzrpRemote.calcStepBp). The trs80gp
     * server has no native step-over, so they are realized as ordinary
     * breakpoints that are added for this run only.
     */
    public async sendDzrpCmdContinue(bp1Addr64k?: number, bp2Addr64k?: number): Promise<void> {
        try {
            // Set the temporary step breakpoints (replaces previous ones)
            this.tmpStepBps = [];
            if (bp1Addr64k !== undefined && bp1Addr64k >= 0)
                this.tmpStepBps.push(bp1Addr64k & 0xFFFF);
            if (bp2Addr64k !== undefined && bp2Addr64k >= 0)
                this.tmpStepBps.push(bp2Addr64k & 0xFFFF);
            await this.syncBreakpoints();
            await this.sendTrs80GpJsonRpcRequest('continue');
        } catch (err) {
            throw new Error(`Failed to continue execution in trs80gp: ${err.message}`);
        }
    }


    /**
     * Sends the complete current breakpoint list (permanent + temporary step
     * breakpoints) to the emulator. The trs80gp protocol only supports
     * replacing the whole list ('setBreakpoints'), not adding/removing
     * individual breakpoints.
     */
    protected async syncBreakpoints(): Promise<void> {
        const addresses = new Set<number>(this.permanentBps.values());
        for (const addr of this.tmpStepBps)
            addresses.add(addr);
        // Server bug (verified live): 'setBreakpoints' with an EMPTY list is
        // ignored - the old breakpoints stay armed. Replacing with a
        // non-empty list works correctly. So clearing is done by replacing
        // with a single dummy breakpoint at 0xFFFF (never executed).
        if (addresses.size === 0)
            addresses.add(0xFFFF);
        const breakpoints = [...addresses].map(address => ({address: '0x' + address.toString(16)}));
        await this.sendTrs80GpJsonRpcRequest('setBreakpoints', {breakpoints});
    }


    /**
     * Adds a single breakpoint (DeZog/DZRP semantics) by re-sending the whole list.
     * Sets bp.bpId (0 would mean 'unverified').
     */
    protected async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
        const addr64k = bp.longAddress & 0xFFFF;
        bp.bpId = ++this.bpIdCounter;
        this.permanentBps.set(bp.bpId, addr64k);
        try {
            await this.syncBreakpoints();
        } catch (err) {
            // Roll back and mark as unverified
            this.permanentBps.delete(bp.bpId);
            bp.bpId = 0;
            throw new Error(`Failed to set breakpoint in trs80gp: ${err.message}`);
        }
    }


    /**
     * Removes a single breakpoint by re-sending the whole list.
     */
    protected async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
        if (bp.bpId && this.permanentBps.delete(bp.bpId)) {
            await this.syncBreakpoints();
        }
    }

    /**
     * Pause execution.
     * Note: the real trs80gp server answers with {"status":"paused"} but does
     * NOT send a 'stopped' notification (verified live). DeZog's continue
     * promise is resolved via funcContinueResolve, so the stop is synthesized
     * here after the successful response.
     */
    public async sendDzrpCmdPause(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('pause');
            // Synthesize the missing stop notification. Harmless if a real
            // 'stopped' notification arrives too: the first call consumes
            // funcContinueResolve, the second finds none.
            this.handleStoppedNotification({reason: 'pause'});
        } catch (err) {
            throw new Error(`Failed to pause execution in trs80gp: ${err.message}`);
        }
    }

    /**
     * Step into (single step) (common Z80 functionality).
     */
    public async sendDzrpCmdStepInto(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('stepInto');
        } catch (err) {
            throw new Error(`Failed to step into in trs80gp: ${err.message}`);
        }
    }

    // Note: there is deliberately no sendDzrpCmdStepOver. The real trs80gp
    // server does not implement the 'stepOver' JSON-RPC method (only the mock
    // does). Step-over is realized client-side by DzrpRemote.stepOver() via
    // temporary breakpoints passed to sendDzrpCmdContinue(bp1, bp2).

    /**
     * Read memory block.
     * Subclasses can override this for model-specific memory mapping.
     */
    public async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
        try {
            // Note: the real trs80gp server expects 'length' (with 'size' it
            // silently returns only 1 byte) and addresses as hex strings.
            const result = await this.sendTrs80GpJsonRpcRequest('readMemory', {
                address: '0x' + address.toString(16),
                length: size
            });

            if (result && result.data) {
                // Convert hex string to Uint8Array
                const data = new Uint8Array(Buffer.from(result.data, 'hex'));
                return data;
            }
            return new Uint8Array(size);
        } catch (err) {
            throw new Error(`Failed to read memory from trs80gp: ${err.message}`);
        }
    }

    /**
     * Write memory block.
     * Subclasses can override this for model-specific memory mapping.
     */
    public async sendDzrpCmdWriteMem(address: number, data: Uint8Array): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('writeMemory', {
                address: '0x' + address.toString(16),
                data: Buffer.from(data).toString('hex')
            });
        } catch (err) {
            throw new Error(`Failed to write memory to trs80gp: ${err.message}`);
        }
    }

    /**
     * Read memory dump for stack retrieval and other debugging operations.
     * This method implements the base class requirement and delegates to sendDzrpCmdReadMem.
     * @param addr64k The 64k memory start address.
     * @param size The memory size to read.
     * @returns A promise with an Uint8Array containing the memory data.
     */
    public async readMemoryDump(addr64k: number, size: number): Promise<Uint8Array> {
        return this.sendDzrpCmdReadMem(addr64k, size);
    }

    /**
     * Set breakpoints (common Z80 functionality).
     */
    public async sendDzrpCmdSetBreakpoints(bpAddresses: number[]): Promise<number[]> {
        try {
            const breakpoints = bpAddresses.map(address => ({ address }));
            await this.sendTrs80GpJsonRpcRequest('setBreakpoints', {
                breakpoints: breakpoints
            });
            // Return the same addresses as confirmation
            return bpAddresses;
        } catch (err) {
            throw new Error(`Failed to set breakpoints in trs80gp: ${err.message}`);
        }
    }

    /**
     * Load object file.
     */
    public async sendDzrpCmdLoadObj(filePath: string): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('loadObj', {
                filePath: filePath
            });
        } catch (err) {
            throw new Error(`Failed to load object file in trs80gp: ${err.message}`);
        }
    }

    /**
     * Save object file.
     */
    public async sendDzrpCmdSaveObj(startAddress: number, endAddress: number, filePath: string, execAddress?: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('saveObj', {
                startAddress: startAddress,
                endAddress: endAddress,
                filePath: filePath,
                execAddress: execAddress
            });
        } catch (err) {
            throw new Error(`Failed to save object file in trs80gp: ${err.message}`);
        }
    }

    //---- Methods that will typically be model-specific ----

    /**
     * Get slots - will vary by model (flat memory vs banked memory).
     * Default implementation for flat memory models.
     */
    public async sendDzrpCmdGetSlots(): Promise<void> {
        // Default: flat memory, no slots
        this.emit('received-slots-data', []);
    }

    /**
     * Write memory bank - will vary by model.
     * Default implementation for flat memory models.
     */
    public async sendDzrpCmdWriteBank(bank: number, dataArray: Uint8Array): Promise<void> {
        // Default: treat as regular memory write at bank address
        const address = bank * 0x2000; // 8k banks
        await this.sendDzrpCmdWriteMem(address, dataArray);
    }

    //---- Methods not applicable to TRS-80 models ----

    public async sendDzrpCmdGetTbblueRegister(register: number): Promise<void> {
        throw new Error('TBBlue registers not supported on TRS-80 models');
    }

    public async sendDzrpCmdSetTbblueRegister(register: number, value: number): Promise<void> {
        throw new Error('TBBlue registers not supported on TRS-80 models');
    }

    public async sendDzrpCmdGetSprites(index: number, count: number): Promise<Uint8Array[]> {
        throw new Error('Sprites not supported on TRS-80 models');
    }

    public async sendDzrpCmdGetSpritePatterns(index: number, count: number): Promise<number[][]> {
        throw new Error('Sprite patterns not supported on TRS-80 models');
    }

    public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
        throw new Error('Border color not supported on TRS-80 models');
    }

    /**
     * Get the currently allocated port for this remote instance.
     * This is the port that the trs80gp emulator is listening on.
     * 
     * @returns The allocated port number, or 0 if no port is allocated
     */
    public getAllocatedPort(): number {
        // Return the port from the socket if connected, otherwise return 0
        if (this.socket && !this.socket.destroyed) {
            return this.socket.remotePort || 0;
        }
        return 0;
    }

    /**
     * Check if the default trs80gp port (49152) is available.
     * This is useful before attempting to connect to determine if the emulator 
     * is likely running on the default port.
     * 
     * @returns Promise that resolves to true if the default port is available
     */
    public async isDefaultPortAvailable(): Promise<boolean> {
        return PortManager.isDefaultPortAvailable();
    }

    /**
     * Find an available port for trs80gp emulator connection.
     * Searches from the preferred port (or default 49152) downward to find 
     * the first available port in the valid range.
     * 
     * @param preferredPort Optional preferred port to start checking from
     * @returns Promise that resolves to an available port number
     * @throws Error if no free port is found in the valid range
     */
    public async findAvailablePort(preferredPort?: number): Promise<number> {
        return PortManager.findAvailablePort(preferredPort);
    }

    /**
     * Validate that a port number is suitable for trs80gp emulator connections.
     * 
     * @param port Port number to validate
     * @returns True if the port is in the valid range for trs80gp
     */
    public static isValidTrs80GpPort(port: number): boolean {
        return PortManager.isValidTrs80GpPort(port);
    }

    /**
     * Get the default port number for trs80gp emulator (49152).
     * 
     * @returns The default port number
     */
    public static getDefaultPort(): number {
        return PortManager.getDefaultPort();
    }

    /**
     * Creates a visual error display for JSON parse errors with highlighted problematic characters.
     * Shows the error location with inverse/colored highlighting and expected content if possible.
     */
    private createJsonParseErrorDisplay(message: string, error: Error): string {
        const lines: string[] = [];
        
        // Extract position information from JavaScript JSON.parse error
        const errorMessage = error.message;
        let position = -1;
        let expectedInfo = '';
        
        // Try to extract position from error message
        const positionMatch = errorMessage.match(/position\s+(\d+)/i);
        if (positionMatch) {
            position = parseInt(positionMatch[1], 10);
        }
        
        // Extract expected information if available
        if (errorMessage.includes('Unexpected token')) {
            const tokenMatch = errorMessage.match(/Unexpected token (.+?) in JSON/);
            if (tokenMatch) {
                expectedInfo = `Unexpected token: ${tokenMatch[1]}`;
            }
        }
        
        lines.push(`JSON Parse Error: ${errorMessage}`);
        lines.push(`Message length: ${message.length} characters`);
        
        if (position >= 0 && position < message.length) {
            lines.push('');
            lines.push('Error location highlighted:');
            
            // Create hex dump with error highlighting
            const messageBuffer = Buffer.from(message, 'utf8');
            const hexErrorDisplay = this.createErrorHighlightedHexDump(messageBuffer, position);
            lines.push(hexErrorDisplay);
            
            // Create text display with error highlighting
            const textErrorDisplay = this.createErrorHighlightedText(message, position);
            lines.push('');
            lines.push('Text representation:');
            lines.push(textErrorDisplay);
            
            // Show context around the error
            const contextStart = Math.max(0, position - 20);
            const contextEnd = Math.min(message.length, position + 20);
            const context = message.substring(contextStart, contextEnd);
            const relativePos = position - contextStart;
            
            lines.push('');
            lines.push('Context (±20 chars):');
            lines.push(`"${context}"`);
            lines.push(' '.repeat(relativePos + 1) + '^-- Error here');
        }
        
        if (expectedInfo) {
            lines.push('');
            lines.push(`Expected: Valid JSON syntax`);
            lines.push(`Analysis: ${expectedInfo}`);
        }
        
        // Add suggestions based on common JSON errors
        lines.push('');
        lines.push('Common causes:');
        lines.push('• Missing quotes around string values');
        lines.push('• Trailing commas in objects/arrays');
        lines.push('• Unescaped characters in strings');
        lines.push('• Incomplete JSON message (fragmented transmission)');
        
        return lines.join('\n');
    }

    /**
     * Creates a hex dump with the error position highlighted using ANSI escape codes.
     */
    private createErrorHighlightedHexDump(buffer: Buffer, errorPosition: number): string {
        const lines: string[] = [];
        const bytesPerLine = 16;
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const slice = buffer.slice(i, i + bytesPerLine);
            const lineStart = i;
            const lineEnd = i + slice.length - 1;
            
            // Check if error position is in this line
            const hasError = errorPosition >= lineStart && errorPosition <= lineEnd;
            const errorOffset = hasError ? errorPosition - lineStart : -1;
            
            // Create hex representation with highlighting
            const hexParts: string[] = [];
            for (let j = 0; j < slice.length; j++) {
                const byte = slice[j];
                const hexStr = byte.toString(16).padStart(2, '0').toUpperCase();
                
                if (j === errorOffset) {
                    // Highlight the error byte - use ANSI inverse video
                    hexParts.push(`\x1b[7m${hexStr}\x1b[0m`);
                } else {
                    hexParts.push(hexStr);
                }
            }
            
            // Pad hex representation
            const hexLine = hexParts.join(' ').padEnd(47, ' ');
            
            // Create ASCII representation with highlighting
            const asciiParts: string[] = [];
            for (let j = 0; j < slice.length; j++) {
                const byte = slice[j];
                let char: string;
                
                if (byte >= 32 && byte <= 126) {
                    char = String.fromCharCode(byte);
                } else {
                    char = '.';
                }
                
                if (j === errorOffset) {
                    // Highlight the error character
                    asciiParts.push(`\x1b[7m${char}\x1b[0m`);
                } else {
                    asciiParts.push(char);
                }
            }
            
            const asciiLine = asciiParts.join('');
            const offset = i.toString(16).padStart(8, '0').toUpperCase();
            
            lines.push(`    ${offset}: ${hexLine} |${asciiLine}|`);
        }
        
        return lines.join('\n');
    }

    /**
     * Creates a text representation with the error position highlighted.
     */
    private createErrorHighlightedText(text: string, errorPosition: number): string {
        if (errorPosition < 0 || errorPosition >= text.length) {
            return `"${text}"`;
        }
        
        const before = text.substring(0, errorPosition);
        const errorChar = text.charAt(errorPosition);
        const after = text.substring(errorPosition + 1);
        
        // Use ANSI inverse video for highlighting
        const highlightedChar = `\x1b[7m${errorChar === '' ? ' ' : errorChar}\x1b[0m`;
        
        return `"${before}${highlightedChar}${after}"`;
    }

    /**
     * Loads a .cmd file (TRS-80 command file).
     * CMD files are the native executable format for TRS-80 systems.
     * Parses the CMD file format and loads data using JSON-RPC writeMemoryRequest.
     * 
     * Validation Strategy:
     * - BDS file is the single point of truth for addresses and symbols
     * - CMD blocks must have identical length to BDS blocks (warning if different addresses)
     * - Different content between CMD and BDS = ERROR (requires new assembly)
     * - Entry point comes from BDS, not CMD
     * 
     * Integration with Labels System:
     * - This method is called during loadObjs phase for TRS-80 systems
     * - CMD data supplements BDS debugging information 
     * - Both are needed for complete breakpoint verification
     */
    protected async loadBinCmd(filePath: string): Promise<void> {
        this.emit('debug_console', `Loading TRS-80 CMD file: ${filePath}`);

        // Parse the .cmd locally (best effort): provides the entry address
        // for stop-at-entry and feeds the Labels/breakpoint verification.
        let cmdFile: CmdFile | undefined;
        try {
            cmdFile = new CmdFile();
            cmdFile.readFile(filePath);
        } catch (err) {
            cmdFile = undefined;
            LogTransport.log(`TRS-80: .cmd parse failed: ${err.message}`);
        }

        // The session should start halted (matching the debugger UI).
        // Halting via 'pause' after 'launch' makes the emulator's frame
        // scheduler lose sync (CPU runs in extreme slow motion afterwards,
        // see design/Trs80GpServerTodo.md). A breakpoint at the entry
        // address set BEFORE 'launch' stops reliably instead. The next
        // syncBreakpoints() replaces it, so it does not linger.
        const entry = cmdFile?.transferAddress;
        const stopAtEntry = !Settings.launch.startAutomatically;
        if (stopAtEntry && entry) {
            await this.sendTrs80GpJsonRpcRequest('setBreakpoints', {
                breakpoints: [{address: '0x' + entry.toString(16)}]
            });
        }

        // Let the emulator load and start the .cmd natively via 'launch'.
        // Loading client-side through writeMemory cannot work with the
        // current server: setRegister is broken, so the entry PC could
        // never be set.
        await this.sendTrs80GpJsonRpcRequest('launch', {program: filePath});

        if (stopAtEntry && !entry) {
            // No entry address known - halt via 'pause' as a fallback,
            // accepting the frame scheduler risk.
            await this.sendDzrpCmdPause();
        }

        // Label integration, best effort - a failure must not abort the
        // session, the program is already loaded by the emulator.
        try {
            if (!cmdFile)
                throw new Error('.cmd not parseable');

            // Integrate CMD data with Labels system for breakpoint verification
            // Create CMD memory mappings for the ZmacLabelParser integration
            const cmdMappings = new Map<number, {data: Uint8Array, size: number, entryPoint?: number}>();
            for (const block of cmdFile.dataBlocks) {
                if (block.data.length > 0) {
                    cmdMappings.set(block.address, {
                        data: block.data,
                        size: block.data.length,
                        entryPoint: block.address === cmdFile.transferAddress ? cmdFile.transferAddress : undefined
                    });
                }
            }
            
            // Pass CMD data to Labels system for integration with ZmacLabelParser
            if (cmdMappings.size > 0) {
                const integrationSuccess = Labels.enableCmdIntegration(cmdMappings);
                if (integrationSuccess) {
                    console.log(`[trs80gp] CMD file data successfully integrated with Labels system for breakpoint verification`);
                } else {
                    console.log(`[trs80gp] Warning: No zmac parser available for CMD integration - breakpoint verification may be limited`);
                }
            }
            
            // Emit notification that CMD file has been processed for Labels system integration
            const memRange = cmdFile.getMemoryRange();
            if (memRange) {
                console.log(`[trs80gp] CMD file loaded successfully: ${cmdFile.getTotalDataSize()} bytes from 0x${memRange.startAddress.toString(16)} to 0x${memRange.endAddress.toString(16)}`);
                this.emit('debug_console', `CMD file loaded: ${cmdFile.getTotalDataSize()} bytes - Labels system integration complete`);
                
                // Note: With the modified startup sequence, this CMD data is now loaded before breakpoint verification
                console.log(`[trs80gp] CMD file processing complete - breakpoint verification can now proceed with complete debugging information`);
            } else {
                console.log(`[trs80gp] CMD file loaded successfully: ${cmdFile.getTotalDataSize()} bytes`);
                this.emit('debug_console', `CMD file loaded: ${cmdFile.getTotalDataSize()} bytes - Labels system integration complete`);
            }
            
        } catch (err) {
            // Non-fatal: the emulator has already loaded the program.
            console.log(`[trs80gp] CMD label integration skipped: ${err.message}`);
            this.emit('debug_console', `CMD label integration skipped: ${err.message}`);
        }
    }
}
