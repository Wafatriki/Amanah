import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActiveDependentService } from '../services/active-dependent.service';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { ChatService } from '../services/chat.service';
import { AIChatService } from '../services/ai-chat.service';
import { DependentService } from '../services/dependent.service';
import { ChatMessage } from '../models/chat.model';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { NotificationService } from '../services/notification.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  messages: ChatMessage[] = [];
  messageText = '';
  imagePreview: string | null = null;
  selectedFile: File | null = null;
  selectedFileName: string | null = null;

  currentUserId: string | null = null;
  currentUserName: string | null = null;
  activeDependentId: string | null = null;
  dependentName: string = '';
  dependentDescription: string = '';
  participantCount = 0;
  userNames: Map<string, string> = new Map();
  caregivers: Array<{ id: string; name: string; image?: string }> = [];

  loading = false;
  sending = false;
  error: string | null = null;

  // Propiedades para chat con IA
  showAIChat = false;
  aiMessages: Array<{ role: 'user' | 'ai'; text: string; timestamp: Date }> = [];
  aiSuggestedQuestions: string[] = [];
  aiLoading = false;
  aiShortcutHint = 'Enter para enviar · Shift+Enter para nueva línea';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly chatService: ChatService,
    private readonly aiChatService: AIChatService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly permissionService: PermissionService,
    private readonly dependentService: DependentService,
    private readonly router: Router,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly notificationService: NotificationService,
    private readonly cdr: ChangeDetectorRef
  ) {
    // Cargar preguntas sugeridas para el chat con IA
    this.aiSuggestedQuestions = this.aiChatService.getSuggestedQuestions();
  }

  ngOnInit(): void {
    // Check permission to access chat
    if (this.permissionService.isReadOnly()) {
      console.warn('Chat: User is read-only (invited), redirecting to dashboard');
      this.router.navigate(['/dashboard']);
      return;
    }
    // Load current user with proper fullName from Firestore
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async user => {
        if (user) {
          this.currentUserId = user.uid;
          // Get fullName from Firestore
          this.currentUserName = await this.authService.getUserFullName(user.uid);
          this.userNames.set(user.uid, this.currentUserName);
          console.log('Chat: Current user loaded', { uid: this.currentUserId, name: this.currentUserName });
        } else {
          console.warn('Chat: No current user found');
        }
        this.cdr.markForCheck();
      });

    // Load active dependent
    this.activeDependentService.activeDependentId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        this.activeDependentId = id;
        console.log('Chat: Active dependent ID:', id);
        if (id) {
          this.loadMessages();
          this.loadParticipants(id);
        } else {
          console.warn('Chat: No active dependent selected');
        }
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadMessages(): void {
    if (!this.activeDependentId) return;

    this.loading = true;
    this.chatService
      .getMessages(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (messages: ChatMessage[]) => {
          this.messages = messages;
          this.loading = false;
          this.cdr.markForCheck();
          this.scrollToBottom();

          // Marcar todos los mensajes sin leer como leídos (excepto los propios)
          this.markUnreadMessagesAsRead();
        },
        error: (err: any) => {
          console.error('Error loading messages:', err);
          this.error = 'Error al cargar mensajes';
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private markUnreadMessagesAsRead(): void {
    if (!this.activeDependentId || !this.currentUserId) return;

    // Filtrar mensajes sin leer que no sean del usuario actual
    const unreadMessageIds = this.messages
      .filter(msg => !msg.isRead && msg.userId !== this.currentUserId)
      .map(msg => msg.id)
      .filter((id): id is string => id !== undefined);

    // Marcar como leídos
    if (unreadMessageIds.length > 0) {
      this.chatService.markMessagesAsRead(this.activeDependentId, unreadMessageIds)
        .catch(err => console.error('Error marking messages as read:', err));
    }
  }

  private loadParticipants(dependentId: string): void {
    this.dependentService
      .getDependent(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (dependent: any) => {
          this.dependentName = dependent.name || 'Dependiente';
          this.dependentDescription = dependent.notes || '';
          // Count: dependiente + cuidadores
          const caregiverCount = dependent.caregivers?.length || 0;
          this.participantCount = caregiverCount + 1; // +1 para el dependiente

          // Load caregiver names from their profiles
          this.loadCaregiverNames(dependentId);

          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading participants:', err);
        }
      });
  }

  private loadCaregiverNames(dependentId: string): void {
    this.dependentService.getCaregiversForDependent(dependentId)
      .then((caregivers: any[]) => {
        console.log('Caregivers loaded:', caregivers);
        if (caregivers && Array.isArray(caregivers)) {
          // Usar directamente los datos que vienen del servicio
          this.caregivers = caregivers.map(caregiver => ({
            id: caregiver.userId,
            name: caregiver.name,
            image: caregiver.image || undefined
          }));

          console.log('Caregivers mapped:', this.caregivers);

          // Guardar en el mapa de nombres para los mensajes
          caregivers.forEach(caregiver => {
            this.userNames.set(caregiver.userId, caregiver.name);
          });

          this.cdr.markForCheck();
        } else {
          console.warn('No caregivers found or not an array');
        }
      })
      .catch((err: any) => {
        console.error('Error loading caregiver names:', err);
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      const maxSize = 500 * 1024; // 500KB (máximo en Firestore después de base64)

      // Validar tamaño
      if (file.size > maxSize) {
        this.error = `El archivo es demasiado grande (máximo 500KB, tu archivo es ${(file.size / 1024).toFixed(0)}KB)`;
        this.cdr.markForCheck();
        return;
      }

      this.selectedFile = file;
      this.selectedFileName = file.name;
      this.error = null;

      // Si es imagen, crear preview
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          this.imagePreview = e.target?.result as string;
          this.cdr.markForCheck();
        };
        reader.readAsDataURL(file);
      }

      this.cdr.markForCheck();
    }
  }

  removeImage(): void {
    this.selectedFile = null;
    this.selectedFileName = null;
    this.imagePreview = null;
    this.cdr.markForCheck();
  }

  sendMessage(): void {
    // Solo cuidadores pueden enviar mensajes
    if (this.permissionService.isReadOnly()) {
      this.error = 'No tienes permisos para enviar mensajes';
      return;
    }

    if (!this.activeDependentId || !this.currentUserId || !this.currentUserName) {
      this.error = 'Faltan datos de usuario o dependiente';
      return;
    }

    const text = this.messageText?.trim() || '';
    if (!text && !this.selectedFile) {
      this.error = 'Escribe un mensaje o adjunta un archivo';
      return;
    }

    this.sending = true;
    this.error = null;

    if (this.selectedFile) {
      // Validar que tenemos los IDs necesarios
      if (!this.activeDependentId || !this.currentUserId || !this.currentUserName) {
        this.error = 'Faltan datos de usuario o dependiente';
        this.sending = false;
        return;
      }

      // Si es imagen, usar imagePreview (data URL)
      if (this.imagePreview) {
        this.chatService
          .sendMessageWithFile(
            this.activeDependentId,
            this.currentUserId,
            this.currentUserName,
            text,
            this.imagePreview,
            this.selectedFile.name,
            this.selectedFile.type
          )
          .then(() => {
            this.messageText = '';
            this.removeImage();
            this.sending = false;
            this.cdr.markForCheck();
          })
          .catch((err: any) => {
            console.error('Error sending message:', err);
            this.error = 'Error al enviar mensaje';
            this.sending = false;
            this.cdr.markForCheck();
          });
      } else {
        // Para archivos no-imagen, convertir a base64
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
          const fileBase64 = e.target?.result as string;
          this.chatService
            .sendMessageWithFile(
              this.activeDependentId!,
              this.currentUserId!,
              this.currentUserName!,
              text,
              fileBase64,
              this.selectedFile!.name,
              this.selectedFile!.type
            )
            .then(() => {
              this.messageText = '';
              this.removeImage();
              this.sending = false;
              this.cdr.markForCheck();
            })
            .catch((err: any) => {
              console.error('Error sending message:', err);
              this.error = 'Error al enviar mensaje';
              this.sending = false;
              this.cdr.markForCheck();
            });
        };
        reader.readAsDataURL(this.selectedFile);
      }
    } else {
      // Enviar solo texto
      this.chatService
        .sendMessage(
          this.activeDependentId,
          this.currentUserId,
          this.currentUserName,
          text
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.messageText = '';
            this.sending = false;
            this.cdr.markForCheck();
          },
          error: (err: any) => {
            console.error('Error sending message:', err);
            this.error = 'Error al enviar mensaje';
            this.sending = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  deleteMessage(messageId: string): void {
    const dependentId = this.activeDependentId;
    if (!dependentId) return;

    this.uiFeedbackService.confirm({
      title: 'Eliminar mensaje',
      message: 'El mensaje se eliminará de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    }).then(confirmed => {
      if (!confirmed) return;

      this.chatService
        .deleteMessage(dependentId, messageId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.cdr.markForCheck();
            this.notificationService.notifySuccess('Mensaje eliminado', 'El mensaje se eliminó correctamente');
          },
          error: (err: any) => {
            console.error('Error deleting message:', err);
            this.error = 'Error al eliminar mensaje';
            this.cdr.markForCheck();
            this.notificationService.notifyError('Error', 'No se pudo eliminar el mensaje');
          }
        });
    });
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message.id || index.toString();
  }

  // ============================================
  // MÉTODOS PARA CHAT CON IA
  // ============================================

  /**
   * Alterna entre chat normal y chat con IA
   */
  toggleAIChat(forceState?: boolean): void {
    this.showAIChat = typeof forceState === 'boolean' ? forceState : !this.showAIChat;
    if (this.showAIChat) {
      this.aiMessages = [];
      this.error = null;
    }
    this.cdr.markForCheck();
  }

  closeAIChat(): void {
    this.toggleAIChat(false);
  }

  /**
   * Enviar pregunta a la IA
   */
  sendAIMessage(message?: string): void {
    if (!this.activeDependentId) {
      this.error = 'Dependiente no seleccionado';
      return;
    }

    const userMessage = (message || this.messageText).trim();

    if (!this.aiChatService.isValidMessage(userMessage)) {
      this.error = 'Mensaje inválido (debe tener entre 1 y 1000 caracteres)';
      this.cdr.markForCheck();
      return;
    }

    // Agregar mensaje del usuario al chat
    this.aiMessages.push({
      role: 'user',
      text: userMessage,
      timestamp: new Date()
    });

    this.messageText = '';
    this.aiLoading = true;
    this.error = null;
    this.cdr.markForCheck();
    this.scrollToBottom();

    // Enviar a la IA
    this.aiChatService
      .sendMessage(userMessage, this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (reply: string) => {
          this.aiMessages.push({
            role: 'ai',
            text: reply,
            timestamp: new Date()
          });
          this.aiLoading = false;
          this.cdr.markForCheck();
          this.scrollToBottom();
        },
        error: (err: any) => {
          console.error('Error calling AI:', err);
          this.error = 'Error al contactar con la IA: ' + (err.message || 'Intenta nuevamente');
          this.aiLoading = false;

          // Remover el último mensaje del usuario si hubo error
          if (this.aiMessages.length > 0) {
            this.aiMessages.pop();
          }

          this.cdr.markForCheck();
        }
      });
  }

  onAIInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendAIMessage();
    }
  }

  /**
   * Usar una pregunta sugerida
   */
  useSuggestedQuestion(question: string): void {
    this.messageText = question;
    this.cdr.markForCheck();
  }

  private scrollToBottom(): void {
    // First scroll attempt immediately
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }

    // Second scroll attempt after a short delay to ensure rendering is complete
    setTimeout(() => {
      if (this.messagesContainer) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);

    // Third attempt with requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      if (this.messagesContainer) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
