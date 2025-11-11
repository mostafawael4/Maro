import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { OrdersService, Order } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  orders: Order[] = [];
  loading = true;
  error = '';
  isAuthenticated = false;
  updatingOrderId: string | null = null;

  constructor(
    private ordersService: OrdersService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check authentication
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth;
    });
    
    // Always try to load orders - let the API handle authentication
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading = true;
    this.ordersService.getOrders().subscribe({
      next: (response) => {
        this.orders = response.orders;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        // If unauthorized, redirect to admin login
        if (err.status === 401) {
          this.router.navigate(['/admin']);
        } else {
          this.error = 'Failed to load orders';
          console.error('Error loading orders:', err);
        }
      }
    });
  }

  updateStatus(orderId: string, newStatus: string): void {
    this.updatingOrderId = orderId;
    this.ordersService.updateOrderStatus(orderId, newStatus).subscribe({
      next: () => {
        // Update the order in the list
        const order = this.orders.find(o => o._id === orderId);
        if (order) {
          order.status = newStatus as any;
        }
        this.updatingOrderId = null;
      },
      error: (err) => {
        this.error = 'Failed to update status';
        this.updatingOrderId = null;
        console.error('Error updating status:', err);
      }
    });
  }

  viewOrderInfo(orderId: string): void {
    this.router.navigate(['/order-info', orderId]);
  }

  viewOrderImages(orderId: string): void {
    this.router.navigate(['/order-details', orderId]);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'in-progress':
        return 'status-inprogress';
      case 'done':
        return 'status-completed';
      default:
        return '';
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
}
