import { Component, Input, Output, EventEmitter, HostListener, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GalleryImage } from '../../services/gallery.service';
import { HomePageImage } from '../../services/homepage.service';
import { environment } from '../../../environments/environment';

export type ImageType = GalleryImage | HomePageImage;

@Component({
  selector: 'app-image-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-slider.component.html',
  styleUrl: './image-slider.component.scss'
})
export class ImageSliderComponent {
  @Input() images: ImageType[] = [];
  @Input() currentIndex: number = 0;
  @Input() show: boolean = false;
  @Input() variant: 'gallery' | 'folder' = 'gallery';
  @Output() close = new EventEmitter<void>();

  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  // Listen for ESC key to close slider
  @HostListener('document:keydown.escape', ['$event'])
  handleEscape() {
    if (this.show) {
      this.closeSlider();
    }
  }

  // Listen for arrow keys to navigate
  @HostListener('document:keydown.arrowleft', ['$event'])
  handleArrowLeft() {
    if (this.show) {
      this.previousImage();
    }
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  handleArrowRight() {
    if (this.show) {
      this.nextImage();
    }
  }

  closeSlider() {
    this.close.emit();
  }

  previousImage() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else {
      // Loop to last image
      this.currentIndex = this.images.length - 1;
    }
  }

  nextImage() {
    if (this.currentIndex < this.images.length - 1) {
      this.currentIndex++;
    } else {
      // Loop to first image
      this.currentIndex = 0;
    }
  }

  getCurrentImage(): ImageType | null {
    if (this.images && this.images.length > 0 && this.currentIndex >= 0 && this.currentIndex < this.images.length) {
      return this.images[this.currentIndex];
    }
    return null;
  }

  getImageUrl(image: ImageType): string {
    // Cast to any to access properties
    const img = image as any;

    // Prefer Hero (2000w) or Medium (1200w) for display
    // Avoid displaying the original URL (img.url) directly if optimized versions exist,
    // to save bandwidth and improve load performance.
    let url = img.hero || img.medium || img.url;

    // If the URL is relative, prepend the backend URL
    if (url && url.startsWith('/')) {
      return `${environment.apiUrl}${url}`;
    }
    return url;
  }

  isVideo(image: ImageType): boolean {
    if (!image.filename) return false;
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
    const ext = image.filename.toLowerCase().substring(image.filename.lastIndexOf('.'));
    return videoExtensions.includes(ext);
  }

  // Prevent closing when clicking on the image
  onImageClick(event: Event) {
    event.stopPropagation();
  }

  // Stop propagation for button clicks
  onButtonClick(event: Event, action: 'previous' | 'next' | 'close') {
    event.stopPropagation();
    if (action === 'previous') {
      this.previousImage();
    } else if (action === 'next') {
      this.nextImage();
    } else if (action === 'close') {
      this.closeSlider();
    }
  }
  getSrcSet(image: ImageType): string {
    if (this.isVideo(image)) return '';

    // Cast to any to access optional properties if TypeScript complains, 
    // or assume ImageType has them (which it does via union)
    const img = image as any;

    // If no optimized versions, return empty (browser uses src)
    if (!img.thumbnail && !img.medium && !img.hero) {
      return '';
    }

    const parts = [];
    if (img.thumbnail) parts.push(`${img.thumbnail} 400w`);
    if (img.medium) parts.push(`${img.medium} 1200w`);
    if (img.hero) parts.push(`${img.hero} 2000w`);

    // Also include original if it's absolute URL, roughly assuming it's large? 
    // Or maybe skip original in srcset to force usage of optimized ones?
    // Let's include original as fallback for largest if needed, but 'hero' should be enough.
    // Actually, let's just use the optimized ones + original as default in src.

    return parts.join(', ');
  }
}

