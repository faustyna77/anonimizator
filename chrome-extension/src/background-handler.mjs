import { createSupabaseAuth } from './auth.mjs';
import { createDocumentApi } from './document-client.mjs';
import { anonymizeAndDownload } from './document-flow.mjs';
import { deserializeDocumentFromPopup } from './document-transfer.mjs';

export function createBackgroundHandler({ chromeApi, config, fetchImpl = fetch }) {
  return async function handleMessage(message) {
    if (message?.type !== 'ANONYMIZE_DOCUMENT') {
      return undefined;
    }

    try {
      const auth = createSupabaseAuth({ chromeApi, config, fetchImpl });
      const api = createDocumentApi({
        baseUrl: config.backendUrl,
        getAccessToken: () => auth.getAccessToken(),
        onUnauthorized: (response) => auth.invalidateSessionOnUnauthorized(response),
        fetchImpl,
      });
      return await anonymizeAndDownload({
        file: deserializeDocumentFromPopup(message.file),
        api,
        downloadsApi: chromeApi.downloads,
      });
    } catch (error) {
      return { ok: false, code: error?.code ?? 'REQUEST_FAILED' };
    }
  };
}
