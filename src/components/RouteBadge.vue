<script setup>
import { routeNumber } from '../utils/routes';

defineProps({
  routeId: {
    type: String,
    required: true,
  },
  /** @type {import('vue').PropType<'small' | 'default' | 'large'>} */
  size: {
    type: String,
    default: 'default',
  },
});
</script>

<template>
  <span :class="['route-badge', `route-badge--${size}`]">{{ routeNumber(routeId) }}</span>
</template>

<style scoped>
.route-badge {
  background: rgb(var(--v-theme-primary));
  border-radius: 8px;
  color: rgb(var(--v-theme-on-primary));
  display: inline-block;
  flex-shrink: 0;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.route-badge--small {
  border-radius: 6px;
  font-size: 0.875rem;
  min-width: 32px;
  padding: 2px 6px;
}

.route-badge--default {
  font-size: 1.5rem;
  min-width: 56px;
  padding: 6px 10px;
}

.route-badge--large {
  border-radius: 10px;
  font-size: 2rem;
  min-width: 72px;
  padding: 6px 12px;
}
</style>
