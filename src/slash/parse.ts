// Tiny, robust tokenizer (handles quotes, --k=v, -abc)
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'|([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1] ?? m[3] ?? m[5] ?? "");
  }
  return tokens;
}

export function parseFlagsAndArgs(tokens: string[]) {
  const flags: Record<string, string | number | boolean> = {};
  const args: string[] = [];
  for (const t of tokens) {
    if (t === "--") {
      const idx = tokens.indexOf(t);
      args.push(...tokens.slice(idx + 1));
      break;
    } else if (t.startsWith("--")) {
      const [k, v] = t.slice(2).split("=", 2);
      if (v === undefined) flags[k] = true;
      else if (v.match(/^-?\d+(\.\d+)?$/)) flags[k] = Number(v);
      else flags[k] = v;
    } else if (t.startsWith("-") && t.length > 2) {
      t.slice(1).split("").forEach(ch => (flags[ch] = true));
    } else if (t.startsWith("-")) {
      flags[t.slice(1)] = true;
    } else {
      args.push(t);
    }
  }
  return { args, flags };
}

export function parseLine(input: string) {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return { cmd: "", args: [] as string[], flags: {} as Record<string, any> };
  const [cmd, ...rest] = tokens;
  const { args, flags } = parseFlagsAndArgs(rest);
  return { cmd, args, flags };
}
