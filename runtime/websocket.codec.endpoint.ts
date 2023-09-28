import { handleWebSocket } from "./websocket.common.ts"
import type { APIRoute } from "astro"

export const GET : APIRoute = ({ request }) => {
    if (request.headers.has("Upgrade") === false)
        return new Response('Method Not Allowed', { status: 405 })
    
    if ((globalThis as any).Deno?.upgradeWebSocket !== undefined) {
        // @ts-expect-error - Deno is not in the types
        const { upgradeWebSocket } = Deno as { upgradeWebSocket: (request: Request) => { socket: WebSocket, response: Response } }
        
        const { socket, response } = upgradeWebSocket(request)
        
        handleWebSocket(socket)
        
        return response
    }

    if ((globalThis as any).WebSocketPair) {
        // @ts-expect-error - Workers runtime is not in the types
        const [ client, server ] = new WebSocketPair
        
        server.accept()
        handleWebSocket(server)

        return new Response(null, {
            status: 101,
            // @ts-expect-error cloudflare specific non-standard property
            webSocket: client,
        })
    }

    throw new Error('No WebSocket implementation found. Websocket mode must only be used with Cloudflare or Deno.')
}
