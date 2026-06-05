import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enTranslation from './locales/en/translation.json'
import zhTranslation from './locales/zh/translation.json'

export const supportedLanguages = ['zh', 'en'] as const
export type AppLanguage = (typeof supportedLanguages)[number]
export const APP_LANGUAGE_STORAGE_KEY = 'ai-ssh-language'

const resources = {
  en: {
    translation: enTranslation,
  },
  zh: {
    translation: zhTranslation,
  },
} satisfies Record<AppLanguage, { translation: typeof enTranslation }>

export function normalizeAppLanguage(value: string | null | undefined): AppLanguage {
  if (!value) return 'zh'
  const lower = value.toLowerCase()
  if (lower.startsWith('en')) return 'en'
  return 'zh'
}

export function currentLocaleTag(language: string | null | undefined) {
  return normalizeAppLanguage(language) === 'en' ? 'en-US' : 'zh-CN'
}

const initialLanguage = normalizeAppLanguage(
  localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) || navigator.language,
)

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'zh',
  supportedLngs: supportedLanguages,
  debug: false,
  interpolation: {
    escapeValue: false,
  },
})

document.documentElement.lang = currentLocaleTag(i18n.language)

i18n.on('languageChanged', (language) => {
  const normalized = normalizeAppLanguage(language)
  localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, normalized)
  document.documentElement.lang = currentLocaleTag(normalized)
})

export default i18n
