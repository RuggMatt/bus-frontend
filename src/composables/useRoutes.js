import { useQuery } from "@tanstack/vue-query";
import { getAllRoutes } from "../api";
import { computed } from "vue";

export const useRoutes = () => {
  const {
    data: routes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["routes"],
    queryFn: getAllRoutes,
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
