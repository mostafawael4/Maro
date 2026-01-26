import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject, HostListener } from '@angular/core';
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

  // Pagination state
  currentPage: number = 1;
  pageSize: number = 8;
  hasMore: boolean = true;
  isLoadingMore: boolean = false;

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
      this.isAuthenticated = isAuth;
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

  // Listen for window scroll to trigger load more
  @HostListener('window:scroll', ['$event'])
  onScroll() {
    if (!this.isBrowser || this.isLoading || this.isLoadingMore || !this.hasMore) return;

    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 500; // Load when within 500px of bottom

    if (scrollPosition >= threshold) {
      this.loadMoreImages();
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
    this.homepageService.getAllImages(1, this.pageSize).subscribe({
      next: (response) => {
        this.images = response.items;
        this.hasMore = response.hasMore;
        this.currentPage = 1;
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

  loadMoreImages() {
    if (this.isLoadingMore || !this.hasMore) return;

    this.isLoadingMore = true;
    const nextPage = this.currentPage + 1;

    this.homepageService.getAllImages(nextPage, this.pageSize).subscribe({
      next: (response) => {
        const currentLength = this.images.length;
        this.images = [...this.images, ...response.items];
        this.hasMore = response.hasMore;
        this.currentPage = nextPage;
        this.isLoadingMore = false;

        // Observe new items
        if (this.isBrowser) {
          setTimeout(() => {
            // Only observe newly added items to avoid performance hit
            const allItems = document.querySelectorAll('.home-container .photo-item');
            for (let i = currentLength; i < allItems.length; i++) {
              this.observeImage(allItems[i] as HTMLElement);
            }
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error loading more homepage images:', error);
        this.isLoadingMore = false;
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
    // Reload homepage images after successful upload - reset to page 1
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
          // Shift indices for loaded images
          const newLoaded = new Set<number>();
          this.loadedImages.forEach(i => {
            if (i < index) newLoaded.add(i);
            else if (i > index) newLoaded.add(i - 1);
          });
          this.loadedImages = newLoaded;

          // Shift indices for visible images
          const newVisible = new Set<number>();
          this.visibleImages.forEach(i => {
            if (i < index) newVisible.add(i);
            else if (i > index) newVisible.add(i - 1);
          });
          this.visibleImages = newVisible;
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
