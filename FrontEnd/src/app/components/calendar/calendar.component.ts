import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CalendarService, WeddingCalendarEvent } from '../../services/calendar.service';

interface CalendarDay {
  date: Date;
  isoDate: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: WeddingCalendarEvent[];
  isSelected: boolean;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss'
})
export class CalendarComponent implements OnInit {
  readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  currentDate = new Date();
  weeks: CalendarDay[][] = [];
  events: WeddingCalendarEvent[] = [];
  selectedDate: CalendarDay | null = null;
  selectedEvents: WeddingCalendarEvent[] = [];
  upcomingEvents: WeddingCalendarEvent[] = [];

  isLoading = true;
  errorMessage = '';

  constructor(
    private calendarService: CalendarService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.fetchEvents();
  }

  fetchEvents(): void {
    this.isLoading = true;
    this.calendarService.getEvents().subscribe({
      next: (events) => {
        this.events = events;
        this.isLoading = false;
        this.buildCalendar();
        this.buildUpcomingEvents();
      },
      error: (err) => {
        this.isLoading = false;
        // If unauthorized, redirect to admin login
        if (err.status === 401) {
          this.router.navigate(['/admin']);
        } else {
          this.errorMessage = 'Unable to load events right now. Please try again later.';
        }
      }
    });
  }

  previousMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.buildCalendar();
  }

  nextMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.buildCalendar();
  }

  selectDay(day: CalendarDay): void {
    if (this.selectedDate) {
      this.selectedDate.isSelected = false;
    }
    day.isSelected = true;
    this.selectedDate = day;
    this.selectedEvents = day.events;
    this.buildUpcomingEvents(); // Update upcoming events when selection changes
  }

  trackByWeek(_: number, week: CalendarDay[]): string {
    return week.map(day => day.isoDate).join('-');
  }

  trackByDay(_: number, day: CalendarDay): string {
    return day.isoDate;
  }

  private buildCalendar(): void {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const endDate = new Date(lastDayOfMonth);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const weeks: CalendarDay[][] = [];
    let current = new Date(startDate);
    const todayKey = this.toIsoDate(new Date());
    const eventMap = this.buildEventMap();

    while (current <= endDate) {
      const week: CalendarDay[] = [];
      for (let i = 0; i < 7; i++) {
        const isoDate = this.toIsoDate(current);
        const events = eventMap.get(isoDate) ?? [];
        const day: CalendarDay = {
          date: new Date(current),
          isoDate,
          isCurrentMonth: current.getMonth() === month,
          isToday: isoDate === todayKey,
          events,
          isSelected: false
        };
        week.push(day);
        current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      }
      weeks.push(week);
    }

    this.weeks = weeks;
    // On first load, select today's date; otherwise keep the currently selected date
    const initialSelection = this.selectedDate?.isoDate ?? todayKey;
    const initialDay = this.weeks.flat().find(day => day.isoDate === initialSelection) ?? this.weeks.flat().find(day => day.isCurrentMonth);
    if (initialDay) {
      this.selectDay(initialDay);
    } else {
      this.selectedDate = null;
      this.selectedEvents = [];
    }
  }

  private buildUpcomingEvents(): void {
    // Use selected date if available, otherwise use today
    const referenceDate = this.selectedDate 
      ? new Date(this.selectedDate.date.getFullYear(), this.selectedDate.date.getMonth(), this.selectedDate.date.getDate())
      : new Date();
    
    const referenceDateStr = this.toIsoDate(referenceDate);
    
    // Filter events that come AFTER the selected date (not on the same day)
    this.upcomingEvents = [...this.events]
      .filter(event => {
        const eventDateStr = this.toIsoDate(new Date(event.date));
        return eventDateStr > referenceDateStr; // Only events after the selected date
      })
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .slice(0, 6);
  }

  private buildEventMap(): Map<string, WeddingCalendarEvent[]> {
    return this.events.reduce((map, event) => {
      const key = this.toIsoDate(new Date(event.date));
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(event);
      return map;
    }, new Map<string, WeddingCalendarEvent[]>());
  }

  private toIsoDate(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private stripTime(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}


