import ESModuleLexer from 'es-module-lexer'
import type { AstroIntegration, ViteUserConfig } from 'astro'

export default function (): AstroIntegration {
    return {
        name: 'server-functions',
        hooks: {
            'astro:config:setup' ({ command, config, injectRoute, logger }) {
                
                injectRoute({
                    pattern   : '/_sf',
                    entryPoint: 'astro-server-functions/server-runtime.ts'
                })

                const plugins = config.vite.plugins ??= []
                
                plugins.push(createVitePLugin({ command, config, logger }))
            },
            async 'astro:server:setup' ({ server, logger }) {
                const serverRuntime = await server.ssrLoadModule('astro-server-functions/server-runtime.ts')
                console.log(serverRuntime.GET.toString())
            }
        }
    }
}

function createVitePLugin({ command, config, logger }: VitePluginOptions): VitePlugin {
    
    let serverFunctionsModuleId : string

    const vitePlugin: VitePlugin = {
        name: 'server-functions/vite',
        async resolveId(source, importer) {
            // @ts-expect-error - allow it to fail at runtime if resolution fails
            serverFunctionsModuleId ??= (await this.resolve(config.srcDir.pathname + 'serverfunctions')).id

            // console.log({ source, importer })
            // viteDevServer.ssrLoadModule (in astro:server:setup) needs some help
            if (command === 'dev' && importer?.endsWith('index.html')) {
                if (source === './es-codec.ts') return this.resolve('astro-server-functions/es-codec.ts')
                if (source === './iota.ts') return this.resolve('astro-server-functions/iota.ts')
                if (source === './implementation-stand-in.ts') return this.resolve(config.srcDir.pathname + 'serverfunctions')
            }
        },
        transform(code, id, options) {
            // during build, options is { ssr: true } for code that runs on the server, and undefined otherwise
            // during dev, options is { ssr: true } for code that runs on the server, and { ssr: false } otherwise
            // transformation of server functions to remote calls is only intended for the client
            if (options?.ssr !== true && id.startsWith(serverFunctionsModuleId)) {
                const [ _, exports ] = ESModuleLexer.parse(code)

                logger.info(`transforming ${exports.length} functions to remote calls for the browser`)
                exports.forEach(exp => logger.info(exp.n))
                
                const imports = `import { createProxy } from "astro-server-functions/client-runtime.ts"`
                
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

type VitePlugin = Exclude<NonNullable<ViteUserConfig['plugins']>[number], false | null | Promise<any> | undefined | any[]>
type VitePluginOptions = Pick<Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0], 'command' | 'config' | 'logger'>
