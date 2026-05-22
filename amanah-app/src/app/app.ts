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
    // Siempre limpiar SW/caches para evitar ejecutar bundles obsoletos en hosting.
    this.forceFreshClient();

    // Solicitar permisos de notificación al inicializar
    this.notificationService.requestPermission().then(granted => {
      if (granted) {
        console.log('Permisos de notificación concedidos');
      } else {
        console.log('Permisos de notificación denegados');
      }
    });
  }

  private forceFreshClient(): void {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistrations()
      .then(registrations => {
        registrations.forEach(reg => reg.unregister());
        console.log('Service Workers desregistrados para evitar caché obsoleta');
      })
      .catch(error => {
        console.warn('No se pudieron desregistrar Service Workers:', error);
      });

    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.map(key => caches.delete(key))))
        .then(() => console.log('CacheStorage limpiado al iniciar'))
        .catch(error => console.warn('No se pudo limpiar CacheStorage:', error));
    }
  }
}
