<script setup>
defineProps({
  /** the bus (vehicle) id */
  bus: {
    type: [String, Number],
    required: true,
  },
});
</script>

<template>
  <!-- .stop, as bus ids often sit inside rows that are clickable themselves -->
  <router-link :to="`/buses/${encodeURIComponent(bus)}`" class="bus-link" @click.stop>
    <slot>Bus {{ bus }}</slot>
  </router-link>
</template>

<style scoped>
.bus-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: rgba(var(--v-theme-on-surface), 0.3);
  text-underline-offset: 2px;
}

.bus-link:hover {
  color: rgb(var(--v-theme-primary));
  text-decoration-color: currentColor;
}
</style>
