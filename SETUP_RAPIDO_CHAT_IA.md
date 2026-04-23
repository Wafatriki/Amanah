# 🚀 SETUP RÁPIDO: Chat IA en 5 pasos

## Paso 1️⃣: Obtener Groq API Key (2 minutos)

```
1. Abre: https://console.groq.com/keys
2. Haz login (gratis)
3. Haz clic: "Create API Key"
4. Copia la clave (empieza con "gsk_")
```

## Paso 2️⃣: Configurar .env.local (1 minuto)

Edita `c:\Users\wafat\Desktop\UNI\TFG\Amanah\.env.local`:

```env
GROQ_API_KEY=gsk_PEGA_TU_CLAVE_AQUI
NODE_ENV=development
APP_URL=http://localhost:4200
```

## Paso 3️⃣: Instalar dependencias (3 minutos)

```powershell
cd c:\Users\wafat\Desktop\UNI\TFG\Amanah\functions
npm install
```

## Paso 4️⃣: Ejecutar emulador (1 minuto)

**Terminal 1:**
```powershell
cd c:\Users\wafat\Desktop\UNI\TFG\Amanah
firebase emulators:start
```

Espera hasta ver: `✓ All emulators ready!`

**Terminal 2:**
```powershell
cd c:\Users\wafat\Desktop\UNI\TFG\Amanah\amanah-app
ng serve
```

Abre: http://localhost:4200

## Paso 5️⃣: Probar (2 minutos)

1. Selecciona un dependiente ✅
2. Abre el chat
3. Haz clic en botón "🤖 IA"
4. Prueba: "¿Qué tareas hay hoy?"

---

## ✅ ¿Funciona? Deberías ver:

- Botón "🤖 Asistente" en el header del chat ✅
- Preguntas sugeridas ✅
- Respuestas de IA en 1-2 segundos ✅
- En la consola (F12): "Respuesta IA: ..." ✅

---

## ❌ Si NO funciona:

```
1. ¿API Key correcta? → Revisa .env.local
2. ¿npm install ejecutado? → Vuelve a ejecutar
3. ¿Emulador corriendo? → Debería decir "✓ All emulators ready"
4. ¿Hay un dependiente? → Selecciona uno primero
5. ¿Abre F12 → Console? → Busca errores en rojo
```

---

## 📚 Más información:

Ver archivo: `AI_CHAT_IMPLEMENTACION_FINAL.md`

---

**Tiempo total:** ~10 minutos ⏱️
