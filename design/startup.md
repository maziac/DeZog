# Startup

Traced startup sequence.
Is here just for reference.


```puml
title Startup

hide footbox


participant vscode
participant ZXDebug
participant ZXSocket as "Zesarux\nSocket"

== init  ==
vscode -> ZXDebug: <font color=red><b>initialize</b></font>, ({"clientID":"vscode","clientName":"Visual Studio Code",\n"adapterID":"dezog","pathFormat":"path","linesStartAt1":true,"columnsStartAt1":true,\n"supportsVariableType":true,"supportsVariablePaging":true,\n"supportsRunInTerminalRequest":true,"locale":"en-us"})
vscode <- ZXDebug: <font color=red><b>sendResponse, initialize</b></font>({"supportsConfigurationDoneRequest":false,\n"supportsStepBack":true,"supportTerminateDebuggee":true,"supportsGotoTargetsRequest":true,\n"supportsEvaluateForHovers":true,"supportsSetVariable":true})


== launch==
vscode -> ZXDebug: <font color=red><b>launch</b></font>({"type":"dezog","request":"launch","name":"Zesarux Debugger",\n"debugServer":4711,"startAutomatically":false,\n"listFile":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list",\n"labelsFile":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.labels",\n,"__sessionId":"e0eec1b5-3612-462f-bd08-7c78fcf99476"})
vscode <- ZXDebug: <font color=red><b>sendResponse, launch</b></font>(undefined)
ZXSocket <- ZXDebug: connect
ZXSocket -> ZXDebug: connected
vscode <- ZXDebug: <font color=red><b>sendEvent, stopped</b></font>({"reason":"entry","threadId":1})

vscode <- ZXDebug: <font color=red><b>sendEvent, initialized</b></font>(undefined)

== threads ==
vscode -> ZXDebug: <font color=red><b>threads</b></font>(undefined)
vscode <- ZXDebug: <font color=red><b>sendResponse, threads</b></font>({"threads":[{"id":1,"name":"thread_1"}]})

== breakpoints ==
vscode -> ZXDebug: <font color=red><b>setBreakpoints</b></font>({"source":{"name":"starwarrior.list",\n"path":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list"},\n"lines":[14343,14344,17011,21550,21553],"breakpoints":[{"line":14343},{"line":14344},{"line":17011},\n{"line":21550},{"line":21553}],"sourceModified":false})
vscode <- ZXDebug: <font color=red><b>sendResponse, setBreakpoints</b></font>(undefined)

== stacktrace ==
vscode -> ZXDebug: <font color=red><b>stackTrace</b></font>({"threadId":1,"startFrame":0,"levels":20})
vscode -> ZXDebug: <font color=red><b>threads</b></font>(undefined)
vscode <- ZXDebug: <font color=red><b>sendResponse, threads</b></font>({"threads":[{"id":1,"name":"thread_1"}]})
vscode -> ZXDebug: <font color=red><b>stackTrace({"threadId":1</b></font>,"startFrame":0,"levels":20})
vscode <- ZXDebug: <font color=red><b>sendResponse</b></font>, stackTrace({"stackFrames":[{"id":0,"source":{"name":"starwarrior.list",\n"path":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list",\n"sourceReference":0,"adapterData":"zesarux-adapter-data"},"line":0,"column":0,"name":null}],\n"totalFrames":1})

== var scopes ==
vscode -> ZXDebug: <font color=red><b>scopes</b></font>({"frameId":0})
vscode <- ZXDebug: <font color=red><b>sendResponse, scopes</b></font>({"scopes":[{"name":"Disassembly",\n"variablesReference":1048577,"expensive":false},{"name":"Registers",\n"variablesReference":1048578,"expensive":false},{"name":"Registers 2",\n"variablesReference":1048579,"expensive":false}]})

== from WATCHES ==
vscode -> ZXDebug: <font color=red><b>evaluate</b></font>({"expression":"VSYNC_COUNTER","frameId":0,"context":"watch"})
vscode -> ZXDebug: <font color=red><b>evaluate</b></font>({"expression":"speech_toggle_rom","frameId":0,"context":"watch"})
vscode -> ZXDebug: <font color=red><b>evaluate</b></font>({"expression":"LBL_SYSTEM_VARIABLES","frameId":0,"context":"watch"})

== from VARIABLES ==
vscode -> ZXDebug: <font color=red><b>variables</b></font>({"variablesReference":1048577})

vscode <- ZXDebug: <font color=red><b>sendResponse, stackTrace</b></font>({"stackFrames":[{"id":0,"source":{"name":"starwarrior.list",\n"path":"/Volumes/Macintosh HD 2/Projects/zesarux/starwarrior/starwarrior.list",\n"sourceReference":0,"adapterData":"zesarux-adapter-data"},"line":0,"column":0,\n"name":null}],"totalFrames":1})

vscode <- ZXDebug: <font color=red><b>sendResponse, evaluate</b></font>({"result":"(5C78h)b=NaN/'', (5C78h)w=NaN",\n"variablesReference":285816,"type":"data","namedVariables":2})
vscode <- ZXDebug: <font color=red><b>sendResponse, evaluate</b></font>({"result":"(0038h)b=0/'', (0038h)w=3584",\n"variablesReference":262200,"type":"data","namedVariables":2})
vscode <- ZXDebug: <font color=red><b>sendResponse, evaluate</b></font>({"result":"(5C00h)b=0/'', (5C00h)w=3584",\n"variablesReference":285696,"type":"data","namedVariables":2})
vscode <- ZXDebug: <font color=red><b>sendResponse, variables</b></font>({"variables":[{"name":"00","type":"string",\n"value":"","variablesReference":0},{"name":"mman","type":"string",\n"value":"> PC=fdfd SP=9f0a BC=0007 A=00 HL=5c78 DE=6323 IX=6f00 IY=a926\nA'=1e BC'=0200 HL'=a97a DE'=4e41 I=fe R=58  F=S    HNC F'=    3HN  \nMEMPTR=0000 IM2         VPS: 0 ","variablesReference":0}]})

```

