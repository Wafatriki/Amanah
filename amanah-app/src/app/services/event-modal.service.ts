import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CalendarEvent } from '../models/calendar-event.model';
import { CalendarEventService } from './calendar-event.service';

export interface EventModalState {
  isOpen: boolean;
  event: CalendarEvent | null;
}

@Injectable({
  providedIn: 'root',
})
export class EventModalService {
  private modalState$ = new BehaviorSubject<EventModalState>({
    isOpen: false,
    event: null,
  });

  constructor(private readonly calendarEventService: CalendarEventService) {}

  openModal(event: CalendarEvent): void {
    console.log('EventModalService: Opening modal for event:', event.title);
    this.modalState$.next({
      isOpen: true,
      event,
    });
  }

  closeModal(): void {
    console.log('EventModalService: Closing modal');
    this.modalState$.next({
      isOpen: false,
      event: null,
    });
  }

  getModalState(): Observable<EventModalState> {
    return this.modalState$.asObservable();
  }

  async deleteEvent(eventId: string, dependentId: string): Promise<void> {
    try {
      await this.calendarEventService.deleteEvent(eventId, dependentId);
      this.closeModal();
      console.log('EventModalService: Event deleted');
    } catch (error) {
      console.error('EventModalService: Error deleting event:', error);
      throw error;
    }
  }
}
