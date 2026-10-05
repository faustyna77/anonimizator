import { DocumentClientError, validateDocumentUpload } from './document-client.mjs';

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string') {
    throw new DocumentClientError('FILE_TYPE_NOT_ALLOWED');
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new DocumentClientError('FILE_TYPE_NOT_ALLOWED');
  }
}

export async function serializeDocumentForWorker(file) {
  validateDocumentUpload(file);
  return {
    name: file.name,
    type: file.type,
    contentBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
  };
}

export function deserializeDocumentFromPopup(payload) {
  if (!payload || typeof payload.name !== 'string' || typeof payload.type !== 'string') {
    throw new DocumentClientError('FILE_TYPE_NOT_ALLOWED');
  }
  const file = new File([base64ToBytes(payload.contentBase64)], payload.name, { type: payload.type });
  validateDocumentUpload(file);
  return file;
}
