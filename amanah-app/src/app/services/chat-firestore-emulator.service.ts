import { Injectable } from '@angular/core';
import { Firestore, getFirestore, connectFirestoreEmulator, collection, addDoc, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

export interface ChatHistoryRecord {
  id?: string;
  userId: string;
  dependentId: string;
  userMessage: string;
  aiResponse: string;
  createdAt: Date;
}

/**
 * Servicio para gestionar el historial de chat de IA usando Firestore Emulator.
 *
 * Esto permite que:
 * - El chat de IA sea completamente GRATIS (usa emulador local)
 * - El resto de la app use Firestore REAL sin cambios
 *
 * Los datos del chat se guardan localmente en el emulador y se pierden al reiniciar,
 * o puedes persistirlos manualmente si lo necesitas.
 */
@Injectable({
  providedIn: 'root'
})
export class ChatFirestoreEmulatorService {
  private emulatorFirestore!: Firestore;
  private isEmulatorConnected = false;

  constructor(private readonly firebaseService: FirebaseService) {
    this.initializeEmulator();
  }

  /**
   * Inicializa la conexión a Firestore Emulator
   * Solo se ejecuta en localhost para desarrollo
   */
  private initializeEmulator(): void {
    try {
      const hostname = globalThis.location?.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      if (!isLocalhost) {
        console.warn('ChatEmulatorService: No en localhost, emulador deshabilitado');
        return;
      }

      // Crear una nueva instancia de Firestore conectada al emulador
      this.emulatorFirestore = getFirestore(this.firebaseService.app);

      try {
        connectFirestoreEmulator(this.emulatorFirestore, 'localhost', 8080);
        this.isEmulatorConnected = true;
        console.log('ChatEmulatorService: Conectado a Firestore Emulator (localhost:8080) para historial de chat');
      } catch (error: any) {
        // El emulador ya está conectado o no está disponible
        if (error?.message?.includes('already connected')) {
          this.isEmulatorConnected = true;
          console.log('ℹ️ ChatEmulatorService: Firestore Emulator ya estaba conectado');
        } else {
          console.warn('⚠️ ChatEmulatorService: Error conectando a emulador:', error?.message);
          console.warn('⚠️ Asegúrate de que los emuladores de Firebase están corriendo: `firebase emulators:start`');
        }
      }
    } catch (error) {
      console.error('❌ ChatEmulatorService: Error inicializando:', error);
    }
  }

  /**
   * Guarda un intercambio de chat en Firestore Emulator (gratis)
   */
  async saveChatMessage(
    userId: string,
    dependentId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<void> {
    if (!this.isEmulatorConnected) {
      console.warn('⚠️ ChatEmulatorService: Emulador no conectado, no se guarda el mensaje');
      return;
    }

    try {
      const chatHistoryRef = collection(this.emulatorFirestore, 'chat_history');
      await addDoc(chatHistoryRef, {
        userId,
        dependentId,
        userMessage,
        aiResponse,
        createdAt: Timestamp.now()
      });
      console.log('✅ ChatEmulatorService: Mensaje guardado en emulador');
    } catch (error) {
      console.error('❌ ChatEmulatorService: Error guardando mensaje:', error);
      // No fallar la operación, solo registrar el error
    }
  }

  /**
   * Obtiene el historial de chat desde el emulador
   */
  async getChatHistory(userId: string, dependentId: string): Promise<ChatHistoryRecord[]> {
    if (!this.isEmulatorConnected) {
      console.warn('ChatEmulatorService: Emulador no conectado, retornando historial vacío');
      return [];
    }

    try {
      const chatHistoryRef = collection(this.emulatorFirestore, 'chat_history');
      const q = query(
        chatHistoryRef,
        where('userId', '==', userId),
        where('dependentId', '==', dependentId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const messages: ChatHistoryRecord[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data() as any;
        messages.push({
          id: doc.id,
          userId: data['userId'] || '',
          dependentId: data['dependentId'] || '',
          userMessage: data['userMessage'] || '',
          aiResponse: data['aiResponse'] || '',
          createdAt: data['createdAt']?.toDate?.() || new Date()
        });
      });

      console.log(`ChatEmulatorService: ${messages.length} mensajes recuperados del emulador`);
      return messages;
    } catch (error) {
      console.error('ChatEmulatorService: Error leyendo historial:', error);
      return [];
    }
  }

  /**
   * Verifica si el emulador está disponible
   */
  isAvailable(): boolean {
    return this.isEmulatorConnected;
  }
}
