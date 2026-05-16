# Cloud Functions para Amanah

Esta carpeta contiene las Cloud Functions para enviar emails de invitación automáticamente.

## Instalación

### 1. Instalar dependencias

```bash
cd functions
npm install
```

### 2. Elegir proveedor SMTP

Esta implementación usa **Nodemailer + SMTP**. La opción más simple para empezar es Gmail con una **App Password**.

### 3. Configurar variables de entorno

En tu proyecto Firebase, configura las variables de entorno:

```bash
firebase functions:config:set smtp.host="smtp.gmail.com"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.user="tu-correo@gmail.com"
firebase functions:config:set smtp.password="TU_APP_PASSWORD"
firebase functions:config:set smtp.from_email="tu-correo@gmail.com"
firebase functions:config:set app.url="https://tudominio.com"
```

Reemplaza:
- `tu-correo@gmail.com` con tu cuenta de envío
- `TU_APP_PASSWORD` con la contraseña de aplicación de Gmail
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

## Troubleshooting

- Si ves "SMTP credentials not configured", revisa las variables de entorno
- Si el email no se envía, comprueba la contraseña de aplicación de Gmail
- Si Gmail bloquea el envío, activa la verificación en dos pasos y genera una App Password
