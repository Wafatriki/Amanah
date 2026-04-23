import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface PageHeader {
  title: string;
  subtitle?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PageHeaderService {
  private readonly headerSubject = new BehaviorSubject<PageHeader>({ title: '' });
  public header$: Observable<PageHeader> = this.headerSubject.asObservable();

  setHeader(title: string, subtitle?: string): void {
    this.headerSubject.next({ title, subtitle });
  }

  clearHeader(): void {
    this.headerSubject.next({ title: '' });
  }
}
