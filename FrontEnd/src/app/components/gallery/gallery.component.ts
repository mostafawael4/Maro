import { Component, OnInit, AfterViewInit, OnDestroy, PLATFORM_ID, Inject, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GalleryService, GalleryImage } from '../../services/gallery.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { UploadModalComponent } from '../upload-modal/upload-modal.component';
import { ImageSliderComponent } from '../image-slider/image-slider.component';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule, UploadModalComponent, ImageSliderComponent, DeleteModalComponent],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss'
})
export class GalleryComponent implements OnInit, AfterViewInit, OnDestroy {
  images: GalleryImage[] = [];
  loadedImages: Set<number> = new Set();
  visibleImages: Set<number> = new Set();
  isLoading: boolean = true;
  errorMessage: string = '';
  isAuthenticated: boolean = false;
  isAdmin: boolean = false;
  showUploadModal: boolean = false;
  showImageSlider: boolean = false;
  currentImageIndex: number = 0;
  showDeleteModal: boolean = false;
  imageToDelete: GalleryImage | null = null;
  deletingImageId: string | null = null;
  deleteModalLoading = false;
  private intersectionObserver?: IntersectionObserver;
  private isBrowser: boolean;

  // Pagination state
  currentPage: number = 1;
  pageSize: number = 8;
  hasMore: boolean = true;
  isLoadingMore: boolean = false;

  constructor(
    private galleryService: GalleryService,
    private authService: AuthService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit() {
    this.loadGalleryImages();

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

  ngAfterViewInit() {
    // Setup Intersection Observer for scroll animations (browser only)
    if (this.isBrowser) {
      setTimeout(() => {
        this.setupIntersectionObserver();
        this.observeAllImages();
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
    // Clean up observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  setupIntersectionObserver() {
    if (!this.isBrowser) return;

    const options = {
      root: null,
      rootMargin: '50px', // Start animation slightly before element enters viewport
      threshold: 0.1
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const index = parseInt(element.getAttribute('data-index') || '0', 10);
          // Add to visible set to trigger animation
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

  loadGalleryImages() {
    this.isLoading = true;
    this.galleryService.getAllImages(1, this.pageSize).subscribe({
      next: (response) => {
        this.images = response.items;
        this.hasMore = response.hasMore;
        this.currentPage = 1;
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
        console.error('Error loading gallery images:', error);
        this.errorMessage = 'Failed to load gallery images. Please try again later.';
        this.isLoading = false;
      }
    });
  }

  loadMoreImages() {
    if (this.isLoadingMore || !this.hasMore) return;

    this.isLoadingMore = true;
    const nextPage = this.currentPage + 1;

    this.galleryService.getAllImages(nextPage, this.pageSize).subscribe({
      next: (response) => {
        const currentLength = this.images.length;
        this.images = [...this.images, ...response.items];
        this.hasMore = response.hasMore;
        this.currentPage = nextPage;
        this.isLoadingMore = false;

        // Observe new items
        if (this.isBrowser) {
          setTimeout(() => {
            const allItems = document.querySelectorAll('.photo-item');
            for (let i = currentLength; i < allItems.length; i++) {
              this.observeImage(allItems[i] as HTMLElement);
            }
          }, 100);
        }
      },
      error: (error) => {
        console.error('Error loading more gallery images:', error);
        this.isLoadingMore = false;
      }
    });
  }

  observeAllImages() {
    if (!this.isBrowser) return;

    const photoItems = document.querySelectorAll('.photo-item');
    photoItems.forEach((item) => {
      this.observeImage(item as HTMLElement);
    });
  }

  onImageLoad(index: number) {
    this.loadedImages.add(index);
  }

  onImageError(index: number, image: GalleryImage) {
    console.error(`Failed to load image:`, this.getImageUrl(image));
    this.loadedImages.add(index);
  }

  isImageLoaded(index: number): boolean {
    return this.loadedImages.has(index);
  }

  getImageUrl(image: GalleryImage): string {
    // If the URL is relative, prepend the backend URL
    if (image.url.startsWith('/')) {
      return `${environment.apiUrl}${image.url}`;
    }
    return image.url;
  }

  // Upload Modal methods
  openUploadModal() {
    this.showUploadModal = true;
  }

  closeUploadModal() {
    this.showUploadModal = false;
  }

  onUploadComplete() {
    // Reload gallery images after successful upload
    this.loadGalleryImages();
  }

  // Upload function to pass to UploadModalComponent
  uploadGalleryImages(files: File[]) {
    return this.galleryService.uploadImages(files);
  }

  // Image Slider methods
  openImageSlider(index: number) {
    this.currentImageIndex = index;
    this.showImageSlider = true;
  }

  closeImageSlider() {
    this.showImageSlider = false;
  }

  // Delete modal methods
  onDeleteClick(image: GalleryImage, event: Event): void {
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

  // Delete image method
  deleteImage(image: GalleryImage): void {
    this.deleteModalLoading = true;
    this.deletingImageId = image._id;

    this.galleryService.deleteImage(image.filename).subscribe({
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
