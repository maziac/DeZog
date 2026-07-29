# trs80gp Mock Server

This is a mock server that simulates the trs80gp emulator's JSON-RPC interface for testing the DeZog debugger extension without requiring the actual emulator.

## Features

- Implements the JSON-RPC protocol used by trs80gp emulator
- Simulates CPU registers and memory
- Supports basic debugging operations (step, continue, breakpoints)
- Responds to all the commands used by DeZog's TRS-80 remote implementation

## Usage

### Building

```bash
npm install
npm run build
```

### Running

```bash
npm start [port]
```

Where `port` is optional and defaults to 49152.

### Development

```bash
npm run dev  # Build and run
npm run watch  # Watch for changes and rebuild
```

## Testing with DeZog

To use this mock server with DeZog:

1. Configure your launch.json to use TRS-80 remote
2. Set the `useMock` property to `true`

Example configuration:

```json
{
    "type": "dezog",
    "request": "launch",
    "name": "TRS-80 (Mock)",
    "remoteType": "trs80gp",
    "trs80": {
        "hostname": "localhost",
        "port": 49152,
        "useMock": true
    },
    "sjasmplus": {
        "path": "${workspaceFolder}/program.asm"
    },
    "rootFolder": "${workspaceFolder}",
    "topOfStack": 65535
}
```
