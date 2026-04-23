import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { NotificationService } from './notification.service';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  limit
} from 'firebase/firestore';
import { Observable, from } from 'rxjs';
import { ChatMessage, ChatRoom } from '../models/chat.model';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);

  constructor(private firebaseService: FirebaseService) { }

  /**
   * Obtener o crear sala de chat para un dependiente
   */
  getOrCreateChatRoom(dependentId: string, participantIds: string[]): Observable<ChatRoom> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, 'chatRooms'),
        where('dependentId', '==', dependentId)
      );

      getDocs(q).then(snapshot => {
        if (!snapshot.empty) {
          // Sala ya existe
          const room = snapshot.docs[0].data();
          observer.next({
            id: snapshot.docs[0].id,
            ...room
          } as ChatRoom);
        } else {
          // Crear nueva sala
          const newRoom: Partial<ChatRoom> = {
            dependentId,
            participantIds,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          addDoc(collection(this.firebaseService.firestore, 'chatRooms'), newRoom)
            .then(docRef => {
              observer.next({
                id: docRef.id,
                ...newRoom
              } as ChatRoom);
            })
            .catch(error => observer.error(error));
        }
      }).catch(error => observer.error(error));
    });
  }

  /**
   * Obtener mensajes en tiempo real de una sala de chat
   */
  getMessages(dependentId: string): Observable<ChatMessage[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/messages`),
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const messages: ChatMessage[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            messages.push({
              id: doc.id,
              ...this.convertFirestoreToMessage(data)
            } as ChatMessage);
          });
          // Invertir para orden ascendente (más antiguo primero)
          observer.next(messages.reverse());
        },
        error => {
          console.error('Error fetching messages:', error);
          observer.next([]);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Enviar mensaje de texto
   */
  sendMessage(
    dependentId: string,
    userId: string,
    userName: string,
    text: string,
    userAvatar?: string
  ): Observable<void> {
    // Validar permisos: Solo cuidadores pueden enviar mensajes
    if (!this.permissionService.canSendMessage()) {
      return from(Promise.reject(new Error('No tienes permisos para enviar mensajes')));
    }

    const message: any = {
      dependentId,
      userId,
      userName,
      text,
      timestamp: new Date()
    };

    // Solo incluir userAvatar si existe
    if (userAvatar) {
      message.userAvatar = userAvatar;
    }

    return from(
      addDoc(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/messages`),
        message
      ).then(() => {
        // Enviar notificación de nuevo mensaje (solo a otros cuidadores, no al remitente)
        this.notificationService.notifyNewMessage(userName, text.substring(0, 100), userId);
        // Actualizar último mensaje en la sala
        return this.updateLastMessage(dependentId, text);
      })
    );
  }

  /**
   * Enviar mensaje con imagen
   */
  async sendMessageWithImage(
    dependentId: string,
    userId: string,
    userName: string,
    text: string,
    imageUrl: string,
    userAvatar?: string
  ): Promise<void> {
    // Validar permisos: Solo cuidadores pueden enviar mensajes
    if (!this.permissionService.canSendMessage()) {
      throw new Error('No tienes permisos para enviar mensajes');
    }

    const message: any = {
      dependentId,
      userId,
      userName,
      text,
      imageUrl,
      timestamp: new Date()
    };

    // Solo incluir userAvatar si existe
    if (userAvatar) {
      message.userAvatar = userAvatar;
    }

    await addDoc(
      collection(this.firebaseService.firestore, `dependents/${dependentId}/messages`),
      message
    );

    await this.updateLastMessage(dependentId, text || '[Imagen]');
  }

  /**
   * Enviar mensaje con archivo (imagen o documento)
   * Los archivos se guardan en base64 en Firestore (máximo 500KB)
   */
  async sendMessageWithFile(
    dependentId: string,
    userId: string,
    userName: string,
    text: string,
    fileData: string, // Base64 or Data URL
    fileName: string,
    fileType: string,
    userAvatar?: string
  ): Promise<void> {
    // Validar permisos: Solo cuidadores pueden enviar mensajes
    if (!this.permissionService.canSendMessage()) {
      throw new Error('No tienes permisos para enviar mensajes');
    }

    try {
      const message: any = {
        dependentId,
        userId,
        userName,
        text,
        fileUrl: fileData, // Guardar como data URL
        fileName,
        fileType,
        timestamp: new Date()
      };

      // Si es imagen, también guardar en imageUrl para compatibilidad
      if (fileType.startsWith('image/')) {
        message.imageUrl = fileData;
      }

      // Solo incluir userAvatar si existe
      if (userAvatar) {
        message.userAvatar = userAvatar;
      }

      await addDoc(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/messages`),
        message
      );

      const label = fileType.startsWith('image/') ? '[Imagen]' : `[${fileName}]`;
      await this.updateLastMessage(dependentId, text || label);
    } catch (error) {
      console.error('Error sending message with file:', error);
      throw error;
    }
  }

  /**
   * Eliminar mensaje
   */
  deleteMessage(dependentId: string, messageId: string): Observable<void> {
    return from(
      deleteDoc(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/messages/${messageId}`)
      )
    );
  }

  /**
   * Editar mensaje
   */
  editMessage(dependentId: string, messageId: string, newText: string): Observable<void> {
    return from(
      updateDoc(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/messages/${messageId}`),
        {
          text: newText,
          isEdited: true,
          editedAt: new Date()
        }
      )
    );
  }

  /**
   * Actualizar último mensaje de la sala
   */
  private updateLastMessage(dependentId: string, lastMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const q = query(
        collection(this.firebaseService.firestore, 'chatRooms'),
        where('dependentId', '==', dependentId)
      );

      getDocs(q)
        .then(snapshot => {
          if (!snapshot.empty) {
            updateDoc(snapshot.docs[0].ref, {
              lastMessage,
              lastMessageTime: new Date(),
              updatedAt: new Date()
            }).then(resolve).catch(reject);
          } else {
            resolve();
          }
        })
        .catch(reject);
    });
  }

  /**
   * Convertir datos de Firestore a objeto ChatMessage
   */
  async markMessagesAsRead(dependentId: string, messageIds: string[]): Promise<void> {
    if (!messageIds.length) return;

    const now = new Date();
    for (const messageId of messageIds) {
      const messageRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/messages`, messageId);
      try {
        await updateDoc(messageRef, {
          isRead: true,
          readAt: now
        });
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  }

  /**
   * Convertir datos de Firestore a modelo ChatMessage
   */
  private convertFirestoreToMessage(data: any): Partial<ChatMessage> {
    return {
      dependentId: data.dependentId,
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      text: data.text,
      imageUrl: data.imageUrl,
      timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      isEdited: data.isEdited || false,
      editedAt: data.editedAt?.toDate?.(),
      isRead: data.isRead || false,
      readAt: data.readAt?.toDate?.()
    };
  }
}
