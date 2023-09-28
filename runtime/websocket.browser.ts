import { WebSocketClient } from "vite"
import { encode, decode } from "./codec.websocket.ts"
import iota from "./iota.ts"

let ws : Promise<WebSocket>

export function createProxy(funName : string) {
    return (...args: any[]) => new Promise(async resolve => {
        await connect()
        const websocket = await ws
        const callId = iota()
        
        websocket.addEventListener("message", listenerForResult)
        websocket.send(encode([ "call", callId, funName, args ], websocket))
        
        function listenerForResult({ data } : any) {
            const [ type, id, value ] = decode(data, websocket) as any
            if (type === "result" && id === callId) {
                websocket.removeEventListener("message", listenerForResult)
                resolve(value)
            }
        }
    })
}

async function connect() {
    if (ws && (await ws).readyState === (await ws).OPEN) return
    const url = new URL(location.href)
    url.pathname = "/_sf"
    url.protocol = url.protocol.replace('http', 'ws')
    ws = new Promise<WebSocket>(resolve => {
        const ws = new WebSocket(url)
        ws.binaryType = "arraybuffer"
        ws.onopen = () => resolve(ws)
    })
}
