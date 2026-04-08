import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type Currency = 'EGP' | 'AED' | 'USD';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private isBrowser: boolean;

  // ── Three-state currency (EGP / AED / USD) ──────────────────────────────────
  private currencySubject = new BehaviorSubject<Currency>('EGP');
  public currency$ = this.currencySubject.asObservable();

  private countrySubject = new BehaviorSubject<string>('EG');
  public country$ = this.countrySubject.asObservable();

  // ── Currency ready signal ─────────────────────────────────────────────────────
  // Starts false; flips to true once the server-side geo-detect call completes
  // (success OR error/fallback). Components should wait for this before fetching
  // packages so that currencyService.country is already the final detected value.
  private currencyReadySubject = new BehaviorSubject<boolean>(false);
  /** Emits true once the initial geo detection round-trip has finished. */
  public currencyReady$ = this.currencyReadySubject.asObservable();

  // ── Legacy aliases (kept for backward compatibility) ─────────────────────────
  /** @deprecated Use currency$ instead. True only for EGP. */
  private isInEgyptSubject = new BehaviorSubject<boolean | null>(null);
  public isInEgypt$ = this.isInEgyptSubject.asObservable();

  // ── Exchange rate (EGP per 1 USD) ────────────────────────────────────────────
  private exchangeRate: number = 50;
  private exchangeRateSubject = new BehaviorSubject<number>(50);
  public exchangeRate$ = this.exchangeRateSubject.asObservable();

  private readonly EXCHANGE_RATE_STORAGE_KEY = 'maro_exchange_rate';
  private readonly EXCHANGE_RATE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly CURRENCY_CACHE_KEY = 'maro_currency_v2';
  private readonly CURRENCY_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.fetchExchangeRate();
      // Always detect currency fresh from server on every page load
      // No localStorage cache — VPN/location changes are detected immediately
      this.fetchCurrency();
    } else {
      // SSR: default to EGP — mark ready immediately (no HTTP call on server)
      this.applyCurrency('EGP', 'EG');
      this.currencyReadySubject.next(true);
    }
  }

  // ── Public getters ────────────────────────────────────────────────────────────

  get currency(): Currency {
    return this.currencySubject.value;
  }

  get country(): string {
    return this.countrySubject.value;
  }

  /** @deprecated Use currency getter instead */
  get isInEgyptValue(): boolean {
    return this.currencySubject.value === 'EGP';
  }

  get currentExchangeRate(): number {
    return this.exchangeRateSubject.value;
  }

  // ── Detection ─────────────────────────────────────────────────────────────────

  /** Called from AppComponent on init and from create-order on every open. */
  public detectCurrency(): void {
    if (!this.isBrowser) return;
    // Reset the ready signal so components that wait on currencyReady$
    // will correctly block until THIS fresh HTTP call resolves.
    this.currencyReadySubject.next(false);
    this.fetchCurrency();
  }

  private fetchCurrency(): void {
    this.http.get<{ currency: string; country: string }>(`${environment.apiUrl}/currency/detect`)
      .pipe(
        catchError(() => of({ currency: 'EGP', country: 'UNKNOWN' }))
      )
      .subscribe({
        next: (res) => {
          const currency = this.validateCurrency(res.currency);
          const country = res.country || 'UNKNOWN';
          this.applyCurrency(currency, country);
          this.currencyReadySubject.next(true); // unblock components waiting for currency
          // Do NOT cache to localStorage — always re-detect from IP
        },
        error: () => {
          this.applyCurrency('EGP', 'UNKNOWN');
          this.currencyReadySubject.next(true); // unblock on error too (EGP fallback)
        }
      });
  }

  private applyCurrency(currency: Currency, country: string): void {
    this.currencySubject.next(currency);
    this.countrySubject.next(country);
    this.isInEgyptSubject.next(currency === 'EGP');
  }

  private validateCurrency(raw: string): Currency {
    const upper = (raw || '').toUpperCase();
    if (upper === 'EGP' || upper === 'AED' || upper === 'USD') return upper as Currency;
    return 'EGP';
  }

  // ── Cache (exchange rate only — currency is never cached) ────────────────────

  private getCachedCurrency(): null {
    // Currency caching removed — always detect from IP
    return null;
  }

  private setCachedCurrency(_currency: Currency, _country: string): void {
    // No-op — currency is not cached in localStorage
  }

  // ── Exchange rate ─────────────────────────────────────────────────────────────

  private fetchExchangeRate(): void {
    if (!this.isBrowser) return;
    const cached = this.getCachedExchangeRate();
    if (cached !== null) {
      this.exchangeRate = cached;
      this.exchangeRateSubject.next(cached);
    }

    this.http.get<any>(`${environment.apiUrl}/currency/exchange-rate`)
      .pipe(
        map((response: any) => {
          if (response.rates?.EGP) {
            const rate = parseFloat(response.rates.EGP);
            if (!isNaN(rate) && rate > 0 && rate <= 1000) return rate;
          }
          throw new Error('Invalid rate');
        }),
        catchError(() => of(null))
      )
      .subscribe({
        next: (rate: number | null) => {
          if (rate !== null) {
            this.exchangeRate = rate;
            this.exchangeRateSubject.next(rate);
            this.setCachedExchangeRate(rate);
          }
        }
      });
  }

  private getCachedExchangeRate(): number | null {
    if (!this.isBrowser) return null;
    try {
      const raw = localStorage.getItem(this.EXCHANGE_RATE_STORAGE_KEY);
      if (!raw) return null;
      const { rate, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < this.EXCHANGE_RATE_CACHE_DURATION && rate >= 10 && rate <= 1000) {
        return rate;
      }
    } catch { /* ignore */ }
    return null;
  }

  private setCachedExchangeRate(rate: number): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(this.EXCHANGE_RATE_STORAGE_KEY, JSON.stringify({ rate, timestamp: Date.now() }));
    } catch { /* ignore */ }
  }

  public forceRefreshExchangeRate(): void {
    if (!this.isBrowser) return;
    try { localStorage.removeItem(this.EXCHANGE_RATE_STORAGE_KEY); } catch { /* ignore */ }
    this.fetchExchangeRate();
  }

  // ── Formatting ────────────────────────────────────────────────────────────────

  /**
   * Format a numeric value using the CURRENT user's detected currency.
   * For EGP: value is EGP → "12,500 LE"
   * For AED: value is AED → "AED 12,500"  (no conversion)
   * For USD: value is EGP → converted and displayed as "$250"
   */
  formatCurrency(value: number | string | null | undefined): string {
    return this.formatByCurrency(value, this.currency);
  }

  /**
   * Format a value using a SPECIFIC currency code — used for displaying stored order prices.
   * The admin sees the order in whatever currency was used when it was created.
   */
  formatOrderCurrency(value: number | string | null | undefined, storedCurrency: string): string {
    const currency = this.validateCurrency(storedCurrency);
    return this.formatByCurrency(value, currency);
  }

  private formatByCurrency(value: number | string | null | undefined, currency: Currency): string {
    if (value === null || value === undefined) return this.zeroFor(currency);
    const num = typeof value === 'string' ? this.parsePriceValue(value) : value;
    if (isNaN(num) || num === 0) return this.zeroFor(currency);

    switch (currency) {
      case 'EGP':
        return `${num.toLocaleString('en-US', { maximumFractionDigits: 0 })} LE`;
      case 'AED':
        // Value is already in AED — display directly
        return `AED ${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      case 'USD':
        // Value is in EGP — convert to USD
        const usd = Math.round(num / this.exchangeRate);
        return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
  }

  /**
   * Format a price string (e.g. "12500 LE") using the current user's currency.
   * Parses numeric value first, then formats.
   */
  formatPriceString(priceString: string | null | undefined): string {
    if (!priceString) return this.zeroFor(this.currency);
    const num = this.parsePriceValue(priceString);
    if (isNaN(num) || num === 0) return this.zeroFor(this.currency);
    return this.formatByCurrency(num, this.currency);
  }

  /**
   * Format an AED-first price for packages.
   * If the item has a priceAED and the user is in UAE → show priceAED directly.
   * Otherwise fall through to normal formatPriceString (EGP or USD).
   */
  formatPackagePrice(priceEGP: string | null | undefined, priceAED: string | null | undefined): string {
    if (this.currency === 'AED' && priceAED) {
      const val = this.parsePriceValue(priceAED);
      return `AED ${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    return this.formatPriceString(priceEGP);
  }

  getCurrencyCode(): Currency {
    return this.currency;
  }

  getCurrencyLabel(): string {
    switch (this.currency) {
      case 'EGP': return 'LE';
      case 'AED': return 'AED';
      case 'USD': return '$';
    }
  }

  /** @deprecated Use getCurrencyLabel() */
  getCurrencySymbol(): string { return this.getCurrencyLabel(); }

  /** @deprecated Use getCurrencyLabel() */
  getCurrencySuffix(): string { return this.getCurrencyLabel(); }

  private zeroFor(currency: Currency): string {
    switch (currency) {
      case 'EGP': return '0 LE';
      case 'AED': return 'AED 0';
      case 'USD': return '$0';
    }
  }

  private parsePriceValue(price: string | number): number {
    if (typeof price === 'number') return price;
    if (!price) return 0;
    const numeric = parseFloat(price.toString().replace(/[^\d.-]/g, ''));
    return isNaN(numeric) ? 0 : numeric;
  }
}
