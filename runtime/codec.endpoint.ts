// @ts-expect-error
import * as actions from "actions:implementation"
import { encode, decode } from "es-codec"
import { astroGlobalStorage } from "./localstorage.ts"
import type { APIRoute } from "astro"

export const POST : APIRoute = async (ctx) => {
    const [ id, args ] = decode(await ctx.request.arrayBuffer()) as any
    const result = await astroGlobalStorage.run(ctx, async () => await actions[id](...args))
    return new Response(encode(result))
}
