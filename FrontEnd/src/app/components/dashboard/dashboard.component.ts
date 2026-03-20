import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OrdersService, Order } from '../../services/orders.service';
import { Subject } from 'rxjs';
import { DeleteModalComponent } from '../delete-modal/delete-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DeleteModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  loading = true;
  error = '';
  updatingOrderId: string | null = null;
  showDeleteModal = false;
  orderIdToDelete: string | null = null;
  isDeletingOrder = false;
  sendingEmail: { [orderId: string]: boolean } = {};
  emailStatus: { [orderId: string]: { type: 'success' | 'error'; message: string } } = {};
  searchTerm = '';
  private destroy$ = new Subject<void>();
  private readonly editCachePrefix = 'maro_edit_order_';

  constructor(
    private ordersService: OrdersService,
    private router: Router
  ) { }

  ngOnInit(): void {
    // Load orders - authentication is handled by adminGuard at route level
    this.loadOrders();
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
        this.applySearch();
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

  openEditOrder(order: Order, event?: Event): void {
    event?.stopPropagation();
    if (!order?._id) {
      return;
    }

    this.cacheOrderForEditing(order);
    this.router.navigate(['/edit-order', order._id], {
      state: { order, source: 'dashboard' }
    });
  }

  private cacheOrderForEditing(order: Order): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(
          `${this.editCachePrefix}${order._id}`,
          JSON.stringify({ order, source: 'dashboard' })
        );
      }
    } catch (err) {
      console.warn('Failed to cache order for editing', err);
    }
  }

  sendOrderCompletionEmail(order: Order): void {
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

  getBrideAndGroomName(order: Order): string {
    if (!order) {
      return '—';
    }

    const rawNames =
      order.orderForm?.brideAndGroomNames ||
      order.clientName ||
      '';

    const cleaned = rawNames.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return order.clientName || '—';
    }

    // If the names are already in a combined format, return as is
    // Otherwise, try to split and format them
    const parts = cleaned
      .split(/&|and|\/|\+|,|x/i)
      .map((part: string) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      // Return both names formatted nicely
      return `${parts[0]} & ${parts[1]}`;
    }

    // If only one name or couldn't split, return the original
    return cleaned;
  }

  getEventDate(order: Order): string | null {
    const eventDate = order.orderForm?.eventDate;
    if (!eventDate) {
      return null;
    }

    const parsedDate = new Date(eventDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return eventDate;
    }

    return parsedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getMediaCount(order: Order): number {
    return order.mediaCount ?? (order.media || []).length;
  }

  onDeleteClick(orderId: string): void {
    this.orderIdToDelete = orderId;
    this.showDeleteModal = true;
  }

  onConfirmDelete(): void {
    if (this.orderIdToDelete && !this.isDeletingOrder) {
      this.isDeletingOrder = true;
      this.deleteOrder(this.orderIdToDelete);
    }
  }

  onCancelDelete(): void {
    if (this.isDeletingOrder) return;
    this.showDeleteModal = false;
    this.orderIdToDelete = null;
  }

  deleteOrder(orderId: string): void {
    this.ordersService.deleteOrder(orderId).subscribe({
      next: (response) => {
        if (response.ok) {
          // Remove the order from the list
          this.orders = this.orders.filter(order => order._id !== orderId);
          this.applySearch();
        }
        this.isDeletingOrder = false;
        this.showDeleteModal = false;
        this.orderIdToDelete = null;
      },
      error: (err) => {
        this.error = 'Failed to delete order';
        console.error('Error deleting order:', err);
        this.isDeletingOrder = false;
        this.showDeleteModal = false;
        this.orderIdToDelete = null;
        setTimeout(() => {
          this.error = '';
        }, 5000);
      }
    });
  }

  private clearEmailStatus(orderId: string): void {
    setTimeout(() => {
      delete this.emailStatus[orderId];
    }, 4000);
  }

  onSearchTermChange(term: string): void {
    this.searchTerm = term;
    this.applySearch();
  }

  private applySearch(): void {
    const normalizedTerm = this.searchTerm.trim().toLowerCase();
    if (!normalizedTerm) {
      this.filteredOrders = [...this.orders];
      return;
    }

    this.filteredOrders = this.orders.filter(order => {
      const formattedNames = this.getBrideAndGroomName(order).toLowerCase();
      const rawNames = (order.orderForm?.brideAndGroomNames || '').toLowerCase();
      const clientName = (order.clientName || '').toLowerCase();
      return (
        formattedNames.includes(normalizedTerm) ||
        rawNames.includes(normalizedTerm) ||
        clientName.includes(normalizedTerm)
      );
    });
  }
}
