import React, { useState } from "react";
import { NotificationTemplate, IntegrationStatus } from "../types";
import {
  Smartphone,
  Mail,
  Calendar,
  Save,
  RefreshCw,
  Key,
  ShieldCheck,
  Send,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRODUCT_NAME } from "../../config/brand";

interface AjustesProps {
  subscription?: {
    status: string;
    currentPeriodEnd: string | null;
    plan: {
      name: string;
      priceCents: number;
      billingPeriod: string;
    };
  } | null;
  notifications: NotificationTemplate[];
  onToggleNotification: (id: string) => void;
  onUpdateNotificationContent: (id: string, content: string) => void;
  onUpdateWhatsappProviderTemplate: (
    id: string,
    name: string,
    language: string,
    parameterOrder: string[],
  ) => Promise<void>;
  integration: IntegrationStatus;
  onUpdateIntegration: (status: IntegrationStatus) => void;
  onConnectWhatsapp: (config: {
    baseUrl: string;
    apiKey: string;
    instanceName: string;
  }) => Promise<void>;
  onDisconnectWhatsapp: () => Promise<void>;
  whatsappLastError?: string | null;
  onConnectChatwoot: (config: {
    baseUrl: string;
    apiToken: string;
    accountId: number;
    inboxId: number;
  }) => Promise<void>;
  onDisconnectChatwoot: () => Promise<void>;
}

