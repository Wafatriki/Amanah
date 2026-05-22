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
  private initialized = false;

  ngOnInit(): void {
    this.notificationService.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(notifications => {
        // Ignorar la emisión inicial que contiene el historial almacenado
        if (!this.initialized) {
          this.initialized = true;
          this.notifications = [];
          return;
        }

        queueMicrotask(() => {
          this.notifications = notifications.length > 0 ? [notifications[0]] : [];
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
    this.notificationService.deleteNotification(id);
  }
}
