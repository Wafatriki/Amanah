import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth, connectAuthEmulator } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideFirebaseApp(() => {
      const app = initializeApp(environment.firebase);

      // En desarrollo (localhost): conectar Auth Emulator
      // Functions Emulator: conectar desde ai-chat.service.ts (orden correcto)
      // Firestore: SIEMPRE real (sin emulator)
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        try {
          connectAuthEmulator(getAuth(app), 'http://localhost:9099', { disableWarnings: true });
          console.log('✅ Auth Emulator conectado');
        } catch (e: any) {
          console.log('ℹ️ Auth Emulator ya estaba conectado o error menor:', e.message);
        }
      }

      console.log('✅ Firebase inicializado con Firestore REAL (sin emulator)');
      return app;
    }),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions()),
    provideStorage(() => getStorage())
  ]
};
