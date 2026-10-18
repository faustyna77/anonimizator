import { cloneElement, isValidElement } from 'react';

function Field({
  id,
  label,
  description,
  error,
  children,
  className = '',
  ...props
}) {
  const controlId = id || children?.props?.id;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [
    children?.props?.['aria-describedby'],
    descriptionId,
    errorId,
  ].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
      id: controlId,
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : children.props['aria-invalid'],
    })
    : children;
  const classNames = ['ui-field', className].filter(Boolean).join(' ');

  return (
    <div className={classNames} {...props}>
      <label className="ui-field__label" htmlFor={controlId}>{label}</label>
      {description && <p className="ui-field__description" id={descriptionId}>{description}</p>}
      {control}
      {error && <p className="ui-field__error" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export default Field;
