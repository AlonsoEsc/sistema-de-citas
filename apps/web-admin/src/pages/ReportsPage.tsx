import { Button, Paper, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { currency } from "../lib/format";

type Plan = {
  id: string;
  code: string;
  name: string;
  priceCents: number;
};

type Subscription = {
  plan: Plan;
  status: string;
  currentPeriodEnd: string;
};

export function ReportsPage() {
  const queryClient = useQueryClient();

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data
  });
  const subscription = useQuery({
    queryKey: ["subscription"],
    queryFn: async () => (await api.get<Subscription | null>("/subscription")).data
  });

  const upgradeMutation = useMutation({
    mutationFn: async (planCode: string) => api.post("/subscription/upgrade", { planCode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    }
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Planes y reportes</Typography>

      <Paper sx={{ p: 3, borderRadius: 4 }}>
        <Typography variant="h6">Suscripción activa</Typography>
        {subscription.data ? (
          <Typography sx={{ mt: 1 }}>
            {subscription.data.plan.name} · vence{" "}
            {new Date(subscription.data.currentPeriodEnd).toLocaleDateString("es-MX")}
          </Typography>
        ) : (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Sin suscripción activa.
          </Typography>
        )}
      </Paper>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        {plans.data?.map((plan) => (
          <Paper key={plan.id} sx={{ p: 2.5, borderRadius: 4, minWidth: 240 }}>
            <Typography variant="h6">{plan.name}</Typography>
            <Typography color="text.secondary">{currency(plan.priceCents)}/mes</Typography>
            <Button
              sx={{ mt: 2 }}
              variant={subscription.data?.plan.code === plan.code ? "outlined" : "contained"}
              onClick={() => upgradeMutation.mutate(plan.code)}
              disabled={subscription.data?.plan.code === plan.code}
            >
              {subscription.data?.plan.code === plan.code ? "Plan actual" : "Cambiar a este plan"}
            </Button>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
