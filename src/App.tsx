import { useEffect, useState } from 'react'
import './App.css'
import { WLLAMA_CONFIG_PATHS } from './utils/wllama/config'
import { Model, ModelManager, Wllama, type WllamaChatMessage } from '@wllama/wllama'
import Terminal from './components/Terminal';

const wllamaInstance = new Wllama(WLLAMA_CONFIG_PATHS);
const currentDate = new Date();
const SYSTEM_PROMPT = `You are a clone of Kelden Lin, a software engineer. You answer as him as you are his clone. Here is what you need to know about him:
- He is a software engineer at Axon.
- He was born in September 1997 (do the math yourself for his age).


It is currently ${currentDate.toLocaleDateString()} and ${currentDate.toLocaleTimeString()}.`



function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModel, setLoadingModel] = useState<boolean>(false);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const modelManager = new ModelManager();

  async function downloadModel(model: any) {
    try {
      await modelManager.downloadModel(model.url, {
        progressCallback(opts) {
          console.log(opts);
          // updateModelDownloadState(model.url, opts.loaded / opts.total);
        },
      });
      // updateModelDownloadState(model.url, -1);
      // await refreshCachedModels();
    } catch (e) {
      alert((e as any)?.message || 'unknown error while downloading model');
    }
  };

  async function listModels() {
    const models = await modelManager.getModels();
    return models;
  }

  async function loadModel(model: Model) {
    try {
      setLoadingModel(true);
      await wllamaInstance.loadModel(model);
      // setLoadedModel(model.clone({ state: ModelState.LOADED }));
      setModelLoaded(true);
      console.log({
        isMultithread: wllamaInstance.isMultithread(),
        hasChatTemplate: !!wllamaInstance.getChatTemplate(),
      });
    } catch (e) {
      alert(`Failed to load model: ${(e as any).message ?? 'Unknown error'}`);
    } finally {
      setLoadingModel(false);
    }
  };

  async function unloadModel() {
    await wllamaInstance.exit();
  };

  const [generating, setGenerating] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<WllamaChatMessage[]>([{
    role: 'system',
    content: SYSTEM_PROMPT,
  }]);
  const [latestResponse, setLatestResponse] = useState<string>('');

  async function createCompletion(
    input: string,
    deltaCallback: (currentText: string) => void,
    completeCallback: (outputText: string) => void
  ) {
    setGenerating(true);
    // stopSignal = false;
    const updatedMessages: WllamaChatMessage[] = [...messages, { role: 'user', content: input }];
    setMessages(updatedMessages);

    const result = await wllamaInstance.createChatCompletion(updatedMessages, {
      nPredict: 4096,
      sampling: {
        temp: 1,
      },
      // @ts-expect-error unused variable
      onNewToken(token, piece, currentText, _optionals) {
        deltaCallback(currentText)
        // if (stopSignal) optionals.abortSignal();
      },
      // required to fix the wrong typing
    });
    completeCallback(result);
    // stopSignal = false;
    setGenerating(false);
  };


  useEffect(() => {
    listModels().then((models) => {
      console.log(models);
      setModels(models);
      if (models.length > 0 && !loadingModel && !modelLoaded) {
        loadModel(models[0]);
      }
    });
  }, []);

  // return (
  //   <>
  //     <div>
  //       <button onClick={() => downloadModel({ url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf' })}>
  //         Download Model
  //       </button>
  //       {models.map((model) => (
  //         <button key={model.url} onClick={() => loadModel(model)}>
  //           Load Model {model.url}
  //         </button>
  //       ))}
  //       <button onClick={() => unloadModel()}>
  //         Unload Model
  //       </button>

  //       <input type="text" value={input} onChange={(e) => setInput(e.target.value)} />
  //       <button onClick={() => 
  //       createCompletion(input, 
  //         // delta
  //         (currentText) => {
  //           setLatestResponse(currentText);
  //           console.log({ currentText });
  //         }, 
  //         // output
  //         (outputText) => {
  //           setLatestResponse('');
  //           setMessages([...messages, { role: 'assistant', content: outputText }]);
  //           console.log({ outputText });
  //         })}
  //       >
  //         Generate
  //       </button>
  //       {messages.map((message, index) => {
  //         // if (message.role === 'system') return null;
  //         return <div key={index}>
  //           <p>{message.role}: {message.content}</p>
  //         </div>
  //       })}
  //       {latestResponse && <p>Assistant: {latestResponse}</p>}
  //       </div>
  //   </>
  // )

  async function handleSendMessage(input: string) {
    if (!input.trim() || generating || !modelLoaded) return;

    
    setGenerating(true);
    setLatestResponse('');
    const updatedMessages: WllamaChatMessage[] = [...messages, { role: 'user', content: input }];
    setMessages(updatedMessages);
    
    if (input.trim() === '/unload') {
      await unloadModel();
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: "LLM unloaded. Type /load to it again" }]);
      setLatestResponse('');
      setGenerating(false);
    } else if (input.trim() === '/download') {
      await downloadModel(models[0]);
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: "LLM downloaded. Type /load to load it" }]);
      setLatestResponse('');
      setGenerating(false);
    } else if (input.trim() === '/load') {
      await loadModel(models[0]);
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: "LLM loaded. Type /unload to unload it" }]);
      setLatestResponse('');
      setGenerating(false);
    }

    try {
      const result = await wllamaInstance.createChatCompletion(updatedMessages, {
        nPredict: 4096,
        sampling: { temp: 1 },
        onNewToken: (_token: any, _piece: any, currentText: string) => {
          setLatestResponse(currentText);
        },
      });

      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: result }]);
    } catch (e) {
      const errorMessage = (e as any)?.message ?? 'Unknown error';
      let finalErrorMessage= ""

      if (errorMessage.includes('loadModel() is not yet called')) {
        finalErrorMessage = "zsh: no llm downloaded\n\ttype /download to download the model (639MB)";
      } else {
        finalErrorMessage = `Error: ${errorMessage}`;
      }
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: finalErrorMessage }]);
    } finally {
      setLatestResponse('');
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <Terminal
        messages={messages}
        onSendMessage={handleSendMessage}
        isGenerating={generating}
        latestResponse={latestResponse}
      />
    </div>
  );
}

export default App
