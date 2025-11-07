import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GalleryService, GalleryImage } from '../../services/gallery.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  images: GalleryImage[] = [];
  loadedImages: Set<number> = new Set();
  isLoading: boolean = true;

  constructor(private galleryService: GalleryService) {}

  ngOnInit() {
    // Load latest images from gallery
    this.loadLatestImages();
  }

  loadLatestImages() {
    this.isLoading = true;
    this.galleryService.getAllImages().subscribe({
      next: (images) => {
        // Get the last 5 images (most recent ones)
        this.images = images.slice(-10).reverse();
        this.isLoading = false;
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
