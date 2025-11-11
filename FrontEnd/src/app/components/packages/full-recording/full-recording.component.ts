import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PackagesService, PackageCollection, PackageExtra, Package } from '../../../services/packages.service';
import { AuthService } from '../../../services/auth.service';
import { EditPackageModalComponent } from '../../edit-package-modal/edit-package-modal.component';

@Component({
  selector: 'app-full-recording',
  standalone: true,
  imports: [CommonModule, EditPackageModalComponent],
  templateUrl: './full-recording.component.html',
  styleUrl: './full-recording.component.scss'
})
export class FullRecordingComponent implements OnInit, AfterViewInit, OnDestroy {
  // Full Recording Services
  services: PackageCollection[] = [];
  
  // Extras
  extras: PackageExtra[] = [];
  
  isLoading: boolean = true;
  errorMessage: string = '';
  
  // Full package data for editing
  fullPackageData: Package | null = null;
  
  // Edit modal
  showEditModal: boolean = false;
  isAuthenticated: boolean = false;
  
  // Animation states
  visibleServices: Set<number> = new Set();
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
    this.loadFullRecordingServices();
    
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
          const type = element.getAttribute('data-type') || 'service';
          
          setTimeout(() => {
            if (type === 'service') {
              this.visibleServices.add(index);
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
    
    const serviceCards = document.querySelectorAll('.service-card');
    const extraCards = document.querySelectorAll('.extra-card');
    
    serviceCards.forEach((card) => {
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
  
  isServiceVisible(index: number): boolean {
    return this.visibleServices.has(index);
  }
  
  isExtraVisible(index: number): boolean {
    return this.visibleExtras.has(index);
  }

  loadFullRecordingServices(): void {
    this.isLoading = true;
    this.packagesService.getAllPackages().subscribe({
      next: (packages) => {
        // Find the fullRecording package
        const fullRecordingPackage = packages.find(pkg => pkg.packageName === 'fullRecording');
        
        if (fullRecordingPackage) {
          this.services = fullRecordingPackage.collections;
          this.extras = fullRecordingPackage.extras || [];
          this.fullPackageData = fullRecordingPackage; // Store full package data
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
  
  // Edit package modal methods
  openEditModal(): void {
    this.showEditModal = true;
  }
  
  closeEditModal(): void {
    this.showEditModal = false;
  }
  
  onPackageSaved(): void {
    // Reload packages after saving
    this.loadFullRecordingServices();
  }
}
