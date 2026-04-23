import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, AppNotification } from '../../services/notification.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-notification-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-container.component.html',
  styleUrls: ['./notification-container.component.scss'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(400px)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ transform: 'translateX(400px)', opacity: 0 }))
      ])
    ])
  ]
})
export class NotificationContainerComponent implements OnInit {
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  notifications: AppNotification[] = [];
  visibleNotificationIds = new Set<string>();

  ngOnInit(): void {
    this.notificationService.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(notifications => {
        // Solo mostrar notificaciones que aún no han sido cerradas
        this.notifications = notifications.filter(n => this.visibleNotificationIds.has(n.id));

        // Agregar nuevas notificaciones a la lista visible
        notifications.forEach(n => {
          if (!this.visibleNotificationIds.has(n.id)) {
            this.visibleNotificationIds.add(n.id);
          }
        });
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

  dismissNotification(id: string): void {
    // Solo remover de la lista visible (toast), NO del historial
    this.visibleNotificationIds.delete(id);
    this.notifications = this.notifications.filter(n => n.id !== id);
  }
}
