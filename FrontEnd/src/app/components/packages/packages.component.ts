import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PackagesService, PackageCollection, PackageExtra, Package } from '../../services/packages.service';
import { AuthService } from '../../services/auth.service';
import { CurrencyService } from '../../services/currency.service';
import { EditPackageModalComponent } from '../edit-package-modal/edit-package-modal.component';
import { Subject } from 'rxjs';
import { filter, take, skip, takeUntil } from 'rxjs/operators';

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
  private destroy$ = new Subject<void>();

  constructor(
    private packagesService: PackagesService,
    private authService: AuthService,
    public currencyService: CurrencyService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    // BUG FIX: defer package load until geo-detect HTTP call resolves.
    // This ensures ?country=AE is sent for UAE users (hiddenInUAE filtered server-side)
    // and that prices use currencyService.currency which is already the detected value.
    this.currencyService.currencyReady$.pipe(
      filter((ready) => ready),
      take(1)
    ).subscribe(() => {
      this.loadAllPackages();
      // After the initial load, reactively reload whenever currency changes
      // (e.g. user switches VPN mid-session). skip(1) avoids a duplicate load
      // from the BehaviorSubject replaying the current value on subscribe.
      this.currencyService.currency$.pipe(
        skip(1),
        takeUntil(this.destroy$)
      ).subscribe(() => this.loadAllPackages());
    });

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
    this.destroy$.next();
    this.destroy$.complete();
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

  // Format price using currency service — AED-aware
  formatPrice(price: string | null | undefined, priceAED?: string | null): string {
    return this.currencyService.formatPackagePrice(price, priceAED);
  }
}
