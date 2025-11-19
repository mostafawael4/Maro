import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrdersService } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';

interface FeedbackItem {
  orderId: string;
  clientName?: string;
  email: string;
  feedbackText: string;
  feedbackId?: string;
}

@Component({
  selector: 'app-feedbacks',
  standalone: true,
  imports: [CommonModule, DeleteModalComponent],
  templateUrl: './feedbacks.component.html',
  styleUrl: './feedbacks.component.scss'
})
export class FeedbacksComponent implements OnInit {
  feedbacks: FeedbackItem[] = [];
  loading = true;
  error = '';
  isAuthenticated = false;
  
  // Delete modal
  showDeleteModal = false;
  feedbackToDelete: { orderId: string; feedbackId: string } | null = null;
  deletingFeedback = false;

  constructor(
    private ordersService: OrdersService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Check authentication status for admin features
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;
    });
    
    this.loadFeedbacks();
  }

  loadFeedbacks(): void {
    this.loading = true;
    this.error = '';
    this.ordersService.getAllFeedbacks().subscribe({
      next: (response) => {
        if (response.ok) {
          this.feedbacks = response.feedbacks || [];
        } else {
          this.error = 'Failed to load feedbacks';
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load feedbacks. Please try again.';
        this.loading = false;
        console.error('Error loading feedbacks:', err);
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onDeleteClick(event: Event, feedback: FeedbackItem): void {
    event.stopPropagation();
    if (!feedback.feedbackId || !feedback.orderId) {
      console.error('Feedback ID or Order ID is missing');
      return;
    }
    this.feedbackToDelete = {
      orderId: feedback.orderId,
      feedbackId: feedback.feedbackId
    };
    this.showDeleteModal = true;
  }

  onDeleteConfirm(): void {
    if (!this.feedbackToDelete || this.deletingFeedback) return;
    
    this.deletingFeedback = true;
    this.ordersService.deleteFeedback(
      this.feedbackToDelete.orderId,
      this.feedbackToDelete.feedbackId
    ).subscribe({
      next: (response) => {
        if (response.ok) {
          // Remove feedback from local array
          this.feedbacks = this.feedbacks.filter(
            fb => !(fb.orderId === this.feedbackToDelete!.orderId && 
                   fb.feedbackId === this.feedbackToDelete!.feedbackId)
          );
          this.showDeleteModal = false;
          this.feedbackToDelete = null;
        } else {
          this.error = response.message || 'Failed to delete feedback';
        }
        this.deletingFeedback = false;
      },
      error: (err) => {
        this.error = 'Failed to delete feedback. Please try again.';
        this.deletingFeedback = false;
        console.error('Error deleting feedback:', err);
      }
    });
  }

  onDeleteCancel(): void {
    if (this.deletingFeedback) return;
    this.showDeleteModal = false;
    this.feedbackToDelete = null;
  }
}
