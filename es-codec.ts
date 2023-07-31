/*
This module exports an es-codec-powered de/serializer,
that has been extended to allow more types.

This is used by both the client and the server runtime.
*/

import { defineContext, defineExtension } from "es-codec"
import iota from "./iota.ts"

export const { encode, decode } = defineContext<WebSocket>().createCodec([
    defineExtension({
        name: "URL",
        when(x) : x is URL { return x?.constructor === URL },
        encode(url)  { return url.href },
        decode(href) { return new URL(href) }
    }),
    defineExtension({
        name: "RS",
        when(x) : x is ReadableStream { return x?.constructor === ReadableStream },
        encode(stream, ws) {
            const streamId = iota()
            stream.pipeTo(new WritableStream({
                write(chunk : string) {
                    ws.send(encode([ "enqueue", streamId, chunk ], ws))
                },
                close() {
                    ws.send(encode([ "close", streamId ], ws))
                }
            }))
            return streamId
        },
        decode(streamId, ws) {
            return new ReadableStream({
                start(controller) {
                    ws.addEventListener("message", function listenerForChunks({ data } : any) {
                        const [ type, id, value ] = decode(data, ws) as any
                        if (type === "enqueue" && id === streamId) {
                            controller.enqueue(value)
                        }
                        if (type === "close" && id === streamId) {
                            controller.close()
                            ws.removeEventListener("message", listenerForChunks)
                        }
                    })
                }
            })
        }
    }),
    defineExtension({
        name: "WS",
        when(x) : x is WritableStream { return x?.constructor === WritableStream },
        encode(stream, ws) {
            const streamId = iota()
            const writer = stream.getWriter()
            ws.addEventListener("message", function listenerForChunks({ data } : any) {
                const [ type, id, value ] = decode(data, ws) as any
                if (type === "enqueue" && id === streamId) {
                    writer.write(value)
                }
                if (type === "close" && id === streamId) {
                    writer.close()
                    ws.removeEventListener("message", listenerForChunks)
                }
            })
            return streamId
        },
        decode(streamId, ws) {
            return new WritableStream({
                write(chunk) {
                    ws.send(encode([ "enqueue", streamId, chunk ], ws))
                },
                close() {
                    ws.send(encode([ "close", streamId ], ws ))
                }
            })
        }
    })
])
