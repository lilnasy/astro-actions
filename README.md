# Astro Server Functions
Write functions that run on the server, and can be called by the browser.

## Getting Started

#### Create a new project
```
npx create-astro --template basics --yes astro-server-functions-project
pnpm create astro --template basics --yes astro-server-functions-project
yarn create astro --template basics --yes astro-server-functions-project
```

#### Install the package
```
npm install astro-server-functions
pnpm add astro-server-functions
yarn add astro-server-functions
```

#### Add server functions to your config
```ts
// astro.config.mjs
import sf from 'astro-server-functions'

export default defineConfig({
    integrations: [sf()]
})
```

#### Implement a server function
```ts
// src/serverfunctions.ts
export async function hello() {
    return 'Hello, world!'
}
```

#### Call the server function from an astro page
```astro
---
// src/pages/index.astro
---
<script>
    import { hello } from "../serverfunctions"
    const message = await hello()
    console.log(message)
</script>
```

## Can I use this in React?
Yes! you can import a server function into any framework component, including React, Vue, Svelte, Solid, and more.

## What can I share between the browser and server?
Primitives (strings, numbers, booleans), plain objects, Set, Map, Request, Response, Promises, and async functions. Please create a discussion if you would like to see more.

## Where can I run this?
Currently, only in the dev server, and Deno. Support for Node is dependent on a proposal to Astro that is being written.
