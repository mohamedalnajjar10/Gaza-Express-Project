import { useState, type FormEvent, type ReactNode } from 'react';
import { ErrorBox } from './feedback';

export function ActionForm({
  submit,
  children,
  label,
}: {
  submit: (data: FormData) => Promise<void>;
  children?: ReactNode;
  label: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      await submit(data);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="form" aria-busy={pending}>
      {children}
      {error ? <ErrorBox error={error} /> : null}
      <button disabled={pending}>{pending ? 'جارٍ التنفيذ…' : label}</button>
    </form>
  );
}
export function Field({
  label,
  name,
  type = 'text',
  required = true,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'tel' | 'decimal';
  pattern?: string;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} required={required} {...props} />
    </label>
  );
}
