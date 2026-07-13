/**
 * Mock trs80gp Server
 * 
 * This implements a simple mock server that simulates the trs80gp emulator's JSON-RPC interface
 * for testing the DeZog debugger extension without requiring the actual emulator.
 */

import * as net from 'net';

interface JsonRpcMessage {
    jsonrpc: string;
    id?: number | string;
    method?: string;
    params?: any;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

interface Breakpoint {
    address: number | string;
}

interface Trs80gpState {
    // CPU Registers
    registers: {
        A: number;
        F: number;
        B: number;
        C: number;
        D: number;
        E: number;
        H: number;
        L: number;
        IX: number;
        IY: number;
        SP: number;
        PC: number;
        I: number;
        R: number;
        // Alternate registers
        AF_: number;
        BC_: number;
        DE_: number;
        HL_: number;
    };
    // Memory
    memory: Uint8Array;
    // Breakpoints
    breakpoints: Array<Breakpoint>;
    // Running state
    running: boolean;
    paused: boolean;
}

class MockTrs80gpServer {
    private server: net.Server;
    private clients: net.Socket[] = [];
    private port: number;
    private emulatorState: Trs80gpState;
    private symbolsMap: Map<string, number> = new Map();
    
    // Configuration option to simulate different register formats
    private use8BitRegistersOnly: boolean = false;
    
    // Configuration option to control how numbers are interpreted (hex vs decimal)
    // true = interpret numbers as hex (regardless of 0x prefix)
    // false = interpret numbers as decimal (unless 0x prefix is present)
    private parseNumbersAsHex: boolean = true;

    /**
     * Initialize registers with random values according to the agreed-upon rules:
     * - BC: random value between 0x0000 and 0x03FF
     * - HL: random value between 0x3C00 and 0x4FFF  
     * - DE: random value between 0x3C00 and 0x4400
     * - AF: random value between 0x0100 and 0x1111
     * - SP: high value decreased by 16 * random(0x00-0x0F)
     * - PC: keep current value (0x6000) for now (would be from BDS file)
     * - Backup registers (_) set to complement values
     */
    private initializeRegisters(): any {
        // Generate random values according to specifications
        const bc = Math.floor(Math.random() * (0x03FF - 0x0000 + 1)) + 0x0000;
        const hl = Math.floor(Math.random() * (0x4FFF - 0x3C00 + 1)) + 0x3C00;
        const de = Math.floor(Math.random() * (0x4400 - 0x3C00 + 1)) + 0x3C00;
        const af = Math.floor(Math.random() * (0x1111 - 0x0100 + 1)) + 0x0100;
        
        // SP: start high and decrease by 16 * random number between 0x00 and 0x0F
        const spDecrease = Math.floor(Math.random() * 0x10) * 16;
        const sp = 0xFFFF - spDecrease;
        
        // PC: keep at 0x6000 for now (would come from BDS file)
        const pc = 0x6000;
        
        // Calculate individual register components
        const a = (af & 0xFF00) >> 8;
        const f = af & 0x00FF;
        const b = (bc & 0xFF00) >> 8;
        const c = bc & 0x00FF;
        const d = (de & 0xFF00) >> 8;
        const e = de & 0x00FF;
        const h = (hl & 0xFF00) >> 8;
        const l = hl & 0x00FF;
        
        // Set backup registers to complement values
        const af_ = af ^ 0xFFFF;
        const bc_ = bc ^ 0xFFFF;
        const de_ = de ^ 0xFFFF;
        const hl_ = hl ^ 0xFFFF;
        
        return {
            A: a, F: f, B: b, C: c, D: d, E: e, H: h, L: l,
            IX: 0, IY: 0, SP: sp, PC: pc,
            I: 0, R: 0, AF_: af_, BC_: bc_, DE_: de_, HL_: hl_
        };
    }

    constructor(port: number) {
        this.port = port;

        // Initialize emulator state with randomized register values
        this.emulatorState = {
            registers: this.initializeRegisters(),
            memory: new Uint8Array(65536), // 64K of memory
            breakpoints: [],
            running: false,
            paused: true
        };
        
        // Initialize memory with some test values
        this.initializeMemory();
        
        // Create server
        this.server = net.createServer((socket) => this.handleConnection(socket));
    }

