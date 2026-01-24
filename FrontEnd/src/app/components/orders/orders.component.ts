import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
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
  isAuthenticated: boolean | null = null;
  isAdmin: boolean = false;
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
  showUploadResultModal: boolean = false;
  uploadResultMessage: string = '';
  uploadResultType: 'success' | 'error' = 'success';
  uploadProgress: number = 0;
  uploadProgressBytes: number = 0;
  uploadTotalBytes: number = 0;
  uploadStartTime: number = 0;
  uploadElapsedTime: string = '0s';
  uploadSpeed: string = '0 Bytes';
  uploadCurrentChunk: number = 0;
  uploadTotalChunks: number = 0;
  uploadChunkInfo: string = '';
  private uploadProgressInterval: any = null;
  private uploadProgressSimulator: any = null;

  // For normal users
  showEmailModal = false;
  authLoaded = false;
  userEmail = '';
  emailError = '';

  // Delete modal
  showDeleteModal = false;
  orderIdToDelete: string | null = null;
  isDeleting: boolean = false;

  // Feedback
  feedbackTexts: { [orderId: string]: string } = {};
  submittingFeedback: { [orderId: string]: boolean } = {};
  feedbackSuccess: { [orderId: string]: string } = {};
  feedbackError: { [orderId: string]: string } = {};
  sendingEmail: { [orderId: string]: boolean } = {};
  emailStatus: { [orderId: string]: { type: 'success' | 'error'; message: string } } = {};
  private readonly editCachePrefix = 'maro_edit_order_';

  constructor(
    private ordersService: OrdersService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // debugger;
    // Check authentication status
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth;
      this.isAdmin = this.authService.isAdmin();

      if (this.isAuthenticated === true) {
        // If admin, load all orders; if editor, show email modal like client
        if (this.isAdmin) {
          this.loadOrders();
        } else {
          // Editor: show email modal like client mode
          this.loading = false;
          this.showEmailModal = true;
        }
      } else if (this.isAuthenticated === false) {
        this.loading = false;
        this.showEmailModal = true;
      }
      // If null, UI will not show either yet
    });

    // Initialize admin status
    this.isAdmin = this.authService.isAdmin();
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
      return `${order.orderBackground.image}`;
    }
    // Otherwise, use the first image from media array if exists and is an image
    if (order.media && order.media.length > 0) {
      // Prefer images (not videos) for order preview
      const firstImage = order.media.find(m => !m.url?.match(/\.(mp4|mov|webm)$/i));
      if (firstImage) {
        return `${firstImage.url}`;
      }
      // Fall back to first media if all are videos
      return `${order.media[0].url}`;
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

  openEditOrder(order: Order, event?: Event): void {
    event?.stopPropagation();
    if (!order?._id) {
      return;
    }

    this.cacheOrderForEditing(order, this.userEmail);
    const extras: any = {
      state: { order, source: 'orders' }
    };

    if (!this.isAuthenticated && this.userEmail) {
      extras.queryParams = { email: this.userEmail };
    }

    this.router.navigate(['/edit-order', order._id], extras);
  }

  private cacheOrderForEditing(order: Order, clientEmail?: string | null): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(
          `${this.editCachePrefix}${order._id}`,
          JSON.stringify({ order, source: 'orders', clientEmail: clientEmail || null })
        );
      }
    } catch (err) {
      console.warn('Failed to cache order for editing', err);
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
    this.stopUploadTimeTracking();
    this.stopProgressSimulation();
    this.showUploadModal = false;
    this.uploadModalOrder = null;
    this.uploadFolderName = '';
    this.uploadFiles = [];
    this.uploadModalError = '';
    this.isDragOver = false;
    this.uploadProgress = 0;
    this.uploadProgressBytes = 0;
    this.uploadTotalBytes = 0;
    this.uploadElapsedTime = '0s';
    this.uploadSpeed = '0 Bytes';
    this.uploadCurrentChunk = 0;
    this.uploadTotalChunks = 0;
    this.uploadChunkInfo = '';
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

    // Calculate total file size
    this.uploadTotalBytes = files.reduce((total, file) => total + file.size, 0);
    this.uploadProgressBytes = 0;
    this.uploadProgress = 0;
    this.uploadStartTime = Date.now();
    this.uploadElapsedTime = '0s';
    this.uploadSpeed = '0 Bytes';
    this.uploadCurrentChunk = 0;
    this.uploadTotalChunks = 0;
    this.uploadChunkInfo = '';

    // Start time tracking
    this.startUploadTimeTracking();

    // Start progress simulation as fallback (in case progress events don't fire)
    this.startProgressSimulation();

    // Use THE OPTIMUM SOLUTION: Direct Client-to-B2 Upload
    this.ordersService.uploadOrderMediaDirectly(orderId, files, folderName).subscribe({
      next: (event: any) => {
        // Handle progress events
        if (event.type === HttpEventType.UploadProgress) {
          // Stop simulation since we have real progress
          this.stopProgressSimulation();

          if (event.total) {
            this.uploadProgress = Math.round((event.loaded / event.total) * 100);
            this.uploadProgressBytes = event.loaded; // This might be percentage-based relative to 100 in DirectUploadService
            // In DirectUploadService we emit loaded as percent, total as 100.
            // But let's check: 
            // observer.next({ type: HttpEventType.UploadProgress, loaded: totalPercent, total: 100 });
            // So event.loaded IS the percent.
            
            // To be safe with display binding which expects percent:
            // this.uploadProgress = event.loaded; 
            
            // But wait, existing code used: 
            // this.uploadProgressBytes = Math.round((this.uploadTotalBytes * event.percent) / 100);
            
            // So if event.loaded is percent (0-100):
            this.uploadProgressBytes = Math.round((this.uploadTotalBytes * event.loaded) / 100);
          }
           
          // this.uploadChunkInfo = `Uploading: ${event.currentFile}`; // We lost currentFile info in DirectUploadService standard event
          this.uploadChunkInfo = 'Uploading files...';
          this.updateUploadSpeed();
          this.cdr.markForCheck();
        }
        
        // Handle completion event
        if (event.type === HttpEventType.Response) {
          const body = event.body;
          if (body && body.type === 'complete') {
             // Stop simulation
            this.stopProgressSimulation();
            // Upload complete - ensure progress shows 100%
            this.uploadProgress = 100;
            this.uploadProgressBytes = this.uploadTotalBytes;
            this.updateUploadSpeed();
            this.cdr.markForCheck();

            // Handle duplicates notification (optional display)
            if (body.duplicates && body.duplicates.length > 0) {
              console.log(`${body.duplicates.length} duplicate files detected.`);
            }

            // Small delay to show 100% before closing
            setTimeout(() => {
              this.stopUploadTimeTracking();
              const response = body; 
              const successCount = response?.added?.length || 0;
              const duplicateCount = response?.duplicates?.length || 0;

              this.uploadingOrderId = null;

              // Close upload modal first
              if (onSuccess) {
                onSuccess();
              }

              // Reload orders to update image count
              this.loadOrders();

              // Build simplified result message
              let messageParts: string[] = [];
              const failedCount = response?.failed?.length || 0;

              if (successCount > 0) {
                messageParts.push(`Uploaded ${successCount} file(s) successfully.`);
              }

              if (duplicateCount > 0) {
                messageParts.push(`Skipped ${duplicateCount} file(s) (already uploaded).`);
              }

              if (failedCount > 0) {
                messageParts.push(`Failed to upload ${failedCount} file(s).`);
                // Optionally list names if few
                if (failedCount <= 3) {
                   const names = response.failed.map((f: any) => f.originalName).join(', ');
                   messageParts.push(`(${names})`);
                }
              }

              // Determine result type and message
              if (failedCount > 0) {
                 this.uploadResultType = 'error';
              } else if (successCount === 0 && duplicateCount > 0) {
                this.uploadResultType = 'error'; // Treat all duplicates as a "warning/error" requiring attention
                this.uploadResultMessage = `All ${duplicateCount} file(s) are already uploaded in this folder.`;
              } else {
                this.uploadResultType = 'success';
              }
              
              if (!(successCount === 0 && duplicateCount > 0 && failedCount === 0)) {
                   this.uploadResultMessage = messageParts.join('\n\n');
              }

              this.showUploadResultModal = true;
            }, 500);
          }
        }
      },
      error: (err) => {
        this.stopUploadTimeTracking();
        this.stopProgressSimulation();
        this.uploadingOrderId = null;
        this.uploadProgress = 0;
        this.uploadSpeed = '0 Bytes';
        console.error('Error uploading images:', err);

        // Close upload modal
        if (onSuccess) {
          onSuccess();
        }

        // Show error modal
        this.uploadResultType = 'error';
        this.uploadResultMessage = typeof err === 'string' ? err : 'Failed to upload images directly to B2. Check your connection.';
        this.showUploadResultModal = true;
      }
    });
  }

  startUploadTimeTracking(): void {
    this.uploadProgressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.uploadStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const newTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      if (this.uploadElapsedTime !== newTime) {
        this.uploadElapsedTime = newTime;
        this.updateUploadSpeed();
        this.cdr.markForCheck();
      }
    }, 100);
  }

  stopUploadTimeTracking(): void {
    if (this.uploadProgressInterval) {
      clearInterval(this.uploadProgressInterval);
      this.uploadProgressInterval = null;
    }
  }

  startProgressSimulation(): void {
    // Simulate progress if real progress events don't fire
    let simulatedProgress = 0;
    this.uploadProgressSimulator = setInterval(() => {
      // Stop if upload is complete or cancelled
      if (this.uploadProgress >= 100 || this.uploadingOrderId === null) {
        this.stopProgressSimulation();
        return;
      }

      // Only simulate if we haven't received real progress and haven't reached 95%
      if (this.uploadProgress < 95 && this.uploadingOrderId !== null) {
        // Gradually increase progress up to 95% (leave room for completion)
        simulatedProgress += 1.5;
        if (simulatedProgress > 95) simulatedProgress = 95;

        // Only update if we haven't received real progress
        if (this.uploadProgress < simulatedProgress) {
          this.uploadProgress = Math.round(simulatedProgress);
          this.uploadProgressBytes = Math.round((this.uploadTotalBytes * simulatedProgress) / 100);
          this.updateUploadSpeed();
          this.cdr.markForCheck();
        }
      }
    }, 150);
  }

  stopProgressSimulation(): void {
    if (this.uploadProgressSimulator) {
      clearInterval(this.uploadProgressSimulator);
      this.uploadProgressSimulator = null;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  updateUploadSpeed(): void {
    if (this.uploadProgressBytes === 0 || this.uploadStartTime === 0) {
      this.uploadSpeed = '0 Bytes';
      return;
    }
    const elapsedSeconds = (Date.now() - this.uploadStartTime) / 1000;
    if (elapsedSeconds === 0) {
      this.uploadSpeed = '0 Bytes';
      return;
    }
    const bytesPerSecond = this.uploadProgressBytes / elapsedSeconds;
    this.uploadSpeed = this.formatBytes(Math.round(bytesPerSecond));
  }

  closeUploadResultModal(): void {
    this.showUploadResultModal = false;
    this.uploadResultMessage = '';
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
        // Backend returns multiple orders
        this.orders = response.orders || [];
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
    if (this.orderIdToDelete && !this.isDeleting) {
      this.isDeleting = true;
      this.deleteOrder(this.orderIdToDelete);
    }
  }

  onCancelDelete(): void {
    this.showDeleteModal = false;
    this.orderIdToDelete = null;
    this.isDeleting = false;
  }

  deleteOrder(orderId: string): void {
    this.ordersService.deleteOrder(orderId).subscribe({
      next: (response) => {
        if (response.ok) {
          // Remove the order from the arrays
          this.orders = this.orders.filter(order => order._id !== orderId);
          this.filteredOrders = this.filteredOrders.filter(order => order._id !== orderId);
        }
        this.isDeleting = false;
        this.showDeleteModal = false;
        this.orderIdToDelete = null;
      },
      error: (err) => {
        console.error('Error deleting order:', err);
        this.error = 'Failed to delete order. Please try again.';
        this.isDeleting = false;
        this.showDeleteModal = false;
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
