import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, AppNotification } from '../services/notification.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-notifications-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-center.component.html',
  styleUrl: './notifications-center.component.scss',
  animations: [
    trigger('notificationAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateY(-20px)' }))
      ])
    ])
  ]
})
export class NotificationsCenterComponent implements OnInit {
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  notifications: AppNotification[] = [];

  ngOnInit(): void {
    this.notificationService.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(notifications => {
        this.notifications = notifications;
      });
  }

  getIconPath(type: string): string {
    const iconPaths: { [key: string]: string } = {
      task: '/assets/icons/task.png',
      appointment: '/assets/icons/estetoscopio.png',
      medication: '/assets/medication-icons/pastillas.png',
      message: '/assets/icons/mensaje.png',
      info: '/assets/logos/amanah-logo.svg'
    };
    return iconPaths[type] || '/assets/logos/amanah-logo.svg';
  }

  getPermissionStatus(): string {
    const status = this.notificationService.getPermissionStatus();
    return status;
  }

  getPermissionStatusText(): string {
    const status = this.notificationService.getPermissionStatus();
    if (status === 'granted') {
      return '✅ Notificaciones push activadas - Recibirás alertas del navegador';
    } else if (status === 'denied') {
      return '❌ Notificaciones push denegadas - Pero puedes usar las notificaciones internas';
    }
    return 'Notificaciones no configuradas - Puedes habilitarlas ahora';
  }

  deleteNotification(id: string): void {
    this.notificationService.deleteNotification(id);
  }

  clearAll(): void {
    this.notificationService.clearAllNotifications();
  }

  requestPermission(): void {
    this.notificationService.requestPermission().then(granted => {
      if (granted) {
        // Notificaciones activadas (sin enviar notificación)
        console.log('Notificaciones activadas');
      }
    });
  }
}
