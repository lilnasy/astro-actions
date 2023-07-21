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
                
                const imports = `import { createProxy } from "astro-server-functions/client-runtime.ts"`

                const callableExports =
                    exports.map(({ n: name }) => {
                        if (name === 'default') return `export default createProxy(${JSON.stringify(name)})`
                        else                    return `export const ${name} = createProxy(${JSON.stringify(name)})`
                    })
                
                return imports + '\n' + callableExports.join('\n')
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
                const iota = createReverseCounter()
                
                async function get({ request }) {
                    if (request.headers.has("Upgrade") === false || globalThis?.Deno?.upgradeWebSocket === undefined)
                        return new Response('Method Not Allowed', { status: 405 })
                    
                    const { socket, response } = Deno.upgradeWebSocket(request)
                    const { encode, decode } =
                        ESCodec.createCodec([
                            {
                                name: "URL",
                                when  (x   ) { return x.constructor === URL },
                                encode(url ) { return url.href },
                                decode(href) { return new URL(href) }
                            },
                            {
                                name: "RS",
                                when  (x) { return x.constructor === ReadableStream },
                                encode(stream) {
                                    const streamId = iota()
                                    stream.pipeTo(new WritableStream({
                                        async write(chunk) {
                                            socket.send(encode([ "enqueue", streamId, chunk ]))
                                        },
                                        async close() {
                                            socket.send(encode([ "close", streamId ]))
                                        }
                                    }))
                                    return streamId
                                },
                                decode(streamId) {
                                    return new ReadableStream({
                                        async start(controller) {
                                            socket.addEventListener("message", listenerForChunks)
                                            async function listenerForChunks({ data }) {
                                                const [ type, id, value ] = decode(data)
                                                if (type === "enqueue" && id === streamId) {
                                                    controller.enqueue(value)
                                                }
                                                if (type === "close" && id === streamId) {
                                                    controller.close();
                                                    socket.removeEventListener("message", listenerForChunks)
                                                }
                                            }
                                        }
                                    })
                                }
                            },
                            {
                                name: "WS",
                                when(x) { return x.constructor === WritableStream },
                                encode(stream) {
                                    const streamId = iota()
                                    const writer = stream.getWriter()
                                    socket.addEventListener("message", listenerForChunks)
                                    return streamId
                                    async function listenerForChunks({ data }) {
                                        const [ type, id, value ] = decode(data)
                                        if (type === "enqueue" && id === streamId) {
                                            writer.write(value)
                                        }
                                        if (type === "close" && id === streamId) {
                                            writer.close();
                                            socket.removeEventListener("message", listenerForChunks)
                                        }
                                    }
                                },
                                decode(streamId) {
                                    return new WritableStream({
                                        async write(chunk) {
                                            socket.send(encode([ "enqueue", streamId, chunk ]))
                                        },
                                        async close() {
                                            socket.send(encode([ "close", streamId ]))
                                        }
                                    })
                                }
                            }
                        ])
                    
                    socket.onmessage = async ({ data }) => {
                        const message = decode(data)
                        if (message[0] === "call") {
                            const [ _, callId, funName, args ] = message
                            const result = await serverFunctions[funName].apply(null, args)
                            socket.send(encode([ "result", callId, result ]))
                        }
                    }
                    
                    return response
                }
                
                function createReverseCounter() {
                    let count = -1
                    return () => count--
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
