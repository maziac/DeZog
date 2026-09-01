# Collect ideas for a common DTRP protocol
Idea is to use one "dzrp" Remote for all.
This Remote would cover "cspect", "mame", "zxnext", "zsim".

TODO: Overwork this document!!!!

# Dzrp Class Design
~~~
           ┌──────────────────────┐
           │                      │
           │      RemoteBase      │
           │                      │
           └──────────────────────┘
                       △
                       │
                       │
            ┌────────────────────┐
            │                    │
            │     DzrpRemote     │◆─────────┬────────────┬────────────┐
            │                    │          │            │            │
            └────────────────────┘     ┌─────────┐  ┌─────────┐  ┌─────────┐
                       △               │ NexFile │  │ SnaFile │  │   Obj   │
                       │               └─────────┘  └─────────┘  └─────────┘
                       │
               ┌───────┴────────────────────┐
               │                            │
               │                            │
   ┌──────────────────────┐      ┌────────────────────┐
   │                      │      │                    │
   │      ZSimRemote      │      │  DzrpQueuedRemote  │
   │                      │      │                    │
   └──────────────────────┘      └────────────────────┘
                                            △
                                            │
                                            ├────────────────────────────────┐
                                            │                                │
                                            │                     ┌────────────────────┐
                                            │                     │                    │
                                            │                     │     MameRemote     │
                                            │                     │                    │
                                            │                     └────────────────────┘
                                 ┌────────────────────┐                      ▲
                                 │                    │                      │
                                 │DzrpTransportRemote │                      ▼
                                 │                    │              ┌──────────────┐
                                 └────────────────────┘              │    Socket    │
                                            ▲                        └──────────────┘
                                            │
                      ┌─────────────────────┴───────────────────────────┬───────────────────────────────────┐
                      │                                                 │                                   │
                      │                                                 │                                   │
           ┌────────────────────┐                            ┌────────────────────┐              ┌────────────────────┐
           │                    │                            │                    │              │                    │
           │ DzrpDezogIfRemote  │                            │ DzrpGenericRemote  │              │    CSpectRemote    │
           │                    │                            │                    │              │                    │
           └────────────────────┘                            └────────────────────┘              └────────────────────┘
                      ▲                                                 ▲                                   ▲
           ┌──────────┴────────────┐                        ┌───────────┴───────────┐                       │
           │                       │                        │                       │                       ▼
┌─────────────────────┐ ┌─────────────────────┐  ┌─────────────────────┐ ┌─────────────────────┐    ┌──────────────┐
│                     │ │                     │  │DzrpGenericSocketRemo│ │DzrpGenericSerialRemo│    │    Socket    │
│ ZxNextSocketRemote  │ │ ZxNextSerialRemote  │  │         te          │ │         te          │    └──────────────┘
│                     │ │                     │  │                     │ │                     │
└─────────────────────┘ └─────────────────────┘  └─────────────────────┘ └─────────────────────┘
           ▲                       ▲                        ▲                       ▲
           │                       │                        │                       │
           ▼                       ▼                        ▼                       ▼
   ┌──────────────┐        ┌──────────────┐         ┌──────────────┐        ┌──────────────┐
   │    Socket    │        │    Serial    │         │    Socket    │        │    Serial    │
   └──────────────┘        └──────────────┘         └──────────────┘        └──────────────┘                           ~~~

## DzrpRemote
Has stubs for all DzrpCommands.

## DzrpQueuedRemote
Has the handling for sending and receiving asynchronous messages for use wth some transport layer.
Is agnostic of the transport layer.
I.e. used as a parent for ZXNextSerialRemote and CSpectRemote but also for MameRemote (not using dzrp at low level).

## DzrpTransportRemote
Prepares the dzrp messages in a buffer to send them through a transport.
I.e. this assumes the physical transport is really uses dzrp content (opposed to e.g. mame).
But it still is agnostic of the used transport, e.g. if send through socket or serial.
If you intend to develop a new Remote which uses DZRP also in the physical transport then derive from DzrpTransportRemote or one of its subclasses.


# Early conclusion
Already looking at function 'createZ80RegistersDecoder' reveals that DeZog has special knowledge about the connected Remote.
All this knowledge would have to be translated into special treatment and extra commands to get more info (e.g. in this case that the zxnext does not return the IM field.)
Probably it is much easier to stay in the current design: the dezog implementation knows about the drawbacks/limitations of the Remote and treats them in a sub class.

However, especially for experimenting with new Remotes it would be useful to have a generic dzrp Remote (and class).
This class could use a new dzrp command to get info about all supported dzrp commands by the Remote.
It would then e.g. decide by itself which breakpoint commands to use.
(In the settings a property could be offered to override the supported commands to allow more customization from dezog side.)


# Next
1. Move common dzrp commands from zxnextserialremote and cspectremote to dzrpbuffer remote - done
2. Add a dzrpdezogifremote and put common functionality from zxnextserialremote and zxnextsocketremote in there
3. In DzrpTransportRemote add a command (and a property in settings) to read the cmd-capabilities of the Remote. Use only the commands allowed and give errors for the others.
4. Add a dzrp command as response for not implemented commands.


# Thoughts

- If no supported-commands is used. How to know that CMD_PAUSE is not supported?
  - Would have to be setup in DeZog.
  - E.g. 2 launch.json configurations for the same remote
  - Or:
    - Smaller response timeout (e.g. 200ms): So user directly gets feedback if the functionality is not available.
- How to save the dezogif configuration?
  - What info:
    - async break
    - (optional) border flashing
  - And how to inform dezog about the configuration?
  - Saving in a file?
  - If not saved, dezog could configure it at start with a new command.
- DZRP command exceptions in DeZog:
  - Should I keep the approach that functions like sendDzrpCmdSetBreakpoints are genericly disabled if remoted does not support them?
  - Makes only sense if there is a generic "dzrp" implementation.
  - For this it would be required. But if anyway implemented it could be used for other Remotes as well.
  - Alternatively a NAK on the command could be used.
    - But requires dzrp implementation changes, but as this is used anyway only for experiments, new implementation this would be acceptable.
    - But NAK would then be a general requirement.

Conclusion:
- Configuration: Supported Commands
  - Also for existing Remotes
  - Only Exceptions on commands, not on higher level features
- For "zxnext": small response timeout for "PAUSE".
- No NAK.
- dezogif configuration
  - no support from dezog
  - up to dezogif
- Nevertheless I could implement the supported-commands command. Might be help for other implementations. Might be useful to check if PAUSE is supported. I.e. for dynamic changes.
- DZRP:
  - Define minimum set of supported commands: CMD_INIT, CMD_CLOSE, CMD_GET_SUPPORTED_COMMANDS?
  - But what problem would it solve?


# Answer

To use an example. The proposed generic "dzrp" could look like this:
~~~json
"dzrp": {
  "socket": "192.....",
  "port": 25000,
  "supportedCommands": "1,2,3,4,5....40,41" // (or a bitmap)
}
~~~

Emulator developers, who want to introduce a new remote and develop the dzrp counterpart could easily define their needs in the launch.json and choose from all implemented commands.
The only difference is that the remote's implementation (at the emulator) does not implement the features capabilities, but it is defined in the launch.json.

From development point of view this should be as easy (if not easier) than implementing a feature command.

But as a compromise we could also additionally have this feature request command.
Maybe it could be used as such:
~~~json
"dzrp": {
  "socket": "192.....",
  "port": 25000,
  "supportedCommands": "remote"
}
~~~

I.e. if the special keyword "remote" is found the request is sent and the response is used.