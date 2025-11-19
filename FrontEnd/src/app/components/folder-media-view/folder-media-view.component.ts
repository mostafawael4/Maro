import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderImage } from '../../services/orders.service';

@Component({
  selector: 'app-folder-media-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-media-view.component.html',
  styleUrl: './folder-media-view.component.scss'
})
export class FolderMediaViewComponent {
  @Input() media: OrderImage[] = [];
  @Input() loading: boolean = false;
  @Input() error: string = '';
  @Input() folderName: string | null = null;
  @Input() showStepper: boolean = false;
  @Input() canGoBack: boolean = false;
  @Input() isAuthenticated: boolean = false;
  @Input() baseUrl: string = '';
  @Input() canSelectBackground: boolean = false;

  @Output() back = new EventEmitter<void>();
  @Output() openMedia = new EventEmitter<number>();
  @Output() downloadMedia = new EventEmitter<OrderImage>();
  @Output() deleteMedia = new EventEmitter<OrderImage>();
  @Output() selectVideoThumbnail = new EventEmitter<OrderImage>();
  @Output() selectBackground = new EventEmitter<void>();

  searchTerm: string = '';

  get hasMedia(): boolean {
    return !!this.media && this.media.length > 0;
  }

  get filteredMedia(): OrderImage[] {
    if (!this.searchTerm.trim()) {
      return this.media;
    }
    const searchLower = this.searchTerm.toLowerCase().trim();
    return this.media.filter(item => {
      const displayName = this.getDisplayName(item).toLowerCase();
      const filename = item.filename?.toLowerCase() || '';
      return displayName.includes(searchLower) || filename.includes(searchLower);
    });
  }

  get hasFilteredMedia(): boolean {
    return !!this.filteredMedia && this.filteredMedia.length > 0;
  }

  onOpenMedia(index: number): void {
    // Get the actual index in the original media array
    const mediaItem = this.filteredMedia[index];
    const actualIndex = this.media.findIndex(m => m.filename === mediaItem.filename);
    this.openMedia.emit(actualIndex >= 0 ? actualIndex : index);
  }

  onDownload(media: OrderImage, event: Event): void {
    event.stopPropagation();
    this.downloadMedia.emit(media);
  }

  onDelete(media: OrderImage, event: Event): void {
    event.stopPropagation();
    this.deleteMedia.emit(media);
  }

  onSelectThumbnail(media: OrderImage, event: Event): void {
    event.stopPropagation();
    this.selectVideoThumbnail.emit(media);
  }

  getImageUrl(image: OrderImage): string {
    return `${this.baseUrl}${image.url}`;
  }

  getVideoThumbnailUrl(image: OrderImage): string {
    if (!image.thumbnail) return '';
    return `${this.baseUrl}${image.thumbnail}`;
  }

  getDisplayName(image: OrderImage): string {
    // Return originalName if available, otherwise fall back to filename
    return image.originalName || image.filename;
  }

  isVideo(file: OrderImage): boolean {
    if (!file.filename) return false;
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
    const ext = file.filename.toLowerCase().substring(file.filename.lastIndexOf('.'));
    return videoExtensions.includes(ext);
  }
}

