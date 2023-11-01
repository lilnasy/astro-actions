// @ts-expect-error
import * as serverFunctions from "server:functions"
import { encode, decode } from "./codec.websocket.ts"

export function handleWebSocket(socket: Omit<WebSocket, 'dispatchEvent'>) {
    socket.binaryType = 'arraybuffer'
    socket.onmessage = async ({ data } : { data : ArrayBuffer }) => {
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
