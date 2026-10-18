import { Button, Card, Field } from './components/ui/index.js';
import './PanelKancelariiKitchenSink.css';

function PanelKancelariiKitchenSink() {
  return (
    <main className="panel kitchen-sink">
      <header className="panel__header">
        <div>
          <h1>Panel Kancelarii — kitchen sink</h1>
          <p>Widok developerski z syntetycznymi stanami komponentów.</p>
        </div>
      </header>

      <div className="panel__workspace">
        <Card
          className="panel__upload-card"
          description="Stan domyślny głównej akcji anonimizacji."
          title="Default, hover i focus-visible"
          titleId="kitchen-sink-default-title"
          variant="primary"
        >
          <Field id="kitchen-sink-file" label="Plik do anonimizacji">
            <input type="file" />
          </Field>
          <div className="kitchen-sink__button-row">
            <Button>Stan domyślny</Button>
            <Button className="kitchen-sink__button--hover">Stan hover</Button>
            <Button className="kitchen-sink__button--focus">Stan focus-visible</Button>
          </div>
        </Card>

        <div className="panel__support-grid">
          <Card title="Disabled i error" titleId="kitchen-sink-feedback-title">
            <Button disabled>Anonimizuj dokument</Button>
            <Field
              error="Wybierz prawidłowy plik PDF lub DOCX."
              id="kitchen-sink-error"
              label="Plik z błędem"
            >
              <input type="text" value="nieprawidłowy-plik.txt" readOnly />
            </Field>
          </Card>

          <Card title="Empty i loading" titleId="kitchen-sink-resource-title">
            <section className="kitchen-sink__resource" aria-labelledby="kitchen-sink-empty-title">
              <h3 id="kitchen-sink-empty-title">Pusta historia</h3>
              <p>Nie przesłano jeszcze dokumentów.</p>
            </section>
            <section className="kitchen-sink__resource" aria-labelledby="kitchen-sink-loading-title">
              <h3 id="kitchen-sink-loading-title">Ładowanie historii</h3>
              <p role="status">Ładowanie historii dokumentów…</p>
            </section>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default PanelKancelariiKitchenSink;
