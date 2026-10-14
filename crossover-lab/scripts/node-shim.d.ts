// The weekly report runs under Node (via vitest); the app itself has no Node types, so declare
// the two things the script uses instead of pulling in @types/node.
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void
}

declare const process: { env: Record<string, string | undefined> }
