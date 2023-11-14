// @ts-expect-error
import * as actions from "astro-actions-internal:implementation"
import type { APIRoute } from "astro"

export const POST : APIRoute = async (ctx) => {
    const [ id, args ] = await ctx.request.json()
    const result = await actions[id](...args)
    return Response.json(result)
}
