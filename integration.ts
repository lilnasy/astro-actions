import ESModuleLexer from 'es-module-lexer'
import type { AstroIntegration } from 'astro'

export default function () {
    
    let serverFunctionsModuleId : string
    
    return {
        name: 'server-functions',
        hooks: {
            'astro:config:setup' ({ injectRoute, config }) {
                
                injectRoute({
                    pattern   : '/_sf',
                    entryPoint: 'astro-server-functions/server-runtime.ts'
                })
                
                const plugins = config.vite.plugins ??= []
                
                plugins.push({
                    name: 'server-functions/vite',
                    resolveId(source) {
                        // resolve the alias for src/serverfunctions that server-runtime.ts uses
                        if (source === 'server:functions') return this.resolve(serverFunctionsModuleId)
                    },
                    transform(code, id, options) {
                        // during build, options is { ssr: true } for code that runs on the server, and undefined otherwise
                        // during dev, options is { ssr: true } for code that runs on the server, and { ssr: false } otherwise
                        // transformation of server functions to remote calls is only intended for the client
                        if (options?.ssr !== true && id.startsWith(serverFunctionsModuleId)) {
                            const [ _, exports ] = ESModuleLexer.parse(code)
                            
                            console.log(`astro-server-functions: transforming functions to remote calls for the browser: ` +  exports.map(({ n }) => n).join(', '))
                            
                            const imports = `import { createProxy } from "astro-server-functions/client-runtime.ts"`
                            
                            const callableExports =
                                exports.map(({ n: name }) => {
                                    if (name === 'default') return `export default createProxy("${name}")`
                                    else                    return `export const ${name} = createProxy("${name}")`
                                })
                            
                            return imports + '\n' + callableExports.join('\n')
                        }
                    },
                    async configureServer({ httpServer, ssrLoadModule }) {
                        // console.log(await ssrLoadModule('E:/workspaces/astro-server-functions/server-runtime.ts'))
                        // httpServer.on('upgrade', r => r)
                    }
                })
            },
            'astro:config:done' ({ config }) {
                serverFunctionsModuleId = config.srcDir.pathname + 'serverfunctions'
                
                // @ts-ignore - process needs types/node, i dont want to bother
                // srcDir on windows is "/E:/workspaces/astro-website/src" (extra slash at the start)
                if (globalThis?.process?.platform === 'win32') serverFunctionsModuleId = serverFunctionsModuleId.slice(1)
            }
        }
    } satisfies AstroIntegration
}
