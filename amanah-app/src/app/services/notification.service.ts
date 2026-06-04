import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getAuth } from 'firebase/auth';
import { environment } from '../../environments/environment';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  type: 'task' | 'appointment' | 'medication' | 'message' | 'info' | 'success' | 'error';
  timestamp: Date;
  onClick?: () => void;
  createdByUserId?: string;
}

// Estado global: ¿está el usuario dentro del chat?
export const chatState = {
  isInsideChat: false,
  activeDependentId: null as string | null
};

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  public notifications$: Observable<AppNotification[]> = this.notificationsSubject.asObservable();

  private notificationPermission: NotificationPermission = 'default';
  private notificationCounter = 0;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private readonly STORAGE_KEY = 'amanah_notifications';

  // Almacenar timers programados para poder cancelarlos
  private readonly scheduledTimers: Map<string, number> = new Map();

  constructor() {
    this.initializeNotifications();
    this.loadFromLocalStorage();
  }

  /**
   * Obtiene el ID del usuario actual
   */
  private getCurrentUserId(): string | null {
    try {
      const auth = getAuth();
      return auth.currentUser?.uid || null;
    } catch (error) {
      console.warn('Auth no inicializado:', error);
      return null;
    }
  }

  /**
   * Carga notificaciones desde localStorage
   */
  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const notifications = JSON.parse(stored) as AppNotification[];
        // Convertir timestamps strings a Date objects
        const parsed = notifications.map(n => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
        this.notificationsSubject.next(parsed);
      }
    } catch (error) {
      console.error('Error cargando notificaciones de localStorage:', error);
      this.notificationsSubject.next([]);
    }
  }

  /**
   * Guarda notificaciones en localStorage
   */
  private saveToLocalStorage(): void {
    try {
      const notifications = this.notificationsSubject.value;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Error guardando notificaciones en localStorage:', error);
    }
  }

  /**
   * Inicializa el servicio de notificaciones
   */
  private initializeNotifications(): void {
    if ('Notification' in window) {
      this.notificationPermission = Notification.permission;
      console.log('Notificaciones disponibles. Permiso actual:', this.notificationPermission);

      // Registrar service worker si es disponible
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          console.log('Service Worker registrado para notificaciones');

          // Limpiar notificaciones viejas al cargar la app
          this.clearOldNotifications(registration);
        });
      }
    } else {
      console.warn('Notificaciones no soportadas en este navegador');
    }
  }

  /**
   * Solicita permiso para enviar notificaciones
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notificaciones no soportadas');
      return false;
    }

    if (this.notificationPermission === 'granted') {
      console.log('Permisos de notificación ya concedidos');
      return true;
    }

    if (this.notificationPermission === 'denied') {
      console.warn('Permisos de notificación denegados');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      console.log('Permiso de notificación:', permission);
      return permission === 'granted';
    } catch (error) {
      console.error('Error solicitando permiso de notificaciones:', error);
      return false;
    }
  }

  /**
   * Obtiene el estado actual del permiso
   */
  getPermissionStatus(): NotificationPermission {
    return this.notificationPermission;
  }

  /**
   * Envía una notificación push al dispositivo
   */
  sendNotification(title: string, options?: NotificationOptions & { type?: string }): void {
    console.log(`[SEND-NOTIF] Intentando enviar notificación. Permiso: ${this.notificationPermission}`);

    if (this.notificationPermission !== 'granted') {
      console.warn(`[SEND-NOTIF] ❌ Permisos de notificación NO concedidos (${this.notificationPermission})`);
      return;
    }

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Enviar a través del service worker
        console.log(`[SEND-NOTIF] Enviando a través de Service Worker`);
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options
        });
      } else {
        // Enviar notificación directa
        console.log(`[SEND-NOTIF] Enviando notificación DIRECTA al navegador`);
        const notification = new Notification(title, {
          icon: '/assets/logos/amanah-logo.svg',
          badge: '/assets/logos/amanah-logo.svg',
          ...options
        });

        // Manejar click en notificación
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }

      console.log(`[SEND-NOTIF] ✅ Notificación enviada: "${title}"`);
    } catch (error) {
      console.error(`[SEND-NOTIF] ❌ Error enviando notificación:`, error);
    }
  }

  /**
   * Notificación de nueva tarea - NO se envía al creador
   */
  notifyNewTask(taskTitle: string, dueDate: string, createdByUserId?: string): void {
    // No enviar notificación al usuario que creó la tarea
    if (createdByUserId && createdByUserId === this.getCurrentUserId()) {
      console.log('No notificar al creador de la tarea');
      return;
    }

    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Nueva Tarea',
      body: `${taskTitle} - Vencimiento: ${dueDate}`,
      type: 'task',
      timestamp: new Date(),
      icon: '/assets/icons/task.png',
      createdByUserId
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/task.png',
      tag: `task-${taskTitle}-${dueDate}-${id}`,
    });
  }

  /**
   * Notificación de cita próxima
   */
  notifyUpcomingAppointment(doctor: string, date: string, time: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: '📅 Hora de la Cita',
      body: `${doctor} - ${date} a las ${time}`,
      type: 'appointment',
      timestamp: new Date(),
      icon: '/assets/icons/estetoscopio.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/estetoscopio.png',
      tag: `appointment-${doctor}-${date}-${id}`,
    });
  }

  /**
   * Notificación de medicación
   */
  notifyMedication(medicationName: string, dose: string, time: string): void {
    console.log(`[notifyMedication] Creando notificación para medicación: ${medicationName}`);
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: '💊 Hora de Medicación',
      body: `${medicationName} (${dose}) - ${time}`,
      type: 'medication',
      timestamp: new Date(),
      icon: '/assets/medication-icons/pastillas.png'
    };

    console.log(`[notifyMedication] Añadiendo notificación a la lista`);
    this.addNotification(notification);

    console.log(`[notifyMedication] Enviando notificación push`);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/medication-icons/pastillas.png',
      tag: `medication-${medicationName}-${time}-${id}`,
    });
  }

  /**
   * Notificación de nuevo mensaje - NO se envía al remitente
   * NO se envía si el usuario está dentro del chat
   */
  notifyNewMessage(senderName: string, message: string, senderUserId?: string, dependentId?: string): void {
    // No enviar notificación al usuario que envió el mensaje
    if (senderUserId && senderUserId === this.getCurrentUserId()) {
      return;
    }

    // No enviar notificación si el usuario está dentro del chat del dependiente
    if (chatState.isInsideChat && dependentId && chatState.activeDependentId === dependentId) {
      console.log('Usuario está dentro del chat, no enviar notificación');
      return;
    }

    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Nuevo Mensaje',
      body: `${senderName}: ${message.substring(0, 50)}...`,
      type: 'message',
      timestamp: new Date(),
      icon: '/assets/icons/mensaje.png',
      createdByUserId: senderUserId
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/mensaje.png',
      tag: 'message',
    });
  }

  /**
   * Notificación de tarea actualizada - NO se envía al usuario que hizo el cambio
   * changeType: qué cambió (horario, fecha, descripción, prioridad, etc)
   */
  notifyTaskUpdated(taskTitle: string, dueDate: string, changeType: string = 'se actualizó', updatedByUserId?: string): void {
    // No notificar al usuario que hizo el cambio
    if (updatedByUserId && updatedByUserId === this.getCurrentUserId()) {
      console.log('No notificar al que actualizó la tarea');
      return;
    }

    const id = this.generateId();
    const changeMessage = this.getChangeMessage(changeType);
    const notification: AppNotification = {
      id,
      title: 'Tarea Actualizada',
      body: `${taskTitle} ${changeMessage} (Vencimiento: ${dueDate})`,
      type: 'task',
      timestamp: new Date(),
      icon: '/assets/icons/task.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/task.png',
      tag: 'task-updated',
    });
  }

  /**
   * Notificación cuando se marca una tarea como completada
   */
  notifyTaskCompleted(taskTitle: string, dueDate: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Tarea Completada',
      body: `${taskTitle} fue completada (Vencimiento: ${dueDate})`,
      type: 'task',
      timestamp: new Date(),
      icon: '/assets/icons/task.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/task.png',
      tag: 'task-completed',
    });
  }

  /**
   * Notificación de cita actualizada - NO se envía al usuario que hizo el cambio
   */
  notifyAppointmentUpdated(doctor: string, date: string, time: string, changeType: string = 'se actualizó', updatedByUserId?: string): void {
    // No notificar al usuario que hizo el cambio
    if (updatedByUserId && updatedByUserId === this.getCurrentUserId()) {
      return;
    }

    const id = this.generateId();
    const changeMessage = this.getChangeMessage(changeType);
    const notification: AppNotification = {
      id,
      title: 'Cita Actualizada',
      body: `${doctor} ${changeMessage} (${date} a las ${time})`,
      type: 'appointment',
      timestamp: new Date(),
      icon: '/assets/icons/estetoscopio.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/estetoscopio.png',
      tag: 'appointment-updated',
    });
  }

  /**
   * Notificación cuando se marca una cita como completada
   */
  notifyAppointmentCompleted(doctor: string, date: string, time: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Cita Completada',
      body: `${doctor} fue completada (${date} a las ${time})`,
      type: 'appointment',
      timestamp: new Date(),
      icon: '/assets/icons/estetoscopio.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/estetoscopio.png',
      tag: 'appointment-completed',
    });
  }

  /**
   * Notificación de medicación actualizada - NO se envía al usuario que hizo el cambio
   */
  notifyMedicationUpdated(medicationName: string, dose: string, time: string, changeType: string = 'se actualizó', updatedByUserId?: string): void {
    // No notificar al usuario que hizo el cambio
    if (updatedByUserId && updatedByUserId === this.getCurrentUserId()) {
      return;
    }

    const id = this.generateId();
    const changeMessage = this.getChangeMessage(changeType);
    const notification: AppNotification = {
      id,
      title: 'Medicación Actualizada',
      body: `${medicationName} ${changeMessage} (${dose})`,
      type: 'medication',
      timestamp: new Date(),
      icon: '/assets/medication-icons/pastillas.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/medication-icons/pastillas.png',
      tag: 'medication-updated',
    });
  }

  /**
   * Notificación cuando se marca una medicación como tomada
   */
  notifyMedicationTaken(medicationName: string, dose: string, time: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Medicación Registrada',
      body: `${medicationName} (${dose}) fue tomada a las ${time}`,
      type: 'medication',
      timestamp: new Date(),
      icon: '/assets/medication-icons/pastillas.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/medication-icons/pastillas.png',
      tag: 'medication-taken',
    });
  }

  /**
   * Notificación de documento subido
   */
  notifyDocumentUploaded(documentName: string, documentType: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Documento Subido',
      body: `${documentName} (${documentType})`,
      type: 'info',
      timestamp: new Date(),
      icon: '/assets/icons/certificado.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/certificado.png',
      tag: 'document',
    });
  }

  /**
   * Notificación de cuidador añadido
   */
  notifyCaregiverAdded(caregiverName: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title: 'Cuidador Añadido',
      body: `${caregiverName} ha sido añadido como cuidador`,
      type: 'info',
      timestamp: new Date(),
      icon: '/assets/icons/acompañantes.png'
    };

    this.addNotification(notification);
    this.sendNotification(notification.title, {
      body: notification.body,
      icon: '/assets/icons/acompañantes.png',
      tag: 'caregiver',
    });
  }

  /**
   * Notificación genérica (SOLO para uso interno, sin push)
   */
  notifyInfo(title: string, body: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title,
      body,
      type: 'info',
      timestamp: new Date(),
      icon: '/assets/logos/amanah-logo.svg'
    };

    // SOLO notificación interna, sin push
    this.addNotification(notification);
  }

  notifySuccess(title: string, body: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title,
      body,
      type: 'success',
      timestamp: new Date(),
      icon: '/assets/logos/amanah-logo.svg'
    };

    this.addNotification(notification);
  }

  notifyError(title: string, body: string): void {
    const id = this.generateId();
    const notification: AppNotification = {
      id,
      title,
      body,
      type: 'error',
      timestamp: new Date(),
      icon: '/assets/logos/amanah-logo.svg'
    };

    this.addNotification(notification);
  }

  /**
   * Añade una notificación a la lista local
   */
  private addNotification(notification: AppNotification): void {
    const current = this.notificationsSubject.value;
    const updated = [notification, ...current];
    this.notificationsSubject.next(updated);
    this.saveToLocalStorage();

    // Ya no auto-eliminamos las notificaciones
    // El usuario las puede eliminar manualmente desde el historial
  }

  /**
   * Obtiene todas las notificaciones
   */
  getNotifications(): AppNotification[] {
    return this.notificationsSubject.value;
  }

  /**
   * Elimina una notificación específica
   */
  deleteNotification(id: string): void {
    const updated = this.notificationsSubject.value.filter(n => n.id !== id);
    this.notificationsSubject.next(updated);
    this.saveToLocalStorage();
  }

  /**
   * Limpia todas las notificaciones
   */
  clearNotifications(): void {
    this.notificationsSubject.next([]);
    this.saveToLocalStorage();
  }

  /**
   * Alias para clearNotifications
   */
  clearAllNotifications(): void {
    this.clearNotifications();
  }

  /**
   * Genera un ID único para la notificación
   */
  private generateId(): string {
    return `notification-${++this.notificationCounter}-${Date.now()}`;
  }

  /**
   * Suscribirse a push notifications (requiere Service Worker)
   */
  async subscribeToPushNotifications(registration: ServiceWorkerRegistration): Promise<void> {
    this.serviceWorkerRegistration = registration;

    try {
      // Verificar si el navegador soporta push notifications
      if (!('PushManager' in window)) {
        console.warn('Advertencia: Push Notifications no soportadas en este navegador');
        return;
      }

      // Obtener suscripción existente
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Si no hay suscripción y tenemos permisos, crear una
        if (this.notificationPermission === 'granted') {
          const vapidPublicKey = (environment as any).vapidPublicKey as string | undefined;

          if (!vapidPublicKey) {
            console.info('Push notifications deshabilitadas: falta vapidPublicKey en environment');
            return;
          }

          try {
            // Crear suscripción web push con VAPID key
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey) as BufferSource
            });
            console.log('Suscrito a push notifications:', subscription);
          } catch (error) {
            console.warn('Advertencia: No se pudo suscribir a push notifications:', error);
          }
        }
      } else {
        console.log('Información: Ya estás suscrito a push notifications');
      }
    } catch (error) {
      console.error('Error en subscribeToPushNotifications:', error);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Reprogramar todos los recordatorios de medicaciones al cargar la app
   */
  rescheduleMedicationReminders(medications: any[], userId: string): void {
    console.log(`[DEBUG] Reprogramando recordatorios de medicaciones para userId: ${userId}`);
    console.log(`[DEBUG] Total medicaciones: ${medications?.length || 0}`);

    // Cancelar todos los timers de medicaciones anteriores para evitar duplicados
    Array.from(this.scheduledTimers.keys())
      .filter(key => key.startsWith('medication-'))
      .forEach(key => this.cancelScheduledNotification(key));

    medications.forEach(medication => {
      console.log(`[DEBUG] Procesando medicación: ${medication.name}`);
      if (medication.schedules && Array.isArray(medication.schedules)) {
        console.log(`[DEBUG] - Tiene ${medication.schedules.length} schedules`);
        medication.schedules.forEach((schedule: any, index: number) => {
          console.log(`[DEBUG] - Schedule ${index}: reminder=${JSON.stringify(schedule.reminder)}, enabled=${schedule.reminder?.enabled}`);
          if (schedule.reminder && schedule.reminder.enabled) {
            // Calcular la próxima vez que se debe tomar la medicación
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Para medicaciones diarias
            const [hours, minutes] = schedule.time.split(':').map(Number);
            const scheduledTime = new Date(today);
            scheduledTime.setHours(hours, minutes, 0, 0);

            // Calcular cuándo debería enviarse la notificación (minutesBefore antes)
            const minutesBefore = schedule.reminder.minutesBefore || 15;
            const notificationTime = new Date(scheduledTime);
            notificationTime.setMinutes(notificationTime.getMinutes() - minutesBefore);

            // Si la hora de notificación ya pasó hoy, programar para mañana
            if (notificationTime < new Date()) {
              scheduledTime.setDate(scheduledTime.getDate() + 1);
              console.log(`[DEBUG] - Hora de notificación ya pasó (${notificationTime.toISOString()} < ahora), reprogramando para mañana`);
            }

            console.log(`[DEBUG] - Llamando scheduleMedicationNotification: ${medication.name}, horario: ${schedule.time}, fecha: ${scheduledTime.toISOString()}, minutesBefore: ${schedule.reminder.minutesBefore || 15}`);

            this.scheduleMedicationNotification(
              medication.name,
              schedule.dosage,
              schedule.time,
              scheduledTime,
              userId,
              userId,
              schedule.reminder.minutesBefore || 15
            );
          }
        });
      }
    });
  }

  /**
   * Reprogramar todos los recordatorios de citas al cargar la app
   */
  rescheduleAppointmentReminders(appointments: any[], userId: string): void {
    // Cancelar todos los timers de citas anteriores para evitar duplicados
    Array.from(this.scheduledTimers.keys())
      .filter(key => key.startsWith('appointment-'))
      .forEach(key => this.cancelScheduledNotification(key));

    appointments.forEach(appointment => {
      if (
        appointment.reminder &&
        appointment.reminder.enabled &&
        appointment.status === 'scheduled'
      ) {
        const appointmentDate = new Date(appointment.date);

        // Calcular cuándo debería enviarse la notificación (minutesBefore antes)
        const minutesBefore = appointment.reminder.minutesBefore || 60;
        const notificationTime = new Date(appointmentDate);
        notificationTime.setMinutes(notificationTime.getMinutes() - minutesBefore);

        // Solo programar si la notificación aún está en el futuro
        if (notificationTime > new Date()) {
          this.scheduleAppointmentNotification(
            appointment.doctor || 'Cita',
            appointment.specialty,
            appointmentDate,
            appointment.time,
            appointment.location,
            userId,
            userId,
            minutesBefore
          );
        }
      }
    });
  }

  /**
   * Reprogramar todos los recordatorios de tareas al cargar la app
   */
  rescheduleTaskReminders(tasks: any[], userId: string): void {
    // Cancelar todos los timers de tareas anteriores para evitar duplicados
    Array.from(this.scheduledTimers.keys())
      .filter(key => key.startsWith('task-'))
      .forEach(key => this.cancelScheduledNotification(key));

    tasks.forEach(task => {
      if (
        task.reminder &&
        task.reminder.enabled &&
        task.status === 'pending' &&
        task.assignedTo &&
        task.assignedTo.some((assignee: any) => assignee.userId === userId)
      ) {
        const dueDate = new Date(task.dueDate);

        // Calcular cuándo debería enviarse la notificación (minutesBefore antes)
        const minutesBefore = task.reminder.minutesBefore || 60;
        const notificationTime = new Date(dueDate);
        notificationTime.setMinutes(notificationTime.getMinutes() - minutesBefore);

        // Solo programar si la notificación aún está en el futuro
        if (notificationTime > new Date()) {
          this.scheduleTaskNotification(
            task.title,
            dueDate,
            task.priority,
            task.assignedTo.map((a: any) => a.userId),
            userId,
            minutesBefore
          );
        }
      }
    });
  }

  /**
   * Genera el mensaje descriptivo del cambio en una tarea, medicación o cita
   */
  private getChangeMessage(changeType: string): string {
    const messages: { [key: string]: string } = {
      'horario': 'cambió su horario',
      'fecha': 'cambió su fecha',
      'hora': 'cambió su hora',
      'descripcion': 'cambió su descripción',
      'prioridad': 'cambió su prioridad',
      'asignacion': 'fue reasignada',
      'estado': 'cambió su estado',
      'dosis': 'cambió su dosis',
      'doctor': 'cambió el médico',
      'especialidad': 'cambió la especialidad',
    };
    return messages[changeType] || 'se actualizó';
  }

  /**
   * Enviar notificación a través del Service Worker (funciona cuando la app está cerrada)
   * NOTA: Este método ya no se usa, se usa sendNotification directamente
   */
  private sendViaServiceWorkerIfAvailable(title: string, options?: NotificationOptions): void {
    if (!this.serviceWorkerRegistration) {
      return; // Service Worker no registrado aún
    }

    if (this.notificationPermission !== 'granted') {
      return; // Sin permisos
    }

    this.serviceWorkerRegistration.showNotification(title, {
      icon: '/assets/logos/amanah-logo.svg',
      badge: '/assets/logos/amanah-logo.svg',
      requireInteraction: true,
      ...options
    }).catch(error => {
      console.warn('No se pudo mostrar notificación del Service Worker:', error);
    });
  }

  /**
   * Limpiar todas las notificaciones antiguas cuando se carga la app
   */
  private clearOldNotifications(registration: ServiceWorkerRegistration): void {
    registration.getNotifications().then(notifications => {
      console.log(`[NOTIF-CLEANUP] Encontradas ${notifications.length} notificaciones antiguas`);

      // Cerrar TODAS las notificaciones viejas (mantener limpio)
      notifications.forEach(notification => {
        console.log(`[NOTIF-CLEANUP] Cerrando: ${notification.title}`);
        notification.close();
      });

      console.log(`[NOTIF-CLEANUP] ✅ Limpieza completada - ${notifications.length} notificaciones cerradas`);
    }).catch(error => {
      console.warn('[NOTIF-CLEANUP] Error limpiando notificaciones:', error);
    });
  }

  /**
   * Programar notificación para una medicación en el futuro
   */
  scheduleMedicationNotification(
    medicationName: string,
    dosage: string,
    scheduledTime: string, // Formato: "HH:mm"
    date: Date,
    userId: string,
    currentUserId: string,
    minutesBefore: number = 15
  ): void {
    console.log(`[DEBUG-MED] Iniciando scheduleMedicationNotification: ${medicationName}`);

    // Solo programar si el usuario actual es quien debe recibir la notificación
    if (userId !== currentUserId) {
      console.log(`[DEBUG-MED] - Usuario no coincide: ${userId} !== ${currentUserId}`);
      return;
    }

    const notificationTime = this.parseScheduledTime(scheduledTime, date);
    console.log(`[DEBUG-MED] - Hora parseada: ${notificationTime.toISOString()}`);

    // Restar los minutos del recordatorio
    notificationTime.setMinutes(notificationTime.getMinutes() - minutesBefore);
    console.log(`[DEBUG-MED] - Hora después de restar ${minutesBefore} min: ${notificationTime.toISOString()}`);

    const now = new Date();
    console.log(`[DEBUG-MED] - Hora actual: ${now.toISOString()}`);

    // No programar notificaciones para tiempos pasados
    if (notificationTime <= now) {
      console.warn(`[DEBUG-MED] ⚠️ No se puede programar notificación para una hora pasada: ${notificationTime.toISOString()} <= ${now.toISOString()}`);
      return;
    }

    const timerId = `medication-${medicationName}-${date.toISOString()}`;
    const timeUntilNotification = notificationTime.getTime() - now.getTime();
    console.log(`[DEBUG-MED] - Timer ID: ${timerId}`);
    console.log(`[DEBUG-MED] - Tiempo hasta notificación: ${timeUntilNotification}ms (${(timeUntilNotification / 1000 / 60).toFixed(2)} minutos)`);

    // Cancelar timer anterior si existe
    if (this.scheduledTimers.has(timerId)) {
      console.log(`[DEBUG-MED] - Cancelando timer anterior`);
      clearTimeout(this.scheduledTimers.get(timerId));
    }

    const timeout = setTimeout(() => {
      console.log(`[NOTIFY] 🔔 ¡ENVIANDO NOTIFICACIÓN DE MEDICACIÓN: ${medicationName}!`);
      this.notifyMedication(medicationName, dosage, scheduledTime);
      this.scheduledTimers.delete(timerId);
    }, timeUntilNotification);

    this.scheduledTimers.set(timerId, timeout);
    console.log(`[DEBUG-MED] ✅ Notificación de medicación PROGRAMADA: ${medicationName}\n  Horario: ${scheduledTime}\n  Fecha: ${date.toLocaleDateString('es-ES')}\n  Se enviará en: ${(timeUntilNotification / 1000 / 60).toFixed(2)} minutos\n  A las: ${notificationTime.toLocaleTimeString('es-ES')}`);
  }

  /**
   * Programar notificación para una cita en el futuro
   */
  scheduleAppointmentNotification(
    doctor: string,
    specialty: string,
    appointmentDate: Date,
    appointmentTime: string, // Formato: "HH:mm"
    location: string,
    userId: string,
    currentUserId: string,
    minutesBefore: number = 60
  ): void {
    // Solo programar si el usuario actual es quien debe recibir la notificación
    if (userId !== currentUserId) {
      return;
    }

    const notificationTime = this.parseScheduledTime(appointmentTime, appointmentDate);

    // Restar los minutos del recordatorio
    notificationTime.setMinutes(notificationTime.getMinutes() - minutesBefore);

    const now = new Date();

    // No programar notificaciones para tiempos pasados
    if (notificationTime <= now) {
      console.warn(`No se puede programar notificación para una hora pasada: ${appointmentTime} - ${minutesBefore} minutos`);
      return;
    }

    const timerId = `appointment-${doctor}-${appointmentDate.toISOString()}`;
    const timeUntilNotification = notificationTime.getTime() - now.getTime();

    // Cancelar timer anterior si existe
    if (this.scheduledTimers.has(timerId)) {
      clearTimeout(this.scheduledTimers.get(timerId));
    }

    const timeout = setTimeout(() => {
      this.notifyUpcomingAppointment(doctor, appointmentDate.toLocaleDateString('es-ES'), appointmentTime);
      this.scheduledTimers.delete(timerId);
    }, timeUntilNotification);

    this.scheduledTimers.set(timerId, timeout);
    console.log(`Notificación de cita programada para ${doctor} a las ${appointmentTime} (recordatorio: ${minutesBefore} minutos antes)`);
  }

  /**
   * Programar notificación para una tarea en el futuro
   */
  scheduleTaskNotification(
    taskTitle: string,
    dueDate: Date,
    priority: string,
    assignedUserIds: string[],
    currentUserId: string,
    minutesBefore: number = 60
  ): void {
    // Solo programar si el usuario actual está en la lista de asignados
    if (!assignedUserIds.includes(currentUserId)) {
      return;
    }

    const now = new Date();

    // No programar notificaciones para tiempos pasados
    if (dueDate <= now) {
      console.warn('No se puede programar notificación para una fecha pasada');
      return;
    }

    // Programar notificación X minutos antes del vencimiento
    const notificationTime = new Date(dueDate.getTime() - minutesBefore * 60 * 1000);

    // Si la hora de notificación también es pasada, no programar
    if (notificationTime <= now) {
      console.warn('La fecha de vencimiento es muy próxima o pasada');
      return;
    }

    const timerId = `task-${taskTitle}-${dueDate.toISOString()}`;
    const timeUntilNotification = notificationTime.getTime() - now.getTime();

    // Cancelar timer anterior si existe
    if (this.scheduledTimers.has(timerId)) {
      clearTimeout(this.scheduledTimers.get(timerId));
    }

    const priorityEmoji = this.getPriorityEmoji(priority);

    const timeout = setTimeout(() => {
      const title = `${priorityEmoji} Recordatorio: ${taskTitle}`;
      const id = this.generateId();

      // Agregar al historial de notificaciones
      const notification: AppNotification = {
        id,
        title,
        body: `Vencimiento: ${dueDate.toLocaleDateString('es-ES')} a las ${dueDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
        type: 'task',
        timestamp: new Date(),
        icon: '/assets/icons/task.png'
      };

      console.log(`[notifyTask] Creando notificación para tarea: ${taskTitle}`);
      this.addNotification(notification);

      console.log(`[notifyTask] Enviando notificación push`);
      this.sendNotification(title, {
        body: notification.body,
        icon: '/assets/icons/task.png',
        tag: `task-${taskTitle}-${dueDate.toISOString()}-${id}`
      });
      this.scheduledTimers.delete(timerId);
    }, timeUntilNotification);

    this.scheduledTimers.set(timerId, timeout);
    console.log(`Notificación de tarea programada para ${taskTitle} (recordatorio: ${minutesBefore} minutos antes)`);
  }

  /**
   * Cancelar notificación programada
   */
  cancelScheduledNotification(timerId: string): void {
    if (this.scheduledTimers.has(timerId)) {
      clearTimeout(this.scheduledTimers.get(timerId));
      this.scheduledTimers.delete(timerId);
      console.log(`Notificación programada cancelada: ${timerId}`);
    }
  }

  /**
   * Cancelar todas las notificaciones programadas
   */
  cancelAllScheduledNotifications(): void {
    this.scheduledTimers.forEach(timeout => clearTimeout(timeout));
    this.scheduledTimers.clear();
    console.log('Todas las notificaciones programadas han sido canceladas');
  }

  /**
   * Parsear hora en formato "HH:mm" con una fecha para obtener un Date
   */
  private parseScheduledTime(timeString: string, baseDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const notificationTime = new Date(baseDate);
    notificationTime.setHours(hours, minutes, 0, 0);
    return notificationTime;
  }

  /**
   * Obtener emoji según la prioridad
   */
  private getPriorityEmoji(priority: string): string {
    const emojiMap: { [key: string]: string } = {
      'high': '🔴',
      'medium': '🟡',
      'low': '🟢'
    };
    return emojiMap[priority] || '📌';
  }
}
