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
                
                const importEsCodec = `import * as ESCode from "es-codec"`

                const callFunction = dedent`
                function createCallableServerFunction(name) {
                    return async (...args) => {
                        const response = await fetch("/_sf", {
                            method: "post",
                            body: ESCode.encode(args),
                            headers: { "x-sf": name }
                        })
                        return ESCode.decode(await response.arrayBuffer())
                    }
                }`
                
                const callableExports =
                    exports.map(({ n }) => {
                        if (n === 'default') return `export default createCallableServerFunction(${JSON.stringify(n)})`
                        else                 return `export const ${n} = createCallableServerFunction(${JSON.stringify(n)})`
                    })
                
                return importEsCodec + '\n' + callFunction + '\n' + callableExports.join('\n')
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

                const imports: string[] = [];
                const exports: string[] = [];
                const RENDERERS_MODULE_ID = '@astro-renderers';
                const MIDDLEWARE_MODULE_ID = '@astro-middleware';

                imports.push(`import * as serverFunctions from ` + JSON.stringify(serverFunctionsModuleId))
                imports.push(`import * as ESCodec from "es-codec"`)
                
                const body = dedent`
                async function post({ request }) {
                    const buffer = await request.arrayBuffer()
                    const args = ESCodec.decode(buffer)
                    const result = await serverFunctions[request.headers.get("x-sf")].apply(null, args)
                    return new Response(ESCodec.encode(result))
                }`
                
                imports.push(`const page = () => ({ post });`);
                exports.push(`export { page }`);

                imports.push(`import { renderers } from "${RENDERERS_MODULE_ID}";`);
                exports.push(`export { renderers };`);

                const middlewareModule = await this.resolve(MIDDLEWARE_MODULE_ID);
                if (middlewareModule) {
                    imports.push(`import * as middleware from "${middlewareModule.id}";`);
                    exports.push(`export { middleware };`);
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
