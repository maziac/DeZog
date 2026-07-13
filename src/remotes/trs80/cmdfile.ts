import * as fs from 'fs';

/**
 * Represents a data block to be loaded into memory.
 */
export class CmdDataBlock {
    /** Starting address where this block should be loaded */
    public address: number;
    /** The data to be loaded */
    public data: Uint8Array;

    constructor(address: number, data: Uint8Array) {
        this.address = address;
        this.data = data;
    }
}

/**
 * A parser for the TRS-80 CMD file format.
 * CMD files are the native executable format for TRS-80 systems.
 * 
 * Format:
 * - Record Type 05: Filename record
 * - Record Type 01: Object Code/Load Block
 * - Record Type 02: Transfer Address (execution entry point)
 * 
 * Each record has the structure:
 * - Record Type (1 byte)
 * - Block Length (1 byte) - number of data bytes following
 * - Load Address (2 bytes, little-endian) - for type 01 records
 * - Data (variable length)
 */
export class CmdFile {
    /** All data blocks to be loaded into memory */
    public dataBlocks: Array<CmdDataBlock>;
    
    /** Transfer address (execution entry point) */
    public transferAddress: number;
    
    /** Filename from the CMD file (if present) */
    public filename: string;

    /**
     * Constructor.
     */
    constructor() {
        this.dataBlocks = new Array<CmdDataBlock>();
        this.transferAddress = 0;
        this.filename = '';
    }

    /**
     * Reads and parses a TRS-80 CMD file.
     * @param filePath The path to the CMD file
     */
    public readFile(filePath: string): void {
        // Read file
        const cmdBuffer = fs.readFileSync(filePath);
        let index = 0;

        // Parse records
        while (index < cmdBuffer.length) {
            if (index + 2 > cmdBuffer.length) {
                throw new Error(`CMD file truncated: missing record header at offset ${index}`);
            }

            // Read record header
            const recordType = cmdBuffer[index++];
            const blockLength = cmdBuffer[index++];

            // Check if we have enough data for this record
            if (index + blockLength > cmdBuffer.length) {
                throw new Error(`CMD file truncated: record at offset ${index - 2} claims ${blockLength} bytes but only ${cmdBuffer.length - index} available`);
            }

            switch (recordType) {
                case 0x01: // Object Code/Load Block
                    this.parseLoadBlock(cmdBuffer, index, blockLength);
                    break;

                case 0x02: // Transfer Address
                    this.parseTransferAddress(cmdBuffer, index, blockLength);
                    break;

                case 0x05: // Filename
                    this.parseFilename(cmdBuffer, index, blockLength);
                    break;

                default:
                    // Unknown record type - skip it
                    console.warn(`Unknown CMD record type 0x${recordType.toString(16).padStart(2, '0')} at offset ${index - 2}, skipping ${blockLength} bytes`);
                    break;
            }

            // Move to next record
            index += blockLength;
        }

        // Validate that we have at least one data block
        if (this.dataBlocks.length === 0) {
            throw new Error('CMD file contains no data blocks');
        }
    }

    /**
     * Parse a load block record (type 0x01).
     * @param buffer The CMD file buffer
     * @param index Starting index of the record data
     * @param blockLength Length of the record data
     */
    private parseLoadBlock(buffer: Buffer, index: number, blockLength: number): void {
        if (blockLength < 2) {
            throw new Error('Load block record too short: must contain at least 2 bytes for address');
        }

        // Read load address (little-endian)
        const address = buffer[index] | (buffer[index + 1] << 8);
        
        // Extract data
        const dataLength = blockLength - 2;
        const data = new Uint8Array(dataLength);
        
        if (dataLength > 0) {
            data.set(buffer.subarray(index + 2, index + 2 + dataLength));
        }

        // Create data block
        const dataBlock = new CmdDataBlock(address, data);
        this.dataBlocks.push(dataBlock);
    }

    /**
     * Parse a transfer address record (type 0x02).
     * @param buffer The CMD file buffer
     * @param index Starting index of the record data
     * @param blockLength Length of the record data
     */
    private parseTransferAddress(buffer: Buffer, index: number, blockLength: number): void {
        if (blockLength !== 2) {
            throw new Error(`Transfer address record has invalid length: expected 2 bytes, got ${blockLength}`);
        }

        // Read transfer address (little-endian)
        this.transferAddress = buffer[index] | (buffer[index + 1] << 8);
    }

    /**
     * Parse a filename record (type 0x05).
     * @param buffer The CMD file buffer
     * @param index Starting index of the record data
     * @param blockLength Length of the record data
     */
    private parseFilename(buffer: Buffer, index: number, blockLength: number): void {
        if (blockLength > 0) {
            // Convert bytes to string, removing any null terminators
            let filename = '';
            for (let i = index; i < index + blockLength; i++) {
                const byte = buffer[i];
                if (byte === 0) break; // Stop at null terminator
                if (byte >= 32 && byte <= 126) { // Printable ASCII only
                    filename += String.fromCharCode(byte);
                }
            }
            this.filename = filename.trim();
        }
    }

    /**
     * Get the total size of all data blocks.
     * @returns Total number of bytes across all data blocks
     */
    public getTotalDataSize(): number {
        return this.dataBlocks.reduce((total, block) => total + block.data.length, 0);
    }

    /**
     * Get the memory range covered by all data blocks.
     * @returns Object with startAddress and endAddress, or null if no data blocks
     */
    public getMemoryRange(): { startAddress: number; endAddress: number } | null {
        if (this.dataBlocks.length === 0) {
            return null;
        }

        let startAddress = this.dataBlocks[0].address;
        let endAddress = this.dataBlocks[0].address + this.dataBlocks[0].data.length - 1;

        for (const block of this.dataBlocks) {
            startAddress = Math.min(startAddress, block.address);
            endAddress = Math.max(endAddress, block.address + block.data.length - 1);
        }

        return { startAddress, endAddress };
    }
}
