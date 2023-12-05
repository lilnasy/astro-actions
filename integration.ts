import url from "node:url"
import path from "node:path"
import fs from "node:fs"
import ts from "typescript"
import dedent from "./dedent.ts"
import type { AstroConfig, AstroIntegration, AstroIntegrationLogger } from "astro"

export interface Options {
    /**
     * The format used by server actions to send data over the network.
     * 
     * When `"es-codec"` is selected, you will be able to send more types of data - including `BigInt`, `Map`, `Set`, `TypedArray`, and `ArrayBuffer`.
     * However, you will be sending slightly more javascript to the browser.
     * 
     * When `"JSON"` is selected, you will be sending very little javascript to the browser but data types will be limited to `number`, `string`, `Array`, and plain objects.
     */
    serialization: "es-codec" | "JSON"
}

export default function (options: Partial<Options> = {}): AstroIntegration {
    const { serialization = "es-codec" } = options
    return {
        name: "astro-actions",
        hooks: {
            "astro:config:setup" ({ config, injectRoute, updateConfig, logger }) {
                
                let actionsFilePath = ""
                const actionsTypesUrl = new URL(".astro/actions.d.ts", config.root)
                
                for (const extension of ["ts", "js", "mjs", "mts"]) {
                    const filePath = url.fileURLToPath(new URL("actions." + extension, config.srcDir))
                    if (fs.existsSync(filePath)) actionsFilePath = filePath.replaceAll("\\", "/")
                    else continue
                    break
                }
                
                if (!actionsFilePath) return logger.error("No actions file found. Make sure you have an actions.ts file in your src directory.")
                
                injectRoute({
                    pattern   : "/_action",
                    entrypoint:
                        serialization === "JSON"
                            ? "astro-actions/runtime/internal-server-endpoint-json.ts"
                            : "astro-actions/runtime/internal-server-endpoint-escodec.ts",
                })

                updateConfig({
                    vite: {
                        plugins: [{
                            name: "astro-actions/vite",
                            resolveId(id) {
                                if (id === "astro:actions/client") return actionsFilePath
                                if (id === "astro:actions/server") return this.resolve("astro-actions/runtime/server.ts")
                            },
                            async transform(_code, id, { ssr } = {}) {
                                if (id === actionsFilePath && Boolean(ssr) === false) {
                                    const exports = getExportsOfModule(actionsFilePath)
                                    
                                    logger.info(`Transforming ${exports.length} functions to server actions: ${exports.join(", ")}.`)
                                    
                                    const entrypoint =
                                        serialization === "JSON"
                                            ? "astro-actions/runtime/internal-client-proxy-json.js"
                                            : "astro-actions/runtime/internal-client-proxy-escodec.js"

                                    const imports = `import { proxyAction } from "${entrypoint}"`
                                    
                                    const callableExports =
                                            exports.map(name => {
                                            if (name === "default") return `export default proxyAction("${name}")`
                                            else                    return `export const ${name} = proxyAction("${name}")`
                                        })
                                    
                                    return imports + "\n" + callableExports.join("\n")
                                }
                            }
                        }, {
                            name: "astro-actions/vite/types",
                            enforce: "post",
                            config() {
                                injectEnvDTS(config, logger, actionsTypesUrl)

                                const actionsTypesPath = url.fileURLToPath(actionsTypesUrl)
                                const exports = getExportsOfModule(actionsFilePath)
                                
                                fs.mkdirSync(path.dirname(actionsTypesPath), { recursive: true })
                                
                                fs.writeFileSync(
                                    actionsTypesPath,
                                    dedent`
                                    type ProxyAction<T> = import("astro-actions/runtime/internal-types.ts").ProxyAction<T>

                                    declare module "astro:actions/client" {
                                        type actions = typeof import(${JSON.stringify(actionsFilePath.replaceAll("\\", "/"))})
                                    ${exports.map(name => name === "default"
                                        ? `    export default ProxyActions<actions["default"]>`
                                        : `    export const ${name}: ProxyAction<actions["${name}"]>`
                                        ).join("\n")}
                                    }
                                    declare module "astro:actions/server" {
                                        export * from "astro-actions/runtime/server.ts"
                                    }
                                    `
                                )
                            }
                        }]
                    }
                } satisfies Partial<AstroConfig>)
            }
        }
    }
}

function getExportsOfModule(path: string) {
    const program = ts.createProgram([path], {})
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile(path)!
    const symbol = checker.getSymbolAtLocation(sourceFile)!
    const exports = checker.getExportsOfModule(symbol)
    return exports.map(exp => exp.getName())
}

function injectEnvDTS(config: AstroConfig, logger: AstroIntegrationLogger, specifier: URL | string) {
    const envDTsPath = url.fileURLToPath(new URL("env.d.ts", config.srcDir))
    
    if (specifier instanceof URL) {
        specifier = url.fileURLToPath(specifier)
        specifier = path.relative(url.fileURLToPath(config.srcDir), specifier)
        specifier = specifier.replaceAll("\\", "/")
    }
    
    let envDTsContents = fs.readFileSync(envDTsPath, "utf-8")
    
    if (envDTsContents.includes(`/// <reference types='${specifier}' />`)) { return }
    if (envDTsContents.includes(`/// <reference types="${specifier}" />`)) { return }
    
    const newEnvDTsContents = envDTsContents.replace(
        `/// <reference types='astro/client' />`,
        `/// <reference types='astro/client' />\n/// <reference types='${specifier}' />\n`
    ).replace(
        `/// <reference types="astro/client" />`,
        `/// <reference types="astro/client" />\n/// <reference types="${specifier}" />\n`
    )
    
    // the odd case where the user changed the reference to astro/client
    if (newEnvDTsContents === envDTsContents) { return }
    
    fs.writeFileSync(envDTsPath, newEnvDTsContents)
    logger.info("Updated env.d.ts types")
}
