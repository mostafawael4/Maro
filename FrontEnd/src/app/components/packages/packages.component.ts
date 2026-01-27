import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PackagesService, PackageCollection, PackageExtra, Package } from '../../services/packages.service';
import { AuthService } from '../../services/auth.service';
import { CurrencyService } from '../../services/currency.service';
import { EditPackageModalComponent } from '../edit-package-modal/edit-package-modal.component';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, EditPackageModalComponent],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent implements OnInit, AfterViewInit, OnDestroy {
  // All packages data
  cinematographyPackage: Package | null = null;
  photographyPackage: Package | null = null;
  fullRecordingPackage: Package | null = null;

  // Loading and error states
  isLoading: boolean = true;
  errorMessage: string = '';

  // Authentication
  isAuthenticated: boolean = false;
  isAdmin: boolean = false;

  // Edit modals
  showCinematographyModal: boolean = false;
  showPhotographyModal: boolean = false;
  showFullRecordingModal: boolean = false;

  // Animation states
  visibleTerms: boolean = false;
  visibleCta: boolean = false;
  visiblePackages: Set<string> = new Set();
  visibleExtras: Set<string> = new Set();
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(
    private packagesService: PackagesService,
    private authService: AuthService,
    public currencyService: CurrencyService,
    private meta: Meta,
    private titleService: Title,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.setMetaTags();
    this.loadAllPackages();

    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
      this.isAdmin = this.authService.isAdmin();
    });

    // Initialize admin status
    if (this.isBrowser) {
      this.isAdmin = this.authService.isAdmin();
    }
  }

  ngAfterViewInit(): void {
    // Setup Intersection Observer for scroll animations (browser only)
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllElements();
      }, 100);
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
          const type = element.getAttribute('data-type');
          const index = element.getAttribute('data-index') || '';

          setTimeout(() => {
            if (type === 'terms') {
              this.visibleTerms = true;
            } else if (type === 'cta') {
              this.visibleCta = true;
            } else if (type === 'package') {
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

    const termsSection = document.querySelector('.terms-section');
    const ctaSection = document.querySelector('.contact-cta');
    const packageCards = document.querySelectorAll('.package-card');
    const extraCards = document.querySelectorAll('.extra-card');
    const serviceCards = document.querySelectorAll('.service-card');

    if (termsSection && this.intersectionObserver) {
      this.intersectionObserver.observe(termsSection as HTMLElement);
    }

    if (ctaSection && this.intersectionObserver) {
      this.intersectionObserver.observe(ctaSection as HTMLElement);
    }

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

    serviceCards.forEach((card) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(card as HTMLElement);
      }
    });
  }

  loadAllPackages(): void {
    this.isLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        this.cinematographyPackage = packages.find(pkg => pkg.packageName === 'cinematography') || null;
        this.photographyPackage = packages.find(pkg => pkg.packageName === 'photography') || null;
        this.fullRecordingPackage = packages.find(pkg => pkg.packageName === 'fullRecording') || null;

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
        console.error('Error loading packages:', error);
        this.errorMessage = 'Failed to load packages. Please try again later.';
        this.isLoading = false;
      }
    });
  }

  isTermsVisible(): boolean {
    return this.visibleTerms;
  }

  isCTAVisible(): boolean {
    return this.visibleCta;
  }

  isPackageVisible(packageType: string, index: number): boolean {
    return this.visiblePackages.has(`${packageType}-${index}`);
  }

  isExtraVisible(packageType: string, index: number): boolean {
    return this.visibleExtras.has(`${packageType}-${index}`);
  }

  // Edit package modal methods
  openEditModal(packageType: string): void {
    if (packageType === 'cinematography') {
      this.showCinematographyModal = true;
    } else if (packageType === 'photography') {
      this.showPhotographyModal = true;
    } else if (packageType === 'fullRecording') {
      this.showFullRecordingModal = true;
    }
  }

  closeEditModal(packageType: string): void {
    if (packageType === 'cinematography') {
      this.showCinematographyModal = false;
    } else if (packageType === 'photography') {
      this.showPhotographyModal = false;
    } else if (packageType === 'fullRecording') {
      this.showFullRecordingModal = false;
    }
  }

  onPackageSaved(): void {
    // Reload packages after saving
    this.loadAllPackages();
  }

  // Open WhatsApp contact
  contactUs(): void {
    window.open('https://wa.me/201025641261', '_blank');
  }

  // Format price using currency service
  formatPrice(price: string | null | undefined): string {
    return this.currencyService.formatPriceString(price);
  }

  private setMetaTags(): void {
    const title = 'PRICING & PACKAGES | MARO WEDDINGS';
    const description = 'Explore our exclusive wedding photography and videography packages. We offer customized services to capture your special day perfectly.';
    const url = 'https://maroweddings.com/packages';
    const image = 'https://maroweddings.com/assets/images/packages.png';

    this.titleService.setTitle(title);

    // Standard Meta Tags
    this.meta.updateTag({ name: 'description', content: description });

    // Open Graph / Facebook
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
  }
}
