import { Component, OnInit, signal, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../sidebar/sidebar';
import { HeaderComponent } from '../header/header';
import { BottomNavComponent } from '../bottom-nav/bottom-nav';
import { FeedbackHostComponent } from '../feedback-host/feedback-host.component';
import { SidebarService } from '../../services/sidebar.service';
import { NotificationService } from '../../services/notification.service';
import { filter, takeUntil, Subject } from 'rxjs';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent, BottomNavComponent, FeedbackHostComponent],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout implements OnInit, OnDestroy {
  showSidebar = signal(false);
  showBottomNav = signal(false);
  isFullHeightRoute = signal(false);
  private readonly showInRoute = signal(false);
  private readonly sidebarVisible = signal(true);
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly sidebarService: SidebarService,
    private readonly notificationService: NotificationService
  ) {}

  ngOnInit() {
    // Inicializar servicio de notificaciones y solicitar permisos
    this.initializeNotifications();

    this.sidebarService.sidebarVisible$
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => {
        this.sidebarVisible.set(visible);
        this.updateShowSidebar();
      });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        const url = event.url;
        const showNavRoutes = ['/dashboard', '/caregivers', '/create-dependent', '/edit-dependent', '/dependent-detail', '/calendar', '/tasks', '/medications', '/appointments', '/documents', '/profile', '/edit-profile', '/chat', '/notifications'];
        const showNavigation = showNavRoutes.some(route => url.startsWith(route));

        // Check if it's a full-height route (like chat)
        const fullHeightRoutes = ['/chat'];
        this.isFullHeightRoute.set(fullHeightRoutes.some(route => url.startsWith(route)));

        this.showInRoute.set(showNavigation);
        this.showBottomNav.set(showNavigation);
        this.updateShowSidebar();
      });
  }

  /**
   * Inicializa el servicio de notificaciones
   */
  private initializeNotifications(): void {
    this.notificationService.requestPermission().then(granted => {
      if (granted) {
        console.log('Notificaciones push habilitadas');
      }
    });
  }

  private updateShowSidebar(): void {
    this.showSidebar.set(this.sidebarVisible() && this.showInRoute());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
