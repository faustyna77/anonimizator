import Button from './Button.jsx';

function Tabs({ id, label, items, value, onChange }) {
  function handleKeyDown(event, index) {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else return;

    event.preventDefault();
    onChange(items[nextIndex].id);
    event.currentTarget.parentElement.children[nextIndex].focus();
  }

  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <Button
          key={item.id}
          className="ui-tabs__tab"
          variant="secondary"
          role="tab"
          id={`${id}-tab-${item.id}`}
          aria-controls={`${id}-panel-${item.id}`}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

function TabPanel({ id, value, activeValue, children }) {
  return (
    <section
      className="ui-tab-panel"
      role="tabpanel"
      id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`}
      hidden={value !== activeValue}
      tabIndex={0}
    >
      {children}
    </section>
  );
}

export { Tabs, TabPanel };
