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
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
