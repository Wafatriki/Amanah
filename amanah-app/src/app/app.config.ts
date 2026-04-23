import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth, connectAuthEmulator } from '@angular/fire/auth';
import { getFirestore, provideFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { getFunctions, provideFunctions, connectFunctionsEmulator } from '@angular/fire/functions';
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

      // Conectar a emuladores en desarrollo
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        try {
          connectAuthEmulator(getAuth(app), 'http://localhost:9099', { disableWarnings: true });
          console.log('✅ Auth Emulator conectado');
        } catch (e: any) {
          console.log('ℹ️ Auth Emulator ya estaba conectado o error menor:', e.message);
        }

        try {
          connectFirestoreEmulator(getFirestore(app), 'localhost', 8080);
          console.log('✅ Firestore Emulator conectado');
        } catch (e: any) {
          console.log('ℹ️ Firestore Emulator ya estaba conectado o error menor:', e.message);
        }

        try {
          connectFunctionsEmulator(getFunctions(app), 'localhost', 5001);
          console.log('✅ Functions Emulator conectado');
        } catch (e: any) {
          console.log('ℹ️ Functions Emulator ya estaba conectado o error menor:', e.message);
        }
      }

      return app;
    }),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions()),
    provideStorage(() => getStorage())
  ]
};
