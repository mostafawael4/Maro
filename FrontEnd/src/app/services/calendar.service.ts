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
  favoriteSongs?: string[];
  stylePreferences?: string[];
  highlightPreferences?: string[];
  moodboardLinks?: string[];
  socialIdeas?: string[];
  editingSequence?: string;
  includeAccessoriesShots?: boolean;
  editingNotes?: string;
  specialRequests?: string;
  timelineNote?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  constructor(private ordersService: OrdersService) {}

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
          this.extractFirstDate(order.orderForm?.timelineOfDay) ||
          order.createdAt;
        const isoDate = this.toIsoDate(new Date(dateSource));
        const { groomName, brideName } = this.extractCoupleNames(order);
        const title =
          this.extractTitle(order) ||
          `Wedding booking – ${groomName || order.clientName || 'Client'}`;
        const location = order.orderForm?.eventVenue || order.notes;

        const favoriteSongs = order.orderForm?.favoriteSongs?.filter(Boolean);
        const stylePreferences = order.orderForm?.filmEditing?.stylePreference?.filter(Boolean);
        const highlightPreferences = order.orderForm?.filmEditing?.highlightPreference?.filter(Boolean);
        const moodboardLinks = order.orderForm?.moodBoardLinks?.filter(Boolean);
        const socialIdeas = [
          ...(order.orderForm?.socialMediaInspiration ?? []),
          ...(order.orderForm?.tiktokIdeas ?? [])
        ].filter(Boolean);

        return {
          id: order._id,
          date: isoDate,
          groomName: groomName || order.clientName || 'Groom',
          brideName,
          title,
          location,
          color: this.getStatusColor(order.status),
          notes: order.orderForm?.specialMoments || order.notes,
          favoriteSongs,
          stylePreferences,
          highlightPreferences,
          moodboardLinks,
          socialIdeas,
          editingSequence: order.orderForm?.filmEditing?.editSequence,
          includeAccessoriesShots: order.orderForm?.filmEditing?.includeAccessoriesShots,
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
      order.orderForm?.coupleDescription ||
      order.clientName ||
      '';

    const cleaned = rawNames.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return { groomName: order.clientName };
    }

    const parts = cleaned
      .split(/&|and|\/|\+|,|x/i)
      .map(part => part.trim())
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
    if (order.orderForm?.specialMoments) {
      parts.push(`Must capture: ${order.orderForm.specialMoments}`);
    }
    if (order.orderForm?.excludeShots) {
      parts.push(`Avoid: ${order.orderForm.excludeShots}`);
    }
    if (order.orderForm?.coupleDescription) {
      parts.push(order.orderForm.coupleDescription);
    }
    return parts.length ? parts.join(' • ') : undefined;
  }

  private buildTimelineNote(order: Order): string | undefined {
    const segments: string[] = [];
    if (order.orderForm?.shootersStartTime) {
      segments.push(`Shooters start: ${order.orderForm.shootersStartTime}`);
    }
    if (order.orderForm?.shootersEndTime) {
      segments.push(`Shooters end: ${order.orderForm.shootersEndTime}`);
    }
    if (order.orderForm?.timelineOfDay) {
      segments.push(`Timeline: ${order.orderForm.timelineOfDay}`);
    }
    return segments.length ? segments.join(' | ') : undefined;
  }

  private formatLabel(value: string | undefined): string | undefined {
    if (!value) return undefined;
    return value
      .split(/[\s-_]/)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private buildEditingNotes(filmEditing?: OrderFormFilmEditing): string | undefined {
    if (!filmEditing) return undefined;
    const segments: string[] = [];
    const sequence = this.formatLabel(filmEditing.editSequence);
    if (sequence) {
      segments.push(`Sequence: ${sequence}`);
    }
    if (filmEditing.includeAccessoriesShots) {
      segments.push('Include accessories shots');
    }
    return segments.length ? segments.join(' • ') : undefined;
  }
}


