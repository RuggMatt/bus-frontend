<script setup>
// @ts-check
import { Chart, registerables } from 'chart.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from 'vuetify';
import { formatPeriodLabel, formatPeriodTitle } from '../utils/tripCounts';

Chart.register(...registerables);

const props = defineProps({
    // oldest first
    counts: {
        type: /** @type {import('vue').PropType<import('../api').TripCount[]>} */ (Array),
        required: true,
    },
    by: {
        type: /** @type {import('vue').PropType<import('../utils/tripCounts').CountPeriod>} */ (String),
        required: true,
    },
    // bars can be tapped, emitting select with their period
    clickable: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits({
    /** @param {string} _period YYYY-MM-DD */
    select: (_period) => true,
});

const theme = useTheme();
/** @type {import('vue').Ref<HTMLCanvasElement | null>} */
const canvas = ref(null);
/** @type {Chart<'bar'> | null} */
let chart = null;

const colors = () => {
    const current = theme.current.value;
    const text = current.dark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
    const grid = current.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    return { bar: current.colors.primary, text, grid };
};

const render = () => {
    if (!canvas.value) return;
    const { bar, text, grid } = colors();
    const counts = props.counts;
    const by = props.by;
    chart?.destroy();
    chart = new Chart(canvas.value, {
        type: 'bar',
        data: {
            labels: counts.map((count) => formatPeriodLabel(count.period, by)),
            datasets: [{
                data: counts.map((count) => count.trips),
                backgroundColor: bar,
                borderRadius: 3,
                maxBarThickness: 32,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    callbacks: {
                        title: (items) => formatPeriodTitle(counts[items[0]?.dataIndex ?? 0]?.period ?? '', by),
                        label: (item) => `${item.raw} ${item.raw === 1 ? 'trip' : 'trips'}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: text, maxRotation: 0, autoSkipPadding: 8 },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: grid },
                    ticks: { color: text, precision: 0 },
                },
            },
            onClick: (_event, elements) => {
                const period = counts[elements[0]?.index ?? -1]?.period;
                if (props.clickable && period) emit('select', period);
            },
            onHover: (event, elements) => {
                const target = /** @type {HTMLElement | null} */ (event.native?.target ?? null);
                if (target) target.style.cursor = props.clickable && elements.length ? 'pointer' : 'default';
            },
        },
    });
};

onMounted(render);
watch(() => [props.counts, props.by, theme.current.value.dark], render);
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="trip-counts-chart">
    <canvas ref="canvas" role="img" aria-label="Trips per period" />
  </div>
</template>

<style scoped>
.trip-counts-chart {
    position: relative;
    height: 200px;
}

@media (max-width: 599px) {
    .trip-counts-chart {
        height: 160px;
    }
}
</style>
