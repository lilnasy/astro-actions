/*
This module exports an es-codec-powered de/serializer,
that has been extended to allow more types.

This is used by both the client and the server runtime.
*/

import { createCodec } from "es-codec"
import iota from "./iota.ts"

export const { encode, decode } = createCodec<WebSocket>([
    {
        name: "URL",
        when  (x    : unknown) : x is URL { return x?.constructor === URL },
        encode(url  : URL    ) { return url.href },
        decode(href : string ) { return new URL(href) }
    },
    {
        name: "RS",
        when  (x    : unknown) : x is ReadableStream<unknown> { return x?.constructor === ReadableStream },
        encode(stream : ReadableStream<unknown>, ws) {
            const streamId = iota()
            stream.pipeTo(new WritableStream({
                write(chunk) {
                    ws.send(encode([ "enqueue", streamId, chunk ], ws))
                },
                close() {
                    ws.send(encode([ "close", streamId ], ws))
                }
            }))
            return streamId
        },
        decode(streamId : number, ws) {
            return new ReadableStream({
                async start(controller) {
                    ws.addEventListener("message", listenerForChunks)
                    function listenerForChunks({ data } : any) {
                        const [ type, id, value ] = decode(data, ws) as any
                        if (type === "enqueue" && id === streamId) {
                            controller.enqueue(value)
                        }
                        if (type === "close" && id === streamId) {
                            controller.close();
                            ws.removeEventListener("message", listenerForChunks)
                        }
                    }
                }
            })
        }
    },
    {
        name: "WS",
        when(x : unknown) : x is WritableStream { return x?.constructor === WritableStream },
        encode(stream : WritableStream<unknown>, ws) {
            const streamId = iota()
            const writer = stream.getWriter()
            ws.addEventListener("message", listenerForChunks)
            return streamId
            function listenerForChunks({ data } : any) {
                const [ type, id, value ] = decode(data, ws) as any
                if (type === "enqueue" && id === streamId) {
                    writer.write(value)
                }
                if (type === "close" && id === streamId) {
                    writer.close();
                    ws.removeEventListener("message", listenerForChunks)
                }
            }
        },
        decode(streamId : number, ws) {
            return new WritableStream({
                write(chunk) {
                    ws.send(encode([ "enqueue", streamId, chunk ], ws))
                },
                close() {
                    ws.send(encode([ "close", streamId ], ws ))
                }
            })
        }
    }
])
