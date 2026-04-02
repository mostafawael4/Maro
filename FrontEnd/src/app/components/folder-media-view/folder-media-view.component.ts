import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderImage, OrdersService } from '../../services/orders.service';
import { SortingUtils } from '../../utils/sorting-utils';

@Component({
  selector: 'app-folder-media-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-media-view.component.html',
  styleUrl: './folder-media-view.component.scss'
})
export class FolderMediaViewComponent implements AfterViewInit, OnDestroy {
  private _media: OrderImage[] = [];
  @Input()
  get media(): OrderImage[] { return this._media; }
  set media(value: OrderImage[]) {
    console.log('[FolderMediaView DEBUG] Input media changed:', value);
    if (value && value.length > 0) {
      console.log('[FolderMediaView DEBUG] Sample item:', value[0]);
    }
    this._media = SortingUtils.sortMedia(value);
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
  @Input() zippingFolder: boolean = false;
  @Input() zippingFolderMessage: string = 'Preparing...';
  @Input() zippingProgress: number = 0;

  @Output() back = new EventEmitter<void>();
  @Output() openMedia = new EventEmitter<{ index: number, sortedMedia: OrderImage[] }>();
  @Output() downloadMedia = new EventEmitter<OrderImage>();
  @Output() deleteMedia = new EventEmitter<OrderImage>();
  @Output() selectVideoThumbnail = new EventEmitter<OrderImage>();
  @Output() selectBackground = new EventEmitter<void>();
  @Output() downloadFolder = new EventEmitter<void>();


  downloadingItems: Set<string> = new Set();
  loadedMedia: Set<string> = new Set();
  itemsToShow: number = 12;
  isLoadingMore: boolean = false;

  @ViewChild('scrollAnchor') scrollAnchor!: ElementRef<HTMLElement>;
  private observer: IntersectionObserver | null = null;

  constructor(private ordersService: OrdersService) { }

  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.destroyObserver();
  }

  private setupIntersectionObserver(): void {
    this.destroyObserver();
    if (!this.scrollAnchor?.nativeElement) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && this.hasMoreItems && !this.isLoadingMore) {
          this.loadMore();
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );
    this.observer.observe(this.scrollAnchor.nativeElement);
  }

  private destroyObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  get hasMedia(): boolean {
    return !!this.media && this.media.length > 0;
  }

  get filteredMedia(): OrderImage[] {
    return this.media || [];
  }

  get visibleMedia(): OrderImage[] {
    return this.filteredMedia.slice(0, this.itemsToShow);
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
    if (this.isLoadingMore || !this.hasMoreItems) return;
    this.isLoadingMore = true;
    // Small timeout so the loading indicator renders before we add items
    setTimeout(() => {
      this.itemsToShow += this.pageSize;
      this.isLoadingMore = false;
    }, 150);
  }

  private resetItemsToShow(): void {
    this.itemsToShow = this.pageSize * 2; // Show 2 pages initially
  }

  get hasFilteredMedia(): boolean {
    return !!this.filteredMedia && this.filteredMedia.length > 0;
  }

  onOpenMedia(index: number, event?: Event): void {
    // Since visibleMedia is a slice of filteredMedia (from index 0),
    // the index in visibleMedia is the same as index in filteredMedia
    // Just emit it directly like gallery/home components do
    this.openMedia.emit({ index, sortedMedia: this.filteredMedia });
  }

  onDownload(media: OrderImage, event: Event): void {
    event.stopPropagation();
    const downloadUrl = this.getDownloadUrl(media);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = media.originalName || media.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  onDelete(media: OrderImage, event: Event): void {
    event.stopPropagation();
    this.deleteMedia.emit(media);
  }

  onSelectThumbnail(media: OrderImage, event: Event): void {
    event.stopPropagation();
    this.selectVideoThumbnail.emit(media);
  }

  getImageUrl(image: OrderImage): string {
    // Prefer medium (1200w) for grid display to ensure quality on high-res screens
    // Fallback to thumbnail (400w) or url (original)
    return image.medium || image.thumbnail || image.url;
  }

  getDownloadUrl(media: OrderImage): string {
    if (!this.orderId) return this.getImageUrl(media);
    return this.ordersService.getDownloadUrl(this.orderId, media.filename);
  }

  getVideoThumbnailUrl(image: OrderImage): string {
    if (!image.thumbnail) return '';
    return `${image.thumbnail}`;
  }

  getSrcSet(image: OrderImage): string | null {
    if (this.isVideo(image)) return null;

    // If no optimized versions, return null (browser uses src)
    if (!image.thumbnail && !image.medium && !image.hero) {
      return null;
    }

    const parts = [];
    if (image.thumbnail) parts.push(`${image.thumbnail} 400w`);
    if (image.medium) parts.push(`${image.medium} 1200w`);
    if (image.hero) parts.push(`${image.hero} 2000w`);

    // Also include the original if we want, but usually optimized ones are enough
    // if (image.url) parts.push(`${image.url} 3000w`); // Optional

    return parts.join(', ');
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

  formatSize(bytes?: number): string {
    if (bytes === undefined || bytes === null || bytes === 0) return '';
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(1) + ' MB';
    const gb = mb / 1024;
    return gb.toFixed(1) + ' GB';
  }

}

