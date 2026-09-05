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

/** 중첩 객체의 leaf 경로를 'a.b.c' 형태의 문자열 유니온으로 만든다. */
type NestedKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : NestedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = NestedKeys<typeof en>;

/** 보간 파라미터 */
type Params = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** 'a.b.c' 경로로 중첩 객체에서 값을 가져온다. */
function resolveKey(obj: unknown, key: string): string {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key; // 키를 찾지 못하면 키 자체를 반환
    }
  }
  return typeof current === 'string' ? current : key;
}

/** {param} 형태의 플레이스홀더를 치환한다. */
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

  // 상위(App)에서 비동기로 로드된 언어가 바뀌면 동기화
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
