import * as fs from 'fs';
import * as path from 'path'; // Keep for path.resolve, path.dirname, path.isAbsolute, path.extname
import { LabelParserBase, Issue } from './labelparserbase'; // Added Issue import
import { SourceFileEntry, ListFileLine } from './labels';
import { ZmacConfig } from '../settings/settings';
// import { Utility } from '../misc/utility'; // Commented out if not used
import { UnifiedPath } from '../misc/unifiedpath'; // Keep for UnifiedPath.getUnifiedPath
// import { LabelsClass } from './labels'; // Commented out if not used
import { MemoryModel } from '../remotes/MemoryModel/memorymodel';


export class ZmacLabelParser extends LabelParserBase {
    private sourceFileContents: Map<string, string[]> = new Map();
    private currentAsmFilePath: string | undefined;
    private currentBdsSourceFileName: string | undefined;
    protected config: ZmacConfig;
    private rootFolder: string; 

    private bdsFileReferences: Map<string, string> = new Map();

    private cmdOffset = 0;
    private cmdOffsetApplied = false;

    constructor(
        memoryModel: MemoryModel,
        fileLineNrs: Map<number, SourceFileEntry>,
        lineArrays: Map<string, Array<number>>,
        labelsForNumber64k: Array<any>,
        labelsForLongAddress: Map<number, Array<string>>,
        numberForLabel: Map<string, number>,
        labelLocations: Map<string, { file: string, lineNr: number, address: number }>,
        watchPointLines: Array<{ address: number, line: string }>, 
        assertionLines: Array<{ address: number, line: string }>, 
        logPointLines: Array<{ address: number, line: string }>, 
        issueHandler: (issue: Issue) => void,
        config: ZmacConfig, 
        rootFolder: string 
    ) {
        super(
            memoryModel,
            fileLineNrs,
            lineArrays,
            labelsForNumber64k,
            labelsForLongAddress,
            numberForLabel,
            labelLocations,
            watchPointLines,
            assertionLines,
            logPointLines,
            issueHandler
        );
        this.config = config;
        this.rootFolder = rootFolder; 
        this.parserName = "ZMAC";
        this.sourceFileContents = new Map();
        this.listFile = []; 
        this.includeFileStack = []; 
    }

    public loadAsmListFile(config: ZmacConfig) {
        this.config = config; 
        this.currentLineNr = 0;
        this.listFile = [];
        this.sourceFileContents.clear();
        this.bdsFileReferences.clear();
        this.currentAsmFilePath = undefined;
        this.currentBdsSourceFileName = undefined;

        this.parseBdsFile(this.config.path);
        this.sourcesModeFinish(); 
    }

    private parseBdsFile(filePath: string): void {
        this.currentLineNr = 0; 
        const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);

