import { encode, decode } from "./codec.websocket.ts"
import iota from "./iota.ts"

const url = new URL(location.href)
url.pathname = "/_sf"
url.protocol = url.protocol.replace('http', 'ws')
const ws = new Promise<WebSocket>(resolve => {
    const ws = new WebSocket(url)
    ws.binaryType = "arraybuffer"
    ws.onopen = () => resolve(ws)
    ws.addEventListener("open", () => {})
})

export function createProxy(funName : string) {
    return (...args: any[]) => new Promise(async resolve => {
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
