import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HomePageService, HomePageImage } from '../../services/homepage.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { ImageSliderComponent } from '../image-slider/image-slider.component';
import { UploadModalComponent } from '../upload-modal/upload-modal.component';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageSliderComponent, UploadModalComponent, DeleteModalComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  images: HomePageImage[] = [];
  loadedImages: Set<number> = new Set();
  visibleImages: Set<number> = new Set();
  isLoading: boolean = true;
  isStoryVisible: boolean = false;
  isAboutVisible: boolean = false;
  showImageSlider: boolean = false;
  currentImageIndex: number = 0;
  isAuthenticated: any = false;
  isAdmin: boolean = false;
  
  // Admin upload/delete states
  showUploadModal: boolean = false;
  showDeleteModal: boolean = false;
  imageToDelete: HomePageImage | null = null;
  deletingImageId: string | null = null;
  deleteModalLoading = false;
  
  private intersectionObserver?: IntersectionObserver;
  private storyObserver?: IntersectionObserver;
  private aboutObserver?: IntersectionObserver;
  private isBrowser: boolean;

  constructor(
    private homepageService: HomePageService,
    private authService: AuthService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated  = isAuth;
      this.isAdmin = this.authService.isAdmin();
    });
    
    // Initialize admin status
    if (this.isBrowser) {
      this.isAdmin = this.authService.isAdmin();
    }
    
    // Load homepage images
    this.loadHomePageImages();
  }

  ngAfterViewInit() {
    // Setup Intersection Observer for scroll animations (browser only)
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllImages();
        this.setupStoryObserver();
        this.setupAboutObserver();
      }, 50);
    }
  }

  ngOnDestroy() {
    // Clean up observers
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    if (this.storyObserver) {
      this.storyObserver.disconnect();
    }
    if (this.aboutObserver) {
      this.aboutObserver.disconnect();
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

  setupStoryObserver() {
    if (!this.isBrowser) return;
    
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.2
    };

    this.storyObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.isStoryVisible = true;
        }
      });
    }, options);

    const storySection = document.querySelector('.who-we-are-section');
    if (storySection) {
      this.storyObserver.observe(storySection);
    }
  }

  setupAboutObserver() {
    if (!this.isBrowser) return;
    
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.2
    };

    this.aboutObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.isAboutVisible = true;
        }
      });
    }, options);

    const aboutSection = document.querySelector('.about-section');
    if (aboutSection) {
      this.aboutObserver.observe(aboutSection);
    }
  }

  loadHomePageImages() {
    this.isLoading = true;
    this.homepageService.getAllImages().subscribe({
      next: (images) => {
        this.images = images;
        this.isLoading = false;
        
        // Re-setup observers after images are loaded (browser only)
        if (this.isBrowser) {
          setTimeout(() => {
            this.setupIntersectionObserver();
            this.observeAllImages();
            this.setupStoryObserver();
            this.setupAboutObserver();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error loading homepage images:', error);
        this.isLoading = false;
      }
    });
  }

  getImageUrl(image: HomePageImage): string {
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

  // Image Slider methods
  openImageSlider(index: number) {
    this.currentImageIndex = index;
    this.showImageSlider = true;
  }

  closeImageSlider() {
    this.showImageSlider = false;
  }

  // Admin upload methods
  openUploadModal() {
    this.showUploadModal = true;
  }

  closeUploadModal() {
    this.showUploadModal = false;
  }

  onUploadComplete() {
    // Reload homepage images after successful upload
    this.loadHomePageImages();
  }

  // Upload function to pass to UploadModalComponent
  uploadHomePageImages(files: File[]) {
    return this.homepageService.uploadImages(files);
  }

  // Admin delete methods
  onDeleteClick(image: HomePageImage, event: Event): void {
    event.stopPropagation(); // Prevent opening the image slider when clicking delete
    this.imageToDelete = image;
    this.showDeleteModal = true;
  }

  onConfirmDelete(): void {
    if (!this.imageToDelete || this.deleteModalLoading) {
      return;
    }
    this.deleteImage(this.imageToDelete);
  }

  onCancelDelete(): void {
    if (this.deleteModalLoading) {
      return;
    }
    this.showDeleteModal = false;
    this.imageToDelete = null;
  }

  deleteImage(image: HomePageImage): void {
    this.deleteModalLoading = true;
    this.deletingImageId = image._id;

    this.homepageService.deleteImage(image.filename).subscribe({
      next: () => {
        // Find the index before deletion
        const index = this.images.findIndex(img => img._id === image._id);
        
        // Remove the image from the array
        this.images = this.images.filter(img => img._id !== image._id);
        this.deletingImageId = null;
        this.imageToDelete = null;
        this.deleteModalLoading = false;
        this.showDeleteModal = false;
        
        // Clean up loaded/visible images tracking
        if (index !== -1) {
          this.loadedImages.delete(index);
          this.visibleImages.delete(index);
        }
        
        // Re-observe images after deletion (browser only)
        if (this.isBrowser) {
          setTimeout(() => {
            this.observeAllImages();
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error deleting image:', error);
        alert('Failed to delete image. Please try again.');
        this.deletingImageId = null;
        this.deleteModalLoading = false;
      }
    });
  }

  isDeleting(imageId: string): boolean {
    return this.deletingImageId === imageId;
  }
}
