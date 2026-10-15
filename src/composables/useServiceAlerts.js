// @ts-check
import { useQuery } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getServiceAlerts } from "../api";
import { groupAlerts, nowLocal } from "../utils/serviceAlerts";

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * The City's service disruption alerts, shared by every page. A failure just shows none
 */
export const useServiceAlerts = () => {
  const { data } = useQuery({
    queryKey: ["service-alerts"],
    queryFn: getServiceAlerts,
    select: groupAlerts,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  });
  return computed(() => data.value ?? []);
};

/**
 * The local time in Edmonton, ticking every minute so alerts start and end on screen
 */
export const useNowLocal = () => {
  const now = ref(nowLocal());
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  onMounted(() => {
    timer = setInterval(() => {
      now.value = nowLocal();
    }, 60000);
  });
  onBeforeUnmount(() => clearInterval(timer));
  return now;
};
