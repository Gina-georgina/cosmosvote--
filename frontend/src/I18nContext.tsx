import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Locale, locales, t, type TranslationKey } from './i18n';

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const LOCALE_TO_BCP47: Record<Locale, string> = {
  en: 'en',
  es: 'es',
  fr: 'fr',
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const saved = (localStorage.getItem('locale') as Locale) ?? 'en';
  const [locale, setLocaleState] = useState<Locale>(
    Object.keys(locales).includes(saved) ? saved : 'en'
  );

  useEffect(() => {
    document.documentElement.lang = LOCALE_TO_BCP47[locale] ?? 'en';
  }, [locale]);

  const setLocale = (l: Locale) => {
    localStorage.setItem('locale', l);
    setLocaleState(l);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: (key, vars) => t(locale, key, vars) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}