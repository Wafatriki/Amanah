import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { PermissionService } from '../../services/permission.service';
import { Subject, takeUntil, filter } from 'rxjs';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNavComponent implements OnInit, OnDestroy {
  navItems = [
    { icon: '/assets/icons/inicio.png', label: 'Inicio', path: '/dashboard', requiresWrite: false },
    { icon: '/assets/medication-icons/pastillas.png', label: 'Medicación', path: '/medications', requiresWrite: false },
    { icon: '/assets/icons/calendario.png', label: 'Citas', path: '/appointments', requiresWrite: false },
    { icon: '/assets/icons/usuario.png', label: 'Perfil', path: '/profile', requiresWrite: false },
  ];

  filteredNavItems: any[] = [];
  activeItem: string = '/dashboard';
  private destroy$ = new Subject<void>();

  constructor(
    private readonly activeDependentService: ActiveDependentService,
    private readonly permissionService: PermissionService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    // Subscribe to active dependent role changes to update nav items
    this.activeDependentService.getActiveDependentRole$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.filterNavItems();
      });

    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: any) => {
        this.updateActiveItem(event.urlAfterRedirects || event.url || this.router.url);
      });

    this.filterNavItems();
    this.updateActiveItem(this.router.url);
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
    const matchedItem = this.navItems.find(item => url.startsWith(item.path));
    this.activeItem = matchedItem?.path || '/dashboard';
  }

  navigate(path: string) {
    this.activeItem = path;
  }
}
