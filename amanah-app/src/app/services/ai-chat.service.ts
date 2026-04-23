import { Injectable } from '@angular/core';
import { Functions, connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { FirebaseService } from './firebase.service';

export interface AIResponse {
  success: boolean;
  reply: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class AIChatService {
  private readonly functions: Functions;

  constructor(private readonly firebaseService: FirebaseService) {
    this.functions = getFunctions(this.firebaseService.app);

    if (this.shouldUseFunctionsEmulator()) {
      try {
        connectFunctionsEmulator(this.functions, 'localhost', 5001);
        console.log('✅ AIChatService conectado a Functions Emulator (localhost:5001)');
      } catch (error) {
        console.log('ℹ️ AIChatService: Functions Emulator ya estaba conectado o no disponible');
        console.debug(error);
      }
    }

    console.log('🚀 AIChatService inicializado');
  }

  private shouldUseFunctionsEmulator(): boolean {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? '');
      const functionsMode = params.get('functions');

      if (functionsMode === 'cloud') {
        return false;
      }

      if (functionsMode === 'emulator' || params.get('firebase') === 'emulator') {
        return true;
      }

      const hostname = globalThis.location?.hostname;
      return hostname === 'localhost' || hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  /**
   * Envía un mensaje a la IA a través de Cloud Function (seguro)
   * @param message Pregunta del usuario
   * @param dependentId ID del dependiente
   * @returns Observable con la respuesta de la IA
   */
  sendMessage(message: string, dependentId: string): Observable<string> {
    console.log('📤 Enviando mensaje a IA a través de Cloud Function...');
    console.log('   Mensaje:', message);
    console.log('   Dependiente:', dependentId);

    try {
      // Obtener referencia a la Cloud Function
      const chatAI = httpsCallable(this.functions, 'chatAI');

      // Llamar a la función con los parámetros
      return from(chatAI({ message, dependentId })).pipe(
        map((response: any) => {
          console.log('✅ Respuesta de IA recibida:', response);
          const reply = response?.data?.reply || response?.reply || 'Sin respuesta del asistente';
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
