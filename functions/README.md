# Cloud Functions para Amanah

Esta carpeta contiene las Cloud Functions para enviar emails de invitación automáticamente.

## Instalación

### 1. Instalar dependencias

```bash
cd functions
npm install
```

### 2. Obtener clave de SendGrid

1. Ve a https://sendgrid.com/
2. Crea una cuenta gratuita (incluye 100 emails gratis diarios)
3. Ve a **Settings > API Keys**
4. Crea una nueva API Key con permiso de envío de emails
5. Copia la clave (no la podrás ver de nuevo)

### 3. Configurar variables de entorno

En tu proyecto Firebase, configura las variables de entorno:

```bash
firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
firebase functions:config:set sendgrid.from_email="noreply@tuemail.com"
firebase functions:config:set app.url="https://tudominio.com"
```

Reemplaza:
- `YOUR_SENDGRID_API_KEY` con tu clave de SendGrid
- `noreply@tuemail.com` con tu email verificado en SendGrid
- `https://tudominio.com` con la URL de tu app (en desarrollo: `http://localhost:4200`)

### 4. Desplegar las Cloud Functions

```bash
firebase deploy --only functions
```

## Verificar que funciona

1. Crea una invitación desde la app
2. Chequea los logs:

```bash
firebase functions:log
```

Deberías ver: "Email sent successfully to: ..."

## Desarrollo local

Para probar localmente con el emulador:

```bash
npm run serve
```

Nota: El emulador de funciones no envía emails reales, solo los registra.

## Troubleshooting

- Si ves "SendGrid API key not configured", asegúrate de haber configurado las variables
- Si el email no se envía, chequea los logs de Firebase
- El email debe ser verificado en SendGrid para enviarlo desde ese remitente
