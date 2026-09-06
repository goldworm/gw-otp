import { en } from './en';
import { ko } from './ko';
import type { Language } from '@/types';

/** Structural type that relaxes nested leaf (string) values to the string type */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

/** Translation structure type (based on the English translation's key structure, values are string) */
export type Translation = DeepStringify<typeof en>;

/** Per-language translation dictionaries */
export const translations: Record<Language, Translation> = {
  en,
  ko,
};

export type { Language };
