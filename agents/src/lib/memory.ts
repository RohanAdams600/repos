/**
 * The "filing cabinet under the desk": a clean, bounded context window
 * builder. Every agent's system prompt is assembled from exactly these
 * pieces — soul.md, identity.md, user.md, the relevant playbook, and
 * nothing else — so context never rots into an unbounded chat history.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_ROOT = path.resolve(__dirname, "../..");

const cache = new Map<string, string>();

async function readIdentityFile(relativePath: string): Promise<string> {
  if (cache.has(relativePath)) return cache.get(relativePath)!;
  const full = path.join(AGENTS_ROOT, relativePath);
  const content = await readFile(full, "utf-8");
  cache.set(relativePath, content);
  return content;
}

export async function loadSoul(): Promise<string> {
  return readIdentityFile("identity/soul.md");
}

export async function loadIdentity(): Promise<string> {
  return readIdentityFile("identity/identity.md");
}

export async function loadUserProfile(): Promise<string> {
  return readIdentityFile("identity/user.md");
}

export type PlaybookName = "voice-style-guide" | "sales-playbook" | "onboarding-playbook";

export async function loadPlaybook(name: PlaybookName): Promise<string> {
  return readIdentityFile(`playbooks/${name}.md`);
}

/**
 * Assembles a bounded system prompt: identity charter + this agent's role
 * slice + the specific playbook(s) it needs for the task at hand. Callers
 * pass only the playbooks relevant to the current task — never the whole
 * playbook directory — to keep the context window clean.
 */
export async function assembleContext(opts: {
  roleBlock: string;
  playbooks?: PlaybookName[];
}): Promise<string> {
  const [soul, identity, user] = await Promise.all([loadSoul(), loadIdentity(), loadUserProfile()]);
  const playbooks = await Promise.all((opts.playbooks ?? []).map(loadPlaybook));

  return [
    soul,
    identity,
    user,
    ...playbooks,
    "---",
    "# Your role for this task",
    opts.roleBlock,
  ].join("\n\n");
}

/** Clears the identity-file cache — used when identity docs change without a process restart. */
export function invalidateMemoryCache(): void {
  cache.clear();
}
