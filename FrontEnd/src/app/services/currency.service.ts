import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private isBrowser: boolean;
  private isInEgyptSubject = new BehaviorSubject<boolean | null>(null);
  public isInEgypt$ = this.isInEgyptSubject.asObservable();
  private readonly STORAGE_KEY = 'maro_currency_location';
  private readonly EXCHANGE_RATE_STORAGE_KEY = 'maro_exchange_rate';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly EXCHANGE_RATE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes - short cache for real-time rates
  private exchangeRate: number = 50; // Temporary initial value, will be replaced by API
  private exchangeRateSubject = new BehaviorSubject<number>(50);
  public exchangeRate$ = this.exchangeRateSubject.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.detectLocation();
      this.fetchExchangeRate();
    } else {
      // Default to Egypt for SSR
      this.isInEgyptSubject.next(true);
    }
  }

  get isInEgyptValue(): boolean {
    return this.isInEgyptSubject.value ?? true; // Default to Egypt if not detected yet
  }

  get currentExchangeRate(): number {
    return this.exchangeRateSubject.value;
  }

  private detectLocation(): void {
    // Check cache first
    const cached = this.getCachedLocation();
    if (cached !== null) {
      this.isInEgyptSubject.next(cached);
      return;
    }

    // Use backend proxy for geolocation
    this.http.get<any>(`${environment.apiUrl}/currency/location`)
      .pipe(
        catchError(() => {
          // If backend fails, default to Egypt
          this.setCachedLocation(true);
          return of({ country_code: 'EG' });
        }),
        map((response: any) => {
          // Check if country is Egypt
          const countryCode = response.country_code || response.countryCode || 'EG';
          const isEgypt = countryCode.toUpperCase() === 'EG';
          this.setCachedLocation(isEgypt);
          return isEgypt;
        })
      )
      .subscribe({
        next: (isEgypt: boolean) => {
          this.isInEgyptSubject.next(isEgypt);
        },
        error: () => {
          // Default to Egypt on error
          this.isInEgyptSubject.next(true);
        }
      });
  }

  private getCachedLocation(): boolean | null {
    if (!this.isBrowser) return null;
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      if (!cached) return null;
      const { isEgypt, timestamp } = JSON.parse(cached);
      const now = Date.now();
      if (now - timestamp < this.CACHE_DURATION) {
        return isEgypt;
      }
      return null;
    } catch {
      return null;
    }
  }

  private setCachedLocation(isEgypt: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        isEgypt,
        timestamp: Date.now()
      }));
    } catch {
      // Ignore localStorage errors
    }
  }

  private fetchExchangeRate(): void {
    if (!this.isBrowser) return;

    // Check for very recent cache (less than 5 minutes) to avoid too many API calls
    const cached = this.getCachedExchangeRate();
    if (cached !== null) {
      this.exchangeRate = cached;
      this.exchangeRateSubject.next(cached);
      // Still fetch fresh in background
    }

    // Fetch REAL-TIME exchange rate from our backend proxy
    this.http.get<any>(`${environment.apiUrl}/currency/exchange-rate`)
      .pipe(
        map((response: any) => {
          // Extract EGP rate from API response: { rates: { EGP: 47.36 } }
          if (response.rates && response.rates.EGP) {
            const egpRate = parseFloat(response.rates.EGP);
            if (!isNaN(egpRate) && egpRate > 0 && egpRate <= 1000) {
              return egpRate;
            }
          }
          throw new Error('Invalid rate from API');
        }),
        catchError((error) => {
          console.error('❌ Failed to fetch exchange rate from API:', error);
          // Don't use any fixed rate - return null
          return of(null);
        })
      )
      .subscribe({
        next: (rate: number | null) => {
          if (rate !== null) {
            this.exchangeRate = rate;
            this.exchangeRateSubject.next(rate);
            this.setCachedExchangeRate(rate);
            
          } else {
            console.error('❌ Could not get exchange rate from API. Prices may not convert correctly.');
          }
        },
        error: (error) => {
          console.error('❌ Exchange rate API error:', error);
        }
      });
  }

  private getCachedExchangeRate(): number | null {
    if (!this.isBrowser) return null;
    try {
      const cached = localStorage.getItem(this.EXCHANGE_RATE_STORAGE_KEY);
      if (!cached) return null;
      const { rate, timestamp } = JSON.parse(cached);
      const now = Date.now();
      if (now - timestamp < this.EXCHANGE_RATE_CACHE_DURATION) {
        // Validate rate is reasonable (should be around 47-48 currently)
        if (rate >= 40 && rate <= 60) {
          return rate;
        } else {
          console.warn('⚠️ Cached rate seems invalid:', rate, '- clearing cache');
          this.clearExchangeRateCache();
          return null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private getCachedExchangeRateData(): { rate: number; timestamp: number } | null {
    if (!this.isBrowser) return null;
    try {
      const cached = localStorage.getItem(this.EXCHANGE_RATE_STORAGE_KEY);
      if (!cached) return null;
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  private clearExchangeRateCache(): void {
    if (!this.isBrowser) return;
    try {
      localStorage.removeItem(this.EXCHANGE_RATE_STORAGE_KEY);
      
    } catch {
      // Ignore errors
    }
  }

  // Public method to force refresh exchange rate (clears cache and fetches fresh)
  public forceRefreshExchangeRate(): void {
    if (!this.isBrowser) return;
    
    this.clearExchangeRateCache();
    this.fetchExchangeRate();
  }

  private setCachedExchangeRate(rate: number): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(this.EXCHANGE_RATE_STORAGE_KEY, JSON.stringify({
        rate,
        timestamp: Date.now()
      }));
    } catch {
      // Ignore localStorage errors
    }
  }

  formatCurrency(value: number | string | null | undefined): string {
    if (value === null || value === undefined) {
      return this.isInEgyptValue ? '0 LE' : '$0';
    }

    const numValue = typeof value === 'string' ? this.parsePriceValue(value) : value;
    
    if (isNaN(numValue) || numValue === 0) {
      return this.isInEgyptValue ? '0 LE' : '$0';
    }

    if (this.isInEgyptValue) {
      // Display in LE (Egyptian Pounds)
      return `${numValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} LE`;
    } else {
      // Convert LE to USD using current exchange rate
      // exchangeRate is EGP per 1 USD, so divide LE by rate to get USD
      const usdValue = numValue / this.exchangeRate;
      // Round to nearest whole number for USD
      const roundedUsd = Math.round(usdValue);
      
      

      return `$${roundedUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
  }

  formatPriceString(priceString: string | null | undefined): string {
    if (!priceString) {
      return this.isInEgyptValue ? '0 LE' : '$0';
    }

    // Extract numeric value from price string
    const numValue = this.parsePriceValue(priceString);
    
    if (isNaN(numValue) || numValue === 0) {
      return this.isInEgyptValue ? '0 LE' : '$0';
    }

    if (this.isInEgyptValue) {
      // Display in LE (Egyptian Pounds)
      return `${numValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} LE`;
    } else {
      // Convert LE to USD using current exchange rate
      // exchangeRate is EGP per 1 USD, so divide LE by rate to get USD
      const usdValue = numValue / this.exchangeRate;
      // Round to nearest whole number for USD
      const roundedUsd = Math.round(usdValue);
      
      
      
      return `$${roundedUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
  }

  getCurrencySymbol(): string {
    return this.isInEgyptValue ? 'LE' : '$';
  }

  getCurrencySuffix(): string {
    return this.isInEgyptValue ? 'LE' : '$';
  }

  private parsePriceValue(price: string | number): number {
    if (typeof price === 'number') {
      return price;
    }
    if (!price) {
      return 0;
    }
    // Remove all non-numeric characters except decimal point and minus sign
    const numeric = parseFloat(price.toString().replace(/[^\d.-]/g, ''));
    return isNaN(numeric) ? 0 : numeric;
  }
}
