import './config.js';
import { createBackgroundHandler } from './src/background-handler.mjs';

let runtimeHandler;

function getRuntimeHandler() {
  if (!runtimeHandler) {
    runtimeHandler = createBackgroundHandler({
      chromeApi: chrome,
      config: globalThis.extensionConfig,
    });
  }
  return runtimeHandler;
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'ANONYMIZE_DOCUMENT') {
      return undefined;
    }
    void getRuntimeHandler()(message)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, code: 'REQUEST_FAILED' }));
    return true;
  });
}
