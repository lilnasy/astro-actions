import * as ESCodec from "es-codec"

const url = new URL(location.href)
url.pathname = "/_sf"
url.protocol = url.protocol.replace('http', 'ws')
const ws = new Promise<WebSocket>(resolve => {
    const ws = new WebSocket(url)
    ws.binaryType = "arraybuffer"
    ws.onopen = () => resolve(ws)
    ws.addEventListener("open", () => {})
})

const { encode, decode } =
    ESCodec.createCodec([
        {
            name: "URL",
            when  (x    : unknown) { return x.constructor === URL },
            encode(url  : URL    ) { return url.href },
            decode(href : string ) { return new URL(href) }
        },
        {
            name: "RS",
            when  (x    : unknown) { return x.constructor === ReadableStream },
            encode(stream : ReadableStream<unknown>) {
                const streamId = iota()
                stream.pipeTo(new WritableStream({
                    async write(chunk) {
                        (await ws).send(encode([ "enqueue", streamId, chunk ]))
                    },
                    async close() {
                        (await ws).send(encode([ "close", streamId ]))
                    }
                }))
                return streamId
            },
            decode(streamId : number) {
                return new ReadableStream({
                    async start(controller) {
                        (await ws).addEventListener("message", listenerForChunks)
                        async function listenerForChunks({ data }) {
                            const [ type, id, value ] = decode(data) as any
                            if (type === "enqueue" && id === streamId) {
                                controller.enqueue(value)
                            }
                            if (type === "close" && id === streamId) {
                                controller.close();
                                (await ws).removeEventListener("message", listenerForChunks)
                            }
                        }
                    }
                })
            }
        },
        {
            name: "WS",
            when(x : unknown) { return x.constructor === WritableStream },
            encode(stream : WritableStream<unknown>) {
                const streamId = iota()
                const writer = stream.getWriter()
                ws.then(websocket => websocket.addEventListener("message", listenerForChunks))
                return streamId
                async function listenerForChunks({ data }) {
                    const [ type, id, value ] = decode(data) as any
                    if (type === "enqueue" && id === streamId) {
                        writer.write(value)
                    }
                    if (type === "close" && id === streamId) {
                        writer.close();
                        (await ws).removeEventListener("message", listenerForChunks)
                    }
                }
            },
            decode(streamId : number) {
                return new WritableStream({
                    async write(chunk) {
                        (await ws).send(encode([ "enqueue", streamId, chunk ]))
                    },
                    async close() {
                        (await ws).send(encode([ "close", streamId ]))
                    }
                })
            }
        }
    ])

const iota = createCounter()

export function createProxy(funName) {
    return (...args) => new Promise(async resolve => {
        const websocket = await ws
        const callId = iota()
        websocket.addEventListener("message", listenerForResult)
        websocket.send(encode([ "call", callId, funName, args ]))
        function listenerForResult({ data }) {
            const [ type, id, value ] = decode(data) as any
            if (type === "result" && id === callId) {
                websocket.removeEventListener("message", listenerForResult)
                resolve(value)
            }
        }
    })
}

// https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream#browser_compatibility
function iterableStream(readable) {
    return {
        [Symbol.asyncIterator]() {
            const reader = readable.getReader()
            return { next() { return reader.read() } }
        }
    }
}

function createCounter() {
    let count = 1
    return () => count++
}