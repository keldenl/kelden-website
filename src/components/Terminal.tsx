import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Prompt } from './Prompt';
import type { WllamaChatMessage } from '@wllama/wllama/esm';

const THINK_TAG_REGEX = /<\/?think>/gi;

type RenderOptions = {
  streaming?: boolean;
};

type Segment = {
  type: 'text' | 'think';
  value: string;
  thinkId?: number;
};

const renderAssistantContent = (content: string, options?: RenderOptions): React.ReactNode => {
  if (!content) return null;

  THINK_TAG_REGEX.lastIndex = 0;

  const segments: Segment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let thinkCounter = 0;
  const thinkStack: number[] = [];

  const currentThinkId = () => thinkStack[thinkStack.length - 1];

  const pushSegment = (rawValue: string) => {
    if (!rawValue) return;
    const type: Segment['type'] = thinkStack.length > 0 ? 'think' : 'text';
    const value = type === 'think' ? rawValue.trim() : rawValue;
    if (type === 'think' && value.length === 0) {
      return;
    }
    const segment: Segment = { type, value };
    if (type === 'think') {
      segment.thinkId = currentThinkId();
    }
    segments.push(segment);
  };

  while ((match = THINK_TAG_REGEX.exec(content)) !== null) {
    const leading = content.slice(cursor, match.index);
    pushSegment(leading);

    const tag = match[0].toLowerCase();
    if (tag === '<think>') {
      thinkCounter += 1;
      thinkStack.push(thinkCounter);
    } else if (thinkStack.length > 0) {
      thinkStack.pop();
    }

    cursor = THINK_TAG_REGEX.lastIndex;
  }

  const trailing = content.slice(cursor);
  pushSegment(trailing);

  if (segments.length === 0) {
    return null;
  }

  if (thinkStack.length > 0 && !options?.streaming) {
    const openThinkIds = new Set(thinkStack);
    segments.forEach((segment) => {
      if (segment.type === 'think' && segment.thinkId !== undefined && openThinkIds.has(segment.thinkId)) {
        segment.type = 'text';
        delete segment.thinkId;
      }
    });
  }

  const firstTextSegment =
    segments.find((segment) => segment.type === 'text' && segment.value.trim().length > 0) ??
    segments.find((segment) => segment.type === 'text');
  if (firstTextSegment) {
    firstTextSegment.value = firstTextSegment.value.replace(/^\s+/, '');
  }

  return segments.map((segment, index) => {
    if (segment.type === 'text') {
      return (
        <React.Fragment key={`text-${index}`}>
          {segment.value}
        </React.Fragment>
      );
    }

    return (
      <div
        key={`think-${index}`}
        className="block italic text-white/60 text-xs whitespace-pre-wrap"
      >
        {segment.value}
      </div>
    );
  });
};

interface TerminalProps {
  messages: WllamaChatMessage[];
  setMessages: (messages: WllamaChatMessage[]) => void;
  onSendMessage: (input: string) => void | Promise<void>;
  isGenerating: boolean;
  latestResponse: string;
  inputLocked: boolean;
}

