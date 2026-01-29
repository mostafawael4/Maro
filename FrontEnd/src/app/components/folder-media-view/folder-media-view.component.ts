import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderImage, OrdersService } from '../../services/orders.service';

@Component({
  selector: 'app-folder-media-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-media-view.component.html',
  styleUrl: './folder-media-view.component.scss'
})
export class FolderMediaViewComponent {
  private _media: OrderImage[] = [];
  @Input()
  get media(): OrderImage[] { return this._media; }
  set media(value: OrderImage[]) {
    this._media = value;
    this.resetItemsToShow(); // Reset when media changes
  }
  @Input() loading: boolean = false;
  @Input() error: string = '';
  @Input() folderName: string | null = null;
  @Input() showStepper: boolean = false;
  @Input() canGoBack: boolean = false;
  @Input() isAuthenticated: boolean = false;
  @Input() baseUrl: string = '';
  @Input() canSelectBackground: boolean = false;
  @Input() orderId: string | null = null;

  @Output() back = new EventEmitter<void>();
  @Output() openMedia = new EventEmitter<number>();
  @Output() downloadMedia = new EventEmitter<OrderImage>();
  @Output() downloadSelectedMedia = new EventEmitter<OrderImage[]>();
  @Output() deleteMedia = new EventEmitter<OrderImage>();
  @Output() selectVideoThumbnail = new EventEmitter<OrderImage>();
  @Output() selectBackground = new EventEmitter<void>();

  private _searchTerm: string = '';
  get searchTerm(): string { return this._searchTerm; }
  set searchTerm(value: string) {
    this._searchTerm = value;
    this.resetItemsToShow(); // Reset when searching
  }
  selectionMode: boolean = false;
  selectedItems: Set<string> = new Set();
  downloadingItems: Set<string> = new Set();
  loadedMedia: Set<string> = new Set();
  sortOption: 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc' = 'date-asc';
  readonly sortOptions = [
    { value: 'name-asc' as const, label: 'Name (A → Z)' },
    { value: 'name-desc' as const, label: 'Name (Z → A)' },
    { value: 'date-desc' as const, label: 'Date (Newest first)' },
    { value: 'date-asc' as const, label: 'Date (Oldest first)' },
  ];
  showSortOptions = false;
  itemsToShow: number = 12;

  constructor(private ordersService: OrdersService) { }

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

  get visibleMedia(): OrderImage[] {
    return this.filteredMedia.slice(0, this.itemsToShow);
  }

  get masonryOrderedMedia(): { item: OrderImage, actualIndex: number }[] {
    const items = this.visibleMedia;
    const cols = this.columns;
    if (cols <= 1) return items.map((item, i) => ({ item, actualIndex: i }));

    const rowCount = Math.ceil(items.length / cols);
    const result: { item: OrderImage, actualIndex: number }[] = [];

    // Construct the array column-by-column so CSS column-count renders them row-by-row
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rowCount; r++) {
        const index = r * cols + c;
        if (index < items.length) {
          result.push({ item: items[index], actualIndex: index });
        }
      }
    }
    return result;
  }

  get hasMoreItems(): boolean {
    return this.filteredMedia.length > this.itemsToShow;
  }

  get columns(): number {
    if (typeof window === 'undefined') return 4;
    const width = window.innerWidth;
    if (width <= 480) return 1; // Matches SCSS: column-count: 1
    if (width <= 768) return 2; // Matches SCSS: column-count: 2
    if (width <= 1200) return 3; // Matches SCSS: column-count: 3
    return 4; // Default: column-count: 4
  }

  get pageSize(): number {
    // Return a multiple of columns to fill rows exactly
    // We'll load roughly 12-16 items but adjusted to the columns
    const multiplier = this.columns === 1 ? 12 : 3; // 4*3=12, 3*3=9, 2*3=6
    return this.columns * multiplier;
  }

  loadMore(): void {
    this.itemsToShow += this.pageSize;
  }

  private resetItemsToShow(): void {
    this.itemsToShow = this.pageSize * 2; // Show 2 pages initially
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

  async onDownload(media: OrderImage, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.selectionMode) {
      this.toggleSelection(media);
      return;
    }

    if (this.downloadingItems.has(media.filename)) return;

    this.downloadingItems.add(media.filename);
    try {
      const downloadUrl = this.getDownloadUrl(media);

      // Fetch as blob to handle progress and UI state
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();

      // Create temporary download link
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = media.originalName || media.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download error:', err);
      // Fallback to direct download if fetch fails (rare since it's same origin/proxied)
      const link = document.createElement('a');
      link.href = this.getDownloadUrl(media);
      link.download = media.originalName || media.filename;
      link.click();
    } finally {
      this.downloadingItems.delete(media.filename);
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

  isDownloading(media: OrderImage): boolean {
    return this.downloadingItems.has(media.filename);
  }

  onMediaLoad(filename: string): void {
    this.loadedMedia.add(filename);
  }

  isMediaLoaded(filename: string): boolean {
    return this.loadedMedia.has(filename);
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
    this.resetItemsToShow(); // Reset visible count on sort change
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
    return `${image.url}`;
  }

  getDownloadUrl(media: OrderImage): string {
    if (!this.orderId) return this.getImageUrl(media);
    return this.ordersService.getDownloadUrl(this.orderId, media.filename);
  }

  getVideoThumbnailUrl(image: OrderImage): string {
    if (!image.thumbnail) return '';
    return `${image.thumbnail}`;
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
    return match?.label || 'Date (Oldest first)';
  }

  toggleSortOptions(event: Event): void {
    event.stopPropagation();
    this.showSortOptions = !this.showSortOptions;
  }

  selectSortOption(event: Event, option: 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'): void {
    event.stopPropagation();
    this.onSortOptionChange(option);
  }

  getFileNameFromUrl(url: string): string {
    try {
      // remove query params
      const cleanUrl = url.split("?")[0];

      // get last path segment
      const rawName = cleanUrl.substring(cleanUrl.lastIndexOf("/") + 1);

      // decode %20 etc.
      return decodeURIComponent(rawName);
    } catch {
      return "download";
    }
  }

  @HostListener('document:click')
  closeSortOptions(): void {
    if (this.showSortOptions) {
      this.showSortOptions = false;
    }
  }
}

