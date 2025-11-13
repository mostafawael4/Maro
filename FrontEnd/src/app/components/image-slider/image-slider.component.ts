import { Component, Input, Output, EventEmitter, HostListener, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { GalleryImage } from '../../services/gallery.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-image-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-slider.component.html',
  styleUrl: './image-slider.component.scss'
})
export class ImageSliderComponent {
  @Input() images: GalleryImage[] = [];
  @Input() currentIndex: number = 0;
  @Input() show: boolean = false;
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

  getCurrentImage(): GalleryImage | null {
    if (this.images && this.images.length > 0 && this.currentIndex >= 0 && this.currentIndex < this.images.length) {
      return this.images[this.currentIndex];
    }
    return null;
  }

  getImageUrl(image: GalleryImage): string {
    // If the URL is relative, prepend the backend URL
    if (image.url.startsWith('/')) {
      return `${environment.apiUrl}${image.url}`;
    }
    return image.url;
  }

  isVideo(image: GalleryImage): boolean {
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
}

