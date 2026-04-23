import { Injectable, inject } from '@angular/core';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  Timestamp,
  QueryConstraint,
  onSnapshot,
} from 'firebase/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { CalendarEvent, EVENT_COLORS, EventType } from '../models/calendar-event.model';

@Injectable({
  providedIn: 'root',
})
export class CalendarEventService {
  private readonly permissionService = inject(PermissionService);

  constructor(private readonly firebaseService: FirebaseService) {}

  async createEvent(event: CalendarEvent): Promise<string> {
    // Validar permisos: Solo cuidadores pueden crear eventos
    if (!this.permissionService.isCaregiver()) {
      throw new Error('No tienes permisos para crear eventos de calendario');
    }

    try {
      const eventsCollection = collection(this.firebaseService.firestore, `dependents/${event.dependentId}/calendar_events`);
      const eventData: Record<string, any> = {
        title: event.title,
        description: event.description || '',
        type: event.type,
        startDate: Timestamp.fromDate(new Date(event.startDate)),
        endDate: Timestamp.fromDate(new Date(event.endDate)),
        dependentId: event.dependentId,
        notes: event.notes || '',
        reminder: event.reminder || false,
        reminderTime: event.reminderTime || 0,
        recurrence: event.recurrence ? {
          frequency: event.recurrence.frequency,
          endsAfterDays: event.recurrence.endsAfterDays || null,
        } : {
          frequency: 'never',
          endsAfterDays: null,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(eventsCollection, eventData);

      // Si tiene recurrencia y no es 'never', generar eventos repetidos
      if (event.recurrence && event.recurrence.frequency !== 'never') {
        await this.generateRecurringEvents(docRef.id, event);
      }

      return docRef.id;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  private async generateRecurringEvents(parentEventId: string, event: CalendarEvent): Promise<void> {
    if (!event.recurrence) return;

    const eventsCollection = collection(this.firebaseService.firestore, `dependents/${event.dependentId}/calendar_events`);
    const startDate = new Date(event.startDate);
    const endDate = event.recurrence.endsAfterDays
      ? new Date(startDate.getTime() + event.recurrence.endsAfterDays * 24 * 60 * 60 * 1000)
      : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());

    let currentDate = new Date(startDate);
    const durationMs = new Date(event.endDate).getTime() - startDate.getTime();

    while (currentDate < endDate) {
      const nextDate = new Date(currentDate);

      switch (event.recurrence.frequency) {
        case 'daily':
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case 'yearly':
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
      }

      if (nextDate >= endDate) break;

      const newEventEndDate = new Date(nextDate.getTime() + durationMs);

      const recurringEvent = {
        ...event,
        startDate: Timestamp.fromDate(nextDate),
        endDate: Timestamp.fromDate(newEventEndDate),
        parentEventId: parentEventId,
        recurrence: undefined, // No guardar recurrence en los eventos generados
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(eventsCollection, recurringEvent);
      currentDate = nextDate;
    }
  }

  async updateEvent(eventId: string, event: Partial<CalendarEvent>, dependentId: string): Promise<void> {
    // Validar permisos: Solo cuidadores pueden editar eventos
    if (!this.permissionService.isCaregiver()) {
      throw new Error('No tienes permisos para editar eventos de calendario');
    }

    try {
      const eventRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/calendar_events`, eventId);
      const updateData: any = {
        ...event,
        updatedAt: Timestamp.now(),
      };

      if (event.startDate) {
        updateData.startDate = Timestamp.fromDate(new Date(event.startDate));
      }
      if (event.endDate) {
        updateData.endDate = Timestamp.fromDate(new Date(event.endDate));
      }

      await updateDoc(eventRef, updateData);
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw error;
    }
  }

  async deleteEvent(eventId: string, dependentId: string): Promise<void> {
    // Validar permisos: Solo cuidadores pueden eliminar eventos
    if (!this.permissionService.isCaregiver()) {
      throw new Error('No tienes permisos para eliminar eventos de calendario');
    }

    try {
      const eventRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/calendar_events`, eventId);
      await deleteDoc(eventRef);
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw error;
    }
  }

  async getEvent(eventId: string, dependentId: string): Promise<CalendarEvent | null> {
    try {
      const eventRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/calendar_events`, eventId);
      const eventSnap = await getDoc(eventRef);

      if (eventSnap.exists()) {
        return this.convertFirestoreEvent(eventSnap.id, eventSnap.data());
      }
      return null;
    } catch (error) {
      console.error('Error getting calendar event:', error);
      return null;
    }
  }

  getEventsByDependentLive(dependentId: string): Observable<CalendarEvent[]> {
    return new Observable((observer) => {
      const eventsCollection = collection(this.firebaseService.firestore, `dependents/${dependentId}/calendar_events`);
      const constraints: QueryConstraint[] = [];

      const q = query(eventsCollection, ...constraints);

      // Usar onSnapshot para sincronización en tiempo real
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const events = querySnapshot.docs
            .map((doc) => this.convertFirestoreEvent(doc.id, doc.data()))
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
          observer.next(events);
        },
        (error) => {
          console.error('Error listening to calendar events:', error);
          observer.error(error);
        }
      );

      // Retornar función de cleanup
      return () => unsubscribe();
    });
  }

  getEventsBetween(
    dependentId: string,
    startDate: Date,
    endDate: Date
  ): Observable<CalendarEvent[]> {
    const eventsCollection = collection(this.firebaseService.firestore, `dependents/${dependentId}/calendar_events`);
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const constraints: QueryConstraint[] = [
      where('startDate', '>=', startTimestamp),
      where('startDate', '<=', endTimestamp),
    ];

    const q = query(eventsCollection, ...constraints);

    return from(getDocs(q)).pipe(
      map((querySnapshot) =>
        querySnapshot.docs
          .map((doc) => this.convertFirestoreEvent(doc.id, doc.data()))
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      )
    );
  }

  getEventsByType(dependentId: string, type: string): Observable<CalendarEvent[]> {
    const eventsCollection = collection(this.firebaseService.firestore, `dependents/${dependentId}/calendar_events`);
    const constraints: QueryConstraint[] = [
      where('type', '==', type),
    ];

    const q = query(eventsCollection, ...constraints);

    return from(getDocs(q)).pipe(
      map((querySnapshot) =>
        querySnapshot.docs
          .map((doc) => this.convertFirestoreEvent(doc.id, doc.data()))
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      )
    );
  }

  private convertFirestoreEvent(id: string, data: any): CalendarEvent {
    const type = (data.type || 'other') as EventType;
    return {
      id,
      dependentId: data.dependentId,
      title: data.title,
      description: data.description || '',
      startDate: data.startDate?.toDate() || new Date(),
      endDate: data.endDate?.toDate() || new Date(),
      type: type,
      color: EVENT_COLORS[type],
      createdBy: data.createdBy,
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
      reminder: data.reminder || false,
      reminderTime: data.reminderTime,
      notes: data.notes,
      recurrence: data.recurrence,
    };
  }
}
