import { Component, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent implements AfterViewInit, OnDestroy {
  // Animation states
  visibleTerms: boolean = false;
  visibleCta: boolean = false;
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;
  private routerSubscription: any;

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    
    // Re-observe elements when route changes
    if (this.isBrowser) {
      this.routerSubscription = this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        // Reset animation states on route change
        this.visibleTerms = false;
        this.visibleCta = false;
        
        // Re-observe elements after route content loads
        setTimeout(() => {
          this.observeAllElements();
        }, 300);
      });
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
    
    // Clean up router subscription
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
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

          setTimeout(() => {
            if (type === 'terms') {
              this.visibleTerms = true;
            } else if (type === 'cta') {
              this.visibleCta = true;
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

    if (termsSection && this.intersectionObserver) {
      this.intersectionObserver.observe(termsSection as HTMLElement);
    }

    if (ctaSection && this.intersectionObserver) {
      this.intersectionObserver.observe(ctaSection as HTMLElement);
    }
  }

  isTermsVisible(): boolean {
    return this.visibleTerms;
  }

  isCTAVisible(): boolean {
    return this.visibleCta;
  }

  // Switch between different package types
  switchSection(section: string): void {
    this.router.navigate(['/packages', section]);
  }

  // Check if a route is active
  isActive(route: string): boolean {
    return this.router.url.includes(route);
  }

  // Open WhatsApp contact
  contactUs(): void {
    window.open('https://wa.me/201025641261', '_blank');
  }
}
