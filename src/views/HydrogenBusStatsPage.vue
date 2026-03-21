<template>
  <v-container>
    <h1>Hydrogen Bus Stats</h1>
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="hourly">Hourly</v-tab>
      <v-tab value="daily">Daily</v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <v-tabs-window-item value="hourly">
        <v-row class="mb-4">
          <v-col cols="12">
            <v-btn-group variant="outlined" divided>
              <v-btn
                v-for="option in hourlyRangeOptions"
                :key="option.value"
                class="range-button"
                :color="selectedHourlyRange === option.value ? 'primary' : inactiveButtonColor"
                :variant="selectedHourlyRange === option.value ? 'flat' : 'outlined'"
                @click="selectedHourlyRange = option.value"
              >
                {{ option.label }}
              </v-btn>
            </v-btn-group>
          </v-col>
        </v-row>
        <div class="chart-container">
          <div v-if="loadingHourly" class="d-flex justify-center align-center" style="min-height: 300px">
            <v-progress-circular indeterminate color="primary" size="64" />
          </div>
          <canvas v-else ref="hourlyChartRef"></canvas>
        </div>
      </v-tabs-window-item>

      <v-tabs-window-item value="daily">
        <v-row class="mb-4">
          <v-col cols="12">
            <v-btn-group variant="outlined" divided>
              <v-btn
                v-for="option in dailyRangeOptions"
                :key="option.value"
                class="range-button"
                :color="selectedDailyRange === option.value ? 'primary' : inactiveButtonColor"
                :variant="selectedDailyRange === option.value ? 'flat' : 'outlined'"
                @click="selectedDailyRange = option.value"
              >
                {{ option.label }}
              </v-btn>
            </v-btn-group>
          </v-col>
        </v-row>
        <div class="chart-container">
          <div v-if="loadingDaily" class="d-flex justify-center align-center" style="min-height: 300px">
            <v-progress-circular indeterminate color="primary" size="64" />
          </div>
          <canvas v-else ref="dailyChartRef"></canvas>
        </div>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { Chart, registerables } from 'chart.js';
import { getHydrogenBusStatsHourly, getHydrogenBusStatsDaily } from '../api/index.js';

const theme = useTheme();
const inactiveButtonColor = computed(() => theme.global.current.value.dark ? 'grey-lighten-3' : 'grey-darken-3');

Chart.register(...registerables);

// --- Tabs ---
const activeTab = ref('hourly');

// --- Hourly ---
const hourlyChartRef = ref(null);
let hourlyChartInstance = null;
const allHourlyData = ref([]);
const loadingHourly = ref(false);

const hourlyRangeOptions = [
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 3 Days', value: '3d' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'All Time', value: 'all' },
];
const selectedHourlyRange = ref('7d');

const getUtcHourKey = (value) => {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

const getContinuousHourlyData = (data, range) => {
  const durationByRange = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 };
  const byHour = new Map();
  for (const item of data) {
    byHour.set(getUtcHourKey(item.hour), item.unique_bus_count);
  }
  const availableHours = Array.from(byHour.keys()).sort((a, b) => new Date(a) - new Date(b));
  if (!availableHours.length) return [];
  const endHour = getUtcHourKey(new Date());
  let startHour = availableHours[0];
  let stopHour = availableHours[availableHours.length - 1];
  if (range !== 'all') {
    const duration = durationByRange[range] || 168;
    startHour = getUtcHourKey(new Date(new Date(endHour).getTime() - (duration - 1) * 3600000));
    stopHour = endHour;
  }
  const result = [];
  let current = new Date(startHour);
  const stop = new Date(stopHour);
  while (current <= stop) {
    const key = getUtcHourKey(current);
    result.push({ hour: key, unique_bus_count: byHour.get(key) ?? 0 });
    current = new Date(current.getTime() + 3600000);
  }
  return result;
};

const renderHourlyChart = (data) => {
  const labels = data.map(item =>
    new Date(item.hour).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' })
  );
  if (hourlyChartInstance) hourlyChartInstance.destroy();
  hourlyChartInstance = new Chart(hourlyChartRef.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Unique Hydrogen Buses per Hour', data: data.map(i => i.unique_bus_count), backgroundColor: 'rgba(139, 92, 246, 0.5)' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: 'Hourly Unique Hydrogen Bus Count' } },
      scales: {
        x: { title: { display: true, text: 'Hour' } },
        y: { title: { display: true, text: 'Unique Bus Count' }, beginAtZero: true },
      },
    },
  });
};

