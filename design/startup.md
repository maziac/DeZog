# vscode debug startup

Traced startup sequence.
Is here just for reference.


```puml
title vscode debug startup

hide footbox

participant vscode
participant DeZog
participant ZXSocket as "Zesarux\nSocket"

== init  ==
vscode -> DeZog: <font color=red><b>initialize</b></font>, ({"clientID":"vscode","clientName":"Visual Studio Code",\n"adapterID":"dezog","pathFormat":"path","linesStartAt1":true,"columnsStartAt1":true,\n"supportsVariableType":true,"supportsVariablePaging":true,\n"supportsRunInTerminalRequest":true,"locale":"en-us"})
vscode <- DeZog: <font color=red><b>sendResponse, initialize</b></font>({"supportsConfigurationDoneRequest":false,\n"supportsStepBack":true,"supportTerminateDebuggee":true,"supportsGotoTargetsRequest":true,\n"supportsEvaluateForHovers":true,"supportsSetVariable":true})


== launch==
vscode -> DeZog: <font color=red><b>launch</b></font>({"type":"dezog","request":"launch","name":"Zesarux Debugger",\n"debugServer":4711,"startAutomatically":false,\n"listFile":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list",\n"labelsFile":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.labels",\n,"__sessionId":"e0eec1b5-3612-462f-bd08-7c78fcf99476"})
vscode <- DeZog: <font color=red><b>sendResponse, launch</b></font>(undefined)
ZXSocket <- DeZog: connect
ZXSocket -> DeZog: connected
vscode <- DeZog: <font color=red><b>sendEvent, stopped</b></font>({"reason":"entry","threadId":1})

vscode <- DeZog: <font color=red><b>sendEvent, initialized</b></font>(undefined)

== threads ==
vscode -> DeZog: <font color=red><b>threads</b></font>(undefined)
vscode <- DeZog: <font color=red><b>sendResponse, threads</b></font>({"threads":[{"id":1,"name":"thread_1"}]})

== breakpoints ==
vscode -> DeZog: <font color=red><b>setBreakpoints</b></font>({"source":{"name":"starwarrior.list",\n"path":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list"},\n"lines":[14343,14344,17011,21550,21553],"breakpoints":[{"line":14343},{"line":14344},{"line":17011},\n{"line":21550},{"line":21553}],"sourceModified":false})
vscode <- DeZog: <font color=red><b>sendResponse, setBreakpoints</b></font>(undefined)

== stacktrace ==
vscode -> DeZog: <font color=red><b>stackTrace</b></font>({"threadId":1,"startFrame":0,"levels":20})
vscode -> DeZog: <font color=red><b>threads</b></font>(undefined)
vscode <- DeZog: <font color=red><b>sendResponse, threads</b></font>({"threads":[{"id":1,"name":"thread_1"}]})
vscode -> DeZog: <font color=red><b>stackTrace({"threadId":1</b></font>,"startFrame":0,"levels":20})
vscode <- DeZog: <font color=red><b>sendResponse</b></font>, stackTrace({"stackFrames":[{"id":0,"source":{"name":"starwarrior.list",\n"path":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list",\n"sourceReference":0,"adapterData":"zesarux-adapter-data"},"line":0,"column":0,"name":null}],\n"totalFrames":1})

== var scopes ==
vscode -> DeZog: <font color=red><b>scopes</b></font>({"frameId":0})
vscode <- DeZog: <font color=red><b>sendResponse, scopes</b></font>({"scopes":[{"name":"Disassembly",\n"variablesReference":1048577,"expensive":false},{"name":"Registers",\n"variablesReference":1048578,"expensive":false},{"name":"Registers 2",\n"variablesReference":1048579,"expensive":false}]})

== from WATCHES ==
vscode -> DeZog: <font color=red><b>evaluate</b></font>({"expression":"VSYNC_COUNTER","frameId":0,"context":"watch"})
vscode -> DeZog: <font color=red><b>evaluate</b></font>({"expression":"speech_toggle_rom","frameId":0,"context":"watch"})
vscode -> DeZog: <font color=red><b>evaluate</b></font>({"expression":"LBL_SYSTEM_VARIABLES","frameId":0,"context":"watch"})

== from VARIABLES ==
vscode -> DeZog: <font color=red><b>variables</b></font>({"variablesReference":1048577})

vscode <- DeZog: <font color=red><b>sendResponse, stackTrace</b></font>({"stackFrames":[{"id":0,"source":{"name":"starwarrior.list",\n"path":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list",\n"sourceReference":0,"adapterData":"zesarux-adapter-data"},"line":0,"column":0,\n"name":null}],"totalFrames":1})

vscode <- DeZog: <font color=red><b>sendResponse, evaluate</b></font>({"result":"(5C78h)b=NaN/'', (5C78h)w=NaN",\n"variablesReference":285816,"type":"data","namedVariables":2})
vscode <- DeZog: <font color=red><b>sendResponse, evaluate</b></font>({"result":"(0038h)b=0/'', (0038h)w=3584",\n"variablesReference":262200,"type":"data","namedVariables":2})
vscode <- DeZog: <font color=red><b>sendResponse, evaluate</b></font>({"result":"(5C00h)b=0/'', (5C00h)w=3584",\n"variablesReference":285696,"type":"data","namedVariables":2})
vscode <- DeZog: <font color=red><b>sendResponse, variables</b></font>({"variables":[{"name":"00","type":"string",\n"value":"","variablesReference":0},{"name":"mman","type":"string",\n"value":"> PC=fdfd SP=9f0a BC=0007 A=00 HL=5c78 DE=6323 IX=6f00 IY=a926\nA'=1e BC'=0200 HL'=a97a DE'=4e41 I=fe R=58  F=S    HNC F'=    3HN  \nMEMPTR=0000 IM2         VPS: 0 ","variablesReference":0}]})

```


