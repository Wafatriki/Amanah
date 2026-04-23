# 🤖 Setup: Chat con IA (Groq) en Amanah

## Resumen de cambios

Se ha añadido un **Chat de IA** a la aplicación Amanah que permite a los cuidadores hacer preguntas sobre:
- ✅ Tareas del día
- ✅ Medicamentos activos
- ✅ Próximas citas médicas
- ✅ Recordatorios generales

## 🔧 Instalación y Configuración

### Paso 1: Instalar dependencias en Cloud Functions

```bash
cd functions
npm install
```

Esto instalará las dependencias de `functions` que usa la Cloud Function `chatAI`.

### Paso 2: Obtener API Key de Groq

1. Crear una cuenta o entrar en Groq
2. Generar una API key desde el panel de desarrollador
3. Copiar la **API Key**

**Importante:** La clave solo debe estar en el servidor o en el emulador local, nunca en el frontend.

### Paso 3: Configurar Variables de Entorno

#### Opción A: Emulador Local (Para desarrollo)

1. Crear archivo `.env.local` en la raíz del proyecto (si no existe):
```
GROQ_API_KEY=tu-api-key-aqui
GROQ_MODEL=llama-3.1-8b-instant
```

2. Al ejecutar las functions en local, cargará automáticamente esta variable.

#### Opción B: Firebase Deploy (Producción)

1. Desde la terminal, en la carpeta raíz:
```bash
firebase functions:config:set groq.api_key="tu-api-key-aqui"
```

O manualmente en Firebase Console:
- Console → Project Settings → Environment variables
- Crear: `GROQ_API_KEY = tu-api-key`

### Paso 4: Deployar Cloud Function

```bash
cd functions
npm run deploy
```

## 📋 Flujo de Datos

```
Usuario pregunta en el chat
    ↓
sendAIMessage() → AIChatService.sendMessage()
    ↓
Firebase Cloud Function: chatAI()
    ↓
1. Validar autenticación Firebase
2. Verificar acceso al dependiente
3. Obtener datos de Firestore:
   - Tareas (filtradas por hoy)
   - Medicamentos (activos)
   - Citas (próximas 5)
    ↓
4. Sanitizar datos (sin información sensible)
5. Llamar a Groq API desde el servidor
6. Retornar respuesta
    ↓
7. Guardar log en ai_chat_logs (auditoría)
    ↓
Mostrar respuesta en el UI
```

## 🔒 Seguridad y Privacidad

### ✅ Medidas implementadas:

1. **Autenticación Firebase obligatoria**
   - Solo usuarios logged-in pueden usar el chat de IA

2. **Validación de acceso**
   - Solo pueden hacer preguntas sobre dependientes que manejan
   - Se verifica que el usuario sea cuidador o propietario del dependiente

3. **Sanitización de datos**
   - No se envían números de historia clínica
   - No se envían diagnósticos específicos
   - Solo información agregada: "3 medicamentos", "próxima cita el X"

4. **Firestore Rules estrictas**
   - `ai_chat_logs` solo puede escribirse (auditoría)
   - No se pueden leer logs directamente
   - Acceso limitado a datos del usuario

5. **Encriptación**
   - Comunicación HTTPS (Firebase)
   - Datos en tránsito cifrados

6. **Cumplimiento RGPD**
   - Logs de auditoría en `ai_chat_logs`
   - Preguntas guardadas como preview (no completas)
   - Se puede implementar "derecho al olvido" borrando logs

### Cumple con:
- ✅ RGPD (Regulación General de Protección de Datos)
- ✅ LOPD (Ley de Protección de Datos España)
- ✅ Confidencialidad médica

## 🧪 Testing

### Test local (emulador):

1. Iniciar emulador:
```bash
firebase emulators:start
```

2. O arrancar todo con un solo comando desde la raíz:
```powershell
.\start-amanah.ps1
```

Al terminar la sesión, para guardar de forma explícita los datos locales de Auth y Firestore:
```powershell
.\stop-amanah.ps1
```

3. Si prefieres hacerlo manualmente, en otra terminal desde `amanah-app`:
```bash
ng serve
```

4. Abrir `http://localhost:4200` y probar el chat de IA

### Elegir origen de datos (importante)

- `http://localhost:4200/` usa **Firebase real** (cuentas de Firebase Console)
- `http://localhost:4200/?firebase=emulator` usa **emuladores locales** (Auth/Firestore local)

Si no puedes iniciar sesión con una cuenta que ves en Firebase Console, asegúrate de estar en la URL sin `?firebase=emulator`.

### Preguntas de prueba:
- "¿Qué tareas hay que hacer hoy?"
- "¿Cuántos medicamentos activos hay?"
- "¿Cuál es la próxima cita?"

## 📝 Archivos Modificados

### Backend (Cloud Functions)
- `functions/package.json` - Agregada dependencia `@google-ai/generative-ai`
- `functions/src/index.ts` - Cloud Function `chatAI`

### Frontend (Angular)
- `amanah-app/src/app/services/ai-chat.service.ts` - Servicio para llamar la IA vía Cloud Function
- `amanah-app/src/app/chat/chat.component.ts` - Lógica del chat con IA
- `amanah-app/src/app/chat/chat.component.html` - UI con toggle IA/Chat normal
- `amanah-app/src/app/chat/chat.component.scss` - Estilos para el chat de IA
- `start-amanah.ps1` - Script único para levantar frontend y emuladores

### Seguridad
- `firestore.rules` - Rules actualizadas con acceso controlado a `ai_chat_logs`

## ⚡ Costos

**Groq API:**
- El coste depende del modelo y del plan configurado
- El frontend nunca expone la API key
- El chat sigue funcionando aunque cambies el modelo en el servidor

**Firebase Cloud Functions:**
- 2 millones de llamadas/mes gratis
- Después: $0.40 por millón de llamadas

**Estimación para TFG:**
- ✅ Totalmente GRATIS

## 🚀 Próximas mejoras (opcional)

1. Guardar historial del chat con IA
2. Usar embeddings para búsquedas más inteligentes
3. Integrar con chat normal (guardar respuestas en Firestore)
4. Análisis de sentimiento para detectar situaciones críticas
5. Alerts automáticos si detecta medicamentos olvidados

## 📞 Troubleshooting

### Error: "GROQ_API_KEY not configured"
- Verificar que la variable de entorno está configurada
- Reiniciar emulador si estás en local
- Redeploy si estás en producción

### Error: "Usuario no autenticado"
- Asegúrate de estar logged-in en la app
- Verificar que Firebase Auth está funcionando

### Error: "Dependiente no encontrado"
- Verificar que el `dependentId` es correcto
- Asegúrate que el usuario es cuidador del dependiente

### Respuesta lenta o timeout
- Normal si es la primera llamada (cold start)
- Gemini tardará 1-3 segundos en responder
- Aumentar timeout si necesario

## 📚 Referencias

- [Groq Docs](https://console.groq.com/docs)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
