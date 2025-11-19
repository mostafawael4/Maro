import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OrdersService, Order, OrderPricing } from '../../services/orders.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-order-info',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './order-info.component.html',
  styleUrl: './order-info.component.scss'
})
export class OrderInfoComponent implements OnInit {
  order: Order | null = null;
  loading = true;
  error = '';
  baseUrl = environment.apiUrl;
  isAuthenticated = false;

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

    // Get order ID and load order
    const orderId = this.route.snapshot.paramMap.get('id');
    if (orderId) {
      this.loadOrder(orderId);
    } else {
      this.error = 'Order ID not found';
      this.loading = false;
    }
  }

  loadOrder(orderId: string): void {
    this.ordersService.getOrderById(orderId).subscribe({
      next: (response: any) => {
        this.order = response.order || response;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        // If unauthorized, redirect to admin login
        if (err.status === 401) {
          this.router.navigate(['/admin']);
        } else {
          this.error = 'Failed to load order information';
          console.error('Error loading order:', err);
        }
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  viewImages(): void {
    if (this.order) {
      this.router.navigate(['/order-details', this.order._id]);
    }
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
    return new Date(date).toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(value?: number | null): string {
    if (value === undefined || value === null) {
      return '0 EGP';
    }
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} EGP`;
  }

  hasPricingSelections(pricing?: OrderPricing | null): boolean {
    if (!pricing) {
      return false;
    }

    const hasPackages = Array.isArray(pricing.packages) && pricing.packages.length > 0;
    const hasCollections = Array.isArray(pricing.collections) && pricing.collections.length > 0;
    const hasExtras = Array.isArray(pricing.extras) && pricing.extras.length > 0;

    return hasPackages || hasCollections || hasExtras;
  }

  getDepositPaid(pricing?: OrderPricing | null): number {
    if (!pricing || pricing.depositPaid === undefined || pricing.depositPaid === null) {
      return 0;
    }
    return pricing.depositPaid;
  }

  getRemainingBalance(pricing?: OrderPricing | null): number {
    if (!pricing) {
      return 0;
    }
    if (pricing.remainingBalance !== undefined && pricing.remainingBalance !== null) {
      return pricing.remainingBalance;
    }
    const total = pricing.total ?? 0;
    const deposit = this.getDepositPaid(pricing);
    return Math.max(total - deposit, 0);
  }
}
