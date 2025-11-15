import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrdersService } from '../../services/orders.service';

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
  imports: [CommonModule],
  templateUrl: './feedbacks.component.html',
  styleUrl: './feedbacks.component.scss'
})
export class FeedbacksComponent implements OnInit {
  feedbacks: FeedbackItem[] = [];
  loading = true;
  error = '';

  constructor(private ordersService: OrdersService) {}

  ngOnInit(): void {
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
}
