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

@Component({
  selector: 'app-order-details',
  standalone: true,
  imports: [CommonModule, ImageSliderComponent],
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
    this.currentImageIndex = index;
    this.showImageSlider = true;
  }

  closeImageSlider() {
    this.showImageSlider = false;
  }

  getSliderImages(): GalleryImage[] {
    if (!this.order?.media) return [];
    return this.order.media.map(img => ({
      _id: img.filename,
      filename: img.filename,
      url: img.url,
      uploadedAt: new Date(img.uploadedAt)
    }));
  }

  async downloadImage(image: OrderImage, event: Event) {
    event.stopPropagation(); // Prevent opening the slider
    
    try {
      const imageUrl = this.getImageUrl(image);
      
      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = image.filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Please try again.');
    }
  }
}
