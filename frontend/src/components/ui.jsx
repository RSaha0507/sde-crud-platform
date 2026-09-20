export function Button({
  children,
  variant = "primary",
  type = "button",
  ...props
}) {
  return (
    <button className={`button button-${variant}`} type={type} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, ...props }) {
  const id = props.id || props.name;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input id={id} {...props} />
      {hint && <small>{hint}</small>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

export function SelectField({ label, children, ...props }) {
  const id = props.id || props.name;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} /> <span>{label}</span>
    </label>
  );
}

export function Card({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Status({ loading, error, empty, onRetry }) {
  if (loading)
    return (
      <p className="status" role="status">
        Loading…
      </p>
    );
  if (error)
    return (
      <div className="status error" role="alert">
        {error.message || String(error)}{" "}
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  if (empty) return <p className="status">No records found.</p>;
  return null;
}
