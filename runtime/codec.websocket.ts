/*
This module exports an es-codec-powered de/serializer,
that has been extended to allow more types.

This is used by both the client and the server runtime.
*/

import { defineContext, defineExtension } from "es-codec"
import iota from "./iota.ts"

// @ts-ignore who cares
const AsyncFunction = (async x => x).constructor

// TODO: each event listener is decoding every message
// leading to one message being decoded multiple times

export const { encode, decode } = defineContext<Omit<WebSocket, 'dispatchEvent'>>().createCodec([
    // whatwg url
    defineExtension({
        name: "URL",
        when(x) : x is URL { return x?.constructor === URL },
        encode(url)  { return url.href },
        decode(href) { return new URL(href) }
    }),
    // promise
    defineExtension({
        name: "Pr",
        when(x) : x is Promise<unknown> { return x?.constructor === Promise },
        encode(promise, ws) {
            const promiseId = iota()
            promise
                .then(value => ws.send(encode([ "promise fulfill", promiseId, value ], ws)))
                .catch(reason => ws.send(encode([ "promise rejected", promiseId, reason ], ws)))
            return promiseId
        },
        decode(promiseId, ws) {
            return new Promise((fulfill, reject) => {
                ws.addEventListener("message", function listenForResolution({ data }) {
                    const [ type, incomingPromiseId, resolution ] = decode(data, ws) as any
                    if (type === "promise fulfill" && incomingPromiseId === promiseId) fulfill(resolution)
                    if (type === "promise rejected" && incomingPromiseId === promiseId) reject(resolution)
                })
            })
        }
    }),
    // whatwg request
    defineExtension({
        name: "Rq",
        when(x) : x is Request { return x?.constructor === Request },
        encode({ body, headers, method, url }) {
            return { body, url, method, headers: [ ...headers.entries() ] }
        },
        decode({ body, headers, method, url }) {
            return new Request(url, { body , headers, method })
        }
    }),
    // whatwg response
    defineExtension({
        name: "Rs",
        when(x) : x is Response { return x?.constructor === Response },
        encode({ body, headers, status, statusText }) {
            return { body, headers: [ ...headers.entries() ], status, statusText }
        },
        decode({ body, headers, status, statusText }) {
            return new Response(body, { headers, status, statusText })
        }
    }),
    // readable streams
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
    // writable streams
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
    // async functions
    defineExtension({
        name: "AF",
        when(x): x is Function { return x?.constructor === AsyncFunction },
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
