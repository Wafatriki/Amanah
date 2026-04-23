import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarService } from '../../services/sidebar.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { PermissionService } from '../../services/permission.service';
import { Subject, takeUntil, filter } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent implements OnInit, OnDestroy {
  navItems = [
    { label: 'Inicio', path: '/dashboard', requiresWrite: false },
    { label: 'Perfil Dependiente', path: 'dependent-detail', special: true, requiresWrite: false },
    { label: 'Otros Dependientes', path: '/dependent-selector', requiresWrite: false },
    { label: 'Calendario', path: '/calendar', requiresWrite: false },
    { label: 'Tareas', path: '/tasks', requiresWrite: false },
    { label: 'Medicación', path: '/medications', requiresWrite: false },
    { label: 'Citas Médicas', path: '/appointments', requiresWrite: false },
    { label: 'Documentos', path: '/documents', requiresWrite: false },
    { label: 'Chat', path: '/chat', requiresWrite: true },
    { label: 'Cuidadores', path: '/caregivers', requiresWrite: true },
    { label: 'Notificaciones', path: '/notifications', requiresWrite: false },
    { label: 'Mi perfil', path: '/profile', requiresWrite: false },
  ];

  activeItem: string = '/dashboard';
  isSidebarOpen = false;
  filteredNavItems: any[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    public readonly sidebarService: SidebarService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly permissionService: PermissionService,
    private readonly router: Router
  ) {}

  ngOnInit() {
    // Subscribe to active dependent role changes to update nav items
    this.activeDependentService.getActiveDependentRole$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.filterNavItems();
      });

    this.sidebarService.sidebarOpen$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOpen => {
        this.isSidebarOpen = isOpen;
      });

    // Subscribe to route changes to update active item
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: any) => {
        this.updateActiveItem(event.urlAfterRedirects || event.url);
      });

    // Set initial active item based on current route
    this.updateActiveItem(this.router.url);
    this.filterNavItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private filterNavItems(): void {
    const isReadOnly = this.permissionService.isReadOnly();
    this.filteredNavItems = this.navItems.filter(item => {
      // Si es invitado y el item requiere permisos de escritura, ocultarlo
      if (isReadOnly && item.requiresWrite) {
        return false;
      }
      return true;
    });
  }

  private updateActiveItem(url: string): void {
    // Handle dependent-detail special case
    if (url.startsWith('/dependent-detail')) {
      this.activeItem = url;
    } else {
      // Find matching item
      const matchedItem = this.navItems.find(item => url.startsWith(item.path));
      if (matchedItem) {
        this.activeItem = matchedItem.path;
      }
    }
  }

  navigate(item: any) {
    // Special handling for "Perfil Dependiente"
    if (item.special && item.label === 'Perfil Dependiente') {
      const activeDependentId = this.activeDependentService.getActiveDependentId();
      if (activeDependentId) {
        this.activeItem = `/dependent-detail/${activeDependentId}`;
        this.router.navigate(['/dependent-detail', activeDependentId]);
      } else {
        // Si no hay dependiente activo, ir al selector
        this.activeItem = '/dependent-selector';
        this.router.navigate(['/dependent-selector']);
      }
    } else {
      this.activeItem = item.path;
      this.router.navigate([item.path]);
    }

    // Cerrar sidebar en mobile después de navegar
    if (window.innerWidth < 768) {
      this.sidebarService.closeSidebar();
    }
  }
}
