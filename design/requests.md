# Requests

```puml
title Different requests

hide footbox


participant vscode
participant ZXDebug as "DebugSessionClass"
'participant ZXSocket as "Zesarux\nSocket"

== step  ==

vscode -> ZXDebug: threadsRequest()
vscode <-- ZXDebug: response(thread)‚

vscode -> ZXDebug: stackTraceRequest(thread)
vscode <-- ZXDebug: response(frames)

vscode -> ZXDebug: scopesRequest(frameID/selected frame)
vscode <-- ZXDebug: response(scope names + their varID)

vscode -> ZXDebug: variablesRequest(varID)
vscode <-- ZXDebug: response(variables)

note over vscode, ZXDebug: The evaluateRequest may also come earlier. Also before the scopes request.
vscode -> ZXDebug: evaluateRequest(expression, frameID)
vscode <-- ZXDebug: response(result)

== select in CALL STACK area  ==

vscode -> ZXDebug: scopesRequest(frameID/selected frame)
vscode <-- ZXDebug: response(scope names + their varID)

vscode -> ZXDebug: variablesRequest(varID)
vscode <-- ZXDebug: response(variables)


== open scope in VARIABLES ares  ==

vscode -> ZXDebug: variablesRequest(varID)
vscode <-- ZXDebug: response(variables)


== hovering, watch ==

vscode -> ZXDebug: evaluateRequest(expression, frameID, context)
vscode <-- ZXDebug: response(result, varID)

note over vscode, ZXDebug: If the expression/variable is opened in the WATCH area

vscode -> ZXDebug: variablesRequest(varID)
vscode <-- ZXDebug: response(variables)


== disconnect ==

vscode -> ZXDebug: disconnectRequest()

note over ZXDebug: Disconnect socket etc.

vscode <-- ZXDebug: response(result, varID)
````

