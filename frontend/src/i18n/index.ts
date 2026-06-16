import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import uzLatn from './locales/uz-Latn.json';
import uzCyrl from './locales/uz-Cyrl.json';
import ru from './locales/ru.json';
import en from './locales/en.json';

// Saqlangan til va yozuvni o'qish
const savedLang = localStorage.getItem('lokma_lang') || 'uz';
const savedScript = localStorage.getItem('lokma_script') || 'Latn';

// O'zbek tili uchun yozuv kombinatsiya: uz-Latn yoki uz-Cyrl
const getInitialLocale = (): string => {
  if (savedLang === 'uz') return `uz-${savedScript}`;
  return savedLang;
};

i18n.use(initReactI18next).init({
  resources: {
    'uz-Latn': { translation: uzLatn },
    'uz-Cyrl': { translation: uzCyrl },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: getInitialLocale(),
  fallbackLng: 'uz-Latn',
  interpolation: { escapeValue: false },
});

// Til o'zgartirish helper
export const setLanguage = (lang: 'uz' | 'ru' | 'en', script: 'Latn' | 'Cyrl' = 'Latn') => {
  localStorage.setItem('lokma_lang', lang);
  if (lang === 'uz') {
    localStorage.setItem('lokma_script', script);
    i18n.changeLanguage(`uz-${script}`);
  } else {
    i18n.changeLanguage(lang);
  }
};

export const getCurrentLang = (): 'uz' | 'ru' | 'en' => {
  return (localStorage.getItem('lokma_lang') as 'uz' | 'ru' | 'en') || 'uz';
};

export const getCurrentScript = (): 'Latn' | 'Cyrl' => {
  return (localStorage.getItem('lokma_script') as 'Latn' | 'Cyrl') || 'Latn';
};

export default i18n;
