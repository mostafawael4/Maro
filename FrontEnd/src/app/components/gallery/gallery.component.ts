import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GalleryService, GalleryImage } from '../../services/gallery.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { UploadModalComponent } from '../upload-modal/upload-modal.component';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule, UploadModalComponent],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss'
})
export class GalleryComponent implements OnInit {
  images: GalleryImage[] = [];
  loadedImages: Set<number> = new Set();
  isLoading: boolean = true;
  errorMessage: string = '';
  isAuthenticated: boolean = false;
  showUploadModal: boolean = false;

  constructor(
    private galleryService: GalleryService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadGalleryImages();
    
    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth;
    });
  }

  loadGalleryImages() {
    this.isLoading = true;
    this.galleryService.getAllImages().subscribe({
      next: (images) => {
        this.images = images;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading gallery images:', error);
        this.errorMessage = 'Failed to load gallery images. Please try again later.';
        this.isLoading = false;
      }
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
}
