import './ui.css';

function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  const classNames = ['ui-button', `ui-button--${variant}`, className].filter(Boolean).join(' ');

  return <button className={classNames} type={type} {...props} />;
}

export default Button;
