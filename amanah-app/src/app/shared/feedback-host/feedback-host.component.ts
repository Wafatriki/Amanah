import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { NotificationContainerComponent } from '../notification-container/notification-container.component';

@Component({
  selector: 'app-feedback-host',
  standalone: true,
  imports: [CommonModule, NotificationContainerComponent],
  templateUrl: './feedback-host.component.html',
  styleUrl: './feedback-host.component.scss'
})
export class FeedbackHostComponent {
  constructor(private readonly uiFeedbackService: UiFeedbackService) {}

  get confirm$() {
    return this.uiFeedbackService.confirm$;
  }

  accept(): void {
    this.uiFeedbackService.accept();
  }

  decline(): void {
    this.uiFeedbackService.decline();
  }

  close(): void {
    this.uiFeedbackService.close();
  }
}