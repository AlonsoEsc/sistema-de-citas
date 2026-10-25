import { useState } from "react";
import {
  Button,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Customer, Service, Staff } from "../lib/types";
import { currency } from "../lib/format";

export function CatalogPage() {
  const queryClient = useQueryClient();
  const [staffName, setStaffName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [duration, setDuration] = useState(45);
  const [price, setPrice] = useState(25000);
  const [customerName, setCustomerName] = useState("");

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

  const createStaff = useMutation({
    mutationFn: async () => {
      await api.post("/staff", { displayName: staffName });
    },
    onSuccess: async () => {
      setStaffName("");
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
    }
  });

  const createService = useMutation({
    mutationFn: async () => {
      await api.post("/services", {
        name: serviceName,
        durationMinutes: duration,
        priceCents: price
      });
    },
    onSuccess: async () => {
      setServiceName("");
      await queryClient.invalidateQueries({ queryKey: ["services"] });
    }
  });

  const createCustomer = useMutation({
    mutationFn: async () => {
      await api.post("/customers", {
        fullName: customerName
      });
    },
    onSuccess: async () => {
      setCustomerName("");
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Catálogos</Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 4 }}>
            <Typography variant="h6">Profesionales</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <TextField size="small" fullWidth label="Nombre" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
              <Button variant="contained" onClick={() => createStaff.mutate()}>
                Agregar
              </Button>
            </Stack>
            <Stack spacing={1} sx={{ mt: 2 }}>
              {staffQuery.data?.map((staff) => (
                <Paper key={staff.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography>{staff.displayName}</Typography>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 4 }}>
            <Typography variant="h6">Servicios</Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <TextField size="small" label="Nombre" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  type="number"
                  label="Duración (min)"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Precio (centavos)"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </Stack>
              <Button variant="contained" onClick={() => createService.mutate()}>
                Agregar servicio
              </Button>
            </Stack>

            <Stack spacing={1} sx={{ mt: 2 }}>
              {servicesQuery.data?.map((service) => (
                <Paper key={service.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography>{service.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {service.durationMinutes} min • {currency(service.priceCents)}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 4 }}>
            <Typography variant="h6">Clientes</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <TextField
                size="small"
                fullWidth
                label="Nombre cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Button variant="contained" onClick={() => createCustomer.mutate()}>
                Agregar
              </Button>
            </Stack>

            <Stack spacing={1} sx={{ mt: 2 }}>
              {customersQuery.data?.map((customer) => (
                <Paper key={customer.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography>{customer.fullName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {customer.phone ?? customer.email ?? "Sin contacto"}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
