<template>
  <v-container>
    <h1>System Status</h1>

    <v-card class="mt-4">
      <v-card-title>Disk Usage</v-card-title>
      <v-card-text>
        <div class="mt-6">
          <div class="d-flex justify-space-between align-center mb-3">
            <span class="font-weight-bold">Disk Full: {{ (diskStats.percentFull * 100).toFixed(2) }}%</span>
            <span class="text-caption">{{ formatBytes(diskStats.availableBytes) }} available</span>
          </div>
          <div class="progress-bar-container">
            <v-progress-linear
              :model-value="diskStats.percentFull * 100"
              :color="getDiskUsageColor(diskStats.percentFull)"
              height="32"
            />
            <div class="progress-bar-label">
              {{ (diskStats.percentFull * 100).toFixed(2) }}%
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- only from a backend that reports the database's own space -->
    <v-card
      v-if="diskStats.databaseBytes !== undefined"
      class="mt-4"
    >
      <v-card-title>Database</v-card-title>
      <v-card-text>
        <div class="d-flex justify-space-between align-center mb-1">
          <span>Database size</span>
          <span class="font-weight-bold text-no-wrap ms-4">{{ formatBytes(diskStats.databaseBytes) }}</span>
        </div>
        <div class="d-flex justify-space-between align-center mb-1">
          <span>Freed by trims, reused first</span>
          <span class="font-weight-bold text-no-wrap ms-4">{{ formatBytes(diskStats.reusableBytes) }}</span>
        </div>
        <div class="d-flex justify-space-between align-center mb-1">
          <span>Data stored</span>
          <span class="font-weight-bold text-no-wrap ms-4">{{ formatBytes(diskStats.databaseBytes - diskStats.reusableBytes) }}</span>
        </div>
        <div class="mt-6">
          <div class="d-flex justify-space-between align-center mb-3">
            <span class="font-weight-bold">Disk Full, counting freed space as available: {{ (diskStats.effectivePercentFull * 100).toFixed(2) }}%</span>
            <span class="text-caption">{{ formatBytes(diskStats.availableBytes + diskStats.reusableBytes) }} available</span>
          </div>
          <div class="progress-bar-container">
            <v-progress-linear
              :model-value="diskStats.effectivePercentFull * 100"
              :color="getDiskUsageColor(diskStats.effectivePercentFull)"
              height="32"
            />
            <div class="progress-bar-label">
              {{ (diskStats.effectivePercentFull * 100).toFixed(2) }}%
            </div>
          </div>
          <div class="text-caption mt-2">
            The disk space alert goes by this figure.
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- only from a backend that reports each table's size -->
    <v-card
      v-if="diskStats.tableSizes"
      class="mt-4"
    >
      <v-card-title>Space by Table</v-card-title>
      <v-card-text>
        <div v-if="!diskStats.tableSizes.tables">
          Working out each table's size. Reload in a minute to see it.
        </div>
        <template v-else>
          <div
            v-for="table in diskStats.tableSizes.tables"
            :key="table.name"
            class="mb-3"
          >
            <div class="d-flex justify-space-between align-center mb-1">
              <span>
                {{ TABLE_LABELS[table.name] ?? table.name }}
                <span
                  v-if="TABLE_LABELS[table.name]"
                  class="text-caption text-medium-emphasis"
                >{{ table.name }}</span>
              </span>
              <span class="font-weight-bold text-no-wrap ms-4">
                {{ formatBytes(table.bytes) }}
                <span class="text-caption">({{ tableShare(table.bytes) }}%)</span>
              </span>
            </div>
            <v-progress-linear
              :model-value="tableShare(table.bytes)"
              color="#39FF14"
              height="6"
              rounded
            />
          </div>
          <div class="text-caption mt-2">
            Each table's indexes are included. Shares are of the data stored.
            Worked out {{ formatAge(diskStats.tableSizes.computedAt) }}, and again every six hours at most.
          </div>
        </template>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getDiskStats } from '../api/index.js';

const diskStats = ref({
  totalBytes: 0,
  usedBytes: 0,
  availableBytes: 0,
  percentFull: 0,
});

const formatBytes = (bytes) => {
  if (bytes <= 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// what the backend's tables hold, for the table sizes card
const TABLE_LABELS = {
  pos: 'Bus positions',
  actual_stop_times: 'Stop times',
  trip_delays: 'Trip delay summaries',
  actual_stop_time_days: 'Days of stop times worked out',
  backups: 'Completed downloads',
  sqlite_schema: 'Table list',
  sqlite_sequence: 'Id counters',
};

const tableShare = (bytes) => {
  const total = diskStats.value.tableSizes.tables.reduce((sum, t) => sum + t.bytes, 0);
  return total ? Math.round((bytes / total) * 1000) / 10 : 0;
};

const formatAge = (seconds) => {
  const minutes = Math.round((Date.now() / 1000 - seconds) / 60);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
};

const getDiskUsageColor = (percentFull) => {
  return '#39FF14';
};

onMounted(async () => {
  diskStats.value = await getDiskStats();
});
</script>

<style scoped>
.progress-bar-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-label {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  color: white
}
</style>
