import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GalleryService, GalleryImage } from '../../services/gallery.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  images: GalleryImage[] = [];
  loadedImages: Set<number> = new Set();
  visibleImages: Set<number> = new Set();
  isLoading: boolean = true;
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(
    private galleryService: GalleryService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    // Load latest images from gallery
    this.loadLatestImages();
  }

  ngAfterViewInit() {
    // Setup Intersection Observer for scroll animations (browser only)
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllImages();
      }, 50);
    }
  }

  ngOnDestroy() {
    // Clean up observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  setupIntersectionObserver() {
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
          setTimeout(() => {
            this.visibleImages.add(index);
          }, 0);
        }
      });
    }, options);
  }

  observeImage(element: HTMLElement) {
    if (this.intersectionObserver && element) {
      this.intersectionObserver.observe(element);
    }
  }

  isImageVisible(index: number): boolean {
    return this.visibleImages.has(index);
  }

  observeAllImages() {
    if (!this.isBrowser) return;
    
    const photoItems = document.querySelectorAll('.home-container .photo-item');
    photoItems.forEach((item) => {
      this.observeImage(item as HTMLElement);
    });
  }

  loadLatestImages() {
    this.isLoading = true;
    this.galleryService.getAllImages().subscribe({
      next: (images) => {
        // Get the last 10 images (most recent ones)
        this.images = images.slice(-10).reverse();
        this.isLoading = false;
        
        // Re-setup observer after images are loaded (browser only)
        if (this.isBrowser) {
          setTimeout(() => {
            this.setupIntersectionObserver();
            this.observeAllImages();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error loading latest images:', error);
        this.isLoading = false;
      }
    });
  }

  getImageUrl(image: GalleryImage): string {
    // If the URL is relative, prepend the backend URL
    if (image.url.startsWith('/')) {
      return `${environment.apiUrl}${image.url}`;
    }
    return image.url;
  }

  onImageLoad(index: number) {
    this.loadedImages.add(index);
  }

  isImageLoaded(index: number): boolean {
    return this.loadedImages.has(index);
  }
}
