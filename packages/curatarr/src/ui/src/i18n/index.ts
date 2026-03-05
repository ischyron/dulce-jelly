import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from './locales/en/common.json';
import scan from './locales/en/scan.json';
import settings from './locales/en/settings.json';

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  defaultNS: 'common',
  ns: ['common', 'scan', 'settings'],
  resources: {
    en: {
      common,
      scan,
      settings,
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
