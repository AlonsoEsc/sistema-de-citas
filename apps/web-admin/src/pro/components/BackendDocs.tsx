import { useState } from 'react';
import { Database, FileCode, Server, Share2, Clipboard, Check } from 'lucide-react';

export default function BackendDocs() {
  const [activeSubTab, setActiveSubTab] = useState<'db' | 'server' | 'api' | 'notify'>('db');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sqlSchema = `
-- 1. Crear base de datos
CREATE DATABASE agenda_pro;

-- 2. Conectarse a la base de datos
\\c agenda_pro;

-- 3. Tabla de Profesionales
CREATE TABLE professionals (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'prof_' || md5(random()::text),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#0d9488',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Servicios
CREATE TABLE services (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'srv_' || md5(random()::text),
  name VARCHAR(100) NOT NULL,
  duration INTEGER NOT NULL, -- en minutos
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Clientes
CREATE TABLE clients (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'cli_' || md5(random()::text),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Citas (Agendas)
CREATE TABLE appointments (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'app_' || md5(random()::text),
  client_id VARCHAR(50) REFERENCES clients(id) ON DELETE SET NULL,
  service_id VARCHAR(50) REFERENCES services(id) ON DELETE SET NULL,
  professional_id VARCHAR(50) REFERENCES professionals(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  price DECIMAL(10,2) NOT NULL,
  duration INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

  const nodeServerCode = `
// index.js (Servidor Principal con Express y node-postgres)
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Configuración de la base de datos PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://usuario:password@localhost:5432/agenda_pro',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// Endpoint de verificación de estado
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', database: 'connected', timestamp: new Date() });
});

