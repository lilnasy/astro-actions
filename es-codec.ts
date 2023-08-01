/*
This module exports an es-codec-powered de/serializer,
that has been extended to allow more types.

This is used by both the client and the server runtime.
*/

import { defineContext, defineExtension } from "es-codec"
import iota from "./iota.ts"

// @ts-ignore who cares
const AsyncFunction = (async x => x).constructor

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
    }),
    defineExtension({
        name: "AF",
        when(x): x is Function {
            return x?.constructor === AsyncFunction
        },
        encode(fun, ws) {
            const funId = iota()
            ws.addEventListener("message", async function listenForInvocations ({ data }) {
                const [ type, incomingFunId, callId, args ] = decode(data, ws) as any
                if (type === "apply" && incomingFunId === funId) {
                    const result = await fun.apply(null, args)
                    ws.send(encode([ "apply result", callId, result ], ws))
                }
            })
            return funId
        },
        decode(funId, ws) {
            return (...args: any[]) => new Promise(resolve => {
                const callId = iota()
                ws.send(encode([ "apply", funId, callId, args ], ws))
                ws.addEventListener("message", function listenForResult({ data }) {
                    const [ type, incomingCallId, result ] = decode(data, ws) as any
                    if (type === "apply result" && callId === incomingCallId) {
                        ws.removeEventListener("message", listenForResult)
                        resolve(result)
                    }
                })
            })
        }
    })
])
