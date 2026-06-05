import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en/translation.json';
import zhTranslation from './locales/zh/translation.json';

const resources = {
  en: {
    translation: enTranslation
  },
  zh: {
    translation: zhTranslation
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('ai-ssh-language') || 'zh', // 默认中文
    fallbackLng: 'zh',
    debug: true, // 开启调试模式，方便排查问题
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

export default i18n;
