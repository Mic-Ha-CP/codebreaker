import { useGameStore } from '@/state/gameStore';
import { en } from './en';

const dictionaries = { en } as const;

export type Lang = keyof typeof dictionaries;

export function useT() {
  const lang = useGameStore((s) => s.lang);
  return dictionaries[lang] ?? dictionaries.en;
}
