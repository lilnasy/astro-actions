import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import * as playwright from "playwright/test"
//@ts-expect-error
import globals from "../node_modules/playwright/lib/common/globals.js"
import * as Astro from "astro"

interface TestExtension {
    dev: DevServer
    build: BuildFixture
    exports: NodeAdapterExports
    adapter: NodeAdapterServer
}

interface NodeAdapterExports extends ReturnType<typeof import("@astrojs/node/server.js")["createExports"]> {}
interface NodeAdapterServer extends ReturnType<NodeAdapterExports["startServer"]> {}

export function testFactory(relativeRootPath: `./fixtures/${string}`, options?: Astro.AstroInlineConfig) {
    let devServerPromise: Promise<typeof devServer>
    let devServer: DevServer
    let buildFixturePromise: Promise<typeof buildFixture>
    let buildFixture: BuildFixture
    let exportsPromise: Promise<typeof exports>
    let exports: NodeAdapterExports
    let adapterServer: NodeAdapterServer

    const test = playwright.test.extend<TestExtension>({
        async page({ page }, use) {
            // doing this here avoids needing to create playwright.config.ts
            globals.currentTestInfo()._projectInternal.expect.timeout = 500
            await use(page)
        },
        async dev({}, use) {
            devServerPromise ??= dev(relativeRootPath, options)
            devServer ??= await devServerPromise
            await use(devServer)
        },
        async build({}, use) {
            buildFixturePromise ??= build(relativeRootPath, options)
            buildFixture ??= await buildFixturePromise
            await use(buildFixture)
        },
        async exports({ build }, use) {
            exportsPromise ??= import(build.resolve(`./server/entry.mjs?${Date.now()}`))
            exports ??= await exportsPromise
            await use(exports)
        },
        async adapter({ exports }, use) {
            adapterServer ??= exports.startServer()
            await use(adapterServer)
        }
    })
    return test
}

export interface BuildFixture {
    readTextFile(path: string): string
    resolve(path: string): string
}

export async function build(relativeRootPath: `./fixtures/${string}`, options?: Astro.AstroInlineConfig): Promise<BuildFixture> {
    await command("build", relativeRootPath, options)
    const resolve: BuildFixture["resolve"] = path => join(import.meta.url, "..", relativeRootPath, "dist", path)
    return {
        resolve,
        readTextFile: path => readFileSync(resolve(path), "utf8")
    }
}

export interface DevServer {
    address: { address: string, port: number }
    stop(): Promise<void>
    fetch(path: string): Promise<string>
}

export async function dev(relativeRootPath: `./fixtures/${string}`, options?: Astro.AstroInlineConfig): Promise<DevServer> {
    const server = await command("dev", relativeRootPath, options)
    return {
        address: server.address,
        stop: server.stop,
        fetch: path => fetch(`http://localhost:${server.address.port}${path}`).then(r => r.text())
    }
}

async function command<Command extends "dev" | "build">(
    command: Command,
    relativeRootPath: string,
    options?: Astro.AstroInlineConfig
) {
    const root = fileURLToPath(new URL(relativeRootPath, import.meta.url))
    return await Astro[command]({
        root,
        logLevel: "silent",
        vite: {
            logLevel: "silent",
            build: {
                rollupOptions: {
                    logLevel: "silent",
                    ...options?.vite?.build?.rollupOptions
                },
                ...options?.vite?.build
            },
            ...options?.vite
        },
        ...options
    }) as Command extends "dev" ? ReturnType<typeof Astro.dev> : void
}
