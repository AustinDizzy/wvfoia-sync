(() => {
  const BREAKDOWN_KEYS = ["granted", "grantedInPart", "exempted", "rejected", "other"];
  const CHART_SERIES = [
    { key: "granted", label: "Granted", borderColor: "#3f9a6f", backgroundColor: "rgba(63,154,111,0.24)" },
    { key: "grantedInPart", label: "Granted in part", borderColor: "#8a9f44", backgroundColor: "rgba(138,159,68,0.24)" },
    { key: "exempted", label: "Exempted", borderColor: "#F9A70E", backgroundColor: "rgba(249,167,14,0.22)" },
    { key: "rejected", label: "Rejected", borderColor: "#bb5f66", backgroundColor: "rgba(187,95,102,0.23)" },
    { key: "other", label: "Other", borderColor: "#707c8c", backgroundColor: "rgba(112,124,140,0.24)" }
  ];

  const getThemeColors = () => {
    const rootStyles = getComputedStyle(document.documentElement);
    return {
      tickColor: (rootStyles.getPropertyValue("--chart-text") || "#334155").trim(),
      gridColor: (rootStyles.getPropertyValue("--chart-grid") || "rgba(100,116,139,0.2)").trim()
    };
  };

  const chartWrap = document.getElementById("agencyResolutionChartWrap");
  if (!chartWrap) return;

  const windowsRaw = chartWrap.getAttribute("data-chart-windows");
  if (!windowsRaw) return;

  let chartWindows;
  try {
    chartWindows = JSON.parse(windowsRaw);
  } catch {
    return;
  }

  const ctx = document.getElementById("agencyResolutionStacked");
  const totalEl = document.getElementById("resolutionWindowTotal");
  const breakdownSegments = Array.from(document.querySelectorAll("[data-breakdown-segment]"));
  const breakdownCards = Array.from(document.querySelectorAll("[data-breakdown-key]"));
  const windowButtons = Array.from(document.querySelectorAll("[data-chart-window]"));

  const segmentByKey = new Map(
    breakdownSegments.map((el) => [el.getAttribute("data-breakdown-segment"), el])
  );
  const legendByKey = new Map(
    breakdownCards.map((el) => [el.getAttribute("data-breakdown-key"), el])
  );

  const getChartWidth = () => chartWrap.clientWidth || window.innerWidth;
  const isNarrowChart = () => getChartWidth() < 640;
  const getWindowData = (windowKey) => chartWindows[windowKey] || chartWindows["90"];
  const getTickFont = () => ({ size: isNarrowChart() ? 10 : 11 });

  let resolutionChart = null;
  if (ctx && window.Chart) {
    const themeColors = getThemeColors();
    resolutionChart = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: getWindowData("90").labels,
        datasets: CHART_SERIES.map((series) => ({
          label: series.label,
          data: getWindowData("90").datasets[series.key] || [],
          borderColor: series.borderColor,
          backgroundColor: series.backgroundColor,
          fill: true,
          tension: 0.28,
          pointRadius: 0,
          borderWidth: 1.5,
          stack: "res"
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: themeColors.tickColor,
              boxWidth: isNarrowChart() ? 10 : 12,
              font: getTickFont()
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: themeColors.tickColor, maxRotation: 0, autoSkip: true, maxTicksLimit: isNarrowChart() ? 5 : 8, font: getTickFont() },
            grid: { color: themeColors.gridColor }
          },
          y: {
            stacked: true,
            ticks: { color: themeColors.tickColor, font: getTickFont() },
            grid: { color: themeColors.gridColor },
            beginAtZero: true
          }
        }
      }
    });
  }

  const renderBreakdown = (windowKey) => {
    const windowData = getWindowData(windowKey);
    const total = windowData.totalResolved;
    if (totalEl) totalEl.textContent = total.toLocaleString();
    const byKey = new Map(windowData.breakdown.map((item) => [item.key, item]));

    BREAKDOWN_KEYS.forEach((key) => {
      const item = byKey.get(key);
      const count = item ? item.count : 0;
      const pct = total > 0 ? (count / total) * 100 : 0;

      const segment = segmentByKey.get(key);
      if (segment) segment.style.flexGrow = String(Math.max(pct, 0.1));

      const legend = legendByKey.get(key);
      if (!legend) return;
      const countEl = legend.querySelector("[data-breakdown-count]");
      const pctEl = legend.querySelector("[data-breakdown-percent]");
      if (countEl) countEl.textContent = count.toLocaleString();
      if (pctEl) pctEl.textContent = pct.toFixed(1);
    });
  };

  const markActiveWindow = (windowKey) => {
    windowButtons.forEach((button) => {
      const isActive = button.getAttribute("data-chart-window") === windowKey;
      button.setAttribute("data-active", String(isActive));
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const syncChartViewport = () => {
    if (!resolutionChart) return;
    const small = isNarrowChart();
    const colors = getThemeColors();
    const legend = resolutionChart.options.plugins?.legend?.labels;
    if (legend) {
      legend.color = colors.tickColor;
      legend.boxWidth = small ? 10 : 12;
      legend.font = getTickFont();
    }
    const xTicks = resolutionChart.options.scales?.x?.ticks;
    const yTicks = resolutionChart.options.scales?.y?.ticks;
    const xGrid = resolutionChart.options.scales?.x?.grid;
    const yGrid = resolutionChart.options.scales?.y?.grid;
    if (xTicks) {
      xTicks.color = colors.tickColor;
      xTicks.maxTicksLimit = small ? 5 : 8;
      xTicks.font = getTickFont();
    }
    if (yTicks) {
      yTicks.color = colors.tickColor;
      yTicks.font = getTickFont();
    }
    if (xGrid) xGrid.color = colors.gridColor;
    if (yGrid) yGrid.color = colors.gridColor;
    resolutionChart.resize();
    resolutionChart.update("none");
  };

  const applyWindow = (windowKey) => {
    const windowData = getWindowData(windowKey);
    if (resolutionChart) {
      resolutionChart.data.labels = windowData.labels;
      BREAKDOWN_KEYS.forEach((key, index) => {
        if (resolutionChart.data.datasets[index]) {
          resolutionChart.data.datasets[index].data = windowData.datasets[key] || [];
        }
      });
      resolutionChart.update();
    }
    renderBreakdown(windowKey);
    markActiveWindow(windowKey);
  };

  windowButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-chart-window");
      if (!key) return;
      applyWindow(key);
      window.rybbit?.event?.("chart_window_toggle", { window: key });
    });
  });

  applyWindow("90");
  syncChartViewport();

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(syncChartViewport));
    resizeObserver.observe(chartWrap);
  } else {
    window.addEventListener("resize", syncChartViewport);
  }

  if (typeof MutationObserver !== "undefined") {
    const themeObserver = new MutationObserver(() => syncChartViewport());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
})();
