import {spawn, ChildProcess} from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {Utility} from '../../misc/utility';

/**
 * trs80gp Mock Server Launcher
 * Handles launching and managing the mock trs80gp server for development and testing.
 */
export class Trs80MockServerLauncher {
    private mockServerProcess: ChildProcess | undefined;
    private mockServerPort: number;
    private mockServerPath: string;

    constructor(port: number = 49152) {
        this.mockServerPort = port;
        
        // Get the path to the mock server
        // First try finding the path relative to the current execution context (for tests)
        const basePath = process.cwd();
        const devPath = path.join(basePath, 'src', 'remotes', 'trs80', 'mock-server');
        const outPath = path.join(basePath, 'out', 'src', 'remotes', 'trs80', 'mock-server');
        
        if (fs.existsSync(devPath)) {
            this.mockServerPath = devPath;
        } else if (fs.existsSync(outPath)) {
            this.mockServerPath = outPath;
        } else {
            // Fall back to extension path as a last resort
            const extensionPath = Utility.getExtensionPath();
            if (extensionPath) {
                // First try the out directory (for compiled source)
                const extensionOutPath = path.join(extensionPath, 'out', 'src', 'remotes', 'trs80', 'mock-server');
                // Then try the src directory (for packaged source)
                const extensionSrcPath = path.join(extensionPath, 'src', 'remotes', 'trs80', 'mock-server');
                
                if (fs.existsSync(extensionOutPath)) {
                    this.mockServerPath = extensionOutPath;
                } else if (fs.existsSync(extensionSrcPath)) {
                    this.mockServerPath = extensionSrcPath;
                } else {
                    this.mockServerPath = extensionOutPath; // Default fallback
                }
            } else {
                // For testing without extension context, use source directory
                this.mockServerPath = path.join(basePath, 'src', 'remotes', 'trs80', 'mock-server');
            }
        }
    }

