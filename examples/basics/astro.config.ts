import { defineConfig } from "astro/config"
import sf from "astro-server-functions"
import node from "@astrojs/node"

export default defineConfig({
    integrations: [ sf() ],
    output: "server",
    adapter: node({ mode: 'standalone' }),
})