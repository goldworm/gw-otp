import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { translations, type Language } from './index';
import { en } from './en';

/** Build a string union of leaf paths ('a.b.c' form) from a nested object. */
type NestedKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : NestedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = NestedKeys<typeof en>;

/** Interpolation parameters */
type Params = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Resolve a value from a nested object using an 'a.b.c' path. */
function resolveKey(obj: unknown, key: string): string {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key; // Return the key itself if not found
    }
  }
  return typeof current === 'string' ? current : key;
}

/** Replace placeholders of the form {param}. */
function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

interface I18nProviderProps {
  initialLanguage: Language;
  onLanguageChange?: (lang: Language) => void;
  children: ReactNode;
}

export function I18nProvider({
  initialLanguage,
  onLanguageChange,
  children,
}: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // Sync when the language loaded asynchronously by the parent (App) changes
  useEffect(() => {
    setLanguageState(initialLanguage);
  }, [initialLanguage]);

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageState(lang);
      onLanguageChange?.(lang);
    },
    [onLanguageChange],
  );

  const t = useCallback(
    (key: TranslationKey, params?: Params): string => {
      const dict = translations[language] ?? en;
      const template = resolveKey(dict, key);
      return interpolate(template, params);
    },
    [language],
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