# Remote startup

~~~puml
title Remote startup
hide footbox

participant vscode
participant da as "DeZog/\nDebug Adapter"
participant remote as "Remote"
participant emulator as "Emulator"
participant labels as "Labels"
'participant model as "Memory Model"


vscode -> da: initialize
vscode <- da: sendResponse(initialize)

vscode -> da: launch
note over da: clear variables
da -> da: launch
note over da: create disassembler
da -> da: startEmulator
da -> remote:
activate remote

da -> remote: init
remote -> remote: doInitialization

opt zsim
	remote -> remote: configureMachine
	remote -> remote: load
	remote -> remote: createZ80RegistersDecoder
	note over remote: create memory model\n and init
	da <- remote: event('initialized')
else cspect
	note over remote: connect socket
	remote -> remote: event('connect')
	group dzrpremote
		remote -> remote: onConnect
		remote -> remote: sendDzrpCmdInit
		remote -> remote: load
		remote -> remote: createZ80RegistersDecoder
		note over remote: create memory model\n and init
		da <- remote: event('initialized')
	end
else zxnext
	note over remote: connect serial
	remote -> remote: event('open')
	group dzrpremote
		remote -> remote: onConnect
		...
		da <- remote: event('initialized')
	end
else zesarux
	note over remote: connect socket
	remote -> remote: event('connected')
	remote -> remote: load
	note over remote: create Z80registers.decoder,\nmemory model\nand init
	da <- remote: event('initialized')
else mame
	note over remote: connect socket
	remote -> remote: event('connect')
	remote -> remote: onConnect
	remote -> remote: load
	remote -> remote: createZ80RegistersDecoder
	note over remote: create memory model\nand init
	da <- remote: event('initialized')
end

da -> remote: readListfiles
remote -> labels: readListfiles
da -> remote: loadObjs
da -> remote: initWpmemAssertionLogpoints
remote -> labels: getWatchPointLines
remote -> labels: getAssertionLines
remote -> labels: getLogPointLines
da -> remote: setLaunchExecAddress
da -> remote: getRegistersFromEmulator
da -> remote: getCallStackFromEmulator

vscode <- da: sendEvent(InitializedEvent)

alt Settings.launch.startAutomatically == true
	da -> da: remoteContinue
	da -> remote: continue
else
	vscode <- da: sendEvent(StoppedEvent)
end

vscode <- da: sendResponse(launch)

~~~
