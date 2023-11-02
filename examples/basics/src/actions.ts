import { Astro } from "astro:actions"

export async function hello(to: string) {
    console.log(Astro.request)
    console.log("Hello, ", to)
}