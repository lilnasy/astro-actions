import type { APIContext } from "astro"

export interface ActionContext extends Pick<APIContext, "locals" | "cookies"> {}

export interface Action<Req, Res> {
    fetch(request: Req, context: ActionContext): Promise<Res> | Res
}

export function defineAction<ActionDefinition extends Action<unknown, unknown>>(action: ActionDefinition): ActionDefinition {
    return action
}
