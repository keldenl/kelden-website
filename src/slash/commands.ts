import type { Command } from "./types";

const bar = (pct: number) => {
  const n = Math.max(0, Math.min(20, Math.round((pct / 100) * 20)));
  return `[${"█".repeat(n)}${"░".repeat(20 - n)}] ${pct.toFixed(0)}%`;
};

export const Help = (all: () => Command[]): Command => ({
  name: "help",
  aliases: ["h", "?"],
  summary: "Show available commands or help for a specific command",
  usage: "/help [command]",
  async run(args, _flags, io) {
    if (args[0]) {
      const cmd = all().find(c => c.name === args[0] || c.aliases?.includes(args[0]));
      if (!cmd) return io.println(`No help for: ${args[0]}`);
      io.println(`${cmd.name}${cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : ""}`);
      if (cmd.summary) io.println(cmd.summary);
      if (cmd.usage) io.println(`usage: ${cmd.usage}`);
      cmd.examples?.forEach(ex => io.println(`  ${ex}`));
      return;
    }
    io.println("Available commands:");
    all().forEach(c => {
      io.println(`/${c.name}${c.aliases?.length ? ` (${c.aliases.join(",")})` : ""}  - ${c.summary}`);
    });
  },
});

export const Status: Command = {
  name: "status",
  summary: "Show model and session status",
  usage: "/status [--json] [--quiet|-q]",
  examples: ["/status", "/status --json"],
  run(_a, flags, io, ctx) {
    const s = ctx.getState();
    const payload = {
      model: s.modelName ?? "not installed",
      sizeGB: s.modelSizeGB ?? null,
      downloaded: s.downloaded,
      loaded: s.loaded,
      chats: s.chats,
      status: !s.downloaded ? "offline" : s.loaded ? "active" : "downloaded",
    };

    const wantsJson = Boolean(flags.json);
    const quiet = Boolean(flags.quiet ?? flags.q);

    if (wantsJson) {
      io.println(JSON.stringify(payload, null, 2));
      return;
    }

    if (quiet) return;

    const lines = [
      `model:        ${payload.model}`,
      `size:         ${payload.sizeGB ? `${payload.sizeGB}GB` : "-"}`,
      `status:       ${payload.status}${payload.loaded ? " ✓" : ""}`,
      `memory:       ${payload.loaded ? "loaded" : "-"}`,
      `chats:        ${payload.chats}`,
      `privacy:      local / offline`,
    ];
    (io.printLines ?? ((ls: string[]) => ls.forEach(io.println)))(lines);
  },
};

export const Download: Command = {
  name: "download",
  summary: "Download the starter model",
  usage: "/download",
  examples: ["/download"],
  async run(_a, _f, io, ctx) {
    const state = ctx.getState();
    const total = state.modelSizeGB ?? 1.28;
    const id = "download";
    const modelName = state.modelName ?? "starter.gguf";
    const startMessage = `→ fetching model: ${modelName} (${total}GB)\n  ${bar(0)}`;
    if (io.startLive) io.startLive(id, startMessage);
    else io.println(startMessage);
    await ctx.actions.download((loaded, totalGB) => {
      const pct = Math.min(100, (loaded / (totalGB || total)) * 100);
      const msg = `→ fetching model: ${modelName} (${total}GB)\n  ${bar(pct)}`;
      if (io.updateLive) io.updateLive(id, msg);
      else io.println(msg);
    });
    io.endLive?.(id);
    io.println("install complete.\nrun /load to activate the model.");
  },
};

export const Load: Command = {
  name: "load",
  summary: "Load the model into memory",
  usage: "/load",
  examples: ["/load"],
  async run(_a, _f, io, ctx) {
    const s = ctx.getState();
    if (!s.downloaded) {
      io.println("zsh: no llm downloaded\n\t run /download first");
      return;
    }
    if (s.loaded) {
      io.println("model already active.");
      return;
    }
    io.println(`loading ${s.modelName ?? "model"} ...`);
    await ctx.actions.load();
    io.println("✓ model loaded\nthreads: 8\ncontext: 4096 tokens\nlatency: ~11ms/token\n tip: type a message to start chatting");
  },
};

export const Unload: Command = {
  name: "unload",
  summary: "Unload the model from memory",
  usage: "/unload",
  examples: ["/unload"],
  async run(_a, _f, io, ctx) {
    const s = ctx.getState();
    if (!s.loaded) {
      io.println("model already unloaded.");
      return;
    }
    await ctx.actions.unload();
    io.println("model unloaded. (run /load to activate again)");
  },
};

export const ClearCache: Command = {
  name: "clear-cache",
  summary: "Delete all cached models",
  usage: "/clear-cache",
  examples: ["/clear-cache"],
  async run(_a, _f, io, ctx) {
    const state = ctx.getState();
    if (!state.downloaded && !state.loaded) {
      io.println("no cached models to clear.");
      return;
    }
    if (state.loaded) {
      io.println("unloading model and clearing cache...");
    } else {
      io.println("clearing cached models...");
    }
    await ctx.actions.clearCache();
    io.println("model cache cleared.");
  },
};

export const Clear: Command = {
  name: "clear",
  aliases: ["cls"],
  summary: "Clear the terminal",
  usage: "/clear",
  examples: ["/clear"],
  run(_a, _f, io) {
    io.clearScreen?.();
  },
};

export const Think: Command = {
  name: "think",
  summary: "Enable model thinking output for future prompts",
  usage: "/think",
  run(_a, _f, io, ctx) {
    if (ctx.getState().thinking) {
      io.println("thinking is already enabled.");
      return;
    }
    ctx.actions.setThinking(true);
    io.println("thinking enabled. future prompts will include /think.");
  },
};

export const NoThink: Command = {
  name: "no_think",
  aliases: ["nothink"],
  summary: "Disable model thinking output for future prompts",
  usage: "/no_think",
  run(_a, _f, io, ctx) {
    if (!ctx.getState().thinking) {
      io.println("thinking is already disabled.");
      return;
    }
    ctx.actions.setThinking(false);
    io.println("thinking disabled. future prompts will include /no_think.");
  },
};
