import { defineConfig } from "astro/config"
import node from "@astrojs/node"
import react from "@astrojs/react"
import global from "astro-global"
import actions from "astro-server-actions"

// https://astro.build/config
export default defineConfig({
    output: "server",
    integrations: [react(), actions(), global()],
    adapter: node({
        mode: "standalone"
    })
})
