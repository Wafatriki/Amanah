import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarService } from '../../services/sidebar.service';
import { PageHeaderService } from '../../services/page-header.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  title: string = '';
  subtitle: string = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    public sidebarService: SidebarService,
    private readonly pageHeaderService: PageHeaderService
  ) {}

  ngOnInit(): void {
    this.pageHeaderService.header$
      .pipe(takeUntil(this.destroy$))
      .subscribe(header => {
        this.title = header.title;
        this.subtitle = header.subtitle || '';
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar() {
    this.sidebarService.toggleSidebar();
  }
}