    public start(): void {
        this.server.listen(this.port, () => {
            console.log(`Mock trs80gp server listening on port ${this.port}`);
        });

        this.server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${this.port} is already in use. Please ensure no other trs80gp mock server or process is using this port.`);
                console.error('You can check with: lsof -i :' + this.port);
                process.exit(1);
            } else {
                console.error(`Server error: ${err.message}`);
                process.exit(1);
            }
        });
    }

    public stop(): void {
        this.clients.forEach(client => client.destroy());
        this.clients = [];
        this.server.close(() => {
            console.log('Mock trs80gp server stopped');
        });
    }

    private handleConnection(socket: net.Socket): void {
        console.log(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
        this.clients.push(socket);

        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString();
            
            // Process complete messages
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const messageStr = buffer.substring(0, newlineIndex).trim();
                buffer = buffer.substring(newlineIndex + 1);
                
                if (messageStr.length > 0) {
                    try {
                        const message = JSON.parse(messageStr) as JsonRpcMessage;
                        this.handleJsonRpcMessage(message, socket);
                    } catch (error) {
                        console.error(`Failed to parse message: ${messageStr}`);
                    }
                }
            }
        });

        socket.on('close', () => {
            console.log(`Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
            const index = this.clients.indexOf(socket);
            if (index !== -1) {
                this.clients.splice(index, 1);
            }
        });

