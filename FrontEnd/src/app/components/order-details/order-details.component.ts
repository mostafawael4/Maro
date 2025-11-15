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

@Component({
  selector: 'app-order-details',
  standalone: true,
  imports: [CommonModule, ImageSliderComponent, DeleteModalComponent, VideoPosterSelectorComponent],
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
  mediaFilter: 'all' | 'images' | 'videos' = 'all';
  showDeleteModal = false;
  mediaToDelete: OrderImage | null = null;
  deletingMedia = false;
  showVideoPosterSelector = false;
  selectedVideoForThumbnail: OrderImage | null = null;
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
    });

    // Load order data immediately (localStorage auth is already set)
    const orderId = this.route.snapshot.paramMap.get('id');
    const userEmail = this.route.snapshot.queryParamMap.get('email');
    
    if (!orderId) {
      this.error = 'Order ID not found';
      this.loading = false;
      return;
    }
    
    // Admin users: use getOrderById
    if (this.isAuthenticated) {
      this.loadOrderById(orderId);
    } 
    // Normal users: use getOrdersByEmail
    else if (userEmail) {
      this.loadOrderByEmail(userEmail, orderId);
    } 
    else {
      this.error = 'Access denied';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadOrderById(orderId: string): void {
    this.ordersService.getOrderById(orderId).subscribe({
      next: (response: any) => {
        // Handle if response is wrapped in an object with 'order' property
        this.order = response.order || response;
        this.loading = false;
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
        // Verify the order ID matches
        if (response.order && response.order._id === orderId) {
          this.order = response.order;
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

  openImageSlider(index: number) {
    // Find the clicked media in the filtered array
    const clickedMedia = this.getFilteredMedia()[index];
    if (!clickedMedia) return;
    
    // Find this media in the full media array (for slider - includes both images and videos)
    const allMedia = this.order?.media || [];
    const actualIndex = allMedia.findIndex(m => m.filename === clickedMedia.filename);
    
    this.currentImageIndex = actualIndex >= 0 ? actualIndex : 0;
    this.showImageSlider = true;
  }

  setMediaFilter(filter: 'all' | 'images' | 'videos') {
    this.mediaFilter = filter;
  }

  getFilteredMedia(): OrderImage[] {
    if (!this.order?.media) return [];
    if (this.mediaFilter === 'all') return this.order.media;
    if (this.mediaFilter === 'images') return this.order.media.filter(m => !this.isVideo(m));
    if (this.mediaFilter === 'videos') return this.order.media.filter(m => this.isVideo(m));
    return this.order.media;
  }

  getImagesCount(): number {
    if (!this.order?.media) return 0;
    return this.order.media.filter(m => !this.isVideo(m)).length;
  }

  getVideosCount(): number {
    if (!this.order?.media) return 0;
    return this.order.media.filter(m => this.isVideo(m)).length;
  }

  closeImageSlider() {
    this.showImageSlider = false;
  }

  getSliderImages(): GalleryImage[] {
    if (!this.order?.media) return [];
    // Include both images and videos in the slider
    return this.order.media.map(img => ({
      _id: img.filename,
      filename: img.filename,
      url: img.url,
      uploadedAt: new Date(img.uploadedAt)
    }));
  }

  async downloadImage(media: OrderImage, event: Event) {
    event.stopPropagation(); // Prevent opening the slider
    
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
      link.download = media.filename;
      
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

  onDeleteMediaClick(media: OrderImage, event: Event): void {
    event.stopPropagation(); // Prevent opening the slider
    if (!this.isAuthenticated) return;
    this.mediaToDelete = media;
    this.showDeleteModal = true;
  }

  onConfirmDeleteMedia(): void {
    if (!this.mediaToDelete || !this.order) return;
    
    const orderId = this.order._id;
    this.deletingMedia = true;
    this.ordersService.deleteOrderMedia(orderId, [this.mediaToDelete.filename]).subscribe({
      next: (response) => {
        if (response.ok) {
          // Remove the media from the order
          if (this.order?.media) {
            this.order.media = this.order.media.filter(m => m.filename !== this.mediaToDelete?.filename);
          }
          // Reload the order to get updated data
          this.loadOrderById(orderId);
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
    this.showDeleteModal = false;
    this.mediaToDelete = null;
  }

  onSelectVideoThumbnail(media: OrderImage, event: Event): void {
    event.stopPropagation();
    if (!this.isAuthenticated || !this.isVideo(media)) return;
    this.selectedVideoForThumbnail = media;
    this.showVideoPosterSelector = true;
  }

  onThumbnailSelected(data: { thumbnail: string; thumbnailFilename: string }): void {
    if (!this.order || !this.selectedVideoForThumbnail || !this.order.media) return;
    
    // Update the media item with the new thumbnail
    const mediaIndex = this.order.media.findIndex(m => m.filename === this.selectedVideoForThumbnail?.filename);
    if (mediaIndex !== -1 && this.order.media[mediaIndex]) {
      this.order.media[mediaIndex].thumbnail = data.thumbnail;
      this.order.media[mediaIndex].thumbnailFilename = data.thumbnailFilename;
    }
    
    // Reload order to get updated data
    if (this.isAuthenticated && this.order._id) {
      this.loadOrderById(this.order._id);
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
}
