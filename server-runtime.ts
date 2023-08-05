import { encode, decode } from "./es-codec.ts"
import * as serverFunctions from "server:functions"
import type { APIRoute } from "astro"

export const get : APIRoute = ({ request }) => {
    if (request.headers.has("Upgrade") === false || globalThis?.Deno?.upgradeWebSocket === undefined)
        return new Response('Method Not Allowed', { status: 405 })
    
    const { socket, response } = Deno.upgradeWebSocket(request)
    
    socket.onmessage = async ({ data }) => {
        const message = decode(data, socket) as any
        if (message[0] === "call") {
            const [ _, callId, funName, args ] = message
            const result = await serverFunctions[funName].apply(null, args)
            socket.send(encode([ "result", callId, result ], socket))
        }
    }
    
    return response
}

