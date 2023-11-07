/// <reference types="astro/client" />
/// <reference types="astro-server-actions/client" />

namespace App {
    interface Locals {
        user: Exclude<ReturnType<typeof import("db/users.ts").read>, symbol> | undefined
    }
}