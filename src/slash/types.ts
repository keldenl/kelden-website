export type Flags = Record<string, string | number | boolean>;

export type IO = {
  println: (line: string) => void;
  printLines?: (lines: string[]) => void;
  startLive?: (id: string, line: string) => void;
  updateLive?: (id: string, line: string) => void;
  endLive?: (id: string) => void;
  clearScreen?: () => void;
  lockInput?: () => void;
};

export type CommandContext = {
  getState: () => {
    downloaded: boolean;
    loaded: boolean;
    chats: number;
    modelName?: string;
    modelSizeGB?: number;
    thinking: boolean;
  };
  actions: {
    download: (onProgress?: (loadedMB: number, totalMB: number) => void) => Promise<void>;
    load: () => Promise<void>;
    unload: () => Promise<void>;
    chat: (prompt: string, onStream?: (text: string) => void) => Promise<string>;
    clearCache: () => Promise<void>;
    setThinking: (next: boolean) => void;
  };
};

export type Command = {
  name: string;
  aliases?: string[];
  summary: string;
  usage?: string;
  examples?: string[];
  run: (args: string[], flags: Flags, io: IO, ctx: CommandContext) => Promise<void> | void;
};

export type Router = {
  dispatch: (raw: string, io: IO) => Promise<boolean>;
  list: () => Command[];
  get: (name: string) => Command | undefined;
};
