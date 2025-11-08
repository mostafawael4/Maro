import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Interface for Package Collection
export interface PackageCollection {
  _id: string;
  collectionName: string;
  price: string;
  duration?: string; // Used by Cinematography & Photography only
  description?: string;
  features: string[]; // Always present (can be empty [])
}

// Interface for Package Extra
export interface PackageExtra {
  _id: string;
  name: string;
  price: string;
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

  constructor(private http: HttpClient) { }

  // Get all packages
  getAllPackages(): Observable<Package[]> {
    return this.http.get<Package[]>(this.apiUrl);
  }

  // Get a specific package by packageName (cinematography, photography, fullRecording)
  getPackageByName(packageName: string): Observable<Package> {
    return this.http.get<Package>(`${this.apiUrl}/${packageName}`);
  }

  // Save/Update a package (requires authentication)
  savePackage(packageData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/save`, packageData, { withCredentials: true });
  }
}

