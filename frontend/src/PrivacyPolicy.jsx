import { Button, Card } from './components/ui/index.js';
import './PrivacyPolicy.css';

function PrivacyPolicy() {
  return (
    <main className="privacy-policy">
      <header className="privacy-policy__header">
        <p className="privacy-policy__eyebrow">Anonimizator Prawniczy</p>
        <h1>Polityka prywatności rozszerzenia Chrome</h1>
        <p>
          Ta polityka opisuje dane przetwarzane, gdy korzystasz z rozszerzenia
          Anonimizator Prawniczy oraz powiązanego panelu kancelarii. Za obsługę
          danych odpowiada podmiot udostępniający konto kancelarii; jego dane
          kontaktowe wydawca podaje na stronie rozszerzenia w Chrome Web Store.
        </p>
      </header>

      <div className="privacy-policy__content">
        <Card title="Cel rozszerzenia" titleId="privacy-purpose-title">
          <p>
            Rozszerzenie pomaga zalogowanemu użytkownikowi przesłać jeden wybrany
            PDF lub DOCX do chronionego backendu anonimizacji i pobrać własny
            zanonimizowany wynik. Działa wyłącznie przy aktywnej stronie
            <code>http://127.0.0.1:5173/</code>.
          </p>
          <p>
            Nie odczytuje ani nie zmienia zawartości lokalnej aplikacji AI, nie
            załącza plików automatycznie i nie przesyła jej oryginału dokumentu.
            Ręczne załączenie pobranego, zanonimizowanego pliku do usługi AI jest
            odrębnym działaniem użytkownika i podlega zasadom tej usługi.
          </p>
        </Card>

        <Card title="Jakie dane są przetwarzane" titleId="privacy-data-title">
          <ul>
            <li>
              <strong>Wybrany dokument PDF lub DOCX:</strong> może zawierać dane
              osobowe lub informacje objęte tajemnicą zawodową. Jest przesyłany
              przez szyfrowane połączenie do chronionego backendu wyłącznie w celu
              anonimizacji.
            </li>
            <li>
              <strong>Dane uwierzytelniające:</strong> adres e-mail i hasło są
              przekazywane do Supabase Auth, aby zalogować użytkownika. Rozszerzenie
              nie zapisuje hasła.
            </li>
            <li>
              <strong>Sesja:</strong> po zalogowaniu rozszerzenie przechowuje
              bieżącą sesję w <code>chrome.storage.local</code>, dostępną wyłącznie
              z zaufanych kontekstów rozszerzenia. Sesja służy do autoryzacji API i
              jest usuwana przy wylogowaniu lub nieautoryzowanej odpowiedzi.
            </li>
            <li>
              <strong>Adres aktywnej karty:</strong> jest sprawdzany po otwarciu
              rozszerzenia tylko po to, aby odmówić działania poza dozwoloną lokalną
              aplikacją AI. Nie jest wysyłany ani wykorzystywany do śledzenia.
            </li>
          </ul>
        </Card>

        <Card title="Przechowywanie i retencja" titleId="privacy-retention-title">
          <p>
            Backend przechowuje oryginalny dokument i zanonimizowany wynik w
            prywatnym magazynie obiektowym. Baza danych przechowuje metadane
            dokumentu oraz zaszyfrowane mapowanie markerów, a nie treść pliku.
            Dostęp do gotowego wyniku jest ograniczony do uwierzytelnionego
            właściciela dokumentu przez krótkotrwały, autoryzowany URL.
          </p>
          <p>
            W obecnej wersji nie ma automatycznego harmonogramu usuwania dokumentów.
            Dokumenty pozostają w magazynie po przetworzeniu, dopóki operator usługi
            nie wdroży i nie zakomunikuje okresu retencji albo nie usunie ich w
            ramach obsługi konta. Nie przesyłaj dokumentu, jeśli taka retencja nie
            odpowiada zasadom Twojej kancelarii.
          </p>
        </Card>

        <Card title="Odbiorcy i ograniczenia użycia" titleId="privacy-recipients-title">
          <p>
            Dane są przetwarzane przez backend Anonimizator Prawniczy, dostawcę
            uwierzytelniania Supabase oraz dostawcę prywatnego magazynu dokumentów
            skonfigurowanego po stronie serwera. Rozszerzenie nie ma bezpośredniego
            dostępu do S3, nie pobiera oryginałów ani mapowań markerów i nie używa
            danych do reklam, profilowania lub sprzedaży.
          </p>
          <p>
            W sprawach dotyczących danych, w tym żądania dostępu lub usunięcia,
            skontaktuj się z podmiotem udostępniającym Ci konto kancelarii albo z
            wydawcą wskazanym na stronie rozszerzenia w Chrome Web Store.
          </p>
        </Card>
      </div>

      <footer className="privacy-policy__footer">
        <Button onClick={() => window.location.assign('/')}>Przejdź do panelu</Button>
      </footer>
    </main>
  );
}

export default PrivacyPolicy;
