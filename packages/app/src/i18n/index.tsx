import * as i18n from "@solid-primitives/i18n";
import {
  createContext,
  createSignal,
  type ParentComponent,
  useContext,
} from "solid-js";
import enDict from "../locales/en";
import zhCNDict from "../locales/zh-CN";

export type Locale = "en" | "zh-CN";

// Derive translation keys from the English dictionary
export type TranslationKey = keyof typeof enDict;

type Dict = Record<TranslationKey, string>;

const dictionaries: Record<Locale, Dict> = {
  en: enDict as Dict,
  "zh-CN": zhCNDict as Dict,
};

function detectLocale(): Locale {
  const stored = localStorage.getItem("mineco-locale") as Locale | null;
  if (stored && stored in dictionaries) return stored;
  const browser = navigator.language;
  if (browser.startsWith("zh")) return "zh-CN";
  return "en";
}

interface I18nContextValue {
  locale: () => Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, args?: Record<string, string | number | boolean>) => string;
}

const I18nContext = createContext<I18nContextValue>();

export const I18nProvider: ParentComponent = (props) => {
  const [locale, setLocaleRaw] = createSignal<Locale>(detectLocale());

  const dict = () => dictionaries[locale()];

  const rawT = i18n.translator(dict, i18n.resolveTemplate);
  const t = (key: TranslationKey, args?: Record<string, string | number | boolean>) =>
    rawT(key, args) as string;

  const setLocale = (l: Locale) => {
    setLocaleRaw(l);
    localStorage.setItem("mineco-locale", l);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {props.children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
