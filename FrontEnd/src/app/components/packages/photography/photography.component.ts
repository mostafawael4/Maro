import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PackagesService, PackageCollection, PackageExtra } from '../../../services/packages.service';

@Component({
  selector: 'app-photography',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './photography.component.html',
  styleUrl: './photography.component.scss'
})
export class PhotographyComponent implements OnInit {
  // Photography packages
  photographyPackages: PackageCollection[] = [];
  
  // Extras
  extras: PackageExtra[] = [];

  isLoading: boolean = true;
  errorMessage: string = '';
  selectedPackage: any = null;

  constructor(private packagesService: PackagesService) {}

  ngOnInit(): void {
    this.loadPhotographyPackages();
  }

  loadPhotographyPackages(): void {
    this.isLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        // Find the photography package
        const photographyPackage = packages.find(pkg => pkg.packageName === 'photography');
        
        if (photographyPackage) {
          this.photographyPackages = photographyPackage.collections;
          this.extras = photographyPackage.extras;
        }
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading photography packages:', error);
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

