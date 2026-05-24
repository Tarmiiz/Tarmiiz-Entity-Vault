import { Injectable, signal, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLang = 'en' | 'ar';

const STORAGE_KEY = 'tarmiizVaultLang';
const DEFAULT_LANG: AppLang = 'en';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private translate = inject(TranslateService);

  readonly lang = signal<AppLang>(DEFAULT_LANG);

  init() {
    this.translate.addLangs(['en', 'ar']);
    this.translate.setDefaultLang('en');

    const stored = (typeof localStorage !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEY) as AppLang | null)
      : null);
    const initial: AppLang = stored === 'ar' || stored === 'en' ? stored : DEFAULT_LANG;
    this.apply(initial);
  }

  setLang(lang: AppLang) {
    if (lang === this.lang()) return;
    this.apply(lang);
  }

  toggle() {
    this.setLang(this.lang() === 'en' ? 'ar' : 'en');
  }

  private apply(lang: AppLang) {
    this.lang.set(lang);
    this.translate.use(lang);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }

    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    html.classList.toggle('lang-ar', lang === 'ar');
    html.classList.toggle('lang-en', lang === 'en');
  }
}
