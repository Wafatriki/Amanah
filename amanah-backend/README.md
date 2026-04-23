# Amanah Backend - Clinical Document Storage API

Backend simple para almacenamiento de documentos clínicos en Amanah.

## 📋 Requisitos

- Node.js 14+ 
- npm o yarn

## 🚀 Instalación local

```bash
# Clonar o abrir la carpeta del proyecto
cd amanah-backend

# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env

# Iniciar en desarrollo
npm run dev

# O iniciar en producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 📡 API Endpoints

### Upload documento
```
POST /upload
Content-Type: multipart/form-data

Body:
- file: (archivo, máx 10MB)

Response:
{
  "fileId": "uuid.ext",
  "originalName": "documento.pdf",
  "size": 1024,
  "mimetype": "application/pdf",
  "downloadUrl": "http://localhost:3000/download/uuid.ext"
}
```

### Descargar documento
```
GET /download/:fileId

Response: Archivo descargado
```

### Ver documento inline (imágenes, PDFs)
```
GET /file/:fileId

Response: Archivo mostrado en navegador
```

### Eliminar documento
```
DELETE /delete/:fileId

Response:
{
  "success": true,
  "message": "File deleted successfully"
}
```

## 🌐 Desplegar en Render.com (RECOMENDADO - Gratuito)

### 1. Preparar repositorio
```bash
git init
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. En Render.com
1. Ve a [https://render.com](https://render.com)
2. Crea cuenta con GitHub
3. Haz clic en "New +" → "Web Service"
4. Conecta tu repositorio de GitHub
5. Configura:
   - **Name:** amanah-backend
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
6. Agrega variables de entorno (.env):
   ```
   FRONTEND_URL=https://tu-frontend-url.vercel.app
   BACKEND_URL=https://tu-backend-render.com
   ```
7. Haz clic en "Deploy"

**URL será algo como:** `https://amanah-backend.onrender.com`

⚠️ **Nota:** Con el plan gratuito, el servidor se detiene después de 15 minutos sin uso. Para producción, usa plan Paid ($7/mes).

---

## 🚂 Alternativa: Railway.app

1. Ve a [https://railway.app](https://railway.app)
2. Conecta GitHub
3. Elige este repositorio
4. Railway detectará automáticamente que es Node.js
5. Agrega variables de entorno
6. Deploy automático en cada git push

**Plan gratuito:** $5 crédito/mes (suficiente para pequeño uso)

---

## 🦸 Alternativa: Heroku (requiere tarjeta)

1. Ve a [https://heroku.com](https://heroku.com)
2. Instala Heroku CLI
3. Ejecuta:
```bash
heroku login
heroku create amanah-backend
git push heroku main
```

---

## 🔧 Variables de entorno (.env)

Copia `.env.example` a `.env` y personaliza:

```
PORT=3000
FRONTEND_URL=http://localhost:4200
BACKEND_URL=http://localhost:3000
```

Para producción (Render/Railway):
```
PORT=3000
FRONTEND_URL=https://tu-app.vercel.app
BACKEND_URL=https://amanah-backend.onrender.com (o railway.app)
```

---

## 📁 Estructura de carpetas

```
amanah-backend/
├── server.js          # Servidor principal
├── package.json       # Dependencias
├── .env.example       # Variables de ejemplo
├── .env               # Variables locales (no commitear)
├── uploads/           # Carpeta de almacenamiento (ignorada en git)
└── README.md          # Este archivo
```

---

## 🔐 Seguridad

⚠️ Para producción, agregar:
- Autenticación de Firebase
- Rate limiting
- Validación de token JWT
- HTTPS obligatorio

---

## 📝 Licencia

MIT
