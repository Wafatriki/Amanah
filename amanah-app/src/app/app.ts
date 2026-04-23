import { Component, signal, OnInit, inject } from '@angular/core';
import { Layout } from './shared/layout/layout';
import { NotificationService } from './services/notification.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [Layout],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('Amanah');
  private readonly notificationService = inject(NotificationService);

  ngOnInit(): void {
    // En desarrollo, desactivar SW para evitar cache de bundles viejos
    if (environment.production) {
      this.registerServiceWorker();
    } else {
      this.unregisterServiceWorkers();
    }

    // Solicitar permisos de notificación al inicializar
    this.notificationService.requestPermission().then(granted => {
      if (granted) {
        console.log('Permisos de notificación concedidos');
      } else {
        console.log('Permisos de notificación denegados');
      }
    });
  }

  private registerServiceWorker(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registrado:', registration);
          // Suscribirse a push notifications
          this.notificationService.subscribeToPushNotifications(registration);
        })
        .catch(error => {
          console.error('❌ Error registrando Service Worker:', error);
        });
    } else {
      console.warn('Advertencia: Service Worker no soportado en este navegador');
    }
  }

  private unregisterServiceWorkers(): void {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistrations()
      .then(registrations => {
        registrations.forEach(reg => reg.unregister());
        console.log('Service Workers desregistrados en desarrollo');
      })
      .catch(error => {
        console.warn('No se pudieron desregistrar Service Workers:', error);
      });
  }
}
