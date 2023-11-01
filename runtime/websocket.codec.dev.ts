import { WebSocketServer } from "ws"
import { handleWebSocket } from "./websocket.common.ts"
import type { Server } from "node:http"

export default function (http : Server) {
    const wsServer = new WebSocketServer({ noServer: true })
    
    http.on('upgrade', (request, socket, head) => {
        if (request.url === "/_sf") {
            wsServer.handleUpgrade(request, socket, head, ws => {
                // the usage of websocket in this codebase does not
                // expose the differences between standard websocket
                // and ws.websocket
                handleWebSocket(ws as unknown as Omit<WebSocket, 'dispatchEvent'>)
            })
        }
    })
}
