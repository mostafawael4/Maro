import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PackagesService, PackageCollection } from '../../../services/packages.service';

@Component({
  selector: 'app-full-recording',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './full-recording.component.html',
  styleUrl: './full-recording.component.scss'
})
export class FullRecordingComponent implements OnInit, AfterViewInit, OnDestroy {
  // Full Recording Services
  services: PackageCollection[] = [];
  
  isLoading: boolean = true;
  errorMessage: string = '';
  
  // Animation states
  visibleServices: Set<number> = new Set();
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(
    private packagesService: PackagesService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.loadFullRecordingServices();
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
              this.visibleServices.add(index);
            }
          }, 0);
        }
      });
    }, options);
  }
  
  observeAllElements(): void {
    if (!this.isBrowser) return;
    
    const serviceCards = document.querySelectorAll('.service-card');
    
    serviceCards.forEach((card) => {
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(card as HTMLElement);
      }
    });
  }
  
  isServiceVisible(index: number): boolean {
    return this.visibleServices.has(index);
  }

  loadFullRecordingServices(): void {
    this.isLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        // Find the fullRecording package
        const fullRecordingPackage = packages.find(pkg => pkg.packageName === 'fullRecording');
        
        if (fullRecordingPackage) {
          this.services = fullRecordingPackage.collections;
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
        console.error('Error loading full recording services:', error);
        this.errorMessage = 'Failed to load services. Please try again later.';
        this.isLoading = false;
      }
    });
  }
}
