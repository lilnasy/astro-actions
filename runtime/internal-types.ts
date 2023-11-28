import type { Action } from "./server.ts"

export type ProxyAction<T> =
    // Well-defined action
    T extends Action<infer Req, infer Res> ? { fetch(request: Req): Promise<Res> } :
    // Simple async function
    T extends (...args: any) => Promise<any> ? T :
    // Simple sync function
    T extends (...args: any) => infer ReturnType ? (...args: Parameters<T>) => Promise<ReturnType>
    // Non-function exports
    : undefined
