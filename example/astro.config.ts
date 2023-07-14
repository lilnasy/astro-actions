import { defineConfig } from "astro/config"
import sf from "server-functions"
import deno from "@astrojs/deno"

export default defineConfig({
    integrations: [sf],
    output: "server",
    adapter: deno()
})