// Levantar el servidor
app.listen(PORT, () => {
  console.log(\`Servidor backend Agenda Pro corriendo en el puerto \${PORT}\`);
});
`;

  const appointmentsApi = `
// 1. Obtener todas las citas agrupadas o con filtros
app.get('/api/appointments', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = \`
      SELECT a.*, c.name as "clientName", c.phone as "clientPhone", c.email as "clientEmail",
             s.name as "serviceName", p.name as "professionalName"
      FROM appointments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN professionals p ON a.professional_id = p.id
    \`;
    const params = [];

    if (start_date && end_date) {
      query += " WHERE a.date >= $1 AND a.date <= $2";
      params.push(start_date, end_date);
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Crear una nueva cita
app.post('/api/appointments', async (req, res) => {
  const { clientId, serviceId, professionalId, date, time, price, duration } = req.body;
  try {
    const { rows } = await pool.query(
      \`INSERT INTO appointments (client_id, service_id, professional_id, date, time, price, duration, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed') RETURNING *\`,
      [clientId, serviceId, professionalId, date, time, price, duration]
    );

    // TODO: Disparar notificación por WhatsApp/Gmail aquí
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Cambiar estado de una cita
app.put('/api/appointments/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
`;

  const notificationGuides = `
// Integración con Twilio para WhatsApp o APIs HTTP Directas
const axios = require('axios');

async function enviarNotificacionWhatsApp(clienteTelefono, mensajeText) {
  // Configuración con Twilio API
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const client = require('twilio')(twilioSid, twilioToken);

  try {
    const message = await client.messages.create({
      body: mensajeText,
      from: 'whatsapp:+14155238886', // Número Sandbox o línea verificada
      to: \`whatsapp:\${clienteTelefono}\`
    });
    console.log('Mensaje enviado:', message.sid);
    return message.sid;
  } catch (err) {
    console.error('Error enviando WhatsApp:', err);
  }
}

// Envío automatizado con nodemailer por correo (Gmail)
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD // Contraseña de aplicación
  }
});

async function enviarNotificacionCorreo(clienteEmail, asunto, htmlBody) {
  try {
    const info = await transporter.sendMail({
      from: \`"Agenda Pro" <\${process.env.SMTP_USER}>\`,
      to: clienteEmail,
      subject: asunto,
      html: htmlBody
    });
    console.log('Correo enviado:', info.messageId);
    return info.messageId;
  } catch (error) {
    console.error('Error enviando correo:', error);
  }
}
`;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#141414] p-4 rounded-2xl border border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">Guía de Desarrollo Backend</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">Instrucciones y código modelo para implementar tu servidor Express con PostgreSQL</p>
        </div>
      </div>

      {/* Guide layout split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation buttons */}
        <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl p-4 shadow-sm h-fit space-y-2">
          {[
            { id: 'db', label: '1. Modelo PostgreSQL', icon: Database },
            { id: 'server', label: '2. Servidor Node.js', icon: Server },
            { id: 'api', label: '3. Endpoints API', icon: FileCode },
            { id: 'notify', label: '4. WhatsApp & Mail', icon: Share2 }
          ].map((sub) => {
            const Icon = sub.icon;
            const isAct = activeSubTab === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id as 'db' | 'server' | 'api' | 'notify')}
                className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all text-left outline-none cursor-pointer ${
                  isAct
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-700/20'
                    : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{sub.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Display Panel */}
        <div className="lg:col-span-3 bg-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-sm space-y-4">
          {activeSubTab === 'db' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Esquema SQL de Tablas</h3>
                  <p className="text-xs text-gray-400">Ejecuta estas sentencias en tu consola de PostgreSQL para inicializar las tablas.</p>
                </div>
                <button
                  onClick={() => copyToClipboard(sqlSchema, 'db')}
                  className="p-2 border border-[#2a2a2a] hover:bg-[#222] rounded-xl text-xs font-bold text-gray-300 flex items-center space-x-1 transition-all cursor-pointer"
                >
                  {copiedId === 'db' ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4 text-gray-400" />}
                  <span>{copiedId === 'db' ? 'Copiado' : 'Copiar código'}</span>
                </button>
              </div>

              <pre className="bg-[#121212] border border-[#2a2a2a] text-blue-400 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[380px] leading-relaxed">
                {sqlSchema}
              </pre>
            </div>
          )}

          {activeSubTab === 'server' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Configuración Inicial Express</h3>
                  <p className="text-xs text-gray-400">Crea tu archivo index.js e instala: `npm i express pg dotenv cors`</p>
                </div>
                <button
                  onClick={() => copyToClipboard(nodeServerCode, 'server')}
                  className="p-2 border border-[#2a2a2a] hover:bg-[#222] rounded-xl text-xs font-bold text-gray-300 flex items-center space-x-1 transition-all cursor-pointer"
                >
                  {copiedId === 'server' ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}
                  <span>{copiedId === 'server' ? 'Copiado' : 'Copiar código'}</span>
                </button>
              </div>

              <pre className="bg-[#121212] border border-[#2a2a2a] text-blue-400 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[380px] leading-relaxed">
                {nodeServerCode}
              </pre>
            </div>
          )}

          {activeSubTab === 'api' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Rutas para Citas y Reservas</h3>
                  <p className="text-xs text-gray-400">Añade estas rutas a tu index.js para comunicar tu panel frontal con la base de datos.</p>
                </div>
                <button
                  onClick={() => copyToClipboard(appointmentsApi, 'api')}
                  className="p-2 border border-[#2a2a2a] hover:bg-[#222] rounded-xl text-xs font-bold text-gray-300 flex items-center space-x-1 transition-all cursor-pointer"
                >
                  {copiedId === 'api' ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}
                  <span>{copiedId === 'api' ? 'Copiado' : 'Copiar código'}</span>
                </button>
              </div>

              <pre className="bg-[#121212] border border-[#2a2a2a] text-blue-400 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[380px] leading-relaxed">
                {appointmentsApi}
              </pre>
            </div>
          )}

          {activeSubTab === 'notify' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide">Conexiones WhatsApp & Correo</h3>
                  <p className="text-xs text-gray-400">Lógica para enviar mensajes utilizando Twilio y Nodemailer al confirmarse citas.</p>
                </div>
                <button
                  onClick={() => copyToClipboard(notificationGuides, 'notify')}
                  className="p-2 border border-[#2a2a2a] hover:bg-[#222] rounded-xl text-xs font-bold text-gray-300 flex items-center space-x-1 transition-all cursor-pointer"
                >
                  {copiedId === 'notify' ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}
                  <span>{copiedId === 'notify' ? 'Copiado' : 'Copiar código'}</span>
                </button>
              </div>

              <pre className="bg-[#121212] border border-[#2a2a2a] text-blue-400 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-[380px] leading-relaxed">
                {notificationGuides}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
