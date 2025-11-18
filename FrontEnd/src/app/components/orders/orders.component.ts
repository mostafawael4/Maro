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
  showUploadModal = false;
  uploadModalOrder: Order | null = null;
  uploadFolderName: string = '';
  uploadFiles: File[] = [];
  uploadModalError: string = '';
  isDragOver: boolean = false;
  
  // For normal users
  showEmailModal = false;
  userEmail = '';
  emailError = '';
  
  // Delete modal
  showDeleteModal = false;
  orderIdToDelete: string | null = null;

  // Feedback
  feedbackTexts: { [orderId: string]: string } = {};
  submittingFeedback: { [orderId: string]: boolean } = {};
  feedbackSuccess: { [orderId: string]: string } = {};
  feedbackError: { [orderId: string]: string } = {};
  sendingEmail: { [orderId: string]: boolean } = {};
  emailStatus: { [orderId: string]: { type: 'success' | 'error'; message: string } } = {};

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
    // Use order.orderBackground.image if present (newer orders)
    if (order.orderBackground && order.orderBackground.image) {
      return `${this.baseUrl}${order.orderBackground.image}`;
    }
    // Otherwise, use the first image from media array if exists and is an image
    if (order.media && order.media.length > 0) {
      // Prefer images (not videos) for order preview
      const firstImage = order.media.find(m => !m.url?.match(/\.(mp4|mov|webm)$/i));
      if (firstImage) {
        return `${this.baseUrl}${firstImage.url}`;
      }
      // Fall back to first media if all are videos
      return `${this.baseUrl}${order.media[0].url}`;
    }
    // Default placeholder if nothing available
    return 'assets/images/placeholder.jpg';
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

  onUploadClick(event: Event, order: Order): void {
    event.stopPropagation(); // Prevent opening order details
    this.openUploadModal(order);
  }

  sendOrderCompletionEmail(order: Order, event: Event): void {
    event.stopPropagation();
    if (!order._id) {
      return;
    }

    if (order.status !== 'done') {
      this.emailStatus[order._id] = {
        type: 'error',
        message: 'Mark order as done before emailing.'
      };
      this.clearEmailStatus(order._id);
      return;
    }

    this.sendingEmail[order._id] = true;
    delete this.emailStatus[order._id];

    this.ordersService.sendOrderCompletionEmail(order._id).subscribe({
      next: (response) => {
        this.sendingEmail[order._id] = false;
        this.emailStatus[order._id] = {
          type: 'success',
          message: response?.message || 'Email sent to client.'
        };
        this.clearEmailStatus(order._id);
      },
      error: (err) => {
        this.sendingEmail[order._id] = false;
        this.emailStatus[order._id] = {
          type: 'error',
          message: err.error?.message || 'Failed to send email.'
        };
        this.clearEmailStatus(order._id);
      }
    });
  }

  private clearEmailStatus(orderId: string): void {
    setTimeout(() => {
      delete this.emailStatus[orderId];
    }, 4000);
  }

  openUploadModal(order: Order): void {
    this.uploadModalOrder = order;
    this.showUploadModal = true;
    this.uploadFolderName = '';
    this.uploadFiles = [];
    this.uploadModalError = '';
    this.isDragOver = false;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.uploadModalOrder = null;
    this.uploadFolderName = '';
    this.uploadFiles = [];
    this.uploadModalError = '';
    this.isDragOver = false;
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFiles = Array.from(input.files);
      this.uploadModalError = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const validFiles = Array.from(files).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
      if (validFiles.length === 0) {
        this.uploadModalError = 'Please drop image or video files only.';
        return;
      }
      this.uploadFiles = validFiles;
      this.uploadModalError = '';
    }
  }

  removeUploadFile(index: number): void {
    this.uploadFiles.splice(index, 1);
  }

  submitUploadModal(fileInput?: HTMLInputElement): void {
    const folderName = this.uploadFolderName.trim();
    if (!folderName) {
      this.uploadModalError = 'Folder name is required.';
      return;
    }
    if (this.uploadFiles.length === 0) {
      this.uploadModalError = 'Please select at least one media file.';
      return;
    }
    if (!this.uploadModalOrder?._id) {
      this.uploadModalError = 'Order information missing.';
      return;
    }
    this.uploadModalError = '';
    this.uploadImages(this.uploadModalOrder._id, this.uploadFiles, folderName, () => {
      if (fileInput) {
        fileInput.value = '';
      }
      this.closeUploadModal();
    });
  }

  uploadImages(orderId: string, files: File[], folderName: string, onSuccess?: () => void): void {
    this.uploadingOrderId = orderId;
    this.uploadError = '';
    this.uploadSuccess = '';

    this.ordersService.uploadOrderImages(orderId, files, folderName).subscribe({
      next: (response) => {
        this.uploadSuccess = `Successfully uploaded ${files.length} image(s)`;
        this.uploadingOrderId = null;
        if (onSuccess) {
          onSuccess();
        }
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

  submitFeedback(orderId: string, feedback: string): void {
    if (!feedback.trim()) {
      return;
    }

    this.submittingFeedback[orderId] = true;
    this.feedbackError[orderId] = '';
    this.feedbackSuccess[orderId] = '';

    this.ordersService.submitFeedback(orderId, feedback).subscribe({
      next: (response) => {
        if (response.ok) {
          this.feedbackSuccess[orderId] = 'Feedback submitted successfully!';
          // Clear the feedback text
          this.feedbackTexts[orderId] = '';
          // Clear success message after 3 seconds
          setTimeout(() => {
            this.feedbackSuccess[orderId] = '';
          }, 3000);
        }
        this.submittingFeedback[orderId] = false;
      },
      error: (err) => {
        console.error('Error submitting feedback:', err);
        this.feedbackError[orderId] = 'Failed to submit feedback. Please try again.';
        this.submittingFeedback[orderId] = false;
        // Clear error message after 5 seconds
        setTimeout(() => {
          this.feedbackError[orderId] = '';
        }, 5000);
      }
    });
  }
}
