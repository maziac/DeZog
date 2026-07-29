import * as fs from 'fs';
import * as path from 'path';
import {LabelParserBase, Issue} from './labelparserbase';
import {SourceFileEntry, ListFileLine} from './labels';
import {ZmacConfig} from '../settings/settings';
import {Utility} from '../misc/utility';
import {UnifiedPath} from '../misc/unifiedpath';
import {MemoryModel} from '../remotes/MemoryModel/memorymodel';


/**
 * Parser for zmac's .bds files ("binary-debuggable-source").
 *
 * The .bds file is a text format. After the header line
 * 'binary-debuggable-source' each line is one record:
 *   <addr> <addr> f <filename>     - source file switch
 *   <addr> <addr> s <source line>  - one source line (in file order!)
 *   <addr> <addr> d <hexbytes>     - bytes emitted for the FOLLOWING 's' record
 *   <addr> <addr> u <...>          - usage/timing info (ignored)
 *   <addr> a <symbol>              - symbol table entry (note: single address)
 *
 * Key property used here: zmac emits one 's' record per source line, in
 * order. So the Nth 's' record of a file IS line N of that file - no text
 * matching needed. 'd' records precede the 's' record they belong to and
 * define the line's address and byte size.
 * Note: macro expansions would repeat lines and break the sequential
 * counting; the test corpus does not use macros. Revisit if needed.
 */
export class ZmacLabelParser extends LabelParserBase {
    protected config: ZmacConfig;
    private rootFolder: string;

    // Symbols from the 'a' records (zmac's symbol table).
    private symbols: Array<{addr64k: number, name: string}> = [];

    constructor(
        memoryModel: MemoryModel,
        fileLineNrs: Map<number, SourceFileEntry>,
        lineArrays: Map<string, Array<number>>,
        labelsForNumber64k: Array<any>,
        labelsForLongAddress: Map<number, Array<string>>,
        numberForLabel: Map<string, number>,
        labelLocations: Map<string, {file: string, lineNr: number, address: number}>,
        watchPointLines: Array<{address: number, line: string}>,
        assertionLines: Array<{address: number, line: string}>,
        logPointLines: Array<{address: number, line: string}>,
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
        this.listFile = [];
        this.includeFileStack = [];
    }


    public loadAsmListFile(config: ZmacConfig) {
        this.config = config;
        this.listFile = [];
        this.symbols = [];
        this.currentLineNr = 0;

        // Establishes funcConvertBank (64k -> target memory model banks)
        this.checkMappingToTargetMemoryModel();

        this.parseBdsFile(this.config.path);

        // Register the symbol table (authoritative, includes EQUs and locals)
        for (const sym of this.symbols) {
            const longAddr = this.createLongAddress(sym.addr64k & 0xFFFF, 0);
            this.addLabelForNumberRaw(longAddr, sym.name);
        }

        // Build fileLineNrs, lineArrays from this.listFile
        this.sourcesModeFinish();

        // Label -> source location (now that fileLineNrs is populated)
        for (const sym of this.symbols) {
            const longAddr = this.createLongAddress(sym.addr64k & 0xFFFF, 0);
            const entry = this.fileLineNrs.get(longAddr);
            if (entry)
                this.labelLocations.set(sym.name, {file: entry.fileName, lineNr: entry.lineNr, address: longAddr});
        }
    }


    private parseBdsFile(filePath: string): void {
        const bdsLines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);

        // Per-file 0-based line counters, keyed by the raw name from the 'f'
        // record so counting stays correct even for unresolvable files.
        const lineCounters = new Map<string, number>();
        let currentBdsFileName: string | undefined;
        let currentFileRel = '';    // '' = source file could not be resolved
        const sourceFilesRel = new Map<string, string>();   // bds name -> relative path ('' if unresolved)

        // Bytes collected from 'd' records for the next 's' record
        let pendingAddr64k: number | undefined;
        let pendingSize = 0;

