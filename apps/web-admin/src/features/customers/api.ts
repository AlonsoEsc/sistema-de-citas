import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useApiMutation } from "../../lib/mutation";

export type Customer = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  whatsappOptOutAt: string | null;
  createdAt: string;
};

export type CustomerInput = {
  fullName: string;
  phone?: string;
  email?: string;
  notes?: string;
};

export const customerKeys = {
  all: ["customers"] as const,
  search: (search: string) => ["customers", search] as const,
};

/** Busqueda por nombre, telefono o correo (la API devuelve hasta 100 resultados). */
export function useCustomers(search: string) {
  return useQuery({
    queryKey: customerKeys.search(search),
    queryFn: async () =>
      (
        await api.get<Customer[]>("/customers", {
          params: { search: search || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useSaveCustomer() {
  return useApiMutation({
    mutationFn: async ({ id, ...input }: CustomerInput & { id?: string }) =>
      id
        ? (await api.patch<Customer>(`/customers/${id}`, input)).data
        : (await api.post<Customer>("/customers", input)).data,
    invalidate: [customerKeys.all],
    success: "Guardado.",
    error: "No se pudo guardar.",
  });
}

export function useDeleteCustomer() {
  return useApiMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ anonymized: boolean }>(`/customers/${id}`)).data,
    invalidate: [customerKeys.all, ["appointments"]],
    success: (result) =>
      result.anonymized
        ? "Datos personales eliminados; el historial de citas se conserva sin nombre."
        : "Eliminado.",
    error: "No se pudo eliminar.",
  });
}
