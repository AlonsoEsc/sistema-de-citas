import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useToast } from "../components/ui/toast";
import { apiErrorMessage } from "./errors";

/**
 * Mutacion con el comportamiento comun del panel: refresca las consultas afectadas y
 * avisa el resultado. El mensaje de error de la API tiene prioridad sobre el generico.
 */
export function useApiMutation<TInput, TResult>({
  mutationFn,
  invalidate = [],
  success,
  error = "No se pudo completar la acción.",
  onSuccess,
}: {
  mutationFn: (input: TInput) => Promise<TResult>;
  invalidate?: QueryKey[];
  success?: string | ((result: TResult) => string);
  error?: string;
  onSuccess?: (result: TResult) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await Promise.all(
        invalidate.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      if (success) {
        toast.success(
          typeof success === "function" ? success(result) : success,
        );
      }
      onSuccess?.(result);
    },
    onError: (cause) => toast.error(apiErrorMessage(cause, error)),
  });
}
