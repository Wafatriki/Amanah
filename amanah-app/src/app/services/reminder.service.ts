import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { CalendarEvent } from '../models/calendar-event.model';

interface ReminderNotification {
  eventId: string;
  eventTitle: string;
  dependentId: string;
  notifyTime: Date;
  minutesBefore: number;
}

@Injectable({
  providedIn: 'root',
})
export class ReminderService {
  private reminderIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private notificationsSupported = 'Notification' in window;

  constructor(private readonly firebaseService: FirebaseService) {
    this.requestNotificationPermission();
  }

  private requestNotificationPermission(): void {
    if (this.notificationsSupported && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  /**
   * Inicia monitoreo de recordatorios para un dependiente
   */
  startReminder(dependentId: string): void {
    // Limpiar recordatorio anterior si existe
    this.stopReminder(dependentId);

    // Verificar recordatorios cada minuto
    const intervalId = setInterval(() => {
      this.checkAndNotifyReminders(dependentId);
    }, 60000); // Cada minuto

    this.reminderIntervals.set(dependentId, intervalId);

    // Verificar inmediatamente al iniciar
    this.checkAndNotifyReminders(dependentId);
  }

  /**
   * Detiene monitoreo de recordatorios
   */
  stopReminder(dependentId: string): void {
    const intervalId = this.reminderIntervals.get(dependentId);
    if (intervalId) {
      clearInterval(intervalId);
      this.reminderIntervals.delete(dependentId);
    }
  }

  /**
   * Verifica y notifica recordatorios activos
   */
  private async checkAndNotifyReminders(dependentId: string): Promise<void> {
    try {
      const eventsCollection = collection(this.firebaseService.firestore, 'calendar_events');
      const now = new Date();

      // Buscar eventos con recordatorio habilitado y que comiencen en las próximas 24 horas
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const q = query(
        eventsCollection,
        where('dependentId', '==', dependentId),
        where('reminder', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const reminders: ReminderNotification[] = [];

      querySnapshot.forEach((doc) => {
        const eventData = doc.data() as Record<string, any>;
        const startDate = eventData['startDate']?.toDate() || new Date();

        // Calcular cuándo notificar
        const minutesBefore = eventData['reminderTime'] || 15;
        const notifyTime = new Date(startDate.getTime() - minutesBefore * 60 * 1000);

        // Si es hora de notificar y no hemos notificado antes (verificar margin de 2 minutos)
        if (this.isTimeToNotify(now, notifyTime)) {
          reminders.push({
            eventId: doc.id,
            eventTitle: eventData['title'],
            dependentId: dependentId,
            notifyTime: notifyTime,
            minutesBefore: minutesBefore,
          });
        }
      });

      // Mostrar notificaciones
      reminders.forEach((reminder) => {
        this.showNotification(reminder);
        this.markReminderAsNotified(reminder.eventId);
      });
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  /**
   * Verifica si es hora de notificar (con margen de 2 minutos)
   */
  private isTimeToNotify(now: Date, notifyTime: Date): boolean {
    const timeDiff = now.getTime() - notifyTime.getTime();
    return timeDiff >= 0 && timeDiff < 2 * 60 * 1000; // Entre 0 y 2 minutos
  }

  /**
   * Muestra notificación del navegador
   */
  private showNotification(reminder: ReminderNotification): void {
    if (!this.notificationsSupported || Notification.permission !== 'granted') {
      // Mostrar notificación en la app como fallback
      console.log(`Recordatorio: ${reminder.eventTitle} en ${reminder.minutesBefore} minutos`);
      return;
    }

    const notification = new Notification(`Recordatorio: ${reminder.eventTitle}`, {
      body: `Tu evento comienza en ${reminder.minutesBefore} minutos`,
      icon: '/assets/icons/reminder.png',
      tag: `reminder-${reminder.eventId}`,
      requireInteraction: true,
    });

    // Al hacer click, cerrar notificación
    notification.onclick = () => {
      notification.close();
      window.focus();
    };

    // Auto-cerrar después de 10 segundos
    setTimeout(() => notification.close(), 10000);
  }

  /**
   * Marca un recordatorio como notificado para evitar notificaciones duplicadas
   */
  private async markReminderAsNotified(eventId: string): Promise<void> {
    try {
      const eventRef = doc(this.firebaseService.firestore, 'calendar_events', eventId);
      await updateDoc(eventRef, {
        reminderNotified: true,
        reminderNotifiedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error marking reminder as notified:', error);
    }
  }

  /**
   * Solicita permiso para notificaciones
   */
  requestPermission(): void {
    if (this.notificationsSupported) {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          console.log('Notificaciones habilitadas');
        }
      });
    }
  }

  /**
   * Verifica si las notificaciones están habilitadas
   */
  areNotificationsEnabled(): boolean {
    return this.notificationsSupported && Notification.permission === 'granted';
  }

  /**
   * Limpia todos los recordatorios
   */
  cleanup(): void {
    this.reminderIntervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.reminderIntervals.clear();
  }
}
