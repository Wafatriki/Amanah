# Amanah 🌙

En España, más de un millón y medio de familias cuidan cada día a un familiar dependiente: organizando medicación, coordinando turnos, gestionando citas médicas y manteniéndose comunicados, sin formación específica y sin herramientas digitales adecuadas. **Amanah** nació para cambiar eso.

Plataforma web colaborativa desarrollada como Trabajo de Fin de Grado que centraliza en un único lugar todas las necesidades del cuidado informal: gestión de tareas, medicación, citas médicas, comunicación entre cuidadores y un asistente de IA para consultas rápidas.

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Angular + TypeScript + SCSS |
| Backend | Firebase Cloud Functions (Node.js) |
| Base de datos | Firestore |
| Autenticación | Firebase Auth |
| IA | Groq API (LLaMA 3.1) |

---

## 📁 Estructura del proyecto

```
Amanah/
├── amanah-app/          # Frontend Angular
├── amanah-backend/      # Backend para gestión de documentos y fotos de perfil
├── functions/           # Firebase Cloud Functions
├── firestore.rules      # Reglas de seguridad Firestore
├── firebase.json        # Configuración Firebase
└── start-amanah.ps1     # Script para levantar el entorno local
```

---

## ✨ Funcionalidades principales

- **Gestión de dependientes** — registro y seguimiento de personas bajo cuidado
- **Tareas diarias** — asignación y control de tareas por cuidador
- **Medicamentos activos** — control de medicación con alertas
- **Citas médicas** — agenda de próximas citas
- **Chat colaborativo** — canal de comunicación en tiempo real entre todos los participantes del cuidado de un dependiente
- **Chat con IA** — asistente inteligente (Groq/LLaMA) que responde preguntas sobre el estado del dependiente, con acceso seguro a datos de Firestore
- **Sistema de roles** — tres niveles de acceso para los cuidadores:
  - 👑 **Cuidador principal** — control total sobre el dependiente y sus cuidadores
  - 🤝 **Cuidador colaborativo** — puede gestionar tareas, medicamentos y citas
  - 👁️ **Invitado** — acceso de solo lectura

---

## 🚀 Instalación y puesta en marcha

### Requisitos previos

- Node.js y npm
- Firebase CLI (`npm install -g firebase-tools`)
- Cuenta en [Groq](https://console.groq.com) para obtener la API key

### 1. Clonar el repositorio

```bash
git clone https://github.com/Wafatriki/Amanah.git
cd Amanah
```

### 2. Instalar dependencias del frontend

```bash
cd amanah-app
npm install
```

### 3. Instalar dependencias de Cloud Functions

```bash
cd ../functions
npm install
```

### 4. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
GROQ_API_KEY=tu-api-key-aqui
GROQ_MODEL=llama-3.1-8b-instant
```

> ⚠️ Nunca expongas la API key en el frontend.

### 5. Levantar el entorno local

Desde la raíz del proyecto (Windows):

```powershell
.\start-amanah.ps1
```

Esto levanta los emuladores de Firebase y el servidor Angular.

Accede a la app en:
- `http://localhost:4200/` — Firebase real
- `http://localhost:4200/?firebase=emulator` — emuladores locales

---

## 🤖 Chat con IA

El asistente responde preguntas como:
- *"¿Qué tareas hay que hacer hoy?"*
- *"¿Cuántos medicamentos activos hay?"*
- *"¿Cuál es la próxima cita médica?"*

El flujo es: **Frontend → Cloud Function → Groq API → Firestore** (solo datos del dependiente autorizado, sin información sensible).

Para más detalles, consulta [`AI_CHAT_SETUP.md`](./AI_CHAT_SETUP.md).

---

## 🔒 Seguridad

- Autenticación obligatoria via Firebase Auth
- Los cuidadores solo acceden a datos de sus dependientes asignados
- No se envían diagnósticos ni historiales clínicos a la IA, solo datos agregados
- Logs de auditoría en `ai_chat_logs` (cumplimiento RGPD)
- API key de Groq solo en el servidor, nunca en el cliente

---

## ☁️ Deploy a producción

```bash
# Deploy de Cloud Functions
cd functions
npm run deploy

# Deploy completo (hosting + functions)
firebase deploy
```

Para producción, configura la API key en Firebase:

```bash
firebase functions:config:set groq.api_key="tu-api-key-aqui"
```

---

## 📄 Licencia

Proyecto académico — Trabajo de Fin de Grado.
