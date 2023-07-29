import ESModuleLexer from 'es-module-lexer'
import type { AstroIntegration, ViteUserConfig } from 'astro'

type VitePlugin = NonNullable<ViteUserConfig['plugins']>[number]

const SERVER_FUNCTIONS_ROUTE_PATH      = '/_sf' as const
const SERVER_FUNCTIONS_ROUTE_MODULE_ID = '\0@astro-page:_sf' as const
const RENDERERS_MODULE_ID              = '@astro-renderers'
const MIDDLEWARE_MODULE_ID             = '@astro-middleware'

let buildingFor : 'client' | 'server'
let serverFunctionsModuleId : string

export default {
    name: 'server-functions',
    hooks: {
        'astro:config:setup' ({ injectRoute, config }) {
            injectRoute({ pattern: SERVER_FUNCTIONS_ROUTE_PATH, entryPoint: '_sf' })
            
            const serverPlugin = server()
            const clientPlugin = client()
            
            const plugins = config.vite.plugins ??= []
            plugins.push({
                name: 'server-functions/vite',
                load(...args) {
                    if (buildingFor === 'server') return serverPlugin.load.apply(this, args as [typeof args[0]])
                },
                transform(...args) {
                    if (buildingFor === 'client') return clientPlugin.transform.apply(this, args as [typeof args[0], typeof args[1]])
                }
            })
        },
        'astro:config:done' ({ config }) {
            console.log('config done')
            serverFunctionsModuleId = config.srcDir.pathname + 'serverfunctions'
            
            // srcDir on windows is "/E:/workspaces/astro-website/src" (extra slash at the start)
            if (globalThis?.process?.platform === 'win32') serverFunctionsModuleId = serverFunctionsModuleId.slice(1)
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
        transform(code, id) {
            console.log({ id, serverFunctionsModuleId })
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
        async load(id) {
            if (id === SERVER_FUNCTIONS_ROUTE_MODULE_ID) {
                console.log('loading server module')
                
                const body = dedent`
                async function get({ request }) {
                    if (request.headers.has("Upgrade") === false || globalThis?.Deno?.upgradeWebSocket === undefined)
                        return new Response('Method Not Allowed', { status: 405 })
                    
                    const { socket, response } = Deno.upgradeWebSocket(request)
                    
                    socket.onmessage = async ({ data }) => {
                        const message = decode(data, socket)
                        if (message[0] === "call") {
                            const [ _, callId, funName, args ] = message
                            const result = await serverFunctions[funName].apply(null, args)
                            socket.send(encode([ "result", callId, result ], socket))
                        }
                    }
                    
                    return response
                }`
                
                const imports = new Array<string>
                const exports = new Array<string>
                
                imports.push(`import { encode, decode } from "astro-server-functions/es-codec.ts"`)
                imports.push(`import * as serverFunctions from "${serverFunctionsModuleId}"`)
                imports.push(`import { renderers } from "${RENDERERS_MODULE_ID}"`)
                
                const middlewareModule = await this.resolve(MIDDLEWARE_MODULE_ID)
                
                if (middlewareModule) {
                    imports.push(`import * as middleware from "${middlewareModule.id}"`)
                    exports.push(`export { middleware }`)
                }
                
                exports.push(`export { renderers }`)
                exports.push(`export const page = () => ({ get })`)
                
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
