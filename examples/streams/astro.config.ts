import { defineConfig } from "astro/config"
import sf from "astro-server-functions"
import deno from "@astrojs/deno"

export default defineConfig({
    integrations: [ sf({ mode: 'websocket' }) ],
    output: "server",
    adapter: deno(),
})