// --- Daily ---
const dailyChartRef = ref(null);
let dailyChartInstance = null;
const allDailyData = ref([]);
const loadingDaily = ref(false);
let dailyLoaded = false;

const dailyRangeOptions = [
  { label: 'Last 14 Days', value: '14d' },
  { label: 'Last Month', value: '1m' },
  { label: 'Last 3 Months', value: '3m' },
  { label: 'All Time', value: 'all' },
];
const selectedDailyRange = ref('14d');

const getUtcDayKey = (value) => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
};

const getContinuousDailyData = (data, range) => {
  const byDay = new Map();
  for (const item of data) {
    byDay.set(getUtcDayKey(item.day), item.unique_bus_count);
  }
  const availableDays = Array.from(byDay.keys()).sort((a, b) => new Date(a) - new Date(b));
  if (!availableDays.length) return [];
  const today = getUtcDayKey(new Date());
  let startDay, stopDay;
  if (range === 'all') {
    startDay = availableDays[0];
    stopDay = availableDays[availableDays.length - 1];
  } else {
    stopDay = today;
    const now = new Date(today);
    if (range === '14d') startDay = getUtcDayKey(new Date(now.getTime() - 13 * 86400000));
    else if (range === '1m') startDay = getUtcDayKey(new Date(now.getFullYear(), now.getMonth() - 1, now.getUTCDate()));
    else if (range === '3m') startDay = getUtcDayKey(new Date(now.getFullYear(), now.getMonth() - 3, now.getUTCDate()));
    else startDay = availableDays[0];
  }
  const result = [];
  let current = new Date(startDay);
  const stop = new Date(stopDay);
  while (current <= stop) {
    const key = getUtcDayKey(current);
    result.push({ day: key, unique_bus_count: byDay.get(key) ?? 0 });
    current = new Date(current.getTime() + 86400000);
  }
  return result;
};

const renderDailyChart = (data) => {
  const labels = data.map(item =>
    new Date(item.day).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  );
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(dailyChartRef.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Unique Hydrogen Buses per Day', data: data.map(i => i.unique_bus_count), backgroundColor: 'rgba(167, 139, 250, 0.5)' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: 'Daily Unique Hydrogen Bus Count' } },
      scales: {
        x: { title: { display: true, text: 'Day' } },
        y: { title: { display: true, text: 'Unique Bus Count' }, beginAtZero: true },
      },
    },
  });
};

// --- Lifecycle & watchers ---
onMounted(async () => {
  loadingHourly.value = true;
  allHourlyData.value = await getHydrogenBusStatsHourly();
  loadingHourly.value = false;
  await nextTick();
  renderHourlyChart(getContinuousHourlyData(allHourlyData.value, selectedHourlyRange.value));
});

watch(selectedHourlyRange, (newRange) => {
  renderHourlyChart(getContinuousHourlyData(allHourlyData.value, newRange));
});

watch(selectedDailyRange, (newRange) => {
  renderDailyChart(getContinuousDailyData(allDailyData.value, newRange));
});

watch(activeTab, async (tab) => {
  if (tab === 'daily') {
    if (!dailyLoaded) {
      loadingDaily.value = true;
      allDailyData.value = await getHydrogenBusStatsDaily();
      loadingDaily.value = false;
      dailyLoaded = true;
    }
    await nextTick();
    renderDailyChart(getContinuousDailyData(allDailyData.value, selectedDailyRange.value));
  }
  if (tab === 'hourly' && allHourlyData.value.length) {
    await nextTick();
    renderHourlyChart(getContinuousHourlyData(allHourlyData.value, selectedHourlyRange.value));
  }
});
</script>

<style scoped>
.range-button {
  text-transform: none;
}

.chart-container {
  max-width: 1100px;
  margin-left: auto;
  margin-right: auto;
}

canvas {
  max-width: 100%;
  margin-top: 24px;
}
</style>