const Terminal: React.FC<TerminalProps> = ({
  messages,
  setMessages,
  onSendMessage,
  isGenerating,
  latestResponse,
  inputLocked,
}) => {
  const [input, setInput] = useState('');
  const [inputHistoryIndex, setInputHistoryIndex] = useState<number>(-1);
  const [dimensions, setDimensions] = useState({ cols: 0, rows: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const terminalBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateDimensions = useCallback(() => {
    if (terminalBodyRef.current) {
      // Based on Tailwind's 'text-sm' and 'font-mono'
      const LINE_HEIGHT_PX = 20; // from text-sm -> 1.25rem
      const CHAR_WIDTH_PX = 8.4; // Approximated from 14px font-size * 0.6 factor for monospace

      const { clientWidth, clientHeight } = terminalBodyRef.current;
      
      const cols = Math.floor(clientWidth / CHAR_WIDTH_PX);
      const rows = Math.floor(clientHeight / LINE_HEIGHT_PX);
      setDimensions({ cols, rows });
    }
  }, []);

  useEffect(() => {
    const terminalEl = terminalBodyRef.current;
    if (!terminalEl) return;

    updateDimensions(); // Initial calculation

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(terminalEl);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, latestResponse]);

  useEffect(() => {
    if (inputLocked) {
      setInput('');
    }
  }, [inputLocked]);
  
  const handleSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (inputLocked) return;
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (inputLocked) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const userMessages = messages.filter(msg => msg.role === 'user');
      if (userMessages.length > 0) {
        if (inputHistoryIndex === -1) {
        setInputHistoryIndex(userMessages.length - 1);
        setInput(userMessages[userMessages.length - 1].content);
        } else if (inputHistoryIndex > 0) {
          setInputHistoryIndex(inputHistoryIndex - 1);
          setInput(userMessages[inputHistoryIndex].content);
        }
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const userMessages = messages.filter(msg => msg.role === 'user');
      if (userMessages.length > 0) {
        if (inputHistoryIndex < userMessages.length - 1) {
          setInputHistoryIndex(inputHistoryIndex + 1);
          setInput(userMessages[inputHistoryIndex].content);
        }
      }
    }
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      // reset and start a new user message
      setMessages([...messages, { role: 'user', content: input }]);
      setInput('');
      
    }
  };

  const handleClose = () => window.close();

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="w-full max-w-4xl h-[80vh] min-h-[400px] bg-black/60 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl flex flex-col font-mono text-sm" onClick={() => textareaRef.current?.focus()}>
      {/* Title Bar */}
      <div className="bg-[#21252b] flex items-center px-4 py-1 rounded-t-xl border-b border-black/20 flex-shrink-0">
        <div className="flex space-x-2">
          <button
            aria-label="Close"
            onClick={handleClose}
            className="group w-3 h-3 rounded-full focus:outline-none"
          >
            <span className="block group-hover:hidden group-active:hidden">
              <svg viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#e24b41"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z" fill="#ed6a5f"/></g></svg>
            </span>
            <span className="hidden group-hover:block group-active:hidden">
              <svg viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#e24b41"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z" fill="#ed6a5f"/><g fill="#460804"><path d="m22.5 57.8 35.3-35.3c1.4-1.4 3.6-1.4 5 0l.1.1c1.4 1.4 1.4 3.6 0 5l-35.3 35.3c-1.4 1.4-3.6 1.4-5 0l-.1-.1c-1.3-1.4-1.3-3.6 0-5z"/><path d="m27.6 22.5 35.3 35.3c1.4 1.4 1.4 3.6 0 5l-.1.1c-1.4 1.4-3.6 1.4-5 0l-35.3-35.3c-1.4-1.4-1.4-3.6 0-5l.1-.1c1.4-1.3 3.6-1.3 5 0z"/></g></g></svg>
            </span>
            <span className="hidden group-active:block">
              <svg viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#a14239"/><path d="m42.7 81.7c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z" fill="#b15048"/><g fill="#170101"><path d="m22.5 57.8 35.3-35.3c1.4-1.4 3.6-1.4 5 0l.1.1c1.4 1.4 1.4 3.6 0 5l-35.3 35.3c-1.4 1.4-3.6 1.4-5 0l-.1-.1c-1.4-1.4-1.4-3.7 0-5z"/><path d="m27.5 22.5 35.3 35.3c1.4 1.4 1.4 3.6 0 5l-.1.1c-1.4 1.4-3.6 1.4-5 0l-35.3-35.3c-1.4-1.4-1.4-3.6 0-5l.1-.1c1.4-1.4 3.7-1.4 5 0z"/></g></g></svg>
            </span>
          </button>
          <button
            aria-label="Minimize (disabled)"
            className="group w-3 h-3 rounded-full focus:outline-none"
          >
            <span className="block group-hover:hidden group-active:hidden">
              <svg enableBackground="new 0 0 85.4 85.4" viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#e1a73e"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z" fill="#f6be50"/></g></svg>
            </span>
            <span className="hidden group-hover:block group-active:hidden">
              <svg enableBackground="new 0 0 85.4 85.4" viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#e1a73e"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z" fill="#f6be50"/><path d="m17.8 39.1h49.9c1.9 0 3.5 1.6 3.5 3.5v.1c0 1.9-1.6 3.5-3.5 3.5h-49.9c-1.9 0-3.5-1.6-3.5-3.5v-.1c0-1.9 1.5-3.5 3.5-3.5z" fill="#90591d"/></g></svg>
            </span>
            <span className="hidden group-active:block">
              <svg enableBackground="new 0 0 85.4 85.4" viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7c0 23.5 19 42.7 42.7 42.7z" fill="#a67f36"/><path d="m42.7 81.7c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1c-.1 21.6 17.4 39.1 39.1 39.1z" fill="#b8923b"/><path d="m17.7 39.1h49.9c1.9 0 3.5 1.6 3.5 3.5v.1c0 1.9-1.6 3.5-3.5 3.5h-49.9c-1.9 0-3.5-1.6-3.5-3.5v-.1c0-1.9 1.6-3.5 3.5-3.5z" fill="#532a0a"/></g></svg>
            </span>
          </button>
          <button
            aria-label="Toggle Fullscreen"
            onClick={handleFullscreen}
            className="group w-3 h-3 rounded-full focus:outline-none"
          >
            <span className="block group-hover:hidden group-active:hidden">
              <svg enableBackground="new 0 0 85.4 85.4" viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#2dac2f"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z" fill="#61c555"/></g></svg>
            </span>
            <span className="hidden group-hover:block group-active:hidden">
              <svg enableBackground="new 0 0 85.4 85.4" viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#2dac2f"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1c0 21.5 17.5 39.1 39.1 39.1z" fill="#61c555"/><path d="m31.2 20.8h26.7c3.6 0 6.5 2.9 6.5 6.5v26.7zm23.2 43.7h-26.8c-3.6 0-6.5-2.9-6.5-6.5v-26.8z" fill="#2a6218"/></g></svg>
            </span>
            <span className="hidden group-active:block">
              <svg enableBackground="new 0 0 85.4 85.4" viewBox="0 0 85.4 85.4"><g clipRule="evenodd" fillRule="evenodd"><path d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z" fill="#428234"/><path d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1c0 21.5 17.5 39.1 39.1 39.1z" fill="#4a9741"/><path d="m31.2 20.8h26.7c3.6 0 6.5 2.9 6.5 6.5v26.7zm23.2 43.7h-26.8c-3.6 0-6.5-2.9-6.5-6.5v-26.8z" fill="#113107"/></g></svg>
            </span>
          </button>
        </div>
        <div className="flex-grow text-center text-gray-400">
          kelden-website – -zsh – {dimensions.cols}x{dimensions.rows}
        </div>
      </div>

      {/* Terminal Body */}
      <div ref={scrollRef} className="flex-grow p-4 overflow-y-auto text-white">
        <div ref={terminalBodyRef} className="min-h-full">
          {messages.map((msg, index) => {
            if (msg.role === 'system') return null;
            if (msg.role === 'user') {
              return (
                <div key={index} className="grid grid-cols-[auto_1fr] items-start mt-2">
                  <Prompt />
                  <span className="ml-2 whitespace-pre-wrap break-all">{msg.content}</span>
                </div>
              );
            }
            if (msg.role === 'assistant') {
              return (
                <div key={index} className="whitespace-pre-wrap mt-1 mb-2">
                  {renderAssistantContent(msg.content)}
                </div>
              );
            }
            return null;
          })}
          {latestResponse && (
            <div className="whitespace-pre-wrap mt-1 mb-2">
              {renderAssistantContent(latestResponse, { streaming: true })}
            </div>
          )}
          
          {/* Input Line */}
          {!isGenerating && !inputLocked && (
              <form onSubmit={handleSubmit} className="grid grid-cols-[auto_1fr] items-start mt-2">
                  <Prompt />
                  <div 
                    className="relative ml-2 w-full"
                    onClick={() => textareaRef.current?.focus()}
                  >
                    {/* Hidden textarea to capture input */}
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={inputLocked}
                      className="absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none overflow-y-hidden p-0 m-0 opacity-0 caret-transparent text-white"
                      autoFocus
                      spellCheck="false"
                      aria-label="Terminal input"
                      rows={1}
                    />
                    {/* Visible display of the input text and cursor */}
                    <div className="whitespace-pre-wrap break-all min-h-[20px]">
                      <span>{input}</span>
                      <span className="inline-block w-[8.4px] h-[18px] bg-gray-400 align-text-bottom animate-blink"></span>
                    </div>
                  </div>
              </form>
          )}

          {isGenerating && latestResponse.length === 0 && (
            <span className="relative flex size-3 mt-2 ml-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex size-3 rounded-full bg-white"></span>
          </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Terminal;
