// @ts-expect-error
import * as serverFunctions from "server:functions"
import { encode, decode } from "./codec.fetch.ts"
import type { APIRoute } from "astro"

export const POST : APIRoute = async ({ request }) => {
    const [ funName, args ] = decode(await request.arrayBuffer()) as any
    const result = await serverFunctions[funName](...args)
    return new Response(encode(result))
}
