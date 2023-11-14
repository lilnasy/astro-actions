import ESModuleLexer from 'es-module-lexer'
import * as url from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs'
import dedent from './dedent.ts'
import type { AstroConfig, AstroIntegration } from 'astro'
import type { ServerActionsIntegrationOptions } from "./interface.ts"

export default function (options: Partial<ServerActionsIntegrationOptions> = {}): AstroIntegration {
    const { serialization = 'es-codec' } = options
    return {
        name: 'astro-server-actions',
        hooks: {
            'astro:config:setup' ({ config: { srcDir, root }, injectRoute, updateConfig, logger }) {
                
                let actionsFilePath = ''
                
                for (const extension of ['ts', 'js', 'mjs', 'mts']) {
                    const filePath = url.fileURLToPath(new URL('actions.' + extension, srcDir))
                    if (fs.existsSync(filePath)) actionsFilePath = filePath.replaceAll("\\", "/")
                    else continue
                    break
                }
                
                if (!actionsFilePath) return logger.error('No actions file found. Make sure you have an actions.ts file in your src directory.')
                
                injectRoute({
                    pattern   : '/_action',
                    entryPoint:
                        serialization === 'JSON'
                            ? 'astro-server-actions/runtime/json.endpoint.ts'
                            : 'astro-server-actions/runtime/codec.endpoint.ts',
                })
                
                updateConfig({
                    vite: {
                        plugins: [{
                            name: 'astro-actions',
                            resolveId(id, _, { ssr }) {
                                if (id === 'astro-actions-internal:implementation') return actionsFilePath
                                if (id === 'astro:actions') {
                                    if (ssr === true) return actionsFilePath
                                    return 'fake module id to load astro actions'
                                }
                            },
                            async load(id) {
                                if (id === 'fake module id to load astro actions') {
                                    const { code } = await this.load({ id: actionsFilePath })
                                    const [ _, exports ] = ESModuleLexer.parse(code!)
                                    
                                    logger.info(`Transforming ${exports.length} functions to server actions: ${exports.map(exp => exp.n).join(', ')}.`)
                                    
                                    const entrypoint =
                                        serialization === 'JSON'
                                            ? 'astro-server-actions/runtime/json.browser.ts'
                                            : 'astro-server-actions/runtime/codec.browser.ts'

                                    const imports = `import { createProxy } from "${entrypoint}"`
                                    
                                    const callableExports =
                                        exports.map(({ n: name }) => {
                                            if (name === 'default') return `export default createProxy("${name}")`
                                            else                    return `export const ${name} = createProxy("${name}")`
                                        })
                                    
                                    return imports + '\n' + callableExports.join('\n')
                                }
                            }
                        }, {
                            name: "astro-actions-inject-env-ts",
                            enforce: "post",
                            config() {
                                const envDTsPath = url.fileURLToPath(new URL("env.d.ts", srcDir))
                                const actionsDTsPath = url.fileURLToPath(new URL(".astro/actions.d.ts", root))
                                const actionsFilePathString = JSON.stringify(actionsFilePath)
                                const _relativeActionsDTsPath = path.relative(path.dirname(envDTsPath), actionsDTsPath)
                                const relativeActionsDTsPath = JSON.stringify(_relativeActionsDTsPath.replaceAll("\\", "/"))
                                
                                fs.mkdirSync(path.dirname(actionsDTsPath), { recursive: true })
                                
                                fs.writeFileSync(
                                    actionsDTsPath,
                                    dedent`
                                    // this line is apparently necessary, maybe a typescript bug
                                    import(${actionsFilePathString})
                                    
                                    declare module "astro:actions" {
                                        export * from ${actionsFilePathString}
                                        export { default } from ${actionsFilePathString}
                                    }
                                    `
                                )
                                
                                let envDTsContents = fs.readFileSync(envDTsPath, "utf-8")
                                
                                if (envDTsContents.includes(`/// <reference types=${relativeActionsDTsPath} />`)) { return }
                                
                                const newEnvDTsContents = envDTsContents.replace(
                                    '/// <reference types="astro/client" />',
                                    dedent`
                                    /// <reference types="astro/client" />
                                    /// <reference types=${relativeActionsDTsPath} />
                                    `
                                )
                                
                                if (newEnvDTsContents === envDTsContents) { return }
                                
                                fs.writeFileSync(envDTsPath, newEnvDTsContents)
                                logger.info("Updated env.d.ts types")
                            }
                        }]
                    }
                } satisfies Partial<AstroConfig>)
            }
        }
    }
}