export default function Ajustes({
  subscription,
  notifications,
  onToggleNotification,
  onUpdateNotificationContent,
  onUpdateWhatsappProviderTemplate,
  integration,
  onUpdateIntegration,
  onConnectWhatsapp,
  onDisconnectWhatsapp,
  whatsappLastError,
  onConnectChatwoot,
  onDisconnectChatwoot,
}: AjustesProps) {
  const [activeTab, setActiveTab] = useState<
    "plan" | "whatsapp" | "chatwoot" | "google" | "gmail"
  >("plan");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpUser, setSmtpUser] = useState("notificaciones@demo.com");
  const [testEmail, setTestEmail] = useState("");

  // QR Code Loading Simulation for WhatsApp
  const [qrLoading, setQrLoading] = useState(false);
  const [evolutionUrl, setEvolutionUrl] = useState("http://localhost:8081");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [evolutionInstance, setEvolutionInstance] = useState("");
  const [chatwootUrl, setChatwootUrl] = useState("http://localhost:3000");
  const [chatwootToken, setChatwootToken] = useState("");
  const [chatwootAccountId, setChatwootAccountId] = useState("1");
  const [chatwootInboxId, setChatwootInboxId] = useState("1");
  const [chatwootLoading, setChatwootLoading] = useState(false);
  const [providerTemplateDrafts, setProviderTemplateDrafts] = useState<
    Record<string, { name: string; language: string; parameterOrder: string }>
  >({});
  // General Toast Feed
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleWhatsappConnectLegacy = () => {
    setQrLoading(true);
    setTimeout(() => {
      onUpdateIntegration({
        ...integration,
        whatsapp: {
          connected: true,
          phoneNumber: "+52 55 1234 5678",
          qrCodeUrl: "",
        },
      });
      setQrLoading(false);
      showToast("✅ ¡WhatsApp vinculado con éxito!");
    }, 2500);
  };

  const handleWhatsappDisconnectLegacy = () => {
    onUpdateIntegration({
      ...integration,
      whatsapp: {
        connected: false,
        phoneNumber: "",
        qrCodeUrl:
          "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=whatsapp-auth-placeholder",
      },
    });
    showToast("⚠️ WhatsApp desconectado.");
  };

  void handleWhatsappConnectLegacy;
  void handleWhatsappDisconnectLegacy;

  const handleWhatsappConnect = async () => {
    if (!evolutionUrl || !evolutionApiKey || !evolutionInstance) {
      showToast("Completa URL, API key e instancia de Evolution.");
      return;
    }
    setQrLoading(true);
    try {
      await onConnectWhatsapp({
        baseUrl: evolutionUrl,
        apiKey: evolutionApiKey,
        instanceName: evolutionInstance,
      });
      setEvolutionApiKey("");
      showToast("Evolution API y webhook configurados.");
    } catch {
      showToast(
        "No fue posible conectar Evolution. Revisa los datos y la instancia.",
      );
    } finally {
      setQrLoading(false);
    }
  };

  const handleWhatsappDisconnect = async () => {
    try {
      await onDisconnectWhatsapp();
      showToast("WhatsApp desconectado.");
    } catch {
      showToast("No fue posible desconectar WhatsApp.");
    }
  };

  const handleChatwootConnect = async () => {
    setChatwootLoading(true);
    try {
      await onConnectChatwoot({
        baseUrl: chatwootUrl,
        apiToken: chatwootToken,
        accountId: Number(chatwootAccountId),
        inboxId: Number(chatwootInboxId),
      });
      setChatwootToken("");
      showToast("Chatwoot conectado.");
    } catch {
      showToast("No fue posible validar Chatwoot.");
    } finally {
      setChatwootLoading(false);
    }
  };

  const handleChatwootDisconnect = async () => {
    try {
      await onDisconnectChatwoot();
      showToast("Chatwoot desconectado.");
    } catch {
      showToast("No fue posible desconectar Chatwoot.");
    }
  };

  const handleGoogleConnect = () => {
    // Simulate OAuth popups
    const oauthWindow = window.open("", "google-oauth", "width=500,height=600");
    if (oauthWindow) {
      oauthWindow.document.write(`
        <html>
          <head>
            <title>Iniciar Sesión con Google</title>
            <style>
              body { font-family: sans-serif; text-align: center; padding: 40px; background: #fafafa; }
              .card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #eaeaea; }
              .logo { font-size: 20px; font-weight: bold; margin-bottom: 20px; color: #1f2937; }
              .btn { background: #1a73e8; color: white; border: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; }
              .scope { text-align: left; background: #f3f4f6; padding: 12px; border-radius: 8px; font-size: 12px; margin-bottom: 20px; color: #4b5563; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="logo">Google Calendar Sync</div>
              <p>{PRODUCT_NAME} solicita acceso para sincronizar tus citas y gestionar eventos en tu calendario.</p>
              <div class="scope">
                ☑️ Ver, editar y eliminar eventos en tus calendarios de Google Calendar.
              </div>
              <button class="btn" onclick="window.opener.postMessage('google-oauth-success', '*'); window.close();">Permitir Acceso</button>
            </div>
          </body>
        </html>
      `);
      oauthWindow.document.close();

      const receiveMessage = (event: MessageEvent) => {
        if (event.data === "google-oauth-success") {
          onUpdateIntegration({
            ...integration,
            googleCalendar: {
              connected: true,
              syncedCalendars: [
                `${PRODUCT_NAME} - Principal`,
                "Calendario Barbería",
              ],
              accountEmail: "barberstudio.admin@gmail.com",
            },
          });
          showToast("📅 ¡Google Calendar sincronizado correctamente!");
          window.removeEventListener("message", receiveMessage);
        }
      };
      window.addEventListener("message", receiveMessage);
    }
  };

  const handleGoogleDisconnect = () => {
    onUpdateIntegration({
      ...integration,
      googleCalendar: {
        connected: false,
        syncedCalendars: [`${PRODUCT_NAME} - Principal`],
      },
    });
    showToast("⚠️ Sincronización de Google Calendar eliminada.");
  };

  const handleGmailConnect = () => {
    onUpdateIntegration({
      ...integration,
      gmail: {
        connected: true,
        senderEmail: smtpUser,
      },
    });
    showToast("📧 ¡Gmail SMTP conectado con éxito!");
  };

  const handleGmailDisconnect = () => {
    onUpdateIntegration({
      ...integration,
      gmail: {
        connected: false,
        senderEmail: "",
      },
    });
    showToast("⚠️ Gmail SMTP desconectado.");
  };

  const sendTestEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    showToast(`✉️ Correo de prueba enviado a ${testEmail}`);
    setTestEmail("");
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Action Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 bg-[#121212] text-white px-5 py-3.5 rounded-2xl border border-[#2a2a2a] shadow-2xl z-50 flex items-center space-x-3 text-xs font-semibold"
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121212]/50 backdrop-blur-md p-5 rounded-2xl border border-[#2a2a2a]">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">
            Configuración e Integraciones
          </h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            Controla tu plan, edita plantillas y conecta notificaciones
            automáticas
          </p>
        </div>
      </div>

      {/* Integration tabs navigation */}
      <div className="flex bg-[#141414] p-1 rounded-xl border border-[#2a2a2a] overflow-x-auto">
        {[
          { id: "plan", label: "PLAN & PLANTILLAS", icon: ShieldCheck },
          { id: "whatsapp", label: "WHATSAPP API", icon: Smartphone },
          { id: "chatwoot", label: "CHATWOOT", icon: MessageSquare },
          { id: "google", label: "GOOGLE CALENDAR", icon: Calendar },
          { id: "gmail", label: "GMAIL / SMTP", icon: Mail },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as
                    | "plan"
                    | "whatsapp"
                    | "chatwoot"
                    | "google"
                    | "gmail",
                )
              }
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-bold rounded-lg transition-all outline-none whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-sm border border-blue-500/20"
                  : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* RENDER ACTIVE TAB */}
      <AnimatePresence mode="wait">
        {activeTab === "plan" && (
          <motion.div
            key="plan"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Subscription active card (Matches Image 4) */}
            <div className="bg-[#141414] p-6 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
              <div>
                <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest block">
                  Mi plan actual
                </span>
                <h3 className="text-lg font-bold text-white font-sans tracking-tight mt-0.5">
                  Suscripción activa
                </h3>
                <p className="text-xs text-gray-400 font-medium mt-1">
                  Plan {subscription?.plan.name ?? "sin asignar"}
                  {subscription?.currentPeriodEnd
                    ? ` • vence el ${new Date(subscription.currentPeriodEnd).toLocaleDateString("es-SV")}`
                    : ""}
                </p>
              </div>

              <div className="p-4 bg-[#121212] rounded-xl border border-[#2a2a2a] flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {subscription?.plan.name ?? "Sin plan activo"}
                  </h4>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">
                    {subscription
                      ? `$${(subscription.plan.priceCents / 100).toFixed(2)} / ${subscription.plan.billingPeriod === "monthly" ? "mes" : subscription.plan.billingPeriod}`
                      : "Contacta al administrador"}
                  </p>
                </div>
                <span className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider border border-blue-500/20">
                  Plan Actual
                </span>
              </div>
            </div>

            {/* Notification templates editor (Matches Image 5) */}
            <div className="bg-[#141414] p-6 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Plantillas de Notificación
                </h3>
                <p className="text-xs text-gray-400">
                  Configura el texto de las plantillas enviadas por correo o
                  teléfono
                </p>
              </div>

              <div className="space-y-4">
                {notifications.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="p-4 bg-[#121212] rounded-xl border border-[#2a2a2a] space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        {tmpl.type === "email" ? (
                          <Mail className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Smartphone className="w-4 h-4 text-emerald-400" />
                        )}
                        <span className="text-xs font-bold text-gray-200 capitalize">
                          {tmpl.type}
                        </span>
                        <span className="text-gray-600">•</span>
                        <span className="text-[10px] text-blue-300 font-bold font-mono bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded">
                          {tmpl.trigger}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-gray-500 font-bold">
                          {tmpl.enabled ? "ACTIVO" : "PAUSADO"}
                        </span>
                        <button
                          onClick={() => {
                            onToggleNotification(tmpl.id);
                            showToast(
                              `Plantilla ${tmpl.trigger} ${!tmpl.enabled ? "activada" : "desactivada"}`,
                            );
                          }}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none cursor-pointer ${tmpl.enabled ? "bg-blue-600" : "bg-gray-700"}`}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${tmpl.enabled ? "translate-x-4" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={tmpl.content}
                      onChange={(e) =>
                        onUpdateNotificationContent(tmpl.id, e.target.value)
                      }
                      rows={2}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-xs outline-none focus:border-blue-500 font-medium text-gray-200 leading-relaxed font-sans"
                    />

                    {tmpl.type === "whatsapp" && (
                      <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#2a2a2a] bg-[#101010] p-3 md:grid-cols-3">
                        <label className="space-y-1 text-[10px] font-bold uppercase text-gray-500">
                          Plantilla aprobada Meta
                          <input
                            value={
                              providerTemplateDrafts[tmpl.id]?.name ??
                              tmpl.providerTemplateName ??
                              ""
                            }
                            onChange={(event) =>
                              setProviderTemplateDrafts((current) => ({
                                ...current,
                                [tmpl.id]: {
                                  name: event.target.value,
                                  language:
                                    current[tmpl.id]?.language ??
                                    tmpl.providerTemplateLanguage ??
                                    "es",
                                  parameterOrder:
                                    current[tmpl.id]?.parameterOrder ??
                                    tmpl.providerParameterOrder?.join(",") ??
                                    "",
                                },
                              }))
                            }
                            placeholder="appointment_reminder_24h"
                            className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs font-normal normal-case text-white outline-none focus:border-blue-500"
                          />
                        </label>
                        <label className="space-y-1 text-[10px] font-bold uppercase text-gray-500">
                          Idioma
                          <input
                            value={
                              providerTemplateDrafts[tmpl.id]?.language ??
                              tmpl.providerTemplateLanguage ??
                              "es"
                            }
                            onChange={(event) =>
                              setProviderTemplateDrafts((current) => ({
                                ...current,
                                [tmpl.id]: {
                                  name:
                                    current[tmpl.id]?.name ??
                                    tmpl.providerTemplateName ??
                                    "",
                                  language: event.target.value,
                                  parameterOrder:
                                    current[tmpl.id]?.parameterOrder ??
                                    tmpl.providerParameterOrder?.join(",") ??
                                    "",
                                },
                              }))
                            }
                            placeholder="es"
                            className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs font-normal normal-case text-white outline-none focus:border-blue-500"
                          />
                        </label>
                        <label className="space-y-1 text-[10px] font-bold uppercase text-gray-500">
                          Variables en orden
                          <input
                            value={
                              providerTemplateDrafts[tmpl.id]?.parameterOrder ??
                              tmpl.providerParameterOrder?.join(",") ??
                              ""
                            }
                            onChange={(event) =>
                              setProviderTemplateDrafts((current) => ({
                                ...current,
                                [tmpl.id]: {
                                  name:
                                    current[tmpl.id]?.name ??
                                    tmpl.providerTemplateName ??
                                    "",
                                  language:
                                    current[tmpl.id]?.language ??
                                    tmpl.providerTemplateLanguage ??
                                    "es",
                                  parameterOrder: event.target.value,
                                },
                              }))
                            }
                            placeholder="customerName,staffName,startAt"
                            className="w-full rounded-lg border border-[#333] bg-[#181818] px-3 py-2 text-xs font-normal normal-case text-white outline-none focus:border-blue-500"
                          />
                        </label>
                        <button
                          onClick={async () => {
                            const draft = providerTemplateDrafts[tmpl.id];
                            const name =
                              draft?.name ?? tmpl.providerTemplateName ?? "";
                            if (!name) {
                              showToast("Escribe el nombre aprobado en Meta.");
                              return;
                            }
                            await onUpdateWhatsappProviderTemplate(
                              tmpl.id,
                              name,
                              draft?.language ??
                                tmpl.providerTemplateLanguage ??
                                "es",
                              (
                                draft?.parameterOrder ??
                                tmpl.providerParameterOrder?.join(",") ??
                                ""
                              )
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            );
                            showToast("Plantilla oficial guardada.");
                          }}
                          className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-[10px] font-bold uppercase text-emerald-300 md:col-span-3"
                        >
                          Guardar configuración oficial
                        </button>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                      <span className="font-bold">
                        {
                          "Variables: {{customerName}}, {{startAt}}, {{staffName}}"
                        }
                      </span>
                      <span className="flex items-center space-x-1 font-semibold text-blue-400 cursor-pointer hover:underline">
                        <Save className="w-3.5 h-3.5" />
                        <span>Guardado Automático</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* WHATSAPP API PANEL */}
        {activeTab === "whatsapp" && (
          <motion.div
            key="whatsapp"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-[#141414] p-6 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-6"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  WhatsApp / Evolution API
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Conecta tu cuenta para enviar recordatorios masivos,
                  confirmaciones y códigos OTP.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${
                  integration.whatsapp.connected
                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                    : "bg-[#1a1a1a] text-gray-400 border-[#2a2a2a]"
                }`}
              >
                {integration.whatsapp.connected ? "VINCULADO" : "DESCONECTADO"}
              </span>
            </div>

            {integration.whatsapp.connected ? (
              <div className="p-5 bg-emerald-950/20 rounded-2xl border border-emerald-800/30 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-400">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      WhatsApp Web API
                    </h4>
                    <p className="text-xs text-gray-300 font-medium">
                      Línea vinculada:{" "}
                      <strong>{integration.whatsapp.phoneNumber}</strong>
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                      Estado del webhook: Activo y en espera
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleWhatsappDisconnect}
                  className="px-4 py-2 bg-rose-950/30 border border-rose-800/40 text-rose-300 hover:bg-rose-900/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Desvincular
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-5">
                  <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 text-xs leading-relaxed text-blue-100">
                    Conecta una instancia existente de Evolution API. Para
                    producción utiliza WhatsApp Cloud API. El backend verificará
                    la instancia y registrará el webhook seguro.
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-xs font-bold text-gray-300">
                      URL de Evolution API
                      <input
                        value={evolutionUrl}
                        onChange={(event) =>
                          setEvolutionUrl(event.target.value)
                        }
                        placeholder="https://evolution.tudominio.com"
                        className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="space-y-2 text-xs font-bold text-gray-300">
                      Nombre de instancia
                      <input
                        value={evolutionInstance}
                        onChange={(event) =>
                          setEvolutionInstance(event.target.value)
                        }
                        placeholder="barberia-centro"
                        className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="space-y-2 text-xs font-bold text-gray-300 md:col-span-2">
                      API key
                      <input
                        value={evolutionApiKey}
                        onChange={(event) =>
                          setEvolutionApiKey(event.target.value)
                        }
                        type="password"
                        autoComplete="new-password"
                        placeholder="La clave se guardará cifrada"
                        className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                  {whatsappLastError && (
                    <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-3 text-xs text-rose-200">
                      {whatsappLastError}
                    </div>
                  )}
                  <button
                    onClick={handleWhatsappConnect}
                    disabled={qrLoading}
                    className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-xl border border-blue-500/20 bg-blue-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {qrLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4" />
                    )}
                    <span>
                      {qrLoading
                        ? "Verificando y configurando..."
                        : "Conectar Evolution API"}
                    </span>
                  </button>
                </div>
                <div className="hidden">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      ¿Cómo sincronizar WhatsApp?
                    </h4>
                    <ol className="list-decimal list-inside text-xs text-gray-300 space-y-2 leading-relaxed">
                      <li>
                        Presiona el botón "Generar QR" para cargar un token de
                        vinculación.
                      </li>
                      <li>Abre WhatsApp en tu teléfono inteligente.</li>
                      <li>
                        Ve a <strong>Dispositivos vinculados</strong> &gt;{" "}
                        <strong>Vincular dispositivo</strong>.
                      </li>
                      <li>
                        Apunta con la cámara de tu teléfono al código QR de la
                        derecha.
                      </li>
                    </ol>

                    <button
                      onClick={handleWhatsappConnect}
                      disabled={qrLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer border border-blue-500/20"
                    >
                      {qrLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Sincronizando...</span>
                        </>
                      ) : (
                        <span>Generar QR de vinculación</span>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col items-center justify-center border border-[#2a2a2a] p-6 bg-[#121212] rounded-2xl relative min-h-[220px]">
                    {qrLoading ? (
                      <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-xs flex flex-col items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                        <span className="text-xs text-gray-400 font-bold mt-2">
                          Sincronizando canal seguro...
                        </span>
                      </div>
                    ) : null}
                    <img
                      referrerPolicy="no-referrer"
                      src={integration.whatsapp.qrCodeUrl}
                      alt="WhatsApp QR Code Connection"
                      className="w-40 h-40 object-contain shadow-sm border border-[#2a2a2a] rounded-lg p-2 bg-white"
                    />
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2">
                      QR de Validación local
                    </span>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* CHATWOOT PANEL */}
        {activeTab === "chatwoot" && (
          <motion.div
            key="chatwoot"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-white">
                  Bandeja humana Chatwoot
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  Recibe conversaciones, asigna agentes y responde por WhatsApp
                  sin salir de la bandeja.
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${
                  integration.chatwoot.connected
                    ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-300"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-gray-400"
                }`}
              >
                {integration.chatwoot.connected ? "CONECTADO" : "DESCONECTADO"}
              </span>
            </div>

            {integration.chatwoot.connected ? (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-5">
                <div className="flex items-center gap-4">
                  <MessageSquare className="h-7 w-7 text-emerald-400" />
                  <div>
                    <div className="text-sm font-bold text-white">
                      {integration.chatwoot.inboxName ?? "Inbox conectado"}
                    </div>
                    <div className="text-xs text-gray-400">
                      Inbox ID: {integration.chatwoot.inboxId}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleChatwootDisconnect}
                  className="rounded-xl border border-rose-800/40 bg-rose-950/30 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-900/40"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-xs font-bold text-gray-300 md:col-span-2">
                    URL de Chatwoot
                    <input
                      value={chatwootUrl}
                      onChange={(event) => setChatwootUrl(event.target.value)}
                      placeholder="https://chat.tudominio.com"
                      className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-bold text-gray-300">
                    Account ID
                    <input
                      value={chatwootAccountId}
                      onChange={(event) =>
                        setChatwootAccountId(event.target.value)
                      }
                      inputMode="numeric"
                      className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-bold text-gray-300">
                    Inbox ID
                    <input
                      value={chatwootInboxId}
                      onChange={(event) =>
                        setChatwootInboxId(event.target.value)
                      }
                      inputMode="numeric"
                      className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-bold text-gray-300 md:col-span-2">
                    API access token
                    <input
                      value={chatwootToken}
                      onChange={(event) => setChatwootToken(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      placeholder="Se almacenará cifrado"
                      className="w-full rounded-xl border border-[#333] bg-[#101010] px-4 py-3 text-sm font-normal text-white outline-none focus:border-blue-500"
                    />
                  </label>
                </div>
                <button
                  onClick={handleChatwootConnect}
                  disabled={chatwootLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-600 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {chatwootLoading && (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  )}
                  Conectar Chatwoot
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* GOOGLE CALENDAR PANEL */}
        {activeTab === "google" && (
          <motion.div
            key="google"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-[#141414] p-6 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-6"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Sincronización Google Calendar
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Conecta con Google Calendar para exportar automáticamente tus
                  citas y evitar colisiones horarias.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${
                  integration.googleCalendar.connected
                    ? "bg-blue-950/40 text-blue-300 border-blue-800/40"
                    : "bg-[#1a1a1a] text-gray-400 border-[#2a2a2a]"
                }`}
              >
                {integration.googleCalendar.connected
                  ? "SINCRONIZADO"
                  : "DESCONECTADO"}
              </span>
            </div>

            {integration.googleCalendar.connected ? (
              <div className="space-y-4">
                <div className="p-5 bg-blue-950/20 rounded-2xl border border-blue-800/30 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-400">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Conexión de Calendario Activa
                      </h4>
                      <p className="text-xs text-gray-300 font-medium">
                        Cuenta asociada:{" "}
                        <strong>
                          {integration.googleCalendar.accountEmail}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleGoogleDisconnect}
                    className="px-4 py-2 bg-rose-950/30 border border-rose-800/40 text-rose-300 hover:bg-rose-900/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Detener Sincronización
                  </button>
                </div>

                <div className="p-4 border border-[#2a2a2a] rounded-xl bg-[#121212]">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">
                    Calendarios Sincronizados
                  </span>
                  <div className="space-y-1.5">
                    {integration.googleCalendar.syncedCalendars.map((cal) => (
                      <div
                        key={cal}
                        className="flex items-center space-x-2 text-xs font-medium text-gray-300"
                      >
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        <span>{cal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 space-y-4">
                <Calendar className="w-16 h-16 text-gray-700 mx-auto" />
                <div className="max-w-md mx-auto space-y-2">
                  <h4 className="text-sm font-bold text-white">
                    Mantén tu agenda unificada
                  </h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Conéctate usando tu cuenta de Google. Las reservas de
                    barbería se agregarán automáticamente a tu Google Calendar.
                  </p>
                </div>
                <button
                  onClick={handleGoogleConnect}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-6 py-3.5 rounded-xl shadow-md transition-all uppercase tracking-wider flex items-center space-x-2 mx-auto cursor-pointer border border-blue-500/20"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Conectar con Google Calendar</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* GMAIL PANEL */}
        {activeTab === "gmail" && (
          <motion.div
            key="gmail"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-[#141414] p-6 rounded-2xl border border-[#2a2a2a] shadow-sm space-y-6"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Gmail SMTP / Correo Emisor
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Conecta tu servidor SMTP o cuenta Google Workspace para el
                  envío masivo de correos informativos.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${
                  integration.gmail.connected
                    ? "bg-blue-950/40 text-blue-300 border-blue-800/40"
                    : "bg-[#1a1a1a] text-gray-400 border-[#2a2a2a]"
                }`}
              >
                {integration.gmail.connected ? "CONECTADO" : "DESCONECTADO"}
              </span>
            </div>

            {integration.gmail.connected ? (
              <div className="space-y-4">
                <div className="p-5 bg-blue-950/20 rounded-2xl border border-blue-800/30 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-400">
                      <Mail className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Servidor SMTP de Envío Conectado
                      </h4>
                      <p className="text-xs text-gray-300 font-medium">
                        Remitente:{" "}
                        <strong>{integration.gmail.senderEmail}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleGmailDisconnect}
                    className="px-4 py-2 bg-rose-950/30 border border-rose-800/40 text-rose-300 hover:bg-rose-900/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Desconectar SMTP
                  </button>
                </div>

                {/* Simulated test email sender */}
                <form
                  onSubmit={sendTestEmail}
                  className="p-4 border border-[#2a2a2a] rounded-xl bg-[#121212] space-y-3"
                >
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                    Probar Conectividad de Correo
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="Correo destino (ej. mi-correo@gmail.com)"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-xs text-gray-200 outline-none focus:border-blue-500 focus:bg-[#1f1f1f]"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all uppercase tracking-wider flex items-center space-x-1 cursor-pointer border border-blue-500/20"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>ENVIAR PRUEBA</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SMTP Setup inputs */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Parámetros SMTP
                  </h4>

                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                          Host SMTP
                        </label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 text-xs text-gray-200 outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                          Puerto
                        </label>
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 text-xs text-gray-200 outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                        Usuario Emisor
                      </label>
                      <input
                        type="email"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-2 text-xs text-gray-200 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">
                        Contraseña de Aplicación
                      </label>
                      <input
                        type="password"
                        value="••••••••••••••••"
                        disabled
                        className="w-full bg-[#151515] border border-[#2a2a2a] rounded-lg p-2 text-xs outline-none text-gray-600"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleGmailConnect}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center space-x-1 cursor-pointer border border-blue-500/20"
                  >
                    <span>Guardar y Validar Conexión</span>
                  </button>
                </div>

                <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl p-5 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 text-blue-400">
                      <Key className="w-5 h-5" />
                      <span className="text-xs font-bold uppercase">
                        Nota de Seguridad
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed font-medium">
                      Recomendamos utilizar una{" "}
                      <strong>Contraseña de Aplicación</strong> generada desde
                      tu Cuenta de Google (Seguridad &gt; Contraseña de
                      aplicación) en lugar de tu clave principal de Google.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#2a2a2a] text-[10px] text-gray-500 font-semibold leading-relaxed">
                    Las credenciales SMTP se guardan de forma segura en
                    variables de entorno cifradas en el servidor backend.
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
