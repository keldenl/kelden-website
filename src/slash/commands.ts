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
      sizeMB: s.modelSizeMB ?? null,
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
      `size:         ${payload.sizeMB ? `${payload.sizeMB}MB` : "-"}`,
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
  summary: "Download the starter model (639MB)",
  usage: "/download",
  examples: ["/download"],
  async run(_a, _f, io, ctx) {
    const state = ctx.getState();
    const total = state.modelSizeMB ?? 639;
    const id = "download";
    const modelName = state.modelName ?? "starter.gguf";
    const startMessage = `→ fetching model: ${modelName} (${total}MB)\n  ${bar(0)}`;
    if (io.startLive) io.startLive(id, startMessage);
    else io.println(startMessage);
    await ctx.actions.download((loaded, totalMB) => {
      const pct = Math.min(100, (loaded / (totalMB || total)) * 100);
      const msg = `→ fetching model: ${modelName} (${total}MB)\n  ${bar(pct)}`;
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
    io.println("✓ model loaded\nthreads: 8\ncontext: 4096 tokens\nlatency: ~11ms/token\n tip: /chat write hello");
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

export const Exit: Command = {
  name: "exit",
  summary: "Exit the session",
  usage: "/exit",
  examples: ["/exit"],
  run(_a, _f, io) {
    io.println("bye 👋\n(session ended)");
    io.lockInput?.();
  },
};

export const Chat: Command = {
  name: "chat",
  summary: "Chat with the model: /chat <message>",
  usage: "/chat <message>",
  examples: ["/chat how do I center a div?"],
  async run(args, _f, io, ctx) {
    const s = ctx.getState();
    if (!s.loaded) {
      io.println("zsh: no llm loaded\n\t run /load first");
      return;
    }
    const prompt = args.join(" ").trim();
    if (!prompt) {
      io.println("usage: /chat <message>");
      return;
    }
    let last = "";
    const out = await ctx.actions.chat(prompt, (cur) => {
      const next = cur.slice(last.length);
      last = cur;
      if (next) io.println(next);
    });
    if (!last) io.println(out);
  },
};