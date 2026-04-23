import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  private readonly sidebarOpenSubject = new BehaviorSubject<boolean>(false);
  private readonly sidebarVisibleSubject = new BehaviorSubject<boolean>(true);

  sidebarOpen$ = this.sidebarOpenSubject.asObservable();
  sidebarVisible$ = this.sidebarVisibleSubject.asObservable();

  toggleSidebar(): void {
    this.sidebarOpenSubject.next(!this.sidebarOpenSubject.value);
  }

  closeSidebar(): void {
    this.sidebarOpenSubject.next(false);
  }

  openSidebar(): void {
    this.sidebarOpenSubject.next(true);
  }

  isSidebarOpen(): boolean {
    return this.sidebarOpenSubject.value;
  }

  setSidebarVisible(visible: boolean): void {
    this.sidebarVisibleSubject.next(visible);
    if (!visible) {
      this.closeSidebar();
    }
  }

  isSidebarVisible(): boolean {
    return this.sidebarVisibleSubject.value;
  }
}
