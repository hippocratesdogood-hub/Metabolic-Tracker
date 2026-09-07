import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Whether AI-backed surfaces (Optimization Partner, photo meal analysis,
 * post-meal coaching) are available. Server-derived from ANTHROPIC_API_KEY
 * presence via GET /api/config — flips on automatically once the key is set.
 *
 * Returns false while the config is loading: a briefly hidden entry point
 * beats flashing a door that opens onto an unavailability message.
 */
export function useAiAvailable(): boolean {
  const { data: config } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
    staleTime: 5 * 60 * 1000,
  });
  return config?.aiAvailable ?? false;
}

/**
 * Whether the FOOD AI surface (photo meal analysis, LLM text parse) is
 * available — a separate key from the Partner surface, so the two can be
 * enabled independently. Same loading semantics as useAiAvailable.
 */
export function useFoodAiAvailable(): boolean {
  const { data: config } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
    staleTime: 5 * 60 * 1000,
  });
  return config?.foodAiAvailable ?? false;
}
