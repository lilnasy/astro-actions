// @ts-expect-error
import * as actions from "actions:implementation"
import { astroGlobalStorage } from "./localstorage.ts"
import type { APIRoute } from "astro"

export const POST : APIRoute = async (ctx) => {
    const [ id, args ] = await ctx.request.json()
    const result = await astroGlobalStorage.run(ctx, async () => await actions[id](...args))
    return Response.json(result)
}
