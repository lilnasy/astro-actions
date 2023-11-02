import ESModuleLexer from 'es-module-lexer'
import type { Plugin as VitePlugin } from 'vite'
import type { AstroConfig, AstroUserConfig, AstroIntegration, AstroIntegrationLogger } from 'astro'
import type { ServerActionsIntegrationOptions } from "./interface.ts"

export default function (options: Partial<ServerActionsIntegrationOptions> = {}): AstroIntegration {
    const { serialization = 'es-codec' } = options
    return {
        name: 'astro-server-actions',
        hooks: {
            'astro:config:setup' ({ command, config, injectRoute, updateConfig, logger }) {
                
                injectRoute({
                    pattern   : '/_action',
                    entryPoint: getEntrypoint({ serialization, target: 'server' })
                })
                
                updateConfig({
                    vite: {
                        plugins: [ createVitePlugin({ config, command, logger, serialization }) ]
                    }
                } satisfies AstroUserConfig)
            }
        }
    }
}

function getEntrypoint({ serialization, target } : ServerActionsIntegrationOptions & { target: 'server' | 'browser' }) {
    if (target === 'server') {
        if (serialization === 'es-codec') return 'astro-server-actions/runtime/codec.endpoint.ts'
        if (serialization === 'JSON')     return 'astro-server-actions/runtime/json.endpoint.ts'
        throw new Error
    }
    
    if (target === 'browser') {
        if (serialization === 'es-codec') return 'astro-server-actions/runtime/codec.browser.ts'
        if (serialization === 'JSON')     return 'astro-server-actions/runtime/json.browser.ts'
        throw new Error
    }

    throw new Error
}

interface VitePluginOptions extends ServerActionsIntegrationOptions {
    command : 'dev' | 'build' | 'preview'
    config  : AstroConfig
    logger  : AstroIntegrationLogger
}

function createVitePlugin({ config, logger, serialization }: VitePluginOptions): VitePlugin {
    
    let serverActionsModuleId : string

    const vitePlugin: VitePlugin = {
        name: 'astro-server-actions',
        resolveId(source, importer) {
            if (source === 'astro:actions') return this.resolve("astro-server-actions/runtime/client.ts")
            if (source === 'actions:implementation') return this.resolve(config.srcDir.pathname + 'actions', importer)
        },
        async transform(code, id, options) {
            // @ts-expect-error - allow it to fail at runtime if resolution fails
            serverActionsModuleId ??= (await this.resolve(config.srcDir.pathname + 'actions')).id

            // during build, options is { ssr: true } for code that runs on the server, and undefined otherwise
            // during dev, options is { ssr: true } for code that runs on the server, and { ssr: false } otherwise
            // transformation of server actions to remote calls is only intended for the client
            if (options?.ssr !== true && id === serverActionsModuleId) {
                const [ _, exports ] = ESModuleLexer.parse(code)

                logger.info(`Transforming ${exports.length} functions to server actions: ${exports.map(exp => exp.n).join(', ')}.`)
                
                const imports = `import { createProxy } from "${getEntrypoint({ serialization, target: 'browser'})}"`
                
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
