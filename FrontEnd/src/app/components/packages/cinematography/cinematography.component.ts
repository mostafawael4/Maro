import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PackagesService, PackageCollection, PackageExtra, Package } from '../../../services/packages.service';
import { AuthService } from '../../../services/auth.service';
import { EditPackageModalComponent } from '../../edit-package-modal/edit-package-modal.component';

@Component({
  selector: 'app-cinematography',
  standalone: true,
  imports: [CommonModule, EditPackageModalComponent],
  templateUrl: './cinematography.component.html',
  styleUrl: './cinematography.component.scss'
})
export class CinematographyComponent implements OnInit, AfterViewInit, OnDestroy {
  // Cinematography packages
  cinematographyPackages: PackageCollection[] = [];
  
  // Extras
  extras: PackageExtra[] = [];

  isLoading: boolean = true;
  errorMessage: string = '';
  selectedPackage: any = null;
  
  // Full package data for editing
  fullPackageData: Package | null = null;
  
  // Edit modal
  showEditModal: boolean = false;
  isAuthenticated: boolean = false;
  
  // Animation states
  visiblePackages: Set<number> = new Set();
  visibleExtras: Set<number> = new Set();
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(
    private packagesService: PackagesService,
    private authService: AuthService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.loadCinematographyPackages();
    
    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
    });
  }
  
  ngAfterViewInit(): void {
    // Setup Intersection Observer for scroll animations (browser only)
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllElements();
      }, 50);
    }
  }
  
  ngOnDestroy(): void {
    // Clean up observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }
  
  setupIntersectionObserver(): void {
    if (!this.isBrowser) return;
    
    const options = {
      root: null,
      rootMargin: '50px',
      threshold: 0.1
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const index = parseInt(element.getAttribute('data-index') || '0', 10);
          const type = element.getAttribute('data-type') || 'package';
          
          setTimeout(() => {
            if (type === 'package') {
              this.visiblePackages.add(index);
            } else if (type === 'extra') {
              this.visibleExtras.add(index);
            }
          }, 0);
        }
      });
    }, options);
  }
  
  observeAllElements(): void {
    if (!this.isBrowser) return;
    
    const packageCards = document.querySelectorAll('.package-card');
    const extraCards = document.querySelectorAll('.extra-card');
    
    packageCards.forEach((card) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(card as HTMLElement);
      }
    });
    
    extraCards.forEach((card) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(card as HTMLElement);
      }
    });
  }
  
  isPackageVisible(index: number): boolean {
    return this.visiblePackages.has(index);
  }
  
  isExtraVisible(index: number): boolean {
    return this.visibleExtras.has(index);
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
          this.fullPackageData = cinematographyPackage; // Store full package data
        }
        
        this.isLoading = false;
        
        // Re-setup observer after data is loaded (browser only)
        if (this.isBrowser) {
          setTimeout(() => {
            this.setupIntersectionObserver();
            this.observeAllElements();
          }, 100);
        }
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
  
  // Edit package modal methods
  openEditModal(): void {
    this.showEditModal = true;
  }
  
  closeEditModal(): void {
    this.showEditModal = false;
  }
  
  onPackageSaved(): void {
    // Reload packages after saving
    this.loadCinematographyPackages();
  }
}

