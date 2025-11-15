import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrdersService, Order } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DeleteModalComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnInit {
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  loading = true;
  error = '';
  baseUrl = environment.apiUrl;
  isAuthenticated = false;
  searchEmail = '';
  uploadingOrderId: string | null = null;
  uploadSuccess: string = '';
  uploadError: string = '';
  
  // For normal users
  showEmailModal = false;
  userEmail = '';
  emailError = '';
  
  // Delete modal
  showDeleteModal = false;
  orderIdToDelete: string | null = null;

  constructor(
    private ordersService: OrdersService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
      if (this.isAuthenticated) {
        this.loadOrders();
      } else {
        // For normal users, show email modal
        this.loading = false;
        this.showEmailModal = true;
      }
    });
  }

  loadOrders(): void {
    this.loading = true;
    this.ordersService.getOrders().subscribe({
      next: (response) => {
        this.orders = response.orders;
        this.filteredOrders = this.orders;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load orders';
        this.loading = false;
        console.error('Error loading orders:', err);
      }
    });
  }

  filterByEmail(): void {
    if (!this.searchEmail.trim()) {
      this.filteredOrders = this.orders;
      return;
    }
    this.filteredOrders = this.orders.filter(order => 
      order.email.toLowerCase().includes(this.searchEmail.toLowerCase())
    );
  }

  getFirstImage(order: Order): string {
    if (order.media && order.media.length > 0) {
      // Media are now objects with filename property
      const firstImage = order.media[0];
      return `${this.baseUrl}${firstImage.url}`;
    }
    return 'assets/images/placeholder.jpg'; // Default placeholder
  }

  openOrderDetails(orderId: string): void {
    // Pass user email in query params for normal users
    if (!this.isAuthenticated && this.userEmail) {
      this.router.navigate(['/order-details', orderId], { 
        queryParams: { email: this.userEmail } 
      });
    } else {
      this.router.navigate(['/order-details', orderId]);
    }
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

  formatEventDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  onUploadClick(event: Event, orderId: string): void {
    event.stopPropagation(); // Prevent opening order details
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*'; // Accept both images and videos
    input.multiple = true;
    input.onchange = (e: any) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        this.uploadImages(orderId, Array.from(files));
      }
    };
    input.click();
  }

  uploadImages(orderId: string, files: File[]): void {
    this.uploadingOrderId = orderId;
    this.uploadError = '';
    this.uploadSuccess = '';

    this.ordersService.uploadOrderImages(orderId, files).subscribe({
      next: (response) => {
        this.uploadSuccess = `Successfully uploaded ${files.length} image(s)`;
        this.uploadingOrderId = null;
        // Reload orders to update image count
        this.loadOrders();
        // Clear success message after 3 seconds
        setTimeout(() => {
          this.uploadSuccess = '';
        }, 3000);
      },
      error: (err) => {
        this.uploadError = 'Failed to upload images. Please try again.';
        this.uploadingOrderId = null;
        console.error('Error uploading images:', err);
        // Clear error message after 5 seconds
        setTimeout(() => {
          this.uploadError = '';
        }, 5000);
      }
    });
  }

  // Email Modal Methods for Normal Users
  submitEmail(): void {
    this.emailError = '';
    
    // Validate email
    if (!this.userEmail.trim()) {
      this.emailError = 'Please enter your email address';
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(this.userEmail)) {
      this.emailError = 'Please enter a valid email address';
      return;
    }

    // Load orders by email
    this.loading = true;
    this.showEmailModal = false;

    this.ordersService.getOrdersByEmail(this.userEmail).subscribe({
      next: (response) => {
        // Backend returns a single order, wrap it in an array
        this.orders = response.order ? [response.order] : [];
        this.filteredOrders = this.orders;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load orders. Please try again.';
        this.loading = false;
        this.showEmailModal = true;
        console.error('Error loading orders by email:', err);
      }
    });
  }

  closeEmailModal(): void {
    this.showEmailModal = false;
    this.router.navigate(['/']);
  }

  resetEmail(): void {
    this.userEmail = '';
    this.emailError = '';
    this.orders = [];
    this.filteredOrders = [];
    this.showEmailModal = true;
  }

  onDeleteClick(event: Event, orderId: string): void {
    event.stopPropagation(); // Prevent opening order details
    this.orderIdToDelete = orderId;
    this.showDeleteModal = true;
  }

  onConfirmDelete(): void {
    if (this.orderIdToDelete) {
      this.deleteOrder(this.orderIdToDelete);
    }
  }

  onCancelDelete(): void {
    this.showDeleteModal = false;
    this.orderIdToDelete = null;
  }

  deleteOrder(orderId: string): void {
    this.showDeleteModal = false;
    this.ordersService.deleteOrder(orderId).subscribe({
      next: (response) => {
        if (response.ok) {
          // Remove the order from the arrays
          this.orders = this.orders.filter(order => order._id !== orderId);
          this.filteredOrders = this.filteredOrders.filter(order => order._id !== orderId);
        }
        this.orderIdToDelete = null;
      },
      error: (err) => {
        console.error('Error deleting order:', err);
        this.error = 'Failed to delete order. Please try again.';
        this.orderIdToDelete = null;
        setTimeout(() => {
          this.error = '';
        }, 5000);
      }
    });
  }
}
