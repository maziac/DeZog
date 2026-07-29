import {Trs80GpRemote} from './trs80gpremote';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {Z80Registers} from '../z80registers';

/**
 * TRS-80 Model 3 Remote class that communicates with trs80gp emulator.
 * 
 * This class implements Model 3 specific features:
 * - 64KB flat memory model (no banking) - 48K ROM, 12K ROM, 1K Video RAM, 3K Mapped I/O
 * - Supports cassette and disk operations
 * - Handles specific notifications for Model 3 features
 * - Provides methods for reading/writing memory and video RAM
 * - Provides methods for reading/writing I/O ports
 * - Provides methods for screen manipulation and dimensions
 * Extends the base Trs80GpRemote class which handles the common
 * trs80gp emulator communication via JSON-RPC.
 */
export class Trs80Model3Remote extends Trs80GpRemote {

    // TRS-80 Model 3 specific constants
    private static readonly MODEL3_MEMORY_SIZE = 0x10000; // 64KB
    private static readonly MODEL3_SCREEN_WIDTH = 64;
    private static readonly MODEL3_SCREEN_HEIGHT = 16;
    private static readonly MODEL3_VIDEO_RAM_START = 0x3C00;
    private static readonly MODEL3_VIDEO_RAM_SIZE = 0x400; // 1KB

    /**
     * Constructor for TRS-80 Model 3 Remote.
     */
    constructor() {
        super();
    }

    /**
     * Retrieve the register values from the TRS-80 Model 3 emulator and cache them.
     * This method is called by the debugger to get the current state of the Z80 registers.
     */
    public async getRegistersFromEmulator(): Promise<void> {
        try {
            // Get register data from the TRS-80 GP emulator
            const regData = await this.sendDzrpCmdGetRegisters();
            
            // Cache the register data using Z80Registers
            Z80Registers.setCache(regData);
        } catch (err) {
            throw new Error(`TRS-80 Model 3: Failed to get registers from emulator: ${err.message || err}`);
        }
    }

    /**
     * Get the DZRP machine type for TRS-80 Model 3.
     */
    protected getTrs80GpMachineType(): DzrpMachineType {
        return DzrpMachineType.TRS80_MODEL3;
    }

    /**
     * Handle Model 3 specific notifications from trs80gp.
     */
    protected handleTrs80GpNotification(method: string, params: any): void {
        switch (method) {
            case 'model3_cassette_inserted':
                this.emit('debug_console', `TRS-80 Model 3: Cassette inserted - ${params?.filename}`);
                break;
            case 'model3_cassette_removed':
                this.emit('debug_console', 'TRS-80 Model 3: Cassette removed');
                break;
            case 'model3_disk_inserted':
                this.emit('debug_console', `TRS-80 Model 3: Disk inserted in drive ${params?.drive} - ${params?.filename}`);
                break;
            case 'model3_disk_removed':
                this.emit('debug_console', `TRS-80 Model 3: Disk removed from drive ${params?.drive}`);
                break;
            case 'model3_screen_mode_changed':
                this.emit('debug_console', `TRS-80 Model 3: Screen mode changed to ${params?.mode}`);
                break;
            default:
                // Fall back to base class handling
                super.handleTrs80GpNotification(method, params);
                break;
        }
    }

    /**
     * Model 3 specific register conversion.
     * The Model 3 uses standard Z80 registers but may have specific handling.
     */
    protected convertTrs80GpRegistersToDeZog(registers: any): Uint16Array {
        // For now, use the base implementation
        // In the future, this could handle Model 3 specific register quirks
        return super.convertTrs80GpRegistersToDeZog(registers);
    }

    /**
     * Model 3 specific memory reading.
     * Handles the flat 64KB memory model and video RAM specifics.
     */
    public async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
        // Validate address range for Model 3
        if (address < 0 || address >= Trs80Model3Remote.MODEL3_MEMORY_SIZE) {
            throw new Error(`TRS-80 Model 3: Invalid memory address 0x${address.toString(16)}`);
        }

        // Clamp size to available memory
        const maxSize = Trs80Model3Remote.MODEL3_MEMORY_SIZE - address;
        const actualSize = Math.min(size, maxSize);

