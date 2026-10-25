import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../lib/api";
import type { Appointment, Customer, Service, Staff } from "../lib/types";
import { currency } from "../lib/format";

type DateRange = {
  from: string;
  to: string;
};

type NotifyResult = {
  ok: boolean;
  appointmentId: string;
  channels: Array<"email" | "sms" | "whatsapp">;
  outboxIds: string[];
  message: string;
};

const statusLabels: Record<Appointment["status"], string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  no_show: "No show",
  completed: "Completada"
};

function eventColor(status: Appointment["status"]) {
  if (status === "cancelled") {
    return "#9AA0A6";
  }
  if (status === "completed") {
    return "#188038";
  }
  if (status === "no_show") {
    return "#A142F4";
  }
  if (status === "pending") {
    return "#F29900";
  }
  return "#1A73E8";
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DateRange>(() => {
    const now = dayjs();
    return {
      from: now.startOf("month").toISOString(),
      to: now.endOf("month").toISOString()
    };
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [calendarStaffId, setCalendarStaffId] = useState("all");
  const [appointmentStaffId, setAppointmentStaffId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", range.from, range.to],
    queryFn: async () =>
      (
        await api.get<Appointment[]>("/appointments", {
          params: { from: range.from, to: range.to }
        })
      ).data
  });

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await api.get<Staff[]>("/staff")).data
  });

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get<Service[]>("/services")).data
  });

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get<Customer[]>("/customers")).data
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/appointments", {
        staffId: appointmentStaffId,
        customerId,
        serviceIds: [serviceId],
        startAt: dayjs(startAt).toISOString()
      });
    },
    onSuccess: async () => {
      setIsDialogOpen(false);
      setCreateError(null);
      setAppointmentStaffId("");
      setCustomerId("");
      setServiceId("");
      setStartAt("");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => {
      setCreateError("No se pudo crear la cita. Revisa conflictos de horario.");
    }
  });

  const notifyMutation = useMutation({
    mutationFn: async (appointmentId: string) =>
      (await api.post<NotifyResult>(`/appointments/${appointmentId}/notify-test`, {})).data,
    onSuccess: (result) => {
      setNotifyError(null);
      setNotifyMessage(
        `Notificación en cola por ${result.channels.join(", ")}. IDs: ${result.outboxIds.join(", ")}`
      );
    },
    onError: () => {
      setNotifyMessage(null);
      setNotifyError("No se pudo enviar la notificación de prueba.");
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) =>
      (
        await api.patch(`/appointments/${appointmentId}/status`, {
          status: "cancelled"
        })
      ).data,
    onSuccess: async () => {
      setActionError(null);
      setActionMessage("Cita cancelada correctamente.");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsDetailDialogOpen(false);
    },
    onError: () => {
      setActionMessage(null);
      setActionError("No se pudo cancelar la cita.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (appointmentId: string) => (await api.delete(`/appointments/${appointmentId}`)).data,
    onSuccess: async () => {
      setActionError(null);
      setActionMessage("Cita eliminada por error.");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setIsDetailDialogOpen(false);
    },
    onError: () => {
      setActionMessage(null);
      setActionError("No se pudo eliminar la cita.");
    }
  });

  const filteredAppointments = useMemo(
    () =>
      (appointmentsQuery.data ?? []).filter((appointment) =>
        calendarStaffId === "all" ? true : appointment.staff.id === calendarStaffId
      ),
    [appointmentsQuery.data, calendarStaffId]
  );

  const events = useMemo(
    () =>
      filteredAppointments.map((appointment) => ({
        id: appointment.id,
        title: `${appointment.customer.fullName} - ${appointment.staff.displayName}`,
        start: appointment.startAt,
        end: appointment.endAt,
        backgroundColor: eventColor(appointment.status),
        borderColor: "transparent"
      })),
    [filteredAppointments]
  );

  const dayAppointments = filteredAppointments.filter((appointment) =>
    dayjs(appointment.startAt).isSame(dayjs(), "day")
  );

  function openAppointmentDetails(eventInfo: EventClickArg) {
    const appointment = (appointmentsQuery.data ?? []).find((item) => item.id === eventInfo.event.id);
    if (!appointment) {
      return;
    }
    setSelectedAppointment(appointment);
    setNotifyError(null);
    setNotifyMessage(null);
    setActionError(null);
    setActionMessage(null);
    setIsDetailDialogOpen(true);
  }

  function openCreateDialog(selectedStart?: Date) {
    setCreateError(null);
    setAppointmentStaffId(calendarStaffId === "all" ? "" : calendarStaffId);
    if (selectedStart) {
      setStartAt(dayjs(selectedStart).format("YYYY-MM-DDTHH:mm"));
    }
    setIsDialogOpen(true);
  }

  const canCancel =
    selectedAppointment?.status === "pending" || selectedAppointment?.status === "confirmed";
  const canDelete =
    selectedAppointment?.status !== "completed" && selectedAppointment?.status !== "no_show";

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="h4">Agenda</Typography>
          <Typography color="text.secondary">
            Vista operativa de citas por profesional, con navegación tipo calendario moderno.
          </Typography>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Profesional</InputLabel>
            <Select
              label="Profesional"
              value={calendarStaffId}
              onChange={(event) => setCalendarStaffId(event.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              {staffQuery.data?.map((staff) => (
                <MenuItem key={staff.id} value={staff.id}>
                  {staff.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={() => openCreateDialog()}>
            Crear
          </Button>
        </Stack>
      </Stack>

      {(actionMessage || actionError) && (
        <Alert severity={actionError ? "error" : "success"}>{actionError ?? actionMessage}</Alert>
      )}

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Stack direction={{ xs: "column", lg: "row" }} divider={<Divider orientation="vertical" flexItem />}>
          <Box sx={{ width: { xs: "100%", lg: 260 }, p: 2, backgroundColor: "#FFFFFF" }}>
            <Button
              fullWidth
              variant="contained"
              sx={{ mb: 2, justifyContent: "flex-start", borderRadius: 6, py: 1.1 }}
              onClick={() => openCreateDialog()}
            >
              Nueva cita
            </Button>

            <Typography variant="subtitle2" color="text.secondary">
              Hoy
            </Typography>
            <Stack spacing={1} sx={{ mt: 1.2 }}>
              {dayAppointments.slice(0, 5).map((appointment) => (
                <Paper key={appointment.id} variant="outlined" sx={{ p: 1.2, borderRadius: 2, boxShadow: "none" }}>
                  <Typography variant="body2" fontWeight={700}>
                    {dayjs(appointment.startAt).format("HH:mm")} {appointment.customer.fullName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {appointment.staff.displayName}
                  </Typography>
                </Paper>
              ))}
              {!dayAppointments.length && (
                <Typography variant="body2" color="text.secondary">
                  Sin citas para hoy.
                </Typography>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              <Chip size="small" label="Confirmadas" sx={{ justifyContent: "flex-start", backgroundColor: "#E8F0FE" }} />
              <Chip size="small" label="Pendientes" sx={{ justifyContent: "flex-start", backgroundColor: "#FEF3C7" }} />
              <Chip size="small" label="Completadas" sx={{ justifyContent: "flex-start", backgroundColor: "#E6F4EA" }} />
              <Chip size="small" label="Canceladas" sx={{ justifyContent: "flex-start", backgroundColor: "#F1F3F4" }} />
            </Stack>
          </Box>

          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              p: { xs: 1, md: 2 },
              "& .fc": {
                fontFamily: "\"Plus Jakarta Sans\", sans-serif"
              },
              "& .fc-toolbar-title": {
                fontSize: { xs: "1.05rem", md: "1.35rem" },
                fontWeight: 700
              },
              "& .fc-button": {
                borderRadius: "999px !important",
                borderColor: "#DADCE0 !important",
                background: "#FFFFFF !important",
                color: "#3C4043 !important",
                boxShadow: "none !important",
                textTransform: "capitalize"
              },
              "& .fc-button-active": {
                background: "#E8F0FE !important",
                color: "#1967D2 !important"
              },
              "& .fc-timegrid-slot": {
                height: 44
              },
              "& .fc-event": {
                borderRadius: 8,
                padding: "2px 4px",
                cursor: "pointer"
              },
              "& .fc-col-header-cell-cushion, & .fc-daygrid-day-number": {
                color: "#3C4043",
                textDecoration: "none"
              }
            }}
          >
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              locale="es"
              height="auto"
              events={events}
              eventClick={openAppointmentDetails}
              selectable
              nowIndicator
              select={(selection) => openCreateDialog(selection.start)}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay"
              }}
              buttonText={{
                today: "Hoy",
                month: "Mes",
                week: "Semana",
                day: "Día"
              }}
              slotMinTime="07:00:00"
              slotMaxTime="21:00:00"
              allDaySlot={false}
              datesSet={(arg) => {
                setRange({
                  from: dayjs(arg.start).toISOString(),
                  to: dayjs(arg.end).toISOString()
                });
              }}
              eventContent={(eventInfo) => (
                <Box sx={{ lineHeight: 1.15 }}>
                  <Typography variant="caption" fontWeight={800}>
                    {eventInfo.timeText}
                  </Typography>
                  <Typography variant="caption" display="block" noWrap>
                    {eventInfo.event.title}
                  </Typography>
                </Box>
              )}
            />
          </Box>
        </Stack>
      </Paper>

      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Crear cita rápida</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createError && <Alert severity="error">{createError}</Alert>}

            <Select value={appointmentStaffId} onChange={(event) => setAppointmentStaffId(event.target.value)} displayEmpty>
              <MenuItem value="">Selecciona profesional</MenuItem>
              {staffQuery.data?.map((staff) => (
                <MenuItem key={staff.id} value={staff.id}>
                  {staff.displayName}
                </MenuItem>
              ))}
            </Select>

            <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} displayEmpty>
              <MenuItem value="">Selecciona cliente</MenuItem>
              {customersQuery.data?.map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.fullName}
                </MenuItem>
              ))}
            </Select>

            <Select value={serviceId} onChange={(event) => setServiceId(event.target.value)} displayEmpty>
              <MenuItem value="">Selecciona servicio</MenuItem>
              {servicesQuery.data?.map((service) => (
                <MenuItem key={service.id} value={service.id}>
                  {service.name} - {currency(service.priceCents)}
                </MenuItem>
              ))}
            </Select>

            <TextField
              label="Fecha y hora"
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setIsDialogOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onClose={() => setIsDetailDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Detalle de cita</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 1 }}>
            {selectedAppointment && (
              <>
                <Typography>
                  <b>Cliente:</b> {selectedAppointment.customer.fullName}
                </Typography>
                <Typography>
                  <b>Profesional:</b> {selectedAppointment.staff.displayName}
                </Typography>
                <Typography>
                  <b>Inicio:</b> {new Date(selectedAppointment.startAt).toLocaleString("es-MX")}
                </Typography>
                <Chip
                  size="small"
                  label={statusLabels[selectedAppointment.status]}
                  sx={{
                    alignSelf: "flex-start",
                    backgroundColor: eventColor(selectedAppointment.status),
                    color: "#FFFFFF"
                  }}
                />
              </>
            )}

            {notifyMessage && <Alert severity="success">{notifyMessage}</Alert>}
            {notifyError && <Alert severity="error">{notifyError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setIsDetailDialogOpen(false)}>
            Cerrar
          </Button>
          <Button
            variant="outlined"
            color="warning"
            disabled={!selectedAppointment || !canCancel || cancelMutation.isPending}
            onClick={() => selectedAppointment && cancelMutation.mutate(selectedAppointment.id)}
          >
            {cancelMutation.isPending ? "Cancelando..." : "Cancelar cita"}
          </Button>
          <Button
            variant="outlined"
            color="error"
            disabled={!selectedAppointment || !canDelete || deleteMutation.isPending}
            onClick={() => selectedAppointment && deleteMutation.mutate(selectedAppointment.id)}
          >
            {deleteMutation.isPending ? "Eliminando..." : "Eliminar por error"}
          </Button>
          <Button
            variant="contained"
            disabled={!selectedAppointment || notifyMutation.isPending}
            onClick={() => selectedAppointment && notifyMutation.mutate(selectedAppointment.id)}
          >
            {notifyMutation.isPending ? "Enviando..." : "Enviar notificación de prueba"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
