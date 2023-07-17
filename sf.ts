import ESModuleLexer from 'es-module-lexer'
import type { AstroIntegration, ViteUserConfig } from 'astro'

type VitePlugin = NonNullable<ViteUserConfig['plugins']>[number]

let buildingFor : 'client' | 'server'
const serverFunctionsHostRoutePath = "/_sf"
const serverFunctionsHostRouteId = `\0@astro-page:_sf` as const
let serverFunctionsModuleId : string

export default {
    name: 'server-functions',
    hooks: {
        'astro:config:setup' ({ injectRoute, config }) {
            injectRoute({ pattern: serverFunctionsHostRoutePath, entryPoint: '_sf' })
            
            const serverPlugin = server()
            const clientPlugin = client()
            
            const plugins = config.vite.plugins ??= []
            plugins.push({
                name: 'server-functions/vite',
                load(...args) {
                    if (buildingFor === 'server') return serverPlugin.load.apply(this, args)
                },
                transform(...args) {
                    if (buildingFor === 'client') return clientPlugin.transform.apply(this, args)
                }
            })
        },
        'astro:config:done' ({ config }) {
            console.log('config done')
            serverFunctionsModuleId = config.srcDir.pathname + 'serverfunctions'
        },
        'astro:build:setup' ({ target }) {
            console.log('build setup', target)
            buildingFor = target
        }
    }
} satisfies AstroIntegration

function client() {
    return {
        name: 'server-functions/vite/client',
        async transform(code, id) {
            if (id.startsWith(serverFunctionsModuleId)) {
                console.log('transforming client functions')
                const [ _, exports ] = ESModuleLexer.parse(code)
                
                const importEsCodec = `import * as ESCodec from "astro-server-functions/es-codec.ts"`
                
                const body = dedent`
                const url = new URL(location)
                url.pathname = "/_sf"
                url.protocol = url.protocol.replace('http', 'ws')
                const ws = new Promise(resolve => {
                    const ws = new WebSocket(url)
                    ws.binaryType = "arraybuffer"
                    ws.onopen = () => resolve(ws)
                })
                
                let getCallId = createCounter()
                let getStreamId = createCounter()
                
                const streamToIdMap = new WeakMap()
                
                function createCallableServerFunction(funName) {
                    return (...args) => new Promise(async (resolve, reject) => {
                        
                        const websocket = await ws
                        
                        const callId = getCallId()
                        
                        function eventListener({ data }) {
                            const [ type, id, value ] = ESCodec.decode(data)
                            if (type === "result" && id === callId) {
                                websocket.removeEventListener("message", eventListener)
                                resolve(value)
                            }
                        }
                        
                        websocket.addEventListener("message", eventListener)
                        
                        if (args.length === 1 && args[0] instanceof ReadableStream) {
                            const stream = args[0]
                            const streamId = getStreamId()
                            websocket.send(ESCodec.encode([ "call with stream", callId, funName, streamId ]))
                            console.log(stream)
                            
                            for await (const value of iterableStream(stream))
                                websocket.send(ESCodec.encode([ "enqueue", streamId, value ]))
                            
                            websocket.send(ESCodec.encode([ "close", streamId ]))
                        }
                        
                        else websocket.send(ESCodec.encode([ "call", callId, funName, args ]))
                    })
                }
                
                // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream#browser_compatibility
                function iterableStream(readable) {
                    return {
                        [Symbol.asyncIterator]: () => {
                            const reader = readable.getReader()
                            return {
                                next() {
                                    return reader.read()
                                }
                            }
                        }
                    }
                }
                
                function createCounter() {
                    let count = 1
                    return () => count++
                }`

                const callableExports =
                    exports.map(({ n: name }) => {
                        if (name === 'default') return `export default createCallableServerFunction(${JSON.stringify(name)})`
                        else                    return `export const ${name} = createCallableServerFunction(${JSON.stringify(name)})`
                    })
                
                return importEsCodec + '\n' + body + '\n' + callableExports.join('\n')
            }
        }
    } satisfies VitePlugin
}

function server() {    
    return {
        name: 'server-functions/vite/server',
        async load(id, options) {
            if (id === serverFunctionsHostRouteId) {
                console.log('loading custom module')
                
                const imports: string[] = []
                const exports: string[] = []
                const RENDERERS_MODULE_ID = '@astro-renderers'
                const MIDDLEWARE_MODULE_ID = '@astro-middleware'
                
                imports.push(`import * as serverFunctions from ` + JSON.stringify(serverFunctionsModuleId))
                imports.push(`import * as ESCodec from "astro-server-functions/es-codec.ts"`)
                
                const body = dedent`
                
                const idToStreamMap = new Map
                
                async function get({ request }) {
                    if (request.headers.has("Upgrade") === false || globalThis?.Deno?.upgradeWebSocket === undefined)
                        return new Response('Method Not Allowed', { status: 405 })
                    
                    const { socket, response } = Deno.upgradeWebSocket(request)
                    
                    socket.onmessage = async ({ data }) => {
                        const message = ESCodec.decode(data)
                        
                        if (message[0] === "call") {
                            const [ _, callId, funName, args ] = message
                            const result = await serverFunctions[funName].apply(null, args)
                            socket.send(ESCodec.encode([ "result", callId, result ]))
                        }
                        
                        if (message[0] === "call with stream") {
                            const [ _, callId, funName, streamId ] = message
                            const { readable, writable } = new TransformStream
                            idToStreamMap.set(streamId, writable)
                            const result = await serverFunctions[funName](readable)
                            socket.send(ESCodec.encode([ "result", callId, result ]))
                        }

                        if (message[0] === "enqueue") {
                            const [ _, streamId, value ] = message
                            const writable = idToStreamMap.get(streamId)
                            const writer = writable.getWriter()
                            writer.write(value)
                            writer.releaseLock()
                        }

                        if (message[0] === "close") {
                            const [ _, streamId ] = message
                            const writable = idToStreamMap.get(streamId)
                            const writer = writable.getWriter()
                            writer.close()
                            writer.releaseLock()
                        }
                    }
                    
                    return response
                }`
                
                exports.push(`export const page = () => ({ get })`)
                
                imports.push(`import { renderers } from "${RENDERERS_MODULE_ID}"`)
                exports.push(`export { renderers }`)
                
                const middlewareModule = await this.resolve(MIDDLEWARE_MODULE_ID)
                if (middlewareModule) {
                    imports.push(`import * as middleware from "${middlewareModule.id}"`)
                    exports.push(`export { middleware }`)
                }
                
                const code = imports.join('\n') + body + exports.join('\n')
                return { code }
            }
        }
    } satisfies VitePlugin
}

function dedent(strings : TemplateStringsArray, ...values : string[]) {
    const lines = strings[0].split('\n')
    const indent = lines[1].match(/^\s*/)![0]
    return lines.map(line => line.replace(indent, '')).join('\n')
}
