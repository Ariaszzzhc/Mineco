import { useNavigate } from "@solidjs/router";
import { Chart, registerables } from "chart.js";
import { ArrowLeft } from "lucide-solid";
import {
  createEffect,
  createMemo,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useI18n } from "../i18n/index.tsx";
import type { DailyStats } from "../stores/stats";
import { statsStore } from "../stores/stats";

Chart.register(...registerables);

const COLORS = {
  primary: "#3b5bdb",
  primaryLight: "#edf2ff",
  border: "#e9ecef",
  textMuted: "#acafb7",
  palette: ["#3b5bdb", "#2b8a3e", "#e67700", "#e03131", "#7048e8", "#0c8599"],
};

type DateRangeOption = "today" | "7d" | "30d" | "all";

const DATE_RANGE_OPTIONS: Array<{
  value: DateRangeOption;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "all", label: "All" },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function aggregateByDate(
  daily: DailyStats[],
): Array<{ date: string; cost: number; tokens: number }> {
  const map = new Map<string, { cost: number; tokens: number }>();
  for (const row of daily) {
    const existing = map.get(row.date) ?? { cost: 0, tokens: 0 };
    existing.cost += row.cost;
    existing.tokens += row.totalTokens;
    map.set(row.date, existing);
  }
  return Array.from(map.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function StatCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  sparkData?: number[];
}) {
  let canvasRef: HTMLCanvasElement | undefined;
  let chartInstance: Chart | null = null;

  createEffect(() => {
    const data = props.sparkData;
    if (!data || data.length < 2 || !canvasRef) return;
    chartInstance?.destroy();
    chartInstance = new Chart(canvasRef, {
      type: "line",
      data: {
        labels: data.map((_, i) => i),
        datasets: [
          {
            data,
            borderColor: COLORS.primary,
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
  });

  onCleanup(() => chartInstance?.destroy());

  return (
    <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-medium text-[var(--text-muted)]">
            {props.title}
          </p>
          <p class="mt-1 text-xl font-semibold text-[var(--text-primary)]">
            {props.value}
          </p>
          <Show when={props.subtitle}>
            <p class="mt-0.5 text-xs text-[var(--text-muted)]">
              {props.subtitle}
            </p>
          </Show>
        </div>
        <Show when={props.sparkData && props.sparkData.length >= 2}>
          <div class="h-10 w-20">
            <canvas ref={canvasRef} />
          </div>
        </Show>
      </div>
    </div>
  );
}

export function StatsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  let dailyCanvasRef: HTMLCanvasElement | undefined;
  let pieCanvasRef: HTMLCanvasElement | undefined;
  let dailyChartInstance: Chart | null = null;
  let pieChartInstance: Chart | null = null;

  const summary = () => statsStore.summary();
  const daily = () => statsStore.daily();
  const byModel = () => statsStore.byModel();

  const sparkTokens = createMemo(() => {
    const agg = aggregateByDate(daily());
    return agg.map((d) => d.tokens);
  });

  const sparkCost = createMemo(() => {
    const agg = aggregateByDate(daily());
    return agg.map((d) => d.cost);
  });

  const sparkRequests = createMemo(() => {
    const agg = aggregateByDate(daily());
    const map = new Map<string, number>();
    for (const row of daily()) {
      map.set(row.date, (map.get(row.date) ?? 0) + row.requests);
    }
    return agg.map((d) => map.get(d.date) ?? 0);
  });

  onMount(() => {
    statsStore.setDateRange("7d");
  });

  // Daily cost line chart
  createEffect(() => {
    const data = daily();
    if (!data.length || !dailyCanvasRef) return;
    dailyChartInstance?.destroy();

    const aggregated = aggregateByDate(data);

    dailyChartInstance = new Chart(dailyCanvasRef, {
      type: "line",
      data: {
        labels: aggregated.map((d) => d.date.slice(5)),
        datasets: [
          {
            label: "Cost ($)",
            data: aggregated.map((d) => d.cost),
            borderColor: COLORS.primary,
            backgroundColor: COLORS.primaryLight,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: COLORS.primary,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { color: COLORS.border },
            ticks: { color: COLORS.textMuted, font: { size: 11 } },
          },
          y: {
            grid: { color: COLORS.border },
            ticks: {
              color: COLORS.textMuted,
              font: { size: 11 },
              callback: (value) => `$${value}`,
            },
          },
        },
      },
    });
  });

  // Model distribution pie chart
  createEffect(() => {
    const data = byModel();
    if (!data.length || !pieCanvasRef) return;
    pieChartInstance?.destroy();

    pieChartInstance = new Chart(pieCanvasRef, {
      type: "doughnut",
      data: {
        labels: data.map((d) => `${d.providerId}/${d.model}`),
        datasets: [
          {
            data: data.map((d) => d.totalTokens),
            backgroundColor: data.map(
              (_, i) => COLORS.palette[i % COLORS.palette.length],
            ),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: COLORS.textMuted,
              font: { size: 11 },
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const tokens = ctx.parsed;
                return ` ${ctx.label}: ${formatTokens(tokens)} tokens`;
              },
            },
          },
        },
      },
    });
  });

  onCleanup(() => {
    dailyChartInstance?.destroy();
    pieChartInstance?.destroy();
  });

  return (
    <div class="flex h-full flex-col animate-fade-in">
      {/* Header */}
      <div class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          class="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 class="text-sm font-semibold text-[var(--text-primary)]">
          {t("stats.title")}
        </h1>
        <div class="ml-auto flex items-center gap-1 rounded-lg border border-[var(--border)] p-0.5">
          <For each={DATE_RANGE_OPTIONS}>
            {(option) => (
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                classList={{
                  "bg-[var(--active)] text-[var(--text-primary)]":
                    statsStore.dateRange() === option.value,
                  "text-[var(--text-muted)] hover:text-[var(--text-primary)]":
                    statsStore.dateRange() !== option.value,
                }}
                onClick={() => statsStore.setDateRange(option.value)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl space-y-6 px-6 py-6">
          <Show when={summary()}>
            {(s) => (
              <div class="grid grid-cols-3 gap-4">
                <StatCard
                  title={t("stats.totalTokens")}
                  value={formatTokens(s().totalTokens)}
                  subtitle={t("stats.requests", { count: s().totalRequests })}
                  sparkData={sparkTokens()}
                />
                <StatCard
                  title={t("stats.totalCost")}
                  value={formatCost(s().totalCost)}
                  sparkData={sparkCost()}
                />
                <StatCard
                  title={t("stats.totalRequests")}
                  value={s().totalRequests.toString()}
                  sparkData={sparkRequests()}
                />
              </div>
            )}
          </Show>

          {/* Daily cost line chart */}
          <section>
            <h2 class="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t("stats.dailyCost")}
            </h2>
            <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <Show
                when={daily().length > 0}
                fallback={
                  <p class="py-8 text-center text-sm text-[var(--text-muted)]">
                    {t("stats.noData")}
                  </p>
                }
              >
                <div class="h-64">
                  <canvas ref={dailyCanvasRef} />
                </div>
              </Show>
            </div>
          </section>

          {/* Model distribution pie chart */}
          <section>
            <h2 class="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t("stats.modelDistribution")}
            </h2>
            <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <Show
                when={byModel().length > 0}
                fallback={
                  <p class="py-8 text-center text-sm text-[var(--text-muted)]">
                    {t("stats.noData")}
                  </p>
                }
              >
                <div class="h-64">
                  <canvas ref={pieCanvasRef} />
                </div>
              </Show>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
