import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OrdersService, Order, OrderImage } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';
import { WebsocketService } from '../../services/websocket.service';
import { environment } from '../../../environments/environment';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil, filter, distinctUntilChanged } from 'rxjs/operators';
import { ImageSliderComponent } from '../image-slider/image-slider.component';
import { GalleryImage } from '../../services/gallery.service';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';
import { VideoPosterSelectorComponent } from '../video-poster-selector/video-poster-selector.component';
import { BackgroundImageSelectorComponent } from '../background-image-selector/background-image-selector.component';
import { OrderFolderPanelComponent } from '../order-folder-panel/order-folder-panel.component';
import { FolderMediaViewComponent } from '../folder-media-view/folder-media-view.component';

@Component({
  selector: 'app-order-details',
  standalone: true,
  imports: [
    CommonModule,
    ImageSliderComponent,
    DeleteModalComponent,
    VideoPosterSelectorComponent,
    BackgroundImageSelectorComponent,
    OrderFolderPanelComponent,
    FolderMediaViewComponent
  ],
  templateUrl: './order-details.component.html',
  styleUrl: './order-details.component.scss'
})
export class OrderDetailsComponent implements OnInit, OnDestroy {
  order: Order | null = null;
  loading = true;
  error = '';
  baseUrl = environment.apiUrl;
  isAuthenticated = false;
  isAdmin = false;
  showImageSlider = false;
  currentImageIndex = 0;
  showDeleteModal = false;
  mediaToDelete: OrderImage | null = null;
  deletingMedia = false;
  showVideoPosterSelector = false;
  selectedVideoForThumbnail: OrderImage | null = null;
  showBackgroundImageSelector = false;
  folders: string[] = [];
  foldersLoading = false;
  foldersError = '';
  selectedFolder: string | null = null;
  folderMedia: OrderImage[] = [];
  folderMediaLoading = false;
  folderMediaError = '';
  showDeleteFolderModal = false;
  folderToDelete: string | null = null;
  deletingFolder = false;
  batchDownloading = false;
  zippingFolder = false;
  zippingFolderMessage = 'Preparing...';
  clientEmail: string | null = null;
  private currentDownloadJobId: string | null = null;
  private currentDownloadFolder: string | null = null;
  private pollInterval: any = null;
  private foldersInitialized = false;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ordersService: OrdersService,
    private authService: AuthService,
    private websocketService: WebsocketService
  ) {
    // Get initial auth state immediately (synchronous from localStorage)
    this.isAuthenticated = this.authService.isAuthenticatedValue;
  }

  ngOnInit(): void {
    // Connect WebSocket for background download notifications
    this.websocketService.connect();

    this.websocketService.onFolderDownloadReady()
      .pipe(takeUntil(this.destroy$))
      .subscribe(payload => {
        this.triggerFolderDownload(payload.downloadUrl, payload.folderName);
      });

    this.websocketService.onFolderDownloadError()
      .pipe(takeUntil(this.destroy$))
      .subscribe(payload => {
        this.stopPolling();
        this.zippingFolder = false;
        this.zippingFolderMessage = 'Preparing...';
        alert(payload.error || 'Failed to prepare download. Please try again.');
      });

    // Subscribe to auth changes
    this.authService.isAuthenticated$
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(isAuth => {
        if (isAuth === null) return;

        this.isAuthenticated = !!isAuth;
        this.isAdmin = this.authService.isAdmin();

        const orderId = this.route.snapshot.paramMap.get('id');
        const userEmail = this.route.snapshot.queryParamMap.get('email');

        console.log('OrderDetails Init:', { orderId, userEmail, isAuthenticated: this.isAuthenticated });

        if (!orderId) {
          this.error = 'Order ID not found';
          this.loading = false;
          return;
        }

        // Load order data
        if (this.isAuthenticated) {
          this.loadOrderById(orderId);
        } else if (userEmail) {
          this.clientEmail = userEmail;
          this.loadOrderByEmail(userEmail, orderId);
        } else {
          this.error = 'Access denied';
          this.loading = false;
        }
      });

  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private triggerFolderDownload(downloadUrl: string, folderName: string): void {
    this.stopPolling();
    this.zippingFolder = false;
    this.zippingFolderMessage = 'Preparing...';
    this.currentDownloadJobId = null;
    this.currentDownloadFolder = null;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${folderName}.zip`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private startPolling(orderId: string, folderName: string, jobId: string): void {
    this.stopPolling();
    // Poll every 15 seconds — covers screen-lock / WebSocket disconnect scenarios
    this.pollInterval = setInterval(() => {
      this.ordersService.pollFolderDownloadStatus(orderId, folderName, jobId).subscribe({
        next: (result) => {
          if (result.status === 'ready' && result.downloadUrl) {
            this.triggerFolderDownload(result.downloadUrl, folderName);
          } else if (result.status === 'error') {
            this.stopPolling();
            this.zippingFolder = false;
            this.zippingFolderMessage = 'Preparing...';
            alert(result.error || 'Failed to prepare download. Please try again.');
          }
          // If still 'pending', keep polling
        },
        error: () => {
          // Network error — keep polling silently, don't stop
        }
      });
    }, 15000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  get currentMedia(): OrderImage[] {
    if (this.selectedFolder !== null || this.isAuthenticated) {
      return this.folderMedia;
    }
    return this.order?.media || [];
  }

  loadOrderById(orderId: string, showLoader: boolean = true): void {
    if (showLoader) {
      this.loading = true;
    }
    // Don't clear error here - let it persist if it was set by a previous operation
    this.ordersService.getOrderById(orderId).subscribe({
      next: (response: any) => {
        this.order = response.order || response;

        if (this.isAuthenticated && this.order?._id) {
          this.loadFolders(this.order._id);
          this.loading = false;
        } else {
          this.selectedFolder = null;
          this.foldersLoading = false;
          this.folderMediaLoading = false;
          this.buildClientFoldersFromMedia();
          this.loading = false; // Only stop loading after folders/media decided
        }
      },
      error: (err) => {
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in as admin.';
          this.router.navigate(['/login']);
        } else {
          this.error = 'Failed to load order details';
        }
        this.loading = false;
        console.error('Error loading order:', err);
      }
    });
  }

  loadOrderByEmail(email: string, orderId: string): void {
    this.loading = true;
    this.ordersService.getOrdersByEmail(email).subscribe({
      next: (response) => {
        const foundOrder = response.orders?.find(order => order._id === orderId);
        if (foundOrder) {
          this.order = foundOrder;
          this.buildClientFoldersFromMedia();
        } else {
          this.error = 'Order not found or access denied';
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load order details';
        this.loading = false;
        console.error('Error loading order by email:', err);
      }
    });
  }


  getImageUrl(image: OrderImage): string {
    return image.thumbnail ? image.thumbnail : image.url;
  }

  isVideo(file: OrderImage): boolean {
    if (!file.filename) return false;
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
    const ext = file.filename.toLowerCase().substring(file.filename.lastIndexOf('.'));
    return videoExtensions.includes(ext);
  }

  goBack(): void {
    this.router.navigate(['/orders']);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return '#FFA500';
      case 'in-progress':
        return '#4A90E2';
      case 'completed':
        return '#28A745';
      default:
        return '#6c757d';
    }
  }

  getStatusClass(status: string | undefined | null): string {
    if (!status) return 'status-default';
    return 'status-' + status.toLowerCase().replace(/\s+/g, '-');
  }

  sliderImages: GalleryImage[] = [];

  openImageSlider(event: { index: number, sortedMedia: OrderImage[] } | number) {
    // Handle both old (number only) and new (object) event formats for backward compatibility
    // though in this case we only expect the new format from folder-media-view

    let index: number;
    let mediaList: OrderImage[];

    if (typeof event === 'number') {
      index = event;
      mediaList = this.currentMedia || [];
    } else {
      index = event.index;
      mediaList = event.sortedMedia;
    }

    if (!mediaList || !mediaList[index]) return;

    this.currentImageIndex = index;

    // Map the sorted media list to GalleryImage format
    this.sliderImages = mediaList.map(img => ({
      _id: img.filename,
      filename: img.filename,
      url: img.url,
      medium: img.medium,
      hero: img.hero,
      uploadedAt: new Date(img.uploadedAt)
    }));

    this.showImageSlider = true;
  }

  closeImageSlider() {
    this.showImageSlider = false;
  }

  async downloadImage(media: OrderImage, event?: Event) {
    event?.stopPropagation(); // Prevent opening the slider

    if (!this.order?._id) return;

    const downloadUrl = this.ordersService.getDownloadUrl(this.order._id, media.filename);

    // Simple way to trigger download via backend
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = media.originalName || media.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onDeleteMediaClick(media: OrderImage, event?: Event): void {
    event?.stopPropagation(); // Prevent opening the slider
    if (!this.isAuthenticated) return;
    this.mediaToDelete = media;
    this.showDeleteModal = true;
  }

  onConfirmDeleteMedia(): void {
    if (!this.mediaToDelete || !this.order || this.deletingMedia) return;

    const orderId = this.order._id;
    this.deletingMedia = true;
    this.ordersService.deleteOrderMedia(orderId, [this.mediaToDelete.filename]).subscribe({
      next: (response) => {
        if (response.ok) {
          if (this.order?.media) {
            this.order.media = this.order.media.filter(m => m.filename !== this.mediaToDelete?.filename);
          }
          if (this.isAuthenticated) {
            if (this.selectedFolder) {
              this.folderMedia = this.folderMedia.filter(m => m.filename !== this.mediaToDelete?.filename);
            }
            this.loadFolders(orderId);
          } else {
            this.folderMedia = this.folderMedia.filter(m => m.filename !== this.mediaToDelete?.filename);
          }
        }
        this.showDeleteModal = false;
        this.mediaToDelete = null;
        this.deletingMedia = false;
      },
      error: (err) => {
        console.error('Error deleting media:', err);
        this.error = 'Failed to delete media. Please try again.';
        this.showDeleteModal = false;
        this.mediaToDelete = null;
        this.deletingMedia = false;
        setTimeout(() => {
          this.error = '';
        }, 5000);
      }
    });
  }

  onCancelDeleteMedia(): void {
    if (this.deletingMedia) return;
    this.showDeleteModal = false;
    this.mediaToDelete = null;
  }

  onSelectVideoThumbnail(media: OrderImage, event?: Event): void {
    event?.stopPropagation();
    if (!this.isAuthenticated || !this.isVideo(media)) return;
    this.selectedVideoForThumbnail = media;
    this.showVideoPosterSelector = true;
  }

  onThumbnailSelected(data: { thumbnail: string; thumbnailFilename: string }): void {
    if (!this.order || !this.selectedVideoForThumbnail) return;

    if (this.order.media) {
      const mediaIndex = this.order.media.findIndex(m => m.filename === this.selectedVideoForThumbnail?.filename);
      if (mediaIndex !== -1) {
        this.order.media[mediaIndex].thumbnail = data.thumbnail;
        this.order.media[mediaIndex].thumbnailFilename = data.thumbnailFilename;
      }
    }

    const folderIndex = this.folderMedia.findIndex(m => m.filename === this.selectedVideoForThumbnail?.filename);
    if (folderIndex !== -1) {
      this.folderMedia[folderIndex].thumbnail = data.thumbnail;
      this.folderMedia[folderIndex].thumbnailFilename = data.thumbnailFilename;
    }

    if (this.isAuthenticated && this.order._id && this.selectedFolder) {
      this.selectFolder(this.selectedFolder);
    }
  }

  onCloseVideoPosterSelector(): void {
    this.showVideoPosterSelector = false;
    this.selectedVideoForThumbnail = null;
  }

  getVideoThumbnailUrl(media: OrderImage): string {
    if (media.thumbnail) {
      return `${media.thumbnail}`;
    }
    return '';
  }

  onSelectBackgroundImage(): void {
    if (!this.isAuthenticated || !this.order) return;
    this.showBackgroundImageSelector = true;
  }

  onBackgroundImageSelected(data: { backgroundImage: string; backgroundImageFilename: string; backgroundImageThumbnail: string | null }): void {
    if (!this.order) return;

    // Ensure orderBackground exists (for legacy orders)
    if (!this.order.orderBackground) {
      this.order.orderBackground = {
        image: data.backgroundImage,
        thumbnail: data.backgroundImageThumbnail ?? undefined,
        filename: data.backgroundImageFilename,
        selectedAt: new Date()
      };
    } else {
      this.order.orderBackground.image = data.backgroundImage;
      this.order.orderBackground.thumbnail = data.backgroundImageThumbnail ?? undefined;
      this.order.orderBackground.filename = data.backgroundImageFilename;
      this.order.orderBackground.selectedAt = new Date();
    }

    // Reload order to get updated data with background image
    if (this.isAuthenticated && this.order._id) {
      this.loadOrderById(this.order._id, false);
    }
  }

  onCloseBackgroundImageSelector(): void {
    this.showBackgroundImageSelector = false;
  }

  getImageOnlyMedia(): OrderImage[] {
    if (!this.currentMedia) return [];
    return this.currentMedia.filter(m => !this.isVideo(m) || (this.isVideo(m) && m.thumbnail));
  }

  exitFolderView(): void {
    this.selectedFolder = null;
    this.folderMediaError = '';
    this.folderMediaLoading = false;

    if (!this.isAuthenticated) {
      this.folderMedia = this.order?.media || [];
    } else {
      this.folderMedia = [];
    }
  }

  private loadFolders(orderId: string): void {
    this.foldersLoading = true;
    this.foldersError = '';
    const previouslySelected = this.selectedFolder;
    const hadSelection = !!previouslySelected;

    this.ordersService.getOrderFolders(orderId).subscribe({
      next: (response) => {
        this.folders = response.folders || [];
        this.foldersLoading = false;

        if (!this.folders.length) {
          this.selectedFolder = null;
          this.folderMedia = [];
          this.folderMediaLoading = false;
          this.foldersInitialized = true;
          return;
        }

        if (hadSelection && previouslySelected && this.folders.includes(previouslySelected)) {
          this.selectFolder(previouslySelected);
        } else if (!this.foldersInitialized) {
          this.selectedFolder = null;
          this.folderMedia = [];
          this.folderMediaLoading = false;
        }

        this.foldersInitialized = true;
      },
      error: (err) => {
        this.foldersLoading = false;
        this.foldersError = err.error?.message || 'Failed to load folders';
        console.error('Error loading folders:', err);
      }
    });
  }

  selectFolder(folderName: string): void {
    if (!this.order?._id) return;
    this.selectedFolder = folderName;
    this.folderMediaError = '';

    if (!this.isAuthenticated) {
      const media = this.order?.media || [];
      this.folderMedia = media.filter(item => item.foldername === folderName);
      this.folderMediaLoading = false;
      return;
    }

    this.folderMediaLoading = true;
    this.folderMedia = [];

    this.ordersService.getFolderMedia(this.order._id, folderName).subscribe({
      next: (response) => {
        this.folderMedia = response.media || [];
        this.folderMediaLoading = false;
      },
      error: (err) => {
        this.folderMediaLoading = false;
        this.folderMediaError = err.error?.message || 'Failed to load folder media';
        console.error('Error loading folder media:', err);
      }
    });
  }

  private buildClientFoldersFromMedia(): void {
    if (this.isAuthenticated) {
      return;
    }

    const media = this.order?.media || [];
    if (!media.length) {
      this.folders = [];
      this.folderMedia = [];
      this.selectedFolder = null;
      this.foldersInitialized = true;
      return;
    }

    const folderSet = new Set<string>();
    media.forEach(item => {
      if (item.foldername) {
        folderSet.add(item.foldername);
      }
    });

    this.folders = Array.from(folderSet);

    if (this.folders.length === 0) {
      this.folderMedia = media;
      this.selectedFolder = null;
    } else {
      // If folders exist, we don't show media directly anymore
      // Unless they come back from a folder
      if (!this.selectedFolder) {
        this.folderMedia = [];
      } else {
        // Re-filter if they were in a folder (unlikely on initial load but good for stability)
        this.folderMedia = media.filter(item => item.foldername === this.selectedFolder);
      }
    }

    this.foldersInitialized = true;
    this.foldersLoading = false;
  }

  // Folder deletion methods
  onDeleteFolder(folderName: string): void {
    if (!this.isAuthenticated || !this.order?._id) return;
    this.folderToDelete = folderName;
    this.showDeleteFolderModal = true;
  }

  onConfirmDeleteFolder(): void {
    if (!this.folderToDelete || !this.order?._id || this.deletingFolder) return;

    const orderId = this.order._id;
    this.deletingFolder = true;
    this.error = ''; // Clear any previous errors
    this.ordersService.deleteOrderFolder(orderId, this.folderToDelete).subscribe({
      next: (response) => {
        // Check if there were any failed deletions
        if (response.failedFiles && response.failedFiles.length > 0) {
          // Partial failure - some files couldn't be deleted
          this.error = response.message || `Failed to delete some files in folder '${this.folderToDelete}'.`;
          this.deletingFolder = false;
          this.showDeleteFolderModal = false;
          this.folderToDelete = null;
          setTimeout(() => {
            this.error = '';
          }, 8000); // Show error for 8 seconds
          return;
        }

        if (response.ok) {
          // Clear error on success
          this.error = '';

          // If the deleted folder was selected, exit folder view
          if (this.selectedFolder === this.folderToDelete) {
            this.exitFolderView();
          }

          // Reload folders to update the list
          if (this.isAuthenticated && this.order?._id) {
            this.loadFolders(this.order._id);
          } else {
            // For clients, rebuild from media
            this.buildClientFoldersFromMedia();
          }

          // Reload order to get updated media (including background image)
          if (this.order?._id) {
            this.loadOrderById(this.order._id, false);
          }
        } else {
          // Response indicates failure
          this.error = response.message || 'Failed to delete folder. Please try again.';
          this.deletingFolder = false;
          this.showDeleteFolderModal = false;
          this.folderToDelete = null;
          setTimeout(() => {
            this.error = '';
          }, 8000);
          return;
        }

        this.showDeleteFolderModal = false;
        this.folderToDelete = null;
        this.deletingFolder = false;
      },
      error: (err) => {
        console.error('Error deleting folder:', err);
        this.error = err.error?.message || 'Failed to delete folder. Please try again.';
        this.showDeleteFolderModal = false;
        this.folderToDelete = null;
        this.deletingFolder = false;
        setTimeout(() => {
          this.error = '';
        }, 8000); // Increased to 8 seconds
      }
    });
  }

  onCancelDeleteFolder(): void {
    if (this.deletingFolder) return;
    this.showDeleteFolderModal = false;
    this.folderToDelete = null;
  }

  getDeleteFolderMessage(): string {
    if (!this.folderToDelete) {
      return 'Are you sure you want to delete this folder and all its contents?';
    }
    return `Are you sure you want to delete the folder "${this.folderToDelete}" and all its contents?`;
  }

  onDownloadFolder(folderName: string): void {
    if (!this.order?._id) return;

    this.zippingFolder = true;
    this.zippingFolderMessage = 'Preparing...';

    this.ordersService.prepareFolderDownload(this.order._id, folderName, this.clientEmail).subscribe({
      next: ({ jobId, totalFiles }) => {
        this.currentDownloadJobId = jobId;
        this.currentDownloadFolder = folderName;
        this.zippingFolderMessage = `Building zip (${totalFiles} files)...`;
        // Start polling as fallback for when WebSocket is unavailable (screen lock, background tab)
        this.startPolling(this.order!._id, folderName, jobId);
      },
      error: () => {
        this.zippingFolder = false;
        this.zippingFolderMessage = 'Preparing...';
        alert('Failed to start download preparation. Please try again.');
      }
    });
  }
}

