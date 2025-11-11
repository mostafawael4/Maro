import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { OrdersService, Order } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  orders: Order[] = [];
  loading = true;
  error = '';
  isAuthenticated = false;
  updatingOrderId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private ordersService: OrdersService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Wait for auth check to complete, then load orders
    combineLatest([
      this.authService.authCheckComplete$,
      this.authService.isAuthenticated$
    ]).pipe(
      filter(([authCheckDone, _]) => authCheckDone), // Only proceed when auth check is done
      takeUntil(this.destroy$)
    ).subscribe(([_, isAuth]) => {
      this.isAuthenticated = isAuth ?? false;
      
      // Load orders - let the API handle authentication
      this.loadOrders();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