        socket.on('error', (err) => {
            console.error(`Socket error: ${err.message}`);
        });
    }

    private handleJsonRpcMessage(message: JsonRpcMessage, socket: net.Socket): void {
        console.log(`Received message: ${JSON.stringify(message)}`);

        // Only handle requests (messages with a method)
        if (!message.method) {
            return;
        }

        let response: JsonRpcMessage | null = null;

        switch (message.method) {
            case 'initialize':
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: {
                        programName: 'Mock trs80gp',
                        version: '1.0.0',
                        modelName: 'TRS-80 Model I',
                        modelNumber: 1
                    }
                };
                break;
                
            case 'getRegisters':
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: this.formatRegistersAsHex()
                };
                break;

            case 'setRegister':
                if (message.params && typeof message.params.register === 'string' &&
                    typeof message.params.value === 'number') {
                    const reg = message.params.register;
                    const value = message.params.value;
                    
                    if (reg in this.emulatorState.registers) {
                        // Update register value
                        (this.emulatorState.registers as any)[reg] = value;
                        
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            result: true
                        };
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: `Invalid register name: ${reg}`
                            }
                        };
                    }
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for setRegister'
                        }
                    };
                }
                break;

            case 'readMemory':
                if (message.params) {
                    // Support both number and hexadecimal string address formats
                    let address: number;
                    let size: number;
                    
                    // Parse address (accept both number and hex string)
                    if (typeof message.params.address === 'number') {
                        address = message.params.address;
                    } else if (typeof message.params.address === 'string') {
                        address = this.parseNumber(message.params.address);
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: 'Invalid address format - must be a number or hex string'
                            }
                        };
                        break;
                    }
                    
                    // Parse size
                    if (typeof message.params.size === 'number') {
                        size = message.params.size;
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: 'Invalid size parameter'
                            }
                        };
                        break;
                    }
                    
                    if (address >= 0 && address + size <= this.emulatorState.memory.length) {
                        // Extract the memory segment
                        const memorySlice = this.emulatorState.memory.slice(address, address + size);
                        
                        // Convert to hex string
                        const hexData = Buffer.from(memorySlice).toString('hex');
                        
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            result: {
                                // Return address as hex string for consistency
                                address: `0x${address.toString(16).padStart(4, '0')}`,
                                size: size,
                                data: hexData
                            }
                        };
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: 'Memory address out of range'
                            }
                        };
                    }
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for readMemory'
                        }
                    };
                }
                break;

            case 'writeMemory':
                if (message.params && typeof message.params.data === 'string') {
                    // Support both number and hexadecimal string address formats
                    let address: number;
                    
                    // Parse address (accept both number and hex string)
                    if (typeof message.params.address === 'number') {
                        address = message.params.address;
                    } else if (typeof message.params.address === 'string') {
                        address = this.parseNumber(message.params.address);
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: 'Invalid address format - must be a number or hex string'
                            }
                        };
                        break;
                    }
                    
                    const data = Buffer.from(message.params.data, 'hex');
                    
                    if (address >= 0 && address + data.length <= this.emulatorState.memory.length) {
                        // Copy data into memory
                        for (let i = 0; i < data.length; i++) {
                            this.emulatorState.memory[address + i] = data[i];
                        }
                        
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            result: true
                        };
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: 'Memory address out of range'
                            }
                        };
                    }
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for writeMemory'
                        }
                    };
                }
                break;

            case 'continue':
                this.emulatorState.running = true;
                this.emulatorState.paused = false;
                
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: true
                };
                
                // Simulate a breakpoint hit after a short delay
                setTimeout(() => {
                    if (this.emulatorState.running) {
                        // Increment PC by some amount to simulate execution
                        this.emulatorState.registers.PC += 10;
                        
                        // Notify about pause/breakpoint
                        const notification: JsonRpcMessage = {
                            jsonrpc: '2.0',
                            method: 'breakpoint',
                            params: {
                                address: this.emulatorState.registers.PC
                            }
                        };
                        
                        socket.write(JSON.stringify(notification) + '\n');
                        
                        this.emulatorState.running = false;
                        this.emulatorState.paused = true;
                    }
                }, 1000);
                break;

            case 'pause':
                this.emulatorState.running = false;
                this.emulatorState.paused = true;
                
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: true
                };
                
                // Notify about pause
                setTimeout(() => {
                    const notification: JsonRpcMessage = {
                        jsonrpc: '2.0',
                        method: 'paused',
                        params: {
                            reason: 'user_request'
                        }
                    };
                    
                    socket.write(JSON.stringify(notification) + '\n');
                }, 100);
                break;

            case 'stepInto':
                // Increment PC to simulate a single step
                this.emulatorState.registers.PC += 1;
                
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: true
                };
                
                // Notify about step completed
                setTimeout(() => {
                    const notification: JsonRpcMessage = {
                        jsonrpc: '2.0',
                        method: 'paused',
                        params: {
                            reason: 'step_complete',
                            address: this.emulatorState.registers.PC
                        }
                    };
                    
                    socket.write(JSON.stringify(notification) + '\n');
                }, 100);
                break;

            case 'stepOver':
                // Increment PC by more than 1 to simulate step over
                this.emulatorState.registers.PC += 3;
                
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    result: true
                };
                
                // Notify about step completed
                setTimeout(() => {
                    const notification: JsonRpcMessage = {
                        jsonrpc: '2.0',
                        method: 'paused',
                        params: {
                            reason: 'step_complete',
                            address: this.emulatorState.registers.PC
                        }
                    };
                    
                    socket.write(JSON.stringify(notification) + '\n');
                }, 100);
                break;

            case 'setBreakpoints':
                if (message.params && Array.isArray(message.params.breakpoints)) {
                    // Store breakpoints - support both hexadecimal strings and numbers
                    this.emulatorState.breakpoints = message.params.breakpoints.map((bp: Breakpoint) => {
                        // If the address is provided as a string, parse it according to configuration
                        if (typeof bp.address === 'string') {
                            return { address: this.parseNumber(bp.address) };
                        }
                        return bp;
                    });
                    
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: true
                    };
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for setBreakpoints'
                        }
                    };
                }
                break;

            case 'loadObj':
                if (message.params && typeof message.params.filePath === 'string') {
                    // Simulate loading a program by setting PC to start address
                    this.emulatorState.registers.PC = 0x6000; // Default TRS-80 program start address
                    
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            success: true,
                            startAddress: 0x6000,
                            endAddress: 0x6100,
                            entryPoint: 0x6000
                        }
                    };
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for loadObj'
                        }
                    };
                }
                break;

            case 'saveObj':
                if (message.params && 
                    typeof message.params.startAddress === 'number' &&
                    typeof message.params.endAddress === 'number' &&
                    typeof message.params.filePath === 'string') {
                    
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        result: {
                            success: true
                        }
                    };
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for saveObj'
                        }
                    };
                }
                break;

            case 'configure':
                if (message.params) {
                    let updated = false;
                    let updateMessages: string[] = [];
                    
                    if (typeof message.params.use8BitRegistersOnly === 'boolean') {
                        this.use8BitRegistersOnly = message.params.use8BitRegistersOnly;
                        updateMessages.push(`Register format: ${this.use8BitRegistersOnly ? '8-bit individual' : '16-bit composite'}`);
                        updated = true;
                    }
                    
                    if (typeof message.params.parseNumbersAsHex === 'boolean') {
                        this.parseNumbersAsHex = message.params.parseNumbersAsHex;
                        updateMessages.push(`Number parsing: ${this.parseNumbersAsHex ? 'hex (regardless of 0x prefix)' : 'decimal (unless 0x prefix)'}`);
                        updated = true;
                    }
                    
                    if (updated) {
                        console.log(`Mock server configuration updated: ${updateMessages.join(', ')}`);
                        
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            result: {
                                use8BitRegistersOnly: this.use8BitRegistersOnly,
                                parseNumbersAsHex: this.parseNumbersAsHex,
                                message: `Configuration updated: ${updateMessages.join(', ')}`
                            }
                        };
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id: message.id,
                            error: {
                                code: -32602,
                                message: 'Invalid params. Expected use8BitRegistersOnly (boolean) and/or parseNumbersAsHex (boolean)'
                            }
                        };
                    }
                } else {
                    response = {
                        jsonrpc: '2.0',
                        id: message.id,
                        error: {
                            code: -32602,
                            message: 'Invalid params for configure - use8BitRegistersOnly must be a boolean'
                        }
                    };
                }
                break;

            default:
                response = {
                    jsonrpc: '2.0',
                    id: message.id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${message.method}`
                    }
                };
                break;
        }

        if (response) {
            console.log(`Sending response: ${JSON.stringify(response)}`);
            socket.write(JSON.stringify(response) + '\n');
        }
    }

    /**
     * Format register values as hexadecimal strings for protocol output
     * Supports both 16-bit composite registers and 8-bit individual registers
     * to test the robust register handling in convertTrs80GpRegistersToDeZog
     */
    private formatRegistersAsHex(): any {
        const regs = this.emulatorState.registers;
        
        if (this.use8BitRegistersOnly) {
            // Provide only individual 8-bit registers to test fallback logic
            return {
                // Individual 8-bit registers only
                A: `0x${regs.A.toString(16).toUpperCase().padStart(2, '0')}`,
                F: `0x${regs.F.toString(16).toUpperCase().padStart(2, '0')}`,
                B: `0x${regs.B.toString(16).toUpperCase().padStart(2, '0')}`,
                C: `0x${regs.C.toString(16).toUpperCase().padStart(2, '0')}`,
                D: `0x${regs.D.toString(16).toUpperCase().padStart(2, '0')}`,
                E: `0x${regs.E.toString(16).toUpperCase().padStart(2, '0')}`,
                H: `0x${regs.H.toString(16).toUpperCase().padStart(2, '0')}`,
                L: `0x${regs.L.toString(16).toUpperCase().padStart(2, '0')}`,
                
                // 16-bit registers that cannot be decomposed
                IX: `0x${regs.IX.toString(16).toUpperCase().padStart(4, '0')}`,
                IY: `0x${regs.IY.toString(16).toUpperCase().padStart(4, '0')}`,
                SP: `0x${regs.SP.toString(16).toUpperCase().padStart(4, '0')}`,
                PC: `0x${regs.PC.toString(16).toUpperCase().padStart(4, '0')}`,
                
                // Individual 8-bit registers (I, R)
                I: `0x${regs.I.toString(16).toUpperCase().padStart(2, '0')}`,
                R: `0x${regs.R.toString(16).toUpperCase().padStart(2, '0')}`,
                
                // Alternate register set as individual 8-bit components
                A2: `0x${((regs.AF_ >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                F2: `0x${(regs.AF_ & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                B2: `0x${((regs.BC_ >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                C2: `0x${(regs.BC_ & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                D2: `0x${((regs.DE_ >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                E2: `0x${(regs.DE_ & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                H2: `0x${((regs.HL_ >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                L2: `0x${(regs.HL_ & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`,
                
                // Interrupt mode (usually 0, 1, or 2)
                IM: 0
            };
        } else {
            // Provide 16-bit composite registers (existing behavior)
            // Combine individual 8-bit registers into 16-bit composite values
            const af = (regs.A << 8) | regs.F;
            const bc = (regs.B << 8) | regs.C;
            const de = (regs.D << 8) | regs.E;
            const hl = (regs.H << 8) | regs.L;
            
            return {
                // Composite 16-bit registers (main registers)
                AF: `0x${af.toString(16).toUpperCase().padStart(4, '0')}`,
                BC: `0x${bc.toString(16).toUpperCase().padStart(4, '0')}`,
                DE: `0x${de.toString(16).toUpperCase().padStart(4, '0')}`,
                HL: `0x${hl.toString(16).toUpperCase().padStart(4, '0')}`,
                
                // 16-bit index and pointer registers
                IX: `0x${regs.IX.toString(16).toUpperCase().padStart(4, '0')}`,
                IY: `0x${regs.IY.toString(16).toUpperCase().padStart(4, '0')}`,
                SP: `0x${regs.SP.toString(16).toUpperCase().padStart(4, '0')}`,
                PC: `0x${regs.PC.toString(16).toUpperCase().padStart(4, '0')}`,
                
                // Individual 8-bit registers (I, R)
                I: `0x${regs.I.toString(16).toUpperCase().padStart(2, '0')}`,
                R: `0x${regs.R.toString(16).toUpperCase().padStart(2, '0')}`,
                
                // Alternate register set (already 16-bit composite)
                AF_: `0x${regs.AF_.toString(16).toUpperCase().padStart(4, '0')}`,
                BC_: `0x${regs.BC_.toString(16).toUpperCase().padStart(4, '0')}`,
                DE_: `0x${regs.DE_.toString(16).toUpperCase().padStart(4, '0')}`,
                HL_: `0x${regs.HL_.toString(16).toUpperCase().padStart(4, '0')}`,
                
                // Interrupt mode (usually 0, 1, or 2)
                IM: 0
            };
        }
    }

    private initializeMemory(): void {
        // Initialize with some recognizable pattern
        for (let i = 0; i < this.emulatorState.memory.length; i++) {
            this.emulatorState.memory[i] = i & 0xFF;
        }

        // Load some test code into memory
        const program = Buffer.from([
            // Simple hello world program (Starting at 0x6000)
            0xCD, 0xC9, 0x01,             // CALL $01C9 (Clear screen)
            0x21, 0x0C, 0x60,             // LD HL, hello_msg
            0xCD, 0x1B, 0x02,             // CALL $021B (Print string)
            0xC3, 0x2D, 0x40,             // JP $402D (Return to DOS)
            
            // "Hello, TRS-80 World!" string at 0x600C
            0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x2C, 0x20, 0x54, 
            0x52, 0x53, 0x2D, 0x38, 0x30, 0x20, 0x57, 0x6F, 
            0x72, 0x6C, 0x64, 0x21, 0x0D, 0x00  // Null-terminated
        ]);

        // Copy program into memory at 0x6000
        program.copy(Buffer.from(this.emulatorState.memory.buffer), 0x6000);

        // Add some symbols for testing
        this.symbolsMap.set("main", 0x6000);
        this.symbolsMap.set("hello_msg", 0x600C);
    }

    /**
     * Toggle between 16-bit composite and 8-bit individual register modes
     * This is useful for testing the robust register handling
     */
    public setUse8BitRegistersOnly(use8BitOnly: boolean): void {
        this.use8BitRegistersOnly = use8BitOnly;
        console.log(`Mock server configuration: Register mode: ${use8BitOnly ? '8-bit individual' : '16-bit composite'}, Number parsing: ${this.parseNumbersAsHex ? 'hex (regardless of 0x prefix)' : 'decimal (unless 0x prefix)'}`);
    }

    /**
     * Parses a number string according to the parseNumbersAsHex configuration.
     * @param numberStr The number string to parse (may or may not have 0x prefix)
     * @returns The parsed number
     */
    private parseNumber(numberStr: string): number {
        // Remove any 0x prefix if present
        const cleanStr = numberStr.replace(/^0x/i, '');
        
        if (this.parseNumbersAsHex) {
            // Parse as hex regardless of prefix
            return parseInt(cleanStr, 16);
        } else {
            // Parse as decimal unless original had 0x prefix
            if (numberStr.toLowerCase().startsWith('0x')) {
                return parseInt(cleanStr, 16);
            } else {
                return parseInt(cleanStr, 10);
            }
        }
    }
}

// Start the server with command-line port argument or default 49152
const port = process.argv.length > 2 ? parseInt(process.argv[2], 10) : 49152;
new MockTrs80gpServer(port).start();