        // Use base class implementation for actual communication
        return super.sendDzrpCmdReadMem(address, actualSize);
    }

    /**
     * Model 3 specific memory writing.
     * Handles the flat 64KB memory model and any write protection.
     */
    public async sendDzrpCmdWriteMem(address: number, data: Uint8Array): Promise<void> {
        // Validate address range for Model 3
        if (address < 0 || address >= Trs80Model3Remote.MODEL3_MEMORY_SIZE) {
            throw new Error(`TRS-80 Model 3: Invalid memory address 0x${address.toString(16)}`);
        }

        // Check if trying to write beyond memory bounds
        if (address + data.length > Trs80Model3Remote.MODEL3_MEMORY_SIZE) {
            throw new Error(`TRS-80 Model 3: Write would exceed memory bounds`);
        }

        // Use base class implementation for actual communication
        return super.sendDzrpCmdWriteMem(address, data);
    }

    /**
     * Model 3 specific bank writing.
     * Since Model 3 has flat memory, this maps to regular memory writes.
     */
    public async sendDzrpCmdWriteBank(bank: number, dataArray: Uint8Array): Promise<void> {
        // Model 3 has flat memory, so treat banks as 8KB segments
        const address = bank * 0x2000; // 8KB per bank
        
        if (address >= Trs80Model3Remote.MODEL3_MEMORY_SIZE) {
            throw new Error(`TRS-80 Model 3: Bank ${bank} exceeds memory bounds`);
        }

        await this.sendDzrpCmdWriteMem(address, dataArray);
    }

    /**
     * Get slots for Model 3.
     * Model 3 has flat memory, so no memory banking slots.
     */
    public async sendDzrpCmdGetSlots(): Promise<void> {
        // Model 3 has flat 64KB memory, no slots/banks
        this.emit('received-slots-data', []);
    }

    /**
     * Model 3 specific video RAM access.
     * This could be used for screen debugging features.
     */
    public async readModel3VideoRam(): Promise<Uint8Array> {
        return this.sendDzrpCmdReadMem(
            Trs80Model3Remote.MODEL3_VIDEO_RAM_START,
            Trs80Model3Remote.MODEL3_VIDEO_RAM_SIZE
        );
    }

    /**
     * Model 3 specific video RAM write.
     * This could be used for screen manipulation.
     */
    public async writeModel3VideoRam(data: Uint8Array): Promise<void> {
        if (data.length > Trs80Model3Remote.MODEL3_VIDEO_RAM_SIZE) {
            throw new Error(`TRS-80 Model 3: Video RAM data too large (${data.length} > ${Trs80Model3Remote.MODEL3_VIDEO_RAM_SIZE})`);
        }

        return this.sendDzrpCmdWriteMem(Trs80Model3Remote.MODEL3_VIDEO_RAM_START, data);
    }

    /**
     * Get Model 3 screen dimensions.
     */
    public getModel3ScreenDimensions(): {width: number, height: number} {
        return {
            width: Trs80Model3Remote.MODEL3_SCREEN_WIDTH,
            height: Trs80Model3Remote.MODEL3_SCREEN_HEIGHT
        };
    }

    /**
     * Model 3 specific I/O port operations.
     * These would be implemented when trs80gp supports port I/O via JSON-RPC.
     */
    public async readModel3Port(port: number): Promise<number> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('readPort', { port });
            return result?.value || 0;
        } catch (err) {
            throw new Error(`Failed to read Model 3 port 0x${port.toString(16)}: ${err.message}`);
        }
    }

    public async writeModel3Port(port: number, value: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('writePort', { port, value });
        } catch (err) {
            throw new Error(`Failed to write Model 3 port 0x${port.toString(16)}: ${err.message}`);
        }
    }

    /**
     * Model 3 specific cassette operations.
     */
    public async loadModel3CassetteTape(filePath: string): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('loadCassette', { filePath });
        } catch (err) {
            throw new Error(`Failed to load Model 3 cassette tape: ${err.message}`);
        }
    }

    public async ejectModel3CassetteTape(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('ejectCassette');
        } catch (err) {
            throw new Error(`Failed to eject Model 3 cassette tape: ${err.message}`);
        }
    }

    /**
     * Model 3 specific disk operations.
     */
    public async loadModel3Disk(drive: number, filePath: string): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('loadDisk', { drive, filePath });
        } catch (err) {
            throw new Error(`Failed to load Model 3 disk in drive ${drive}: ${err.message}`);
        }
    }

    public async ejectModel3Disk(drive: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('ejectDisk', { drive });
        } catch (err) {
            throw new Error(`Failed to eject Model 3 disk from drive ${drive}: ${err.message}`);
        }
    }

    /**
     * Load a /CMD file for Model 3.
     * CMD files have a specific format with load address and execution address.
     * This method uses the base class loadBinCmd implementation which parses
     * the CMD file internally and uses JSON-RPC writeMemoryRequest.
     */
    public async sendDzrpCmdLoadObj(filePath: string): Promise<void> {
        try {
            // Use the base class loadBinCmd implementation
            await this.loadBinCmd(filePath);
        } catch (err) {
            throw new Error(`Failed to load CMD file on TRS-80 Model 3: ${err.message}`);
        }
    }

    /**
     * Save a /CMD file for Model 3.
     */
    public async sendDzrpCmdSaveObj(startAddress: number, endAddress: number, filePath: string, execAddress?: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('saveCmd', {
                startAddress,
                endAddress,
                filePath,
                execAddress,
                machineType: 'model3'
            });
        } catch (err) {
            throw new Error(`Failed to save CMD file on TRS-80 Model 3: ${err.message}`);
        }
    }
}
