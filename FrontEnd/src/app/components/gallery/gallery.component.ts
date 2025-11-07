import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GalleryService, GalleryImage } from '../../services/gallery.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss'
})
export class GalleryComponent implements OnInit {
  images: GalleryImage[] = [];
  loadedImages: Set<number> = new Set();
  isLoading: boolean = true;
  errorMessage: string = '';

  constructor(private galleryService: GalleryService) {}

  ngOnInit() {
    this.loadGalleryImages();
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
}