        for (const line of lines) {
            this.currentLineNr++;
            if (line.trim() === '') continue;

            const parts = line.split(/\s+/);
            const type = parts[0];
            const addr = parseInt(parts[1], 16);
            const data = parts.slice(2).join(' ');

            switch (type) {
                case 'f': 
                    this.parseFileReference(addr, data);
                    break;
                case 's': 
                    this.parseSourceOrLabel(addr, data);
                    break;
                case 'a': 
                    this.parseAddressLabel(addr, data);
                    break;
            }
        }
    }

    private parseFileReference(addr: number, bdsFileName: string): void {
        this.currentBdsSourceFileName = bdsFileName.trim();
        const resolvedPath = this.resolveSourceFilePath(this.currentBdsSourceFileName);

        if (resolvedPath) {
            this.currentAsmFilePath = resolvedPath;
            this.bdsFileReferences.set(this.currentBdsSourceFileName, resolvedPath);

            if (!this.sourceFileContents.has(resolvedPath)) {
                try {
                    const content = fs.readFileSync(resolvedPath, 'utf-8');
                    this.sourceFileContents.set(resolvedPath, content.split(/\r?\n/));
                } catch (e) {
                    this.reportIssue(`Could not read source file: ${resolvedPath}`, 'error');
                    this.currentAsmFilePath = undefined; 
                    return;
                }
            }
        } else {
            this.reportIssue(`Could not resolve source file path for: ${bdsFileName}`, 'warning');
            this.currentAsmFilePath = undefined;
        }
    }

    private resolveSourceFilePath(bdsFileName: string): string | undefined {
        const bdsPath = this.config.path; 
        const bdsDir = path.dirname(bdsPath);

        if (path.isAbsolute(bdsFileName) && fs.existsSync(bdsFileName)) {
            return UnifiedPath.getUnifiedPath(bdsFileName);
        }

        let testPath = path.resolve(bdsDir, bdsFileName);
        if (fs.existsSync(testPath)) {
            return UnifiedPath.getUnifiedPath(testPath);
        }

        if (this.config.srcDirs && this.config.srcDirs.length > 0) {
            for (const srcDir of this.config.srcDirs) {
                const fullSrcDir = path.resolve(this.rootFolder, srcDir);
                testPath = path.resolve(fullSrcDir, bdsFileName);
                if (fs.existsSync(testPath)) {
                    return UnifiedPath.getUnifiedPath(testPath);
                }
            }
        }

        testPath = path.resolve(this.rootFolder, bdsFileName);
        if (fs.existsSync(testPath)) {
            return UnifiedPath.getUnifiedPath(testPath);
        }
        
        const commonExtensions = ['.asm', '.z80', '.s'];
        const ext = path.extname(bdsFileName);
        if (!ext || !commonExtensions.includes(ext.toLowerCase())) {
            for (const commonExt of commonExtensions) {
                const nameWithExt = bdsFileName + commonExt;
                testPath = path.resolve(bdsDir, nameWithExt);
                if (fs.existsSync(testPath)) {
                    return UnifiedPath.getUnifiedPath(testPath);
                }
                if (this.config.srcDirs && this.config.srcDirs.length > 0) {
                    for (const srcDir of this.config.srcDirs) {
                        const fullSrcDir = path.resolve(this.rootFolder, srcDir);
                        testPath = path.resolve(fullSrcDir, nameWithExt);
                        if (fs.existsSync(testPath)) {
                            return UnifiedPath.getUnifiedPath(testPath);
                        }
                    }
                }
                testPath = path.resolve(this.rootFolder, nameWithExt);
                 if (fs.existsSync(testPath)) {
                    return UnifiedPath.getUnifiedPath(testPath);
                }
            }
        }

        this.reportIssue(`Source file '${bdsFileName}' not found. Searched in ${bdsDir}, srcDirs, and ${this.rootFolder}.`, 'warning');
        return undefined;
    }

    private parseSourceOrLabel(addr: number, data: string): void {
        if (!this.currentAsmFilePath || !this.currentBdsSourceFileName) {
            if (!this.currentBdsSourceFileName && this.config.path) {
                 this.reportIssue(`No active source file context for 's' record. Ensure .bds has 'f' directive before 's'. Address: 0x${addr.toString(16)}`, 'warning');
                 return;
            }
             if(this.currentBdsSourceFileName && !this.currentAsmFilePath) {
                this.currentAsmFilePath = this.resolveSourceFilePath(this.currentBdsSourceFileName);
                if (!this.currentAsmFilePath) {
                    this.reportIssue(`Cannot process 's' record for '${this.currentBdsSourceFileName}' as it could not be resolved. Address: 0x${addr.toString(16)}`, 'warning');
                    return;
                }
             }
        }
        
        const sourceLines = this.sourceFileContents.get(this.currentAsmFilePath!);
        if (!sourceLines) {
            this.reportIssue(`Source content not loaded for ${this.currentAsmFilePath}. Address: 0x${addr.toString(16)}`, 'error');
            return;
        }

        const originalLineText = data.trim();
        let originalLineNr = -1;

        for (let i = 0; i < sourceLines.length; i++) {
            if (sourceLines[i].trim() === originalLineText) {
                originalLineNr = i + 1; 
                break;
            }
        }

        if (originalLineNr === -1) {
            const trimmedDataLower = originalLineText.toLowerCase();
            for (let i = 0; i < sourceLines.length; i++) {
                const trimmedSourceLower = sourceLines[i].trim().toLowerCase();
                if (trimmedSourceLower === trimmedDataLower) {
                    originalLineNr = i + 1; 
                    break;
                }
                if (trimmedSourceLower.endsWith(':') && trimmedSourceLower.slice(0, -1) === trimmedDataLower) {
                     originalLineNr = i + 1; 
                    break;
                }
                 if (trimmedDataLower.endsWith(':') && trimmedDataLower.slice(0, -1) === trimmedSourceLower) {
                     originalLineNr = i + 1; 
                    break;
                }
            }
        }

        if (originalLineNr === -1) {
            this.reportIssue(`Could not find line "${originalLineText}" in ${this.currentAsmFilePath}. Address: 0x${addr.toString(16)}`, 'warning');
            return;
        }

        const instructionSize = this.estimateInstructionSize(originalLineText); 
        let label: string | undefined = undefined;
        const labelMatch = originalLineText.match(/^([a-zA-Z_@][a-zA-Z0-9_@]*):?/);
        if (labelMatch) {
            label = labelMatch[1];
            this.addLabel(label, addr, this.currentAsmFilePath!, originalLineNr);
        }

        const fileEntry: ListFileLine = {
            fileName: this.currentAsmFilePath!, 
            lineNr: originalLineNr, 
            longAddr: addr,
            size: instructionSize,
            line: originalLineText, 
        };
        this.listFile.push(fileEntry);
        this.findWpmemAssertionLogpoint(addr, originalLineText); 
    }

    private estimateInstructionSize(text: string): number {
        const upperText = text.toUpperCase().trim();
        if (upperText.includes('EQU') || upperText.includes('.SET') || upperText.startsWith('.') || upperText.endsWith(':')) {
            if (upperText.endsWith(':') && !upperText.substring(0, upperText.length -1).trim().includes(" ")) return 0; 
        }
        return 1; 
    }

    private parseAddressLabel(addr: number, data: string): void {
        const label = data.trim();
        // For 'a' lines, we don't have direct source text from BDS to find the exact line.
        // We can add the label to the symbol table.
        // Finding the original line for labelLocations would require searching all source files.
        this.addLabel(label, addr); // Call without file/line, or try to find it if critical
    }

    private addLabel(label: string, value: number, filePath?: string, lineNr?: number): void {
        if (!this.labelsForLongAddress.has(value)) {
            this.labelsForLongAddress.set(value, []);
        }
        this.labelsForLongAddress.get(value)!.push(label);
        this.numberForLabel.set(label, value);

        if (filePath && lineNr) {
            this.labelLocations.set(label, { file: filePath, lineNr: lineNr, address: value });
        }
    }

    private reportIssue(message: string, severity: 'error' | 'warning', filePath?: string, lineNr?: number): void {
        if (this.issueHandler) {
            this.issueHandler({
                parser: this.parserName,
                filepath: filePath || this.config.path, 
                lineNr: lineNr || this.currentLineNr, 
                severity: severity,
                message: message,
            });
        } else {
            // Fallback to console if no handler (e.g. during unit tests not focused on UI)
            const logSource = filePath ? UnifiedPath.getUnifiedPath(filePath) : 'ZmacParser';
            const logLineNr = lineNr || this.currentLineNr;
            console.warn(`${this.parserName} [${severity}] ${logSource}:${logLineNr}: ${message}`);
        }
    }

    protected parseAllFilesAndLineNumbers(): void {
        // No-op 
    }

    protected parseLabelAndAddress(line: string): void {
        // No-op 
    }

    /**
     * Integrates CMD file data. This is a placeholder and needs to be implemented
     * if ZMAC BDS files need to be correlated with CMD load data for a complete memory map.
     * @param cmdMappings Map of load addresses to CMD file data.
     */
    public enableCmdIntegration(cmdMappings: Map<number, {data: Uint8Array, size: number, entryPoint?: number}>): void {
        if (this.cmdOffsetApplied) {
             console.log('[ZmacLabelParser] enableCmdIntegration: Offset already marked as applied. Skipping.');
             return;
        }

        if (cmdMappings.size === 0) {
            console.log('[ZmacLabelParser] enableCmdIntegration called with empty cmdMappings. No offset will be applied.');
            this.cmdOffsetApplied = true; // Mark as "applied" to prevent re-processing.
            return;
        }

        // Assumption: The first load address encountered in cmdMappings is the base for the main program block.
        // This might need refinement for complex CMD files with multiple, disjoint load segments.
        const firstLoadAddress = cmdMappings.keys().next().value;

        // Critical Assumption: BDS addresses for the main code block are 0-relative.
        // If BDS files can have a different base, this logic would need that base as input.
        const assumedBdsBaseAddress = 0;
        this.cmdOffset = firstLoadAddress - assumedBdsBaseAddress;

        if (this.cmdOffset === 0) {
            console.log('[ZmacLabelParser] CMD offset is 0. No label address adjustments needed.');
            this.cmdOffsetApplied = true;
            return;
        }

        console.log(`[ZmacLabelParser] Applying CMD offset: 0x${this.cmdOffset.toString(16)} (LoadAddr: 0x${firstLoadAddress.toString(16)}, AssumedBdsBase: 0x${assumedBdsBaseAddress.toString(16)})`);

        // Adjust labelsForLongAddress: Map<number, Array<string>>
        const newLabelsForLongAddress = new Map<number, Array<string>>();
        for (const [addr, labels] of this.labelsForLongAddress) {
            newLabelsForLongAddress.set(addr + this.cmdOffset, labels);
        }
        this.labelsForLongAddress = newLabelsForLongAddress;

        // Adjust numberForLabel: Map<string, number>
        const newNumberForLabel = new Map<string, number>();
        for (const [label, addr] of this.numberForLabel) {
            newNumberForLabel.set(label, addr + this.cmdOffset);
        }
        this.numberForLabel = newNumberForLabel;

        // Adjust labelLocations: Map<string, { file: string, lineNr: number, address: number }>
        const newLabelLocations = new Map<string, { file: string, lineNr: number, address: number }>();
        for (const [label, loc] of this.labelLocations) {
            newLabelLocations.set(label, { ...loc, address: loc.address + this.cmdOffset });
        }
        this.labelLocations = newLabelLocations;

        // Adjust fileLineNrs: Map<number, SourceFileEntry> (key is address)
        const newFileLineNrs = new Map<number, SourceFileEntry>();
        for (const [addr, entry] of this.fileLineNrs) {
            newFileLineNrs.set(addr + this.cmdOffset, entry);
        }
        this.fileLineNrs = newFileLineNrs;

        // Adjust listFile: Array<ListFileLine>
        this.listFile.forEach(entry => {
            if (entry.longAddr !== undefined) {
                entry.longAddr += this.cmdOffset;
            }
        });

        // Adjust watchPointLines, assertionLines, logPointLines: Array<{ address: number, line: string }>
        this.watchPointLines.forEach(entry => entry.address += this.cmdOffset);
        this.assertionLines.forEach(entry => entry.address += this.cmdOffset);
        this.logPointLines.forEach(entry => entry.address += this.cmdOffset);

        // Adjust labelsForNumber64k: Array<string[] | undefined> (index is 64k address)
        const newLabelsForNumber64k = new Array<string[] | undefined>(0x10000); // Max 64k entries
        for (let i = 0; i < this.labelsForNumber64k.length; i++) { // Iterate up to old length
            if (this.labelsForNumber64k[i]) {
                const newAddr = i + this.cmdOffset;
                if (newAddr >= 0 && newAddr < 0x10000) { // Check bounds for 64k array
                    newLabelsForNumber64k[newAddr] = this.labelsForNumber64k[i];
                } else {
                    this.reportIssue(`Address 0x${i.toString(16)} with offset 0x${this.cmdOffset.toString(16)} (new: 0x${newAddr.toString(16)}) is out of 64k bounds. Label ignored for labelsForNumber64k map.`, 'warning');
                }
            }
        }
        this.labelsForNumber64k = newLabelsForNumber64k;

        this.cmdOffsetApplied = true;
        console.log('[ZmacLabelParser] CMD offset successfully applied to label structures.');
    }
}