    /**
     * Start the trs80gp mock server.
     * @returns Promise that resolves when the server is ready
     */
    public async start(): Promise<void> {
        // Check if mock server files exist - try both dist/ and direct locations
        let serverScriptPath = path.join(this.mockServerPath, 'dist', 'server.js');
        if (!fs.existsSync(serverScriptPath)) {
            serverScriptPath = path.join(this.mockServerPath, 'server.js');
        }
        const packageJsonPath = path.join(this.mockServerPath, 'package.json');

        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`trs80gp mock server not found at: ${this.mockServerPath}`);
        }

        // Build the mock server if needed
        if (!fs.existsSync(serverScriptPath)) {
            await this.buildMockServer();
        }

        // Check if port is already in use and try to free it
        await this.ensurePortAvailable();

        // Start the mock server process
        return new Promise((resolve, reject) => {
            console.log(`Starting mock server from: ${serverScriptPath}`);
            this.mockServerProcess = spawn('node', [serverScriptPath, this.mockServerPort.toString()], {
                cwd: this.mockServerPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let serverReady = false;

            // Handle stdout
            this.mockServerProcess.stdout?.on('data', (data: Buffer) => {
                const output = data.toString();
                console.log(`[trs80gp Mock] ${output.trim()}`);
                
                // Check if server is ready - look for the listening message
                if (output.includes('listening on port') && !serverReady) {
                    serverReady = true;
                    console.log('[trs80gp Mock] Server startup detected, resolving...');
                    resolve();
                }
            });

            // Handle stderr
            this.mockServerProcess.stderr?.on('data', (data: Buffer) => {
                const error = data.toString();
                console.error(`[trs80gp Mock] ${error.trim()}`);
            });

            // Handle process exit
            this.mockServerProcess.on('exit', (code: number | null) => {
                if (!serverReady) {
                    console.error(`[trs80gp Mock] Process exited before server was ready (exit code: ${code})`);
                    
                    // Provide helpful error messages based on exit code
                    let errorMessage = `trs80gp mock server failed to start (exit code: ${code})`;
                    if (code === 1) {
                        errorMessage += '. This usually indicates a port conflict. Please ensure port ' + this.mockServerPort + ' is not in use by another process.';
                    } else if (code === 0) {
                        errorMessage += '. The server exited normally but never became ready. This might indicate a port conflict or missing dependencies.';
                    }
                    
                    reject(new Error(errorMessage));
                } else {
                    console.log(`[trs80gp Mock] Server stopped (exit code: ${code})`);
                }
                this.mockServerProcess = undefined;
            });

            // Handle process errors
            this.mockServerProcess.on('error', (error: Error) => {
                if (!serverReady) {
                    reject(new Error(`Failed to start trs80gp mock server: ${error.message}`));
                } else {
                    console.error(`[trs80gp Mock] Process error: ${error.message}`);
                }
            });

            // Set a timeout for server startup
            setTimeout(() => {
                if (!serverReady) {
                    console.error('[trs80gp Mock] Server startup timeout');
                    this.stop();
                    reject(new Error('trs80gp mock server startup timeout'));
                }
            }, 15000); // Increased to 15 second timeout
        });
    }

    /**
     * Stop the trs80gp mock server.
     */
    public stop(): void {
        if (this.mockServerProcess) {
            this.mockServerProcess.kill('SIGTERM');
            this.mockServerProcess = undefined;
        }
    }

    /**
     * Check if the mock server is currently running.
     */
    public isRunning(): boolean {
        return this.mockServerProcess !== undefined && !this.mockServerProcess.killed;
    }

    /**
     * Get the port the mock server is listening on.
     */
    public getPort(): number {
        return this.mockServerPort;
    }

    /**
     * Build the mock server TypeScript code.
     */
    private async buildMockServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`Building mock server at: ${this.mockServerPath}`);
            const buildProcess = spawn('npm', ['run', 'build'], {
                cwd: this.mockServerPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let buildOutput = '';
            let buildError = '';

            buildProcess.stdout?.on('data', (data: Buffer) => {
                buildOutput += data.toString();
            });

            buildProcess.stderr?.on('data', (data: Buffer) => {
                buildError += data.toString();
            });

            buildProcess.on('exit', (code: number | null) => {
                if (code === 0) {
                    console.log('[trs80gp Mock] Build completed successfully');
                    resolve();
                } else {
                    console.error('[trs80gp Mock] Build failed:');
                    console.error(buildOutput);
                    console.error(buildError);
                    reject(new Error(`Mock server build failed with exit code: ${code}`));
                }
            });

            buildProcess.on('error', (error: Error) => {
                reject(new Error(`Failed to build mock server: ${error.message}`));
            });
        });
    }

    /**
     * Ensure the mock server port is available by killing any existing processes using it.
     */
    private async ensurePortAvailable(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Check what's using the port
            const lsofProcess = spawn('lsof', ['-i', `:${this.mockServerPort}`], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let output = '';
            lsofProcess.stdout?.on('data', (data: Buffer) => {
                output += data.toString();
            });

            lsofProcess.on('exit', (code: number | null) => {
                if (code === 0 && output.trim()) {
                    // Port is in use, try to kill the processes
                    console.log(`[trs80gp Mock] Port ${this.mockServerPort} is in use, attempting to free it...`);
                    this.killProcessesOnPort(output)
                        .then(() => {
                            console.log(`[trs80gp Mock] Port ${this.mockServerPort} freed successfully`);
                            resolve();
                        })
                        .catch((error) => {
                            console.error(`[trs80gp Mock] Failed to free port ${this.mockServerPort}: ${error.message}`);
                            // Continue anyway, let the server startup handle the port conflict
                            resolve();
                        });
                } else {
                    // Port is free or lsof failed
                    resolve();
                }
            });

            lsofProcess.on('error', (error: Error) => {
                // lsof command failed, continue anyway
                console.log(`[trs80gp Mock] Could not check port status: ${error.message}`);
                resolve();
            });
        });
    }

    /**
     * Kill processes that are using the mock server port.
     */
    private async killProcessesOnPort(lsofOutput: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Parse lsof output to find PIDs
            const lines = lsofOutput.split('\n');
            const pids: string[] = [];
            
            for (const line of lines) {
                if (line.includes('node') && line.includes(`:${this.mockServerPort}`)) {
                    const parts = line.split(/\s+/);
                    if (parts.length > 1) {
                        const pid = parts[1];
                        if (pid && /^\d+$/.test(pid)) {
                            pids.push(pid);
                        }
                    }
                }
            }

            if (pids.length === 0) {
                resolve();
                return;
            }

            console.log(`[trs80gp Mock] Killing processes: ${pids.join(', ')}`);
            
            // Kill all found processes
            const killPromises = pids.map(pid => {
                return new Promise<void>((killResolve) => {
                    const killProcess = spawn('kill', ['-9', pid], {
                        stdio: ['ignore', 'pipe', 'pipe']
                    });
                    
                    killProcess.on('exit', () => {
                        console.log(`[trs80gp Mock] Killed process ${pid}`);
                        killResolve();
                    });
                    
                    killProcess.on('error', () => {
                        console.log(`[trs80gp Mock] Process ${pid} already dead or inaccessible`);
                        killResolve();
                    });
                });
            });

            Promise.all(killPromises)
                .then(() => {
                    // Wait a moment for ports to be freed
                    setTimeout(() => resolve(), 1000);
                })
                .catch(reject);
        });
    }
}
