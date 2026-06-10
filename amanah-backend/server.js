const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-key.json';
if (!fs.existsSync(serviceAccountPath)) {
  console.warn(`⚠️  Firebase service account file not found at ${serviceAccountPath}`);
  console.warn('   To enable Firebase Auth verification, add FIREBASE_SERVICE_ACCOUNT_PATH env var');
}

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

// ========================================
// FIREBASE AUTH VERIFICATION MIDDLEWARE
// ========================================
/**
 * Verifies Firebase ID token from Authorization header
 * Expected format: "Bearer <idToken>"
 */
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    if (!admin.apps.length) {
      console.warn('⚠️  Firebase Admin not initialized, skipping token verification');
      // Continuar sin verificación si Firebase no está configurado
      return next();
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    console.log(`✅ Token verified for user: ${decodedToken.uid}`);
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token', details: error.message });
  }
};

// Crear carpeta uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer para almacenar archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Tipos MIME permitidos
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

/**
 * POST /upload
 * Subir un archivo - REQUIERE autenticación Firebase
 */
app.post('/upload', verifyFirebaseToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  console.log(`📤 File uploaded by user ${req.user?.uid}: ${req.file.filename}`);

  res.json({
    fileId: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    downloadUrl: `${process.env.BACKEND_URL || `http://localhost:${PORT}`}/download/${req.file.filename}`,
    uploadedBy: req.user?.uid,
    uploadedAt: new Date().toISOString()
  });
});

/**
 * GET /download/:fileId
 * Descargar un archivo - Se permite sin token (archivos compartidos)
 * En producción, considerar agregar verificación de permisos
 */
app.get('/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const filePath = path.join(uploadsDir, fileId);

  // Validar que el archivo existe
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  console.log(`📥 File downloaded: ${fileId}`);

  // Enviar archivo
  res.download(filePath, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error downloading file' });
      }
    }
  });
});

/**
 * GET /file/:fileId
 * Ver archivo inline (para imágenes y PDFs en navegador)
 */
app.get('/file/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const filePath = path.join(uploadsDir, fileId);

  // Validar que el archivo existe
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  console.log(`👁️  File viewed inline: ${fileId}`);

  // Enviar archivo inline (sin descargar)
  res.sendFile(filePath);
});

/**
 * DELETE /delete/:fileId
 * Eliminar un archivo - REQUIERE autenticación Firebase
 */
app.delete('/delete/:fileId', verifyFirebaseToken, (req, res) => {
  const fileId = req.params.fileId;
  const filePath = path.join(uploadsDir, fileId);

  // Validar que el archivo existe
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Eliminar archivo
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Delete error:', err);
      return res.status(500).json({ error: 'Error deleting file' });
    }

    console.log(`🗑️  File deleted by user ${req.user?.uid}: ${fileId}`);
    res.json({ success: true, message: 'File deleted successfully', deletedBy: req.user?.uid });
  });
});

/**
 * GET /
 * Health check
 */
app.get('/', (req, res) => {
  res.json({
    message: 'Amanah Backend - Clinical Document Storage API',
    version: '1.0.0',
    firebaseInitialized: admin.apps.length > 0,
    endpoints: {
      upload: 'POST /upload (requires Firebase token)',
      download: 'GET /download/:fileId',
      viewFile: 'GET /file/:fileId',
      delete: 'DELETE /delete/:fileId (requires Firebase token)'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max 10MB allowed.' });
    }
  }

  res.status(500).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Amanah Backend listening on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
});
