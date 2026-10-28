import { useQuery } from "@tanstack/vue-query";
import { getAllRoutes } from "../api";
import { computed } from "vue";

/** @param {{ enabled?: import("vue").MaybeRefOrGetter<boolean> }} [options] */
export const useRoutes = ({ enabled = true } = {}) => {
  const {
    data: routes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["routes"],
    queryFn: getAllRoutes,
    enabled,
  });

  return {
    routes,
    isLoading,
    error,
    keyedroutes: computed(() => {
      if (!routes.value) return {};
      /** @type {Record<string, NonNullable<typeof routes.value>[number]>} */
      const routeMap = {};
      routes.value.forEach((route) => {
        routeMap[route.route_id] = route;
      });
      return routeMap;
    }),
  };
};
