import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';

type DialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

type PromptOptions = DialogOptions & {
  defaultValue?: string;
  inputType?: 'text' | 'password';
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
};

type DialogRequest = {
  id: number;
  kind: 'alert' | 'confirm' | 'prompt';
  message: string;
  options: PromptOptions;
  resolve: (value: unknown) => void;
};

type AppDialogApi = {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
};

const AppDialogContext = createContext<AppDialogApi | null>(null);

export function useAppDialog(): AppDialogApi {
  const value = useContext(AppDialogContext);
  if (!value) throw new Error('useAppDialog must be used inside AppDialogProvider');
  return value;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<DialogRequest[]>([]);
  const [inputValue, setInputValue] = useState('');
  const nextId = useRef(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const active = requests[0];

  const enqueue = useCallback(<T,>(kind: DialogRequest['kind'], message: string, options: PromptOptions = {}) => (
    new Promise<T>((resolve) => {
      const request: DialogRequest = {
        id: nextId.current++,
        kind,
        message,
        options,
        resolve: resolve as (value: unknown) => void,
      };
      setRequests((current) => [...current, request]);
    })
  ), []);

  const api: AppDialogApi = {
    alert: useCallback((message, options = {}) => enqueue<void>('alert', message, options), [enqueue]),
    confirm: useCallback((message, options = {}) => enqueue<boolean>('confirm', message, options), [enqueue]),
    prompt: useCallback((message, options = {}) => enqueue<string | null>('prompt', message, options), [enqueue]),
  };

  const finish = useCallback((value: unknown) => {
    if (!active) return;
    active.resolve(value);
    setRequests((current) => current[0]?.id === active.id ? current.slice(1) : current);
  }, [active]);

  const cancel = useCallback(() => {
    if (!active) return;
    finish(active.kind === 'confirm' ? false : active.kind === 'prompt' ? null : undefined);
  }, [active, finish]);

  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInputValue(active.options.defaultValue ?? '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      (active.kind === 'prompt' ? inputRef.current : primaryButtonRef.current)?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [active?.id]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!active) return;
    if (active.kind === 'prompt') {
      if (active.options.required && !inputValue) return;
      finish(inputValue);
    } else {
      finish(true);
    }
  };

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {active && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-hoterra-navy/55 p-0 backdrop-blur-[1px] sm:items-center sm:p-4">
          <div
            ref={dialogRef}
            role={active.kind === 'alert' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onKeyDown={handleKeyDown}
            className="w-full rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
          >
            <form onSubmit={submit}>
              <div className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
                {active.options.tone === 'danger' && (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-lg font-semibold text-hoterra-navy">
                    {active.options.title || (active.kind === 'alert' ? 'Notice' : active.kind === 'confirm' ? 'Confirm action' : 'Additional information')}
                  </h2>
                  <p id={descriptionId} className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                    {active.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label="Close dialog"
                  className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-hoterra-steel"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {active.kind === 'prompt' && (
                <div className="px-5 pb-4 sm:px-6">
                  <label className="sr-only" htmlFor={`${titleId}-input`}>{active.message}</label>
                  <input
                    ref={inputRef}
                    id={`${titleId}-input`}
                    className="input"
                    type={active.options.inputType || 'text'}
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    autoComplete={active.options.autoComplete}
                    placeholder={active.options.placeholder}
                    required={active.options.required}
                  />
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                {active.kind !== 'alert' && (
                  <button type="button" onClick={cancel} className="btn-secondary sm:w-auto">
                    {active.options.cancelLabel || 'Cancel'}
                  </button>
                )}
                <button
                  ref={primaryButtonRef}
                  type="submit"
                  disabled={active.kind === 'prompt' && active.options.required && !inputValue}
                  className={active.options.tone === 'danger'
                    ? 'inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:w-auto'
                    : 'btn-primary sm:w-auto'}
                >
                  {active.options.confirmLabel || (active.kind === 'alert' ? 'OK' : 'Continue')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  );
}
