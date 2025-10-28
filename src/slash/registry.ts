import type { Command, Router, IO, CommandContext } from "./types";
import { parseLine } from "./parse";

export function createRouter(commands: Command[]): Router {
  const byName = new Map<string, Command>();
  for (const c of commands) {
    byName.set(c.name, c);
    c.aliases?.forEach(a => byName.set(a, c));
  }

  let ctx: CommandContext | null = null;

  async function dispatch(raw: string, io: IO): Promise<boolean> {
    if (!raw.trim().startsWith("/")) return false;
    const { cmd, args, flags } = parseLine(raw.slice(1));
    const entry = byName.get(cmd);
    if (!entry) {
      io.println(`command not found: /${cmd}`);
      io.println(`type /help for a list of commands`);
      return true;
    }
    if (!ctx) {
      io.println("Error: command context unavailable");
      return true;
    }
    try {
      await entry.run(args, flags, io, ctx);
    } catch (e: any) {
      io.println(`Error: ${e?.message ?? String(e)}`);
    }
    return true;
  }

  (dispatch as any).setContext = (next: CommandContext) => {
    ctx = next;
  };

  return {
    dispatch: dispatch as any,
    list: () => [...new Set(commands)],
    get: (n) => byName.get(n),
  };
}
