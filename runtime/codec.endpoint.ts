// @ts-expect-error
import * as actions from "astro-actions-internal:implementation"
import { encode, decode } from "es-codec"
import type { APIRoute } from "astro"

export const POST : APIRoute = async (ctx) => {
    const [ id, args ] = decode(await ctx.request.arrayBuffer()) as any
    const result = await actions[id](...args)
    return new Response(encode(result))
}
