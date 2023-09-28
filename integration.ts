import ESModuleLexer from 'es-module-lexer'
import type { Plugin as VitePlugin } from 'vite'
import type { AstroConfig, AstroUserConfig, AstroIntegration, AstroIntegrationLogger } from 'astro'

export default function (options: Partial<ServerFunctionsOptions> = {}): AstroIntegration {
    const { mode = 'fetch', serialization = 'es-codec' } = options
    return {
        name: 'astro-server-functions',
        hooks: {
            'astro:config:setup' ({ command, config, injectRoute, updateConfig, logger }) {
                
                injectRoute({
                    pattern   : '/_sf',
                    entryPoint: getEntrypoint({ mode, serialization, target: 'server' })
                })
                
                updateConfig({
                    vite: {
                        plugins: [ createVitePlugin({ config, command, logger, mode, serialization }) ]
                    }
                } satisfies AstroUserConfig)
            }
        }
    }
}

interface ServerFunctionsOptions {
    /**
     * The API used by the browser to communicate with the server.
     * 
     * When `"fetch"` is selected, the browser will send HTTP POST requests to the server.
     * You can only send and receive static data in this mode. To send streams and promises, switch to websocket mode.
     * 
     * When `"websocket"` is selected, the browser will establish a websocket connection with the server and make all server function calls over it.
     * 
     * You can send and receive a wide variety of data types - including `Promise`, `ReadableStream`, `WritableStream`, `Request`, and `Response`.
     * However, this mode is only usable with Deno.
     */
    mode: 'fetch' | 'websocket'
    
    /**
     * The format used by server functions to send data over the network.
     * 
     * When `"es-codec"` is selected, you will be able to send more types of data - including `BigInt`, `Map`, `Set`, `TypedArray`, and `ArrayBuffer`.
     * However, you will be sending slightly more javascript to the browser.
     * 
     * When `"JSON"` is selected, you will be sending very little javascript to the browser but data types will be limited to `number`, `string`, `Array`, and plain objects.
     */
    serialization: 'es-codec' | 'JSON'
}

function getEntrypoint({ mode, serialization, target } : ServerFunctionsOptions & { target: 'server' | 'browser' | 'dev' }) {
    if (target === 'server') {
        if (mode === 'fetch'     && serialization === 'es-codec') return 'astro-server-functions/runtime/fetch.codec.endpoint.ts'
        if (mode === 'fetch'     && serialization === 'JSON')     return 'astro-server-functions/runtime/fetch.json.endpoint.ts'
        if (mode === 'websocket' && serialization === 'es-codec') return 'astro-server-functions/runtime/websocket.codec.endpoint.ts'
        if (mode === 'websocket' && serialization === 'JSON')     throw new Error(`JSON serialization is not supported in websocket mode.`)
        throw new Error(`Unsupported combination of mode and serialization: ${mode} and ${serialization}.`)
    }
    
    if (target === 'browser') {
        if (mode === 'fetch'     && serialization === 'es-codec') return 'astro-server-functions/runtime/fetch.codec.browser.ts'
        if (mode === 'fetch'     && serialization === 'JSON')     return 'astro-server-functions/runtime/fetch.json.browser.ts'
        if (mode === 'websocket' && serialization === 'es-codec') return 'astro-server-functions/runtime/websocket.browser.ts'
        if (mode === 'websocket' && serialization === 'JSON')     throw new Error(`JSON serialization is not supported in websocket mode.`)
        throw new Error(`Unsupported combination of mode and serialization: ${mode} and ${serialization}.`)
    }

    if (target === 'dev') {
        if (mode === 'fetch'     && serialization === 'es-codec') return 'astro-server-functions/runtime/fetch.codec.endpoint.ts'
        if (mode === 'fetch'     && serialization === 'JSON')     return 'astro-server-functions/runtime/fetch.json.endpoint.ts'
        if (mode === 'websocket' && serialization === 'es-codec') return 'astro-server-functions/runtime/websocket.codec.dev.ts'
        if (mode === 'websocket' && serialization === 'JSON')     throw new Error(`JSON serialization is not supported in websocket mode.`)
        throw new Error(`Unsupported combination of mode and serialization: ${mode} and ${serialization}.`)
    }

    throw new Error
}


interface VitePluginOptions extends ServerFunctionsOptions {
    command : 'dev' | 'build' | 'preview'
    config  : AstroConfig
    logger  : AstroIntegrationLogger
}

function createVitePlugin({ config, logger, mode, serialization }: VitePluginOptions): VitePlugin {
    
    let serverFunctionsModuleId : string

    const vitePlugin: VitePlugin = {
        name: 'astro-server-functions',
        resolveId(source, importer) {
            if (source === 'server:functions') return this.resolve(config.srcDir.pathname + 'serverfunctions', importer)
        },
        async transform(code, id, options) {
            // @ts-expect-error - allow it to fail at runtime if resolution fails
            serverFunctionsModuleId ??= (await this.resolve(config.srcDir.pathname + 'serverfunctions')).id

            // during build, options is { ssr: true } for code that runs on the server, and undefined otherwise
            // during dev, options is { ssr: true } for code that runs on the server, and { ssr: false } otherwise
            // transformation of server functions to remote calls is only intended for the client
            if (options?.ssr !== true && id === serverFunctionsModuleId) {
                const [ _, exports ] = ESModuleLexer.parse(code)

                logger.info(`Transforming ${exports.length} functions to server functions: ${exports.map(exp => exp.n).join(', ')}.`)
                
                const imports = `import { createProxy } from "${getEntrypoint({ mode, serialization, target: 'browser'})}"`
                
                const callableExports =
                    exports.map(({ n: name }) => {  
                        if (name === 'default') return `export default createProxy("${name}")`
                        else                    return `export const ${name} = createProxy("${name}")`
                    })
                
                return imports + '\n' + callableExports.join('\n')
            }
        }
    }

    return vitePlugin
}
