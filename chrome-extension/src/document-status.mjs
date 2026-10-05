const SAFE_MESSAGES = {
  FILE_TYPE_NOT_ALLOWED: 'Wybierz plik PDF lub DOCX.',
  FILE_TOO_LARGE: 'Plik nie może przekraczać 10 MB.',
  SESSION_REQUIRED: 'Zaloguj się ponownie, aby wysłać dokument.',
  UNAUTHORIZED: 'Sesja wygasła. Zaloguj się ponownie.',
  FORBIDDEN: 'Nie masz dostępu do anonimizacji dla tej kancelarii.',
  PROCESSING_FAILED: 'Nie udało się przetworzyć dokumentu. Sprawdź plik, a dla PDF warstwę tekstową.',
  PROCESSING: 'Dokument jest jeszcze przetwarzany. Spróbuj ponownie za chwilę.',
  RESULT_UNAVAILABLE: 'Wynik anonimizacji nie jest dostępny.',
  NETWORK_ERROR: 'Nie można połączyć się z usługą anonimizacji. Spróbuj ponownie.',
  RESULT_INVALID: 'Usługa nie zwróciła prawidłowego wyniku. Spróbuj ponownie.',
  REQUEST_FAILED: 'Nie udało się wykonać żądania. Spróbuj ponownie.',
};

export function statusMessageForDocumentResult(result) {
  if (result?.ok) {
    return 'Pobrano zanonimizowany wynik. Załącz go ręcznie do lokalnej aplikacji AI.';
  }
  return SAFE_MESSAGES[result?.code] ?? SAFE_MESSAGES.REQUEST_FAILED;
}
