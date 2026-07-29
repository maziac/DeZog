import * as net from 'net';

/**
 * Port allocation manager for trs80gp emulator instances.
 * Handles finding available ports in the range 49152 down to 49089.
 */
export class PortManager {
    private static readonly DEFAULT_PORT = 49152; // 48K addressable memory (TRS-80 Model I/III)
    private static readonly MAX_PORT_ATTEMPTS = 64; // Check 64 ports maximum
    private static readonly PORT_CHECK_TIMEOUT = 1000; // 1 second timeout for port checks

    /**
     * Find the next available port starting from the default port and decrementing.
     * 
     * @param preferredPort Optional preferred port to start checking from (defaults to 49152)
     * @returns Promise that resolves to an available port number
     * @throws Error if no free port is found after checking MAX_PORT_ATTEMPTS ports
     */
    public static async findAvailablePort(preferredPort?: number): Promise<number> {
        const startPort = preferredPort || this.DEFAULT_PORT;
        const minPort = startPort - this.MAX_PORT_ATTEMPTS + 1;
        
        console.log(`Searching for available port starting from ${startPort} down to ${minPort}`);
        
        const busyPorts: Array<{port: number, process?: string}> = [];
        
        for (let port = startPort; port >= minPort; port--) {
            try {
                const isAvailable = await this.isPortAvailable(port);
                if (isAvailable) {
                    console.log(`Found available port: ${port}`);
                    return port;
                } else {
                    // Try to get process info for better error reporting
                    const processInfo = await this.getPortProcessInfo(port);
                    busyPorts.push({port, process: processInfo});
                }
            } catch (error) {
                console.warn(`Error checking port ${port}: ${error.message}`);
                busyPorts.push({port});
            }
        }
        
        // No free port found, create detailed error message
        const busyPortsStr = busyPorts
            .map(bp => bp.process ? `${bp.port} (${bp.process})` : `${bp.port}`)
            .join(', ');
            
        throw new Error(
            `All TCP/IP ports busy. Checked ports ${startPort} down to ${minPort}. ` +
            `Busy ports: ${busyPortsStr}`
        );
    }
    
    /**
     * Check if a specific port is available by attempting to bind to it.
     * 
     * @param port Port number to check
     * @returns Promise that resolves to true if port is available, false otherwise
     */
    public static async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            const timeout = setTimeout(() => {
                server.close();
                resolve(false);
            }, this.PORT_CHECK_TIMEOUT);
            
            server.listen(port, 'localhost', () => {
                clearTimeout(timeout);
                server.close(() => {
                    resolve(true);
                });
            });
            
            server.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }
    
    /**
     * Attempt to get process information for a busy port.
     * Uses lsof on macOS/Linux to identify what's using the port.
     * 
     * @param port Port number to investigate
     * @returns Promise that resolves to process info string or undefined
     */
    public static async getPortProcessInfo(port: number): Promise<string | undefined> {
        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            // Use lsof to find what's using the port
            const { stdout } = await execAsync(`lsof -i :${port} -t`);
            const pid = stdout.trim();
            
            if (pid) {
                // Get process name from PID
                const { stdout: processName } = await execAsync(`ps -p ${pid} -o comm=`);
                return `PID ${pid}: ${processName.trim()}`;
            }
        } catch (error) {
            // Silently fail - we'll just return undefined
        }
        
        return undefined;
    }
    
    /**
     * Check if the default trs80gp port (49152) is available.
     * This is a convenience method for quick checks.
     * 
     * @returns Promise that resolves to true if the default port is available
     */
    public static async isDefaultPortAvailable(): Promise<boolean> {
        return this.isPortAvailable(this.DEFAULT_PORT);
    }
    
    /**
     * Get the default port number for trs80gp emulator.
     * 
     * @returns The default port number (49152)
     */
    public static getDefaultPort(): number {
        return this.DEFAULT_PORT;
    }
    
    /**
     * Validate that a port number is within the acceptable range for trs80gp.
     * 
     * @param port Port number to validate
     * @returns True if port is in the valid range
     */
    public static isValidTrs80GpPort(port: number): boolean {
        const minPort = this.DEFAULT_PORT - this.MAX_PORT_ATTEMPTS + 1;
        return port >= minPort && port <= this.DEFAULT_PORT;
    }
}
