import { Injectable } from '@angular/core';
import { Functions, connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { FirebaseService } from './firebase.service';
import { ChatFirestoreEmulatorService } from './chat-firestore-emulator.service';

export interface AIResponse {
  success: boolean;
  reply: string;
  timestamp: string;
}

/**
 * AIChatService
 *
 * ARQUITECTURA:
 * - Functions: Emulator en dev (localhost:5001), Cloud en prod
 * - Firestore: Real en ambos (dev y prod)
 * - Chat historial: Firestore Emulator en dev (gratis), no se guarda en prod
 *
 * COSTOS:
 * - Cloud Functions: ~$0.0000002 por invocación (primeras 2M gratis)
 * - Firestore: Real en prod
 * - Emulador: GRATIS en dev (datos locales)
 */
@Injectable({
  providedIn: 'root'
})
export class AIChatService {
  private readonly functions: Functions;
  private functionsEmulatorConnected = false;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly chatEmulatorService: ChatFirestoreEmulatorService
  ) {
    this.functions = getFunctions(this.firebaseService.app);

    // Conectar a Functions Emulator en desarrollo
    this.connectToEmulator();

    console.log('AIChatService inicializado');

    if (this.chatEmulatorService.isAvailable()) {
      console.log('Historial del chat se guardará en Firestore Emulator');
    }
  }

  /**
   * Conecta a Functions Emulator si está en desarrollo
   */
  private connectToEmulator(): void {
    try {
      const hostname = globalThis.location?.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      if (!isLocalhost) {
        console.log('ℹ AIChatService: No en localhost, usando Cloud Functions');
        return;
      }

      try {
        connectFunctionsEmulator(this.functions, 'localhost', 5001);
        this.functionsEmulatorConnected = true;
        console.log('AIChatService: Conectado a Functions Emulator (localhost:5001)');
      } catch (error: any) {
        if (error?.message?.includes('already')) {
          this.functionsEmulatorConnected = true;
          console.log('ℹAIChatService: Functions Emulator ya estaba conectado');
        } else {
          console.warn(' AIChatService: No se pudo conectar a Functions Emulator:', error?.message);
          console.warn('Asegúrate de ejecutar: firebase emulators:start --only functions,firestore');
        }
      }
    } catch (error) {
      console.error('AIChatService: Error conectando a emulador:', error);
    }
  }

  /**
   * Envía un mensaje a la IA a través de Cloud Function
   *
   * En desarrollo:
   * - Cloud Function se ejecuta en Functions Emulator (localhost:5001)
   * - Historial se guarda en Firestore Emulator
   *
   * En producción:
   * - Cloud Function se ejecuta en Firebase Cloud
   * - Historial NO se guarda (solo en emulator)
   *
   * @param message Pregunta del usuario
   * @param dependentId ID del dependiente
   * @param userId ID del usuario (para guardar en historial)
   * @returns Observable con la respuesta de la IA
   */
  sendMessage(message: string, dependentId: string, userId?: string): Observable<string> {
    console.log('Enviando mensaje a IA...');
    console.log('Mensaje:', message);
    console.log('Dependiente:', dependentId);
    console.log('Usando Functions Emulator:', this.functionsEmulatorConnected);

    try {
      // Obtener referencia a la Cloud Function
      const chatAI = httpsCallable(this.functions, 'chatAI');

      // Llamar a la función con los parámetros
      return from(chatAI({ message, dependentId })).pipe(
        map((response: any) => {
          console.log('Respuesta de IA recibida');
          const reply = response?.data?.reply || response?.reply || 'Sin respuesta del asistente';

          // Guardar en historial del emulador (asincrónico, no bloquea la respuesta)
          if (userId) {
            this.chatEmulatorService.saveChatMessage(userId, dependentId, message, reply)
              .catch(err => console.error('Error guardando en historial:', err));
          }

          return reply;
        }),
        catchError((error: any) => {
          console.error('❌ Error en Cloud Function:', error);

          // Intentar extraer el mensaje de error
          const errorMessage = error?.message ||
            error?.error?.message ||
            error?.code ||
            'Error al conectar con la IA. Intenta nuevamente.';

          return throwError(() => new Error(errorMessage));
        })
      );
    } catch (error) {
      console.error('❌ Error preparando llamada a Cloud Function:', error);
      return throwError(() => new Error('Error al inicializar el chat de IA.'));
    }
  }

  /**
   * Obtiene el historial de chat del emulador (solo en desarrollo)
   * Útil para mostrar historial previo en la UI
   */
  async getChatHistory(userId: string, dependentId: string) {
    try {
      const history = await this.chatEmulatorService.getChatHistory(userId, dependentId);
      console.log(`Historial recuperado: ${history.length} mensajes`);
      return history;
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      return [];
    }
  }

  /**
   * Validar si el mensaje es válido antes de enviarlo
   */
  isValidMessage(message: string): boolean {
    const trimmed = message.trim();
    return trimmed.length > 0 && trimmed.length <= 1000;
  }

  /**
   * Obtener sugerencias de preguntas frecuentes
   */
  getSuggestedQuestions(): string[] {
    return [
      '¿Qué tareas hay que hacer hoy?',
      '¿Cuánta medicación hay que tomar hoy?',
      '¿Cuál es la próxima cita?',
      '¿Cuándo hay que tomar el próximo medicamento?',
      'Dame un resumen de hoy'
    ];
  }
}
