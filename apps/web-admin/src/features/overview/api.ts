import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type OnboardingStepKey =
  | "verify_email"
  | "add_services"
  | "add_staff"
  | "set_schedule"
  | "connect_whatsapp"
  | "first_appointment";

export type Onboarding = {
  bookingUrl: string;
  completed: boolean;
  progress: number;
  steps: Array<{ key: OnboardingStepKey; done: boolean; optional?: boolean }>;
};

export function useOnboarding() {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => (await api.get<Onboarding>("/onboarding")).data,
    staleTime: 30_000,
  });
}
