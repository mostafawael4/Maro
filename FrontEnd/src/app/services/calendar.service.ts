import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { OrdersService, Order, OrderFormFilmEditing } from './orders.service';

export interface WeddingCalendarEvent {
  id: string;
  date: string; // ISO date string (yyyy-mm-dd)
  groomName: string;
  brideName?: string;
  title: string;
  location?: string;
  color?: string;
  notes?: string;
  editingNotes?: string;
  specialRequests?: string;
  timelineNote?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  constructor(private ordersService: OrdersService) { }

  /**
   * Fetch events from the backend orders API and map into calendar-friendly entries.
   */
  getEvents(): Observable<WeddingCalendarEvent[]> {
    return this.ordersService.getOrders().pipe(
      map(response => this.transformOrdersToEvents(response.orders ?? []))
    );
  }

  private transformOrdersToEvents(orders: Order[]): WeddingCalendarEvent[] {
    return orders
      .map(order => {
        const dateSource =
          order.orderForm?.eventDate ||
          order.createdAt;
        const isoDate = this.toIsoDate(new Date(dateSource));
        const { groomName, brideName } = this.extractCoupleNames(order);
        const title =
          this.extractTitle(order) ||
          `Wedding booking – ${groomName || order.clientName || 'Client'}`;
        const location = order.orderForm?.eventVenue || order.notes;



        return {
          id: order._id,
          date: isoDate,
          groomName: groomName || order.clientName || 'Groom',
          brideName,
          title,
          location,
          color: this.getStatusColor(order.status),
          notes: order.notes,
          editingNotes: this.buildEditingNotes(order.orderForm?.filmEditing),
          specialRequests: this.buildSpecialRequests(order),
          timelineNote: this.buildTimelineNote(order)
        } satisfies WeddingCalendarEvent;
      })
      .filter(event => !Number.isNaN(new Date(event.date).getTime()));
  }

  private extractTitle(order: Order): string | undefined {
    const eventTypeField = order.orderForm?.eventType as unknown;
    if (Array.isArray(eventTypeField) && eventTypeField.length) {
      return eventTypeField.join(' • ');
    }
    if (typeof eventTypeField === 'string' && eventTypeField.trim().length) {
      return eventTypeField.trim();
    }
    return undefined;
  }

  private extractCoupleNames(order: Order): { groomName?: string; brideName?: string } {
    const rawNames =
      order.orderForm?.brideAndGroomNames ||
      order.clientName ||
      '';

    const cleaned = rawNames.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return { groomName: order.clientName };
    }

    const parts = cleaned
      .split(/&|and|\/|\+|,|x/i)
      .map((part: string) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      return { groomName: parts[0], brideName: parts[1] };
    }

    return { groomName: cleaned };
  }

  private extractFirstDate(text?: string): string | undefined {
    if (!text) return undefined;
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match?.[0];
  }

  private getStatusColor(status?: Order['status']): string {
    switch (status) {
      case 'pending':
        return '#f97316';
      case 'in-progress':
        return '#2563eb';
      case 'done':
        return '#16a34a';
      default:
        return '#c084fc';
    }
  }

  private toIsoDate(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private buildSpecialRequests(order: Order): string | undefined {
    const parts: string[] = [];
    return parts.length ? parts.join(' • ') : undefined;
  }

  private buildTimelineNote(order: Order): string | undefined {
    return undefined;
  }

  private buildEditingNotes(filmEditing?: OrderFormFilmEditing): string | undefined {
    return undefined;
  }
}


