import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { getAgencies, getRouteAgencies } from "../api";

/** Each route's agency name, by route id, from the active feed. */
export const useRouteAgencies = () => {
  const { data, isPending, isError } = useQuery({
    queryKey: ["route-agencies"],
    queryFn: getRouteAgencies,
    staleTime: Infinity,
  });
  const agencyByRoute = computed(() =>
    new Map((data.value ?? []).map((entry) => [entry.route_id, entry.agency_name])));
  return { agencyByRoute, isPending, isError };
};

/** The feed's agencies, by name, with their website, fares page and phone. */
export const useAgencies = () => {
  const { data } = useQuery({
    queryKey: ["agencies"],
    queryFn: getAgencies,
    staleTime: Infinity,
  });
  const agenciesByName = computed(() =>
    new Map((data.value ?? []).map((agency) => [agency.agency_name, agency])));
  return { agenciesByName };
};
