const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

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
 * Subir un archivo
 */
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  res.json({
    fileId: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    downloadUrl: `${process.env.BACKEND_URL || `http://localhost:${PORT}`}/download/${req.file.filename}`
  });
});

/**
 * GET /download/:fileId
 * Descargar un archivo
 */
app.get('/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const filePath = path.join(uploadsDir, fileId);

  // Validar que el archivo existe
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

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

  // Enviar archivo inline (sin descargar)
  res.sendFile(filePath);
});

/**
 * DELETE /delete/:fileId
 * Eliminar un archivo
 */
app.delete('/delete/:fileId', (req, res) => {
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

    res.json({ success: true, message: 'File deleted successfully' });
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
    endpoints: {
      upload: 'POST /upload',
      download: 'GET /download/:fileId',
      viewFile: 'GET /file/:fileId',
      delete: 'DELETE /delete/:fileId'
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
