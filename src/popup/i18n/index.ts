import { en } from './en';
import { ko } from './ko';
import type { Language } from '@/types';

/** 중첩 객체의 leaf(string)를 string 타입으로 완화한 구조 타입 */
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

/** 번역 구조 타입 (영어 번역의 키 구조를 기준으로, 값은 string) */
export type Translation = DeepStringify<typeof en>;

/** 언어별 번역 딕셔너리 */
export const translations: Record<Language, Translation> = {
  en,
  ko,
};

export type { Language };
