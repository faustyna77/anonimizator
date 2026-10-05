import { DocumentClientError } from './document-client.mjs';

function resultFilename(file) {
  return `zanonimizowany-${file.name}`;
}

export async function anonymizeAndDownload({ file, api, downloadsApi }) {
  try {
    const uploadResult = await api.uploadDocument(file);
    const downloadResult = await api.getAnonymizedDownload(uploadResult.document_id);
    if (typeof downloadResult.download_url !== 'string' || downloadResult.download_url.length === 0) {
      throw new DocumentClientError('RESULT_INVALID');
    }

    await downloadsApi.download({
      url: downloadResult.download_url,
      filename: resultFilename(file),
      saveAs: true,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error?.code ?? 'REQUEST_FAILED' };
  }
}