        this.currentLineNr = 0;
        for (const bdsLine of bdsLines) {
            this.currentLineNr++;
            if (bdsLine.trim() === '' || bdsLine === 'binary-debuggable-source')
                continue;

            const parts = bdsLine.split(/\s+/);

            // Symbol record: "<addr> a <name>"
            if (parts[1] === 'a') {
                const addr64k = parseInt(parts[0], 16);
                const name = parts.slice(2).join(' ').trim();
                if (!isNaN(addr64k) && name)
                    this.symbols.push({addr64k, name});
                continue;
            }

            const addr64k = parseInt(parts[0], 16);
            const type = parts[2];
            switch (type) {
                case 'f': {
                    const bdsFileName = parts.slice(3).join(' ').trim();
                    currentBdsFileName = bdsFileName;
                    if (!lineCounters.has(bdsFileName))
                        lineCounters.set(bdsFileName, 0);
                    if (!sourceFilesRel.has(bdsFileName)) {
                        const resolved = this.resolveSourceFilePath(bdsFileName);
                        sourceFilesRel.set(bdsFileName, resolved ? Utility.getRelFilePath(resolved) : '');
                        if (!resolved)
                            this.reportIssue(`Source file '${bdsFileName}' not found.`, 'warning');
                    }
                    currentFileRel = sourceFilesRel.get(bdsFileName)!;
                    pendingAddr64k = undefined;
                    pendingSize = 0;
                    break;
                }

                case 'd': {
                    // Hex byte dump for the following 's' record
                    const hex = parts[3] || '';
                    if (pendingAddr64k === undefined)
                        pendingAddr64k = addr64k;
                    pendingSize += Math.floor(hex.length / 2);
                    break;
                }

                case 's': {
                    if (currentBdsFileName === undefined)
                        break;      // No 'f' record seen yet
                    const lineNr = lineCounters.get(currentBdsFileName)!;
                    lineCounters.set(currentBdsFileName, lineNr + 1);
                    if (currentFileRel === '') {
                        // Unresolved source file: keep counting, register nothing
                        pendingAddr64k = undefined;
                        pendingSize = 0;
                        break;
                    }

                    const lineText = parts.slice(3).join(' ');
                    const hasCode = (pendingAddr64k !== undefined);
                    const lineAddr64k = hasCode ? pendingAddr64k! : addr64k;
                    // Lines before ORG carry address 0 - don't map those
                    const longAddr = (hasCode || lineAddr64k !== 0)
                        ? this.createLongAddress(lineAddr64k & 0xFFFF, 0)
                        : undefined;

                    const entry: ListFileLine = {
                        fileName: currentFileRel,
                        lineNr,     // 0-based
                        longAddr,
                        size: hasCode ? pendingSize : 0,
                        line: lineText
                    };
                    this.listFile.push(entry);
                    this.currentFileEntry = entry;
                    this.findWpmemAssertionLogpoint(longAddr, lineText);

                    pendingAddr64k = undefined;
                    pendingSize = 0;
                    break;
                }

                // 'u' (usage/timing) and anything unknown: ignore
            }
        }
    }


    /**
     * Resolves a source file name from the .bds file to an existing file:
     * relative to the .bds location, the configured srcDirs and the root folder.
     */
    private resolveSourceFilePath(bdsFileName: string): string | undefined {
        if (path.isAbsolute(bdsFileName))
            return fs.existsSync(bdsFileName) ? UnifiedPath.getUnifiedPath(bdsFileName) : undefined;

        const searchDirs = [
            path.dirname(this.config.path),
            ...(this.config.srcDirs || []).map(d => path.resolve(this.rootFolder, d)),
            this.rootFolder
        ];
        for (const dir of searchDirs) {
            const testPath = path.resolve(dir, bdsFileName);
            if (fs.existsSync(testPath))
                return UnifiedPath.getUnifiedPath(testPath);
        }
        return undefined;
    }


    private reportIssue(message: string, severity: 'error' | 'warning'): void {
        if (this.issueHandler) {
            this.issueHandler({
                parser: this.parserName,
                filepath: this.config.path,
                lineNr: this.currentLineNr,
                severity,
                message
            });
        }
        else {
            console.warn(`${this.parserName} [${severity}] ${this.config.path}:${this.currentLineNr}: ${message}`);
        }
    }


    protected parseAllFilesAndLineNumbers(): void {
        // No-op: parseBdsFile does everything in one pass
    }

    protected parseLabelAndAddress(line: string): void {
        // No-op: parseBdsFile does everything in one pass
    }


    /**
     * Called by the TRS-80 remote after the .cmd file has been loaded.
     * The .bds file already contains absolute addresses, so no relocation is
     * needed - this only cross-checks that the loaded .cmd covers the same
     * address range as the debug info (a mismatch means .cmd and .bds are
     * from different assembler runs).
     */
    public enableCmdIntegration(cmdMappings: Map<number, {data: Uint8Array, size: number, entryPoint?: number}>): void {
        if (cmdMappings.size === 0)
            return;
        // Find the code range known from the .bds
        let bdsMin = 0x10000, bdsMax = -1;
        for (const entry of this.listFile) {
            if (entry.longAddr !== undefined && entry.size > 0) {
                const a = entry.longAddr & 0xFFFF;
                bdsMin = Math.min(bdsMin, a);
                bdsMax = Math.max(bdsMax, a + entry.size - 1);
            }
        }
        if (bdsMax < 0)
            return;
        for (const [address, block] of cmdMappings) {
            const end = address + block.size - 1;
            if (end < bdsMin || address > bdsMax) {
                this.reportIssue(`CMD block 0x${address.toString(16)}-0x${end.toString(16)} lies outside the .bds code range 0x${bdsMin.toString(16)}-0x${bdsMax.toString(16)}. .cmd and .bds may be from different assembler runs.`, 'warning');
            }
        }
    }
}
