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
    // Load random images from backend API
    this.loadRandomImages();
  }

  loadRandomImages() {
    this.isLoading = true;
    this.galleryService.getRandomImages(6).subscribe({
      next: (images) => {
        this.images = images;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading random images:', error);
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
