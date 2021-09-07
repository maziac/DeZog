# Requests

```puml
title Different requests

hide footbox


participant vscode
participant DeZog as "DebugSessionClass"
'participant ZXSocket as "Zesarux\nSocket"

== step  ==

vscode -> DeZog: threadsRequest()
vscode <-- DeZog: response(thread)‚

vscode -> DeZog: stackTraceRequest(thread)
vscode <-- DeZog: response(frames)

vscode -> DeZog: scopesRequest(frameID/selected frame)
vscode <-- DeZog: response(scope names + their varID)

vscode -> DeZog: variablesRequest(varID)
vscode <-- DeZog: response(variables)

note over vscode, DeZog: The evaluateRequest may also come earlier. Also before the scopes request.
vscode -> DeZog: evaluateRequest(expression, frameID)
vscode <-- DeZog: response(result)

== select in CALL STACK area  ==

vscode -> DeZog: scopesRequest(frameID/selected frame)
vscode <-- DeZog: response(scope names + their varID)

vscode -> DeZog: variablesRequest(varID)
vscode <-- DeZog: response(variables)


== open scope in VARIABLES ares  ==

vscode -> DeZog: variablesRequest(varID)
vscode <-- DeZog: response(variables)


== hovering ==

vscode -> DeZog: evaluateRequest(expression, frameID, context)
vscode <-- DeZog: response(result, varID)


== watch ==

note over vscode, DeZog: evaluateRequest is not only done on first input but on every step.

vscode -> DeZog: evaluateRequest(expression, frameID, context)
vscode <-- DeZog: response(result, varID)

note over vscode, DeZog: if the evaluate Request does not return a simple value but a varID.\nvarIDs are stored only temporarily until the next step.

vscode -> DeZog: variablesRequest(varID)
vscode <-- DeZog: response(variables)


== disconnect ==

vscode -> DeZog: disconnectRequest()

note over DeZog: Disconnect socket etc.

vscode <-- DeZog: response(result, varID)
````

