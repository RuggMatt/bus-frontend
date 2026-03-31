import { useQuery } from "@tanstack/vue-query";
// import { ref } from "vue";
import { getAllBuses, getTrips } from "../api";
import { chunk } from "../utils/chunk";

const assignRouteToEachBus = async (buses) => {
  const tripIds = buses.map((bus) => bus.trip);
  const uniqueTrips = [...new Set(tripIds)];
  const tripBatches = chunk(uniqueTrips, 50);
  const routes = [];
  await Promise.allSettled(
    tripBatches.map((batch) =>
      getTrips(batch).then((batchTrips) => routes.push(...batchTrips)),
    ),
  );
  const routeMap = {};
  routes.forEach((route) => {
    routeMap[route.trip_id] = route.route_id;
  });
  buses.forEach((bus) => {
    bus.route_id = routeMap[bus.trip] || null;
  });
};

export function useBuses() {
  const { data: buses, refetch: updateBuses } = useQuery({
    queryKey: ["buses"],
    queryFn: async () => {
      const busesData = await getAllBuses();
      await assignRouteToEachBus(busesData);
      return busesData;
    },
  });

  return {
    buses,
    updateBuses,
  };
}
