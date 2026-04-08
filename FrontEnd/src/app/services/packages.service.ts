import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CurrencyService } from './currency.service';

// Interface for Package Collection
export interface PackageCollection {
  _id: string;
  collectionName: string;
  price: string;          // EGP price (base)
  priceAED?: string;      // AED price (optional, set by admin)
  hiddenInUAE?: boolean;  // if true, filtered out for UAE users
  duration?: string;
  description?: string;
  features: string[];
}

// Interface for Package Extra
export interface PackageExtra {
  _id: string;
  name: string;
  price: string;          // EGP price (base)
  priceAED?: string;      // AED price (optional)
  hiddenInUAE?: boolean;
}

// Interface for Package
export interface Package {
  _id: string;
  packageName: string;
  displayName: string;
  collections: PackageCollection[];
  extras: PackageExtra[];
  __v?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PackagesService {
  private apiUrl = `${environment.apiUrl}/packages`;

  constructor(
    private http: HttpClient,
    private currencyService: CurrencyService
  ) { }

  // Get all packages, automatically passing country for UAE visibility filtering
  getAllPackages(): Observable<Package[]> {
    const country = this.currencyService.country;
    const params = country ? `?country=${encodeURIComponent(country)}` : '';
    return this.http.get<Package[]>(`${this.apiUrl}${params}`);
  }

  // Get a specific package by packageName
  getPackageByName(packageName: string): Observable<Package> {
    const country = this.currencyService.country;
    const params = country ? `?country=${encodeURIComponent(country)}` : '';
    return this.http.get<Package>(`${this.apiUrl}/${packageName}${params}`);
  }

  // Save/Update a package (requires authentication — always sends all fields)
  savePackage(packageData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/save`, packageData, { withCredentials: true });
  }
}

