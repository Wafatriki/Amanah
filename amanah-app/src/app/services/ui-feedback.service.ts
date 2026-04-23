import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  dangerous?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UiFeedbackService {
  private readonly confirmSubject = new BehaviorSubject<ConfirmDialogConfig | null>(null);
  private confirmResolver: ((value: boolean) => void) | null = null;

  readonly confirm$ = this.confirmSubject.asObservable();

  confirm(config: ConfirmDialogConfig): Promise<boolean> {
    this.confirmSubject.next(config);

    return new Promise<boolean>(resolve => {
      this.confirmResolver = resolve;
    });
  }

  accept(): void {
    this.resolveConfirm(true);
  }

  decline(): void {
    this.resolveConfirm(false);
  }

  close(): void {
    this.resolveConfirm(false);
  }

  private resolveConfirm(value: boolean): void {
    if (this.confirmResolver) {
      this.confirmResolver(value);
    }

    this.confirmResolver = null;
    this.confirmSubject.next(null);
  }
}