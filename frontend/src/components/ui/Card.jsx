function Card({
  title,
  titleId,
  description,
  children,
  className = '',
  headingLevel = 'h2',
  variant = 'default',
  ...props
}) {
  const classNames = ['ui-card', `ui-card--${variant}`, className].filter(Boolean).join(' ');
  const Heading = headingLevel;

  return (
    <section className={classNames} aria-labelledby={titleId} {...props}>
      <header className="ui-card__header">
        <Heading className="ui-card__title" id={titleId}>{title}</Heading>
        {description && <p className="ui-card__description">{description}</p>}
      </header>
      <div className="ui-card__body">{children}</div>
    </section>
  );
}

export default Card;
