// @ts-ignore .ts extension
import { encode, decode } from "./es-codec.ts"
// @ts-ignore .ts extension
import * as serverFunctions from "./implementation-stand-in.ts"
import type { APIRoute } from "astro"

export const GET : APIRoute = ({ request }) => {
    if (request.headers.has("Upgrade") === false || globalThis?.Deno?.upgradeWebSocket === undefined)
        return new Response('Method Not Allowed', { status: 405 })

    // @ts-expect-error - Deno is not in the types
    const { upgradeWebSocket } = Deno as { upgradeWebSocket: (request: Request) => { socket: WebSocket, response: Response } }

    const { socket, response } = upgradeWebSocket(request)
    
    socket.onmessage = async ({ data }) => {
        const message = decode(data, socket) as any
        if (message[0] === "call") {
            const [ _, callId, funName, args ] = message
            try {
                const result = await serverFunctions[funName].apply(null, args)
                socket.send(encode([ "result", callId, result ], socket))
            }
            catch {
                socket.send(encode([ "result", callId, undefined ], socket))
            }
        }
    }
    
    return response
}

