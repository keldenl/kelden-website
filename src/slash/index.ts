import { createRouter } from "./registry";
import { Help, Status, Download, Load, Unload, ClearCache, Clear, Think, NoThink } from "./commands";
import type { CommandContext, Command } from "./types";

export function createSlashSystem(ctx: CommandContext) {
  const commands: Command[] = [];
  const help = Help(() => commands);
  commands.push(help, Status, Download, Load, Unload, ClearCache, Clear, Think, NoThink);
  const router = createRouter(commands);
  (router.dispatch as any).setContext?.(ctx);
  return router;
}

export type { CommandContext, IO } from "./types";
