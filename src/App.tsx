import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { WLLAMA_CONFIG_PATHS } from './utils/wllama/config';
import { Model, ModelManager, Wllama, type WllamaChatMessage } from '@wllama/wllama/esm';
import Terminal from './components/Terminal';
import { createSlashSystem, type IO } from './slash';

const wllamaInstance = new Wllama(WLLAMA_CONFIG_PATHS);
const currentDate = new Date();
const SYSTEM_PROMPT = `You are Kelden Lin's clone. You live on keldenl.com and are here to help visitors.

## Identity & Mission
- You (Kelden Lin) are a playful, tech-forward senior software engineer specializing in developing AI platforms.
- Kelden is 28 years old and lives in Seattle, Washington. He was born in September.
- Keep everything in English.

## Voice & Tone
- Reply in lower case, short lines, candid and breezy.
- Stay playful but keep it sharp.

It is currently ${currentDate.toLocaleDateString()} and ${currentDate.toLocaleTimeString()}.`;

const MODEL_SIZE_MB = 639;
const MODEL_NAME = 'ai model';

const toAssistantMessage = (content: string): WllamaChatMessage => ({
  role: 'assistant',
  content,
});

function App() {
  const modelManager = useMemo(() => new ModelManager(), []);

  const [models, setModels] = useState<Model[]>([]);
  const modelsRef = useRef<Model[]>([]);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [chats, setChats] = useState<number>(0);
  const [latestResponse, setLatestResponse] = useState<string>('');
  const [inputLocked, setInputLocked] = useState<boolean>(false);

  const initialBanner = `Last login: ${currentDate.toDateString()} ${currentDate.toTimeString().split(' ')[0]} on ttys030
zsh: no llm loaded
    run /download to install ai model (${MODEL_SIZE_MB}MB)
    run /load to load it if you already downloaded it
    run /help for commands`;

  const [messages, setMessages] = useState<WllamaChatMessage[]>([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'assistant', content: initialBanner },
  ]);

  const conversationRef = useRef<WllamaChatMessage[]>([
    { role: 'system', content: SYSTEM_PROMPT },
  ]);
  const slashRef = useRef<ReturnType<typeof createSlashSystem> | null>(null);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  useEffect(() => {
    async function refreshModels() {
      const available = await modelManager.getModels();
      setModels(available);
      setDownloaded(available.length > 0);
    }
    refreshModels().catch((error) => {
      console.error('failed to fetch models', error);
    });
  }, [modelManager]);

  const makeIO = useCallback((options?: { coalesce?: boolean }): IO => {
    const coalesce = options?.coalesce ?? false;
    let messageIndex: number | null = coalesce ? null : null;
    const liveIndices = new Map<string, number>();

    const appendBlock = (text: string) => {
      setMessages(prev => {
        if (!coalesce) {
          return [...prev, toAssistantMessage(text)];
        }
        if (messageIndex === null) {
          const next = [...prev, toAssistantMessage(text)];
          messageIndex = next.length - 1;
          return next;
        }
        const idx = messageIndex;
        if (idx < 0 || idx >= prev.length || prev[idx].role !== 'assistant') {
          const next = [...prev, toAssistantMessage(text)];
          messageIndex = next.length - 1;
          return next;
        }
        const next = [...prev];
        const existing = next[idx];
        const content = existing.content
          ? `${existing.content}\n${text}`
          : text;
        next[idx] = { ...existing, content };
        return next;
      });
    };

    const io: IO = {
      println(line: string) {
        appendBlock(line);
      },
    };

    io.printLines = (lines: string[]) => {
      if (lines.length === 0) return;
      appendBlock(lines.join('\n'));
    };

    io.startLive = (id: string, line: string) => {
      setMessages(prev => {
        const message = toAssistantMessage(line);
        const next = [...prev, message];
        const idx = next.length - 1;
        if (coalesce) {
          messageIndex = idx;
        }
        liveIndices.set(id, idx);
        return next;
      });
    };

    io.updateLive = (id: string, line: string) => {
      const idx = liveIndices.get(id);
      if (idx === undefined) {
        appendBlock(line);
        return;
      }
      setMessages(prev => {
        if (idx < 0 || idx >= prev.length) return prev;
        const target = prev[idx];
        if (!target || target.role !== 'assistant') return prev;
        const next = [...prev];
        next[idx] = { ...target, content: line };
        return next;
      });
    };

    io.endLive = (id: string) => {
      liveIndices.delete(id);
    };

    io.clearScreen = () => {
      messageIndex = null;
      liveIndices.clear();
      setMessages(prev => {
        if (prev.length <= 2) return prev;
        return prev.slice(0, 2);
      });
    };
    io.lockInput = () => {
      setInputLocked(true);
    };
    return io;
  }, []);

  const downloadAction = useCallback(async (onProgress?: (loaded: number, total: number) => void) => {
    const model = modelsRef.current[0] ?? {
      url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    };
    await modelManager.downloadModel(model.url, {
      progressCallback(opts) {
        onProgress?.(opts.loaded / (1024 * 1024), opts.total / (1024 * 1024));
      },
    });
    setDownloaded(true);
    const refreshed = await modelManager.getModels();
    setModels(refreshed);
  }, [modelManager]);

  const loadAction = useCallback(async () => {
    const model = modelsRef.current[0];
    if (!model) throw new Error('No model available');
    await wllamaInstance.loadModel(model, {
      // n_ctx: 4096,
      // n_threads: -1,
      // n_batch: 128,
    });
    setModelLoaded(true);
  }, []);

  const unloadAction = useCallback(async () => {
    await wllamaInstance.exit();
    setModelLoaded(false);
  }, []);

  const chatAction = useCallback(async (prompt: string, onStream?: (text: string) => void) => {
    const userMessage: WllamaChatMessage = { role: 'user', content: prompt };
    conversationRef.current.push(userMessage);
    try {
      const result = await wllamaInstance.createChatCompletion(conversationRef.current, {
        // nPredict: 8096,
        sampling: { temp: 1 },
        onNewToken: (_token: any, _piece: any, currentText: string) => {
          onStream?.(currentText);
        },
      });
      setLatestResponse('');
      const assistantMessage: WllamaChatMessage = { role: 'assistant', content: result };
      conversationRef.current.push(assistantMessage);
      setMessages(prev => [...prev, assistantMessage]);
      setChats(prev => prev + 1);
      return result;
    } catch (error) {
      conversationRef.current.pop();
      throw error;
    }
  }, []);

  useEffect(() => {
    const ctx = {
      getState: () => ({
        downloaded,
        loaded: modelLoaded,
        chats,
        modelName: MODEL_NAME,
        modelSizeMB: MODEL_SIZE_MB,
      }),
      actions: {
        download: downloadAction,
        load: loadAction,
        unload: unloadAction,
        chat: chatAction,
      },
    };
    if (!slashRef.current) {
      slashRef.current = createSlashSystem(ctx);
    } else {
      (slashRef.current.dispatch as any).setContext?.(ctx);
    }
  }, [downloaded, modelLoaded, chats, downloadAction, loadAction, unloadAction, chatAction]);

  useEffect(() => {
    if (!modelLoaded) return;
    setDownloaded(true);
  }, [modelLoaded]);

  useEffect(() => {
    return () => {
      unloadAction();
    }
  }, []);

  const handleSendMessage = useCallback(async (value: string, thinking: boolean = false) => {
    const trimmed = value.trim();
    if (!trimmed || inputLocked) return;

    const userMessage: WllamaChatMessage = { role: 'user', content: value };
    setMessages(prev => [...prev, userMessage]);

    setGenerating(true);
    const slashIO = makeIO({ coalesce: true });
    const handled = await slashRef.current?.dispatch(value, slashIO);
    if (handled) {
      setGenerating(false);
      return;
    }

    const io = makeIO();

    if (generating) {
      io.println('still processing previous request. try again shortly.');
      setGenerating(false);
      return;
    }

    if (!modelLoaded) {
      io.println('zsh: no llm loaded\n\t run /download then /load');
      setGenerating(false);
      return;
    }

    try {
      await chatAction(`${value}${!thinking ? ' /no_think' : ''}`, current => setLatestResponse(current));
    } catch (error: any) {
      const message = error?.message ?? String(error);
      const fallback = message.includes('loadModel() is not yet called')
        ? 'zsh: no llm loaded\n\t run /download then /load'
        : `Error: ${message}`;
      io.println(fallback);
    } finally {
      setGenerating(false);
      setLatestResponse('');
    }
  }, [chatAction, generating, inputLocked, makeIO, modelLoaded]);

  const backgroundImageUrl = `${import.meta.env.BASE_URL}26-Tahoe-Dark-6K-thumb.jpg`;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${backgroundImageUrl}')` }}
    >
      <Terminal
        messages={messages}
        setMessages={setMessages}
        onSendMessage={handleSendMessage}
        isGenerating={generating}
        latestResponse={latestResponse}
        inputLocked={inputLocked}
      />
    </div>
  );
}

export default App;
