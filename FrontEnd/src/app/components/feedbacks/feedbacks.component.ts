import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, DeleteModalComponent],
  templateUrl: './feedbacks.component.html',
  styleUrl: './feedbacks.component.scss'
})
export class FeedbacksComponent implements OnInit {
  feedbacks: FeedbackItem[] = [];
  loading = true;
  error = '';
  isAuthenticated = false;
  newFeedback = '';
  submitError = '';
  submitSuccess = '';
  submittingFeedback = false;
  
  // Delete modal
  showDeleteModal = false;
  feedbackToDelete: { orderId?: string | null; feedbackId: string } | null = null;
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
        try {
          // Backend returns { generalFeedbacks: [], orderFeedbacks: [] }
          const generalFeedbacks = response.generalFeedbacks || [];
          const orderFeedbacks = response.orderFeedbacks || [];
          
          // Map general feedbacks
          const mappedGeneralFeedbacks: FeedbackItem[] = generalFeedbacks.map((fb: any) => ({
            orderId: '',
            clientName: undefined,
            email: '',
            feedbackText: fb.feedback || '',
            feedbackId: fb._id
          }));
          
          // Map order feedbacks
          const mappedOrderFeedbacks: FeedbackItem[] = orderFeedbacks.map((fb: any) => ({
            orderId: fb.orderId || '',
            clientName: undefined,
            email: '',
            feedbackText: fb.feedback || '',
            feedbackId: fb._id
          }));
          
          // Combine both arrays
          this.feedbacks = [...mappedGeneralFeedbacks, ...mappedOrderFeedbacks];
          this.loading = false;
        } catch (err) {
          this.error = 'Failed to process feedbacks';
          this.loading = false;
          console.error('Error processing feedbacks:', err);
        }
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
    if (!feedback.feedbackId) {
      console.error('Feedback ID is missing');
      return;
    }
    this.feedbackToDelete = {
      orderId: feedback.orderId || null,
      feedbackId: feedback.feedbackId
    };
    this.showDeleteModal = true;
  }

  onDeleteConfirm(): void {
    if (!this.feedbackToDelete || this.deletingFeedback) return;
    
    this.deletingFeedback = true;
    const { orderId, feedbackId } = this.feedbackToDelete;
    const delete$ = orderId
      ? this.ordersService.deleteFeedback(orderId, feedbackId)
      : this.ordersService.deleteGeneralFeedback(feedbackId);

    delete$.subscribe({
      next: () => {
        this.feedbacks = this.feedbacks.filter(
          fb => fb.feedbackId !== feedbackId
        );
        this.showDeleteModal = false;
        this.feedbackToDelete = null;
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

  onSubmitFeedback(): void {
    this.submitError = '';
    this.submitSuccess = '';
    const trimmedFeedback = this.newFeedback.trim();

    if (!trimmedFeedback) {
      this.submitError = 'Please share your experience before submitting.';
      return;
    }

    this.submittingFeedback = true;
    this.ordersService.createGeneralFeedback(trimmedFeedback).subscribe({
      next: (response) => {
        const newEntry: FeedbackItem = {
          orderId: '',
          clientName: undefined,
          email: '',
          feedbackText: response.feedback || trimmedFeedback,
          feedbackId: response._id
        };
        this.feedbacks = [newEntry, ...this.feedbacks];
        this.newFeedback = '';
        this.submitSuccess = 'Thank you for your feedback!';
        this.submittingFeedback = false;
      },
      error: (err) => {
        console.error('Error submitting feedback:', err);
        this.submitError = 'Failed to send feedback. Please try again.';
        this.submittingFeedback = false;
      }
    });
  }
}
