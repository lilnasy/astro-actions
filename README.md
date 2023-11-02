# Astro Server Actions
Write functions that run on the server, and can be called by the browser.

## Getting Started

#### Create a new project
```
npx create-astro --template basics --yes astro-server-actions-project
pnpm create astro --template basics --yes astro-server-actions-project
yarn create astro --template basics --yes astro-server-actions-project
```

#### Install the package
```
npm install lilnasy/astro-server-actions
pnpm add lilnasy/astro-server-actions
yarn add lilnasy/astro-server-actions
```

#### Add server functions to your config
```ts
// astro.config.mjs
import actions from 'astro-server-actions'

export default defineConfig({
    integrations: [actions()]
})
```

#### Implement server actions in src/actions.ts
```ts
// src/actions.ts
export async function hello() {
    return 'Hello, world!'
}
```

#### Call the server action from an astro page
```astro
---
// src/pages/index.astro
---
<script>
    import { hello } from "../actions.ts"
    const message = await hello()
    console.log(message)
</script>
```

## Can I use this in React?
Yes! you can import a server function into any framework component, including React, Vue, Svelte, Solid, and more.


## What can I share between the browser and server?
Primitives (strings, numbers, booleans), plain objects, `Set`, `Map`, `Error`, `ArrayBuffer`, and `TypedArray`. Please create a discussion if you would like to see more.

## Where can I run this?
Everywhere astro can be deployed. Keep in mind that this feature is only relevant to the server output, you need an SSR deployment to use this.
