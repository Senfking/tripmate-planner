

## Fix: Blank Screen from React Duplicate Instance

### Problem
`@tanstack/react-query` calls `useEffect` on a `null` React instance, meaning Vite is bundling two separate copies of React. The `resolve.dedupe` config in `vite.config.ts` already lists React entries, but the Vite dep cache (`node_modules/.vite`) may be stale.

### Solution
1. **Force a full dep re-optimization** by adding a cache-busting comment or timestamp to `vite.config.ts` (forces Vite to re-hash and rebuild the dep cache).
2. **Ensure `optimizeDeps.include`** explicitly lists `react`, `react-dom`, and `@tanstack/react-query` so Vite pre-bundles them together in one pass, preventing duplicate React instances.

### Changes

**`vite.config.ts`** — Add `optimizeDeps.include` to force co-bundling:
```ts
optimizeDeps: {
  include: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
},
```

This tells Vite to pre-bundle these together, guaranteeing a single React instance. The existing `resolve.dedupe` stays as a secondary safeguard.

