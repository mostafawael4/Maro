import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OrdersService, Order, OrderImage } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { ImageSliderComponent } from '../image-slider/image-slider.component';
import { GalleryImage } from '../../services/gallery.service';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';
import { VideoPosterSelectorComponent } from '../video-poster-selector/video-poster-selector.component';
import { BackgroundImageSelectorComponent } from '../background-image-selector/background-image-selector.component';
import { OrderFolderPanelComponent } from '../order-folder-panel/order-folder-panel.component';
import { FolderMediaViewComponent } from '../folder-media-view/folder-media-view.component';
import JSZip from 'jszip';

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
  private foldersInitialized = false;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ordersService: OrdersService,
    private authService: AuthService
  ) {
    // Get initial auth state immediately (synchronous from localStorage)
    this.isAuthenticated = this.authService.isAuthenticatedValue;
  }

  ngOnInit(): void {
    // Subscribe to auth changes
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
      
      // Load order data immediately (localStorage auth is already set)
      const orderId = this.route.snapshot.paramMap.get('id');
      const userEmail = this.route.snapshot.queryParamMap.get('email');
      
      if (isAuth === null) {
        return;
      }
  
      if (!orderId) {
        this.error = 'Order ID not found';
        this.loading = false;
        return;
      }
      console.log(this.isAuthenticated === true)
      // Admin users: use getOrderById
      if (this.isAuthenticated === true) {
        this.loadOrderById(orderId);
      } 
      // Normal users: use getOrdersByEmail
      else if (userEmail) {
        this.loadOrderByEmail(userEmail, orderId);
      }
      else{
        this.error = 'Access denied';
        this.loading = false;
      }
    });

  } 

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
        // Handle if response is wrapped in an object with 'order' property
        this.order = response.order || response;
        this.loading = false;

        if (this.isAuthenticated && this.order?._id) {
          this.loadFolders(this.order._id);
        } else {
          this.selectedFolder = null;
          this.folderMedia = this.order?.media || [];
          this.foldersLoading = false;
          this.folderMediaLoading = false;
          this.buildClientFoldersFromMedia();
        }
      },
      error: (err) => {
        if (err.status === 401) {
          this.error = 'Authentication required. Please log in as admin.';
          setTimeout(() => this.router.navigate(['/orders']), 2000);
        } else {
          this.error = 'Failed to load order details';
        }
        this.loading = false;
        console.error('Error loading order:', err);
      }
    });
  }

  loadOrderByEmail(email: string, orderId: string): void {
    this.ordersService.getOrdersByEmail(email).subscribe({
      next: (response) => {
        // Find the specific order by ID from the array of orders
        const foundOrder = response.orders?.find(order => order._id === orderId);
        if (foundOrder) {
          this.order = foundOrder;
          this.folderMedia = this.order.media || [];
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
    return `${this.baseUrl}${image.url}`;
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

  openImageSlider(index: number) {
    const media = this.currentMedia;
    if (!media || !media[index]) return;
    this.currentImageIndex = index;
    this.showImageSlider = true;
  }

  closeImageSlider() {
    this.showImageSlider = false;
  }

  getSliderImages(): GalleryImage[] {
    if (!this.currentMedia) return [];
    // Include both images and videos in the slider
    return this.currentMedia.map(img => ({
      _id: img.filename,
      filename: img.filename,
      url: img.url,
      uploadedAt: new Date(img.uploadedAt)
    }));
  }

  async downloadImage(media: OrderImage, event?: Event) {
    event?.stopPropagation(); // Prevent opening the slider
    
    try {
      const mediaUrl = this.getImageUrl(media);
      
      // Fetch the media file as a blob
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = media.originalName || media.filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading media:', error);
      alert(`Failed to download ${this.isVideo(media) ? 'video' : 'image'}. Please try again.`);
    }
  }

  async downloadSelectedImages(mediaArray: OrderImage[]) {
    if (!mediaArray || mediaArray.length === 0) return;

    try {
      // Download files sequentially to avoid browser blocking multiple downloads
      for (let i = 0; i < mediaArray.length; i++) {
        const media = mediaArray[i];
        const mediaUrl = this.getImageUrl(media);
        
        // Fetch the media file as a blob
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        
        // Create a blob URL
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Create a temporary anchor element to trigger download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = media.originalName || media.filename;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the blob URL
        window.URL.revokeObjectURL(blobUrl);
        
        // Small delay between downloads to prevent browser from blocking
        if (i < mediaArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    } catch (error) {
      console.error('Error downloading selected media:', error);
      alert('Failed to download some files. Please try again.');
    }
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
      return `${this.baseUrl}${media.thumbnail}`;
    }
    return '';
  }

  onSelectBackgroundImage(): void {
    if (!this.isAuthenticated || !this.order) return;
    this.showBackgroundImageSelector = true;
  }

  onBackgroundImageSelected(data: { backgroundImage: string; backgroundImageFilename: string }): void {
    if (!this.order) return;

    // Ensure orderBackground exists (for legacy orders)
    if (!this.order.orderBackground) {
      this.order.orderBackground = {
        image: data.backgroundImage,
        filename: data.backgroundImageFilename,
        selectedAt: new Date()
      };
    } else {
      this.order.orderBackground.image = data.backgroundImage;
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
    return this.currentMedia.filter(m => !this.isVideo(m));
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
    } else {
      this.folderMedia = [];
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

  async onDownloadFolder(folderName: string): Promise<void> {
    if (!this.order?._id) return;

    try {
      // Show loading state (you can add a loading variable if needed)
      console.log(`Downloading folder: ${folderName}`);

      // Fetch folder media
      let mediaToDownload: OrderImage[] = [];
      
      if (this.isAuthenticated) {
        // For admin, fetch from API
        const response = await this.ordersService.getFolderMedia(this.order._id, folderName).toPromise();
        mediaToDownload = response?.media || [];
      } else {
        // For clients, filter from existing media
        mediaToDownload = (this.order?.media || []).filter(item => item.foldername === folderName);
      }

      if (mediaToDownload.length === 0) {
        alert('No media found in this folder');
        return;
      }

      // Create a new JSZip instance
      const zip = new JSZip();
      const folder = zip.folder(folderName);

      if (!folder) {
        throw new Error('Failed to create folder in zip');
      }

      // Download each file and add to zip
      const downloadPromises = mediaToDownload.map(async (media) => {
        try {
          const mediaUrl = this.getImageUrl(media);
          const response = await fetch(mediaUrl);
          const blob = await response.blob();
          const filename = media.originalName || media.filename;
          folder.file(filename, blob);
        } catch (error) {
          console.error(`Failed to download ${media.filename}:`, error);
          // Continue with other files even if one fails
        }
      });

      // Wait for all downloads to complete
      await Promise.all(downloadPromises);

      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Create download link
      const downloadUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${folderName}.zip`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(downloadUrl);

      console.log(`Successfully downloaded folder: ${folderName}`);
    } catch (error) {
      console.error('Error downloading folder:', error);
      alert('Failed to download folder. Please try again.');
    }
  }
}
