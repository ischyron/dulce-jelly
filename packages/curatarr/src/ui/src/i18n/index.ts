import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import common from './locales/en/common.json';
import dashboard from './locales/en/dashboard.json';
import disambiguate from './locales/en/disambiguate.json';
import library from './locales/en/library.json';
import scan from './locales/en/scan.json';
import scout from './locales/en/scout.json';
import settings from './locales/en/settings.json';
import verify from './locales/en/verify.json';

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  defaultNS: 'common',
  ns: ['common', 'scan', 'settings', 'library', 'scout', 'disambiguate', 'verify', 'dashboard'],
  resources: {
    en: {
      common,
      scan,
      settings,
      library,
      scout,
      disambiguate,
      verify,
      dashboard,
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
