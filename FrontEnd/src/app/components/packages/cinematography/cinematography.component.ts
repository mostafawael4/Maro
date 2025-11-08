import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PackagesService, PackageCollection, PackageExtra } from '../../../services/packages.service';

@Component({
  selector: 'app-cinematography',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinematography.component.html',
  styleUrl: './cinematography.component.scss'
})
export class CinematographyComponent implements OnInit {
  // Cinematography packages
  cinematographyPackages: PackageCollection[] = [];
  
  // Extras
  extras: PackageExtra[] = [];

  isLoading: boolean = true;
  errorMessage: string = '';
  selectedPackage: any = null;

  constructor(private packagesService: PackagesService) {}

  ngOnInit(): void {
    this.loadCinematographyPackages();
  }

  loadCinematographyPackages(): void {
    this.isLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        // Find the cinematography package
        const cinematographyPackage = packages.find(pkg => pkg.packageName === 'cinematography');
        
        if (cinematographyPackage) {
          this.cinematographyPackages = cinematographyPackage.collections;
          this.extras = cinematographyPackage.extras;
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading cinematography packages:', error);
        this.errorMessage = 'Failed to load packages. Please try again later.';
        this.isLoading = false;
      }
    });
  }

  selectPackage(pkg: any): void {
    this.selectedPackage = pkg;
  }

  contactUs(): void {
    // Navigate to contact or open WhatsApp
    window.open('https://wa.me/201025641261', '_blank');
  }
}

