/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="../.astro/actions.d.ts" />
/// <reference types="astro-global/client" />

type Details = import("db/users.ts").Details

namespace App {
    interface Locals {
        user: Details | undefined
    }
}