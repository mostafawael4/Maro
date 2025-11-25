import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
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
  @Output() downloadSelectedMedia = new EventEmitter<OrderImage[]>();
  @Output() deleteMedia = new EventEmitter<OrderImage>();
  @Output() selectVideoThumbnail = new EventEmitter<OrderImage>();
  @Output() selectBackground = new EventEmitter<void>();

  searchTerm: string = '';
  selectionMode: boolean = false;
  selectedItems: Set<string> = new Set();
  sortOption: 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc' = 'date-desc';
  readonly sortOptions = [
    { value: 'name-asc' as const, label: 'Name (A → Z)' },
    { value: 'name-desc' as const, label: 'Name (Z → A)' },
    { value: 'date-desc' as const, label: 'Date (Newest first)' },
    { value: 'date-asc' as const, label: 'Date (Oldest first)' },
  ];
  showSortOptions = false;

  get hasMedia(): boolean {
    return !!this.media && this.media.length > 0;
  }

  get filteredMedia(): OrderImage[] {
    const trimmedSearch = this.searchTerm.trim();
    const filtered = !trimmedSearch
      ? this.media
      : this.media.filter(item => {
          const searchLower = trimmedSearch.toLowerCase();
          const displayName = this.getDisplayName(item).toLowerCase();
          const filename = item.filename?.toLowerCase() || '';
          return displayName.includes(searchLower) || filename.includes(searchLower);
        });

    return this.sortMedia(filtered);
  }

  get hasFilteredMedia(): boolean {
    return !!this.filteredMedia && this.filteredMedia.length > 0;
  }

  onOpenMedia(index: number, event?: Event): void {
    // If in selection mode, toggle selection instead of opening slider
    if (this.selectionMode) {
      event?.stopPropagation();
      const mediaItem = this.filteredMedia[index];
      this.toggleSelection(mediaItem);
      return;
    }
    
    // Get the actual index in the original media array
    const mediaItem = this.filteredMedia[index];
    const actualIndex = this.media.findIndex(m => m.filename === mediaItem.filename);
    this.openMedia.emit(actualIndex >= 0 ? actualIndex : index);
  }

  onDownload(media: OrderImage, event: Event): void {
    event.stopPropagation();
    if (this.selectionMode) {
      this.toggleSelection(media);
    } else {
      this.downloadMedia.emit(media);
    }
  }

  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedItems.clear();
    }
  }

  toggleSelection(media: OrderImage): void {
    const key = media.filename || media._id || '';
    if (this.selectedItems.has(key)) {
      this.selectedItems.delete(key);
    } else {
      this.selectedItems.add(key);
    }
  }

  isSelected(media: OrderImage): boolean {
    const key = media.filename || media._id || '';
    return this.selectedItems.has(key);
  }

  getSelectedCount(): number {
    return this.selectedItems.size;
  }

  onDownloadSelected(): void {
    const selectedMedia = this.filteredMedia.filter(media => {
      const key = media.filename || media._id || '';
      return this.selectedItems.has(key);
    });
    if (selectedMedia.length > 0) {
      this.downloadSelectedMedia.emit(selectedMedia);
      this.selectedItems.clear();
      this.selectionMode = false;
    }
  }

  selectAll(): void {
    this.filteredMedia.forEach(media => {
      const key = media.filename || media._id || '';
      this.selectedItems.add(key);
    });
  }

  deselectAll(): void {
    this.selectedItems.clear();
  }

  onSortOptionChange(option: 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'): void {
    this.sortOption = option;
    this.showSortOptions = false;
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

  private sortMedia(media: OrderImage[]): OrderImage[] {
    if (!media?.length) {
      return media;
    }

    const [field, direction] = this.sortOption.split('-') as ['name' | 'date', 'asc' | 'desc'];
    const sorted = [...media].sort((a, b) => {
      if (field === 'name') {
        const nameA = this.getDisplayName(a)?.toLowerCase() || '';
        const nameB = this.getDisplayName(b)?.toLowerCase() || '';
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      }

      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return dateA - dateB;
    });

    return direction === 'asc' ? sorted : sorted.reverse();
  }

  get currentSortLabel(): string {
    const match = this.sortOptions.find(option => option.value === this.sortOption);
    return match?.label || 'Date (Newest first)';
  }

  toggleSortOptions(event: Event): void {
    event.stopPropagation();
    this.showSortOptions = !this.showSortOptions;
  }

  selectSortOption(event: Event, option: 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'): void {
    event.stopPropagation();
    this.onSortOptionChange(option);
  }

  @HostListener('document:click')
  closeSortOptions(): void {
    if (this.showSortOptions) {
      this.showSortOptions = false;
    }
  }
}

