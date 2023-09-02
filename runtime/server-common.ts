import { encode, decode } from "./es-codec.ts"
import * as serverFunctions from "./functions-stand-in.ts"

export function handleWebSocket(socket: WebSocket) {
    console.log(serverFunctions)
    socket.onmessage = async ({ data }) => {
        const message = decode(data, socket) as any
        if (message[0] === "call") {
            const [ _, callId, funName, args ] = message
            try {
                const result = await (serverFunctions as any)[funName].apply(undefined, args)
                socket.send(encode([ "result", callId, result ], socket))
            }
            catch {
                socket.send(encode([ "result", callId, undefined ], socket))
            }
        }
    }
}
