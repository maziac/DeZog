import {Trs80GpRemote} from './trs80gpremote';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {Z80Registers} from '../z80registers';

/**
 * TRS-80 Model 1 Remote implementation.
 * 
 * The TRS-80 Model 1 has specific characteristics:
 * - 48KB RAM (4000h-FFFFh)
 * - Video RAM at 3C00h-3FFFh (1KB)
 * - ROM at 0000h-2FFFh (12KB Level II BASIC)
 * - Flat memory model (no banking)
 * - 64x16 text display (128x48 pixels with block graphics)
 */
export class Trs80Model1Remote extends Trs80GpRemote {

    /**
     * Get the DZRP machine type for TRS-80 Model 1.
     */
    protected getTrs80GpMachineType(): DzrpMachineType {
        return DzrpMachineType.TRS80_MODEL1;
    }

    /**
     * Initializes the connection to the TRS-80 Model 1.
     * Sends the initial configuration and retrieves the program name and version.
     */
    public async sendDzrpCmdInit(): Promise<{error: string | undefined; programName: string; dzrpVersion: string; machineType: DzrpMachineType}> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('initialize', {
                clientName: 'DeZog',
                version: '1.0.0',
                machineType: 'model1'
            });
            
            return {
                error: undefined,
                programName: result?.programName || 'trs80gp',
                dzrpVersion: result?.version || '1.0.0',
                machineType: DzrpMachineType.TRS80_MODEL1
            };
        } catch (err) {
            return {
                error: `Failed to initialize TRS-80 Model 1 connection: ${err.message}`,
                programName: 'trs80gp',
                dzrpVersion: '1.0.0',
                machineType: DzrpMachineType.TRS80_MODEL1
            };
        }
    }

    /**
     * Model 1 has flat memory - no banking support.
     */
    public async sendDzrpCmdGetSlots(): Promise<void> {
        // Model 1 has flat memory, emit empty slots
        this.emit('received-slots-data', []);
    }

    /**
     * Model 1 memory write with address validation.
     */
    public async sendDzrpCmdWriteMem(address: number, data: Uint8Array): Promise<void> {
        // Validate address ranges for Model 1.
        // While this is technically correct, the emulator will handle this anyways.
        // So on a TRS-80, you can execute statement which write to a ROM address, alas nothing will happen.
        // But we leave this in here.
        if (address >= 0x0000 && address <= 0x2FFF) {
            throw new Error(`Cannot write to ROM area (${address.toString(16).toUpperCase()}h) on TRS-80 Model 1`);
        }

        // We can uncomment this if it comes in handy, but usually the emulator will properly handle this:
        // if (address >= 0x3000 && address <= 0x3BFF) {
        //     throw new Error(`Cannot write to unmapped area (${address.toString(16).toUpperCase()}h) on TRS-80 Model 1`);
        // }

        // Allow writes to Video RAM (3C00h-3FFFh) and System RAM (4000h-FFFFh)
        await super.sendDzrpCmdWriteMem(address, data);
    }

    /**
     * Load a /CMD file for Model 1.
     * CMD files have a specific format with load address and execution address.
     * This method uses the base class loadBinCmd implementation which parses
     * the CMD file internally and uses JSON-RPC writeMemoryRequest.
     */
    public async sendDzrpCmdLoadObj(filePath: string): Promise<void> {
        try {
            // Use the base class loadBinCmd implementation
            await this.loadBinCmd(filePath);
        } catch (err) {
            throw new Error(`Failed to load CMD file on TRS-80 Model 1: ${err.message}`);
        }
    }

    /**
     * Save a /CMD file for Model 1.
     */
    public async sendDzrpCmdSaveObj(startAddress: number, endAddress: number, filePath: string, execAddress?: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('saveCmd', {
                startAddress: startAddress,
                endAddress: endAddress,
                filePath: filePath,
                execAddress: execAddress || startAddress,
                machineType: 'model1'
            });
        } catch (err) {
            throw new Error(`Failed to save CMD file on TRS-80 Model 1: ${err.message}`);
        }
    }

    /**
     * Model 1 specific register handling.
     * The TRS-80 Model 1 exposes standard Z80 registers.
     */
    protected convertTrs80GpRegistersToDeZog(registers: any): Uint16Array {
        // Use the base class implementation which handles format parsing
        const regData = super.convertTrs80GpRegistersToDeZog(registers);
        
        // Model 1 can add any model-specific register handling here if needed
        // For now, the base implementation is sufficient
        
        return regData;
    }

    /**
     * Handle Model 1 specific notifications from the emulator.
     */
    protected handleTrs80GpNotification(method: string, params: any): void {
        switch (method) {
            case 'model1_rom_access':
                this.emit('debug_console', `TRS-80 Model 1: ROM access at ${params?.address}`);
                break;
            case 'model1_video_update':
                this.emit('debug_console', `TRS-80 Model 1: Video RAM update at ${params?.address}`);
                break;
            default:
                super.handleTrs80GpNotification(method, params);
        }
    }

    /**
     * Retrieves the registers from the emulator and caches them.
     * This is required by the base RemoteBase class.
     */
    public async getRegistersFromEmulator(): Promise<void> {
        try {
            console.log('TRS-80 Model 1: getRegistersFromEmulator() called');
            
            // Get register data from emulator
            const regData = await this.sendDzrpCmdGetRegisters();
            console.log('TRS-80 Model 1: sendDzrpCmdGetRegisters() returned:', regData);
            console.log('TRS-80 Model 1: regData type:', typeof regData, 'length:', regData?.length);
            
            // Cache the register data using Z80Registers
            Z80Registers.setCache(regData);
            console.log('TRS-80 Model 1: Z80Registers.setCache() completed');
        } catch (err) {
            console.error('TRS-80 Model 1: getRegistersFromEmulator() error:', err);
            throw new Error(`Failed to get registers from TRS-80 Model 1 emulator: ${err.message}`);
        }
    }
}
