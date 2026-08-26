(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const registry = window.__HERMES_PLUGINS__;
  if (!SDK || !registry) return;

  const React = SDK.React;
  const h = React.createElement;
  const VERSION = "v0.7.3";
  let chartInstance = 0;

  function api(path) {
    return SDK.fetchJSON("/api/plugins/ai-usage-monitor" + path);
  }

  function text() {
    const locale = String(document.documentElement.lang || navigator.language || "en").toLowerCase();
    if (locale.startsWith("fr")) {
      return {
        kicker: "TÉLÉMÉTRIE FOURNISSEUR",
        versionLabel: "Version du plugin",
        title: "Consommation IA",
        subtitle: "Quota fournisseur, compteurs de tokens Hermes et historique récent — sans lire le contenu de tes prompts.",
        refresh: "Actualiser",
        refreshing: "Actualisation…",
        account: "Quota du compte",
        sharedQuota: "Quota fournisseur partagé au niveau du compte ; il n’est pas attribué aux profils.",
        profileScope: "Périmètre des profils",
        currentProfile: "Profil actuel",
        allProfiles: "Tous les profils",
        profileBreakdown: "Consommation par profil",
        profile: "Profil",
        partialWarning: "Données partielles : certains profils sont illisibles et les totaux sont incomplets.",
        unavailable: "Le fournisseur ne publie pas de quota de compte exploitable.",
        usageUnavailable: "Consommation indisponible",
        remaining: "restants",
        used: "utilisés",
        reset: "Réinitialisation",
        quotaScale: "Échelle du quota restant",
        quotaCritical: "Critique 0–<25 %",
        quotaLow: "Faible 25–<50 %",
        quotaModerate: "Modéré 50–<75 %",
        quotaHealthy: "Sain 75–100 %",
        stats: function (days) { return "Activité Hermes · " + (days === 1 ? "24 heures" : days + " jours"); },
        sessions: "Sessions",
        calls: "Appels API",
        input: "Entrée",
        output: "Sortie",
        cached: "Lecture cache",
        cacheWrite: "Cache écrit",
        nonCacheRead: "Hors lecture cache",
        nonCacheReadTokens: "Tokens hors lecture cache",
        cacheReadTokens: "Tokens lus du cache",
        rawTotal: "Total brut",
        tokenSplit: "Répartition des tokens",
        rawVolumeBand: "Palier de volume brut",
        chart: "Utilisation des tokens",
        currentProfileOwnership: function (profile) { return "Profil : " + profile; },
        allProfileOwnership: function (count) { return "Tous les profils · " + count + (count === 1 ? " profil consommateur" : " profils consommateurs"); },
        chartHint: "Créneaux UTC · clique sur une barre pour isoler les sessions correspondantes.",
        periodComposition: "Composition de la période",
        periodTotal: function (total, start, end) { return total + " tokens · du " + start + " au " + end + " UTC"; },
        periodTokenSplit: function (nonCache, cacheRead, raw, start, end) { return "Hors lecture cache " + nonCache + " · Lecture cache " + cacheRead + " · Total brut " + raw + " · du " + start + " au " + end + " UTC"; },
        periodGroup: "Période d’utilisation des tokens",
        reasoningShare: function (percent, value) { return "Raisonnement " + percent + " de la sortie · " + value; },
        bucketBreakdown: function (date) { return "Répartition des tokens pour le " + date + " UTC"; },
        emptyComposition: "Aucun token utilisé sur cette période.",
        ofOutput: "de la sortie",
        inputLegend: "Entrée",
        outputLegend: "Sortie",
        reasoningLegend: "Raisonnement (dans la sortie)",
        cacheReadLegend: "Cache lu",
        cacheWriteLegend: "Cache écrit",
        recent: "Sessions récentes",
        recentHint: "30 dernières sessions de la période",
        filteredHint: "Sessions du créneau sélectionné",
        truncatedHint: "Résultats bornés : certaines sessions du créneau ne sont pas affichées.",
        logRef: "Réf. logs",
        date: "Date",
        model: "Modèle · fournisseur",
        surface: "Surface",
        workload: "Charge",
        tokens: "Tokens",
        inProgress: "En cours",
        durationDays: function (days, hours) { return days + " j " + String(hours).padStart(2, "0") + " h"; },
        durationHours: function (hours, minutes) { return hours + " h " + String(minutes).padStart(2, "0") + " min"; },
        durationMinutes: function (minutes, seconds) { return minutes + " min " + String(seconds).padStart(2, "0") + " s"; },
        durationSeconds: function (seconds) { return seconds + " s"; },
        bands: { green: "Faible", blue: "Modérée", yellow: "Soutenue", orange: "Élevée", red: "Extrême" },
        surfaces: { cron: "Cron", desktop: "Desktop", cli: "CLI", tui: "TUI", acp: "ACP", gateway: "Passerelle", other: "Autre" },
        workloads: { scheduled: "Planifiée", subagent: "Sous-agent", branch: "Branche", continuation: "Continuation" },
        empty: "Aucune consommation enregistrée sur cette période.",
        loading: "Chargement de la consommation…",
        error: "Impossible de charger les données de consommation. Réessaie dans quelques secondes.",
        historyUnavailable: "Historique indisponible. Réessaie dans quelques secondes.",
        codex: "Ce pourcentage représente le quota Codex rattaché à l’abonnement ChatGPT, pas un compteur universel de toutes les conversations ChatGPT.",
        source: "Les pourcentages viennent du fournisseur lorsqu’il les expose. Les tokens sont les compteurs enregistrés par Hermes ; ils ne se convertissent pas directement en pourcentage d’abonnement."
      };
    }
    return {
      kicker: "PROVIDER TELEMETRY",
      versionLabel: "Plugin version",
      title: "AI Usage",
      subtitle: "Provider quota, Hermes token counters, and recent history — without reading prompt content.",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      account: "Account quota",
      sharedQuota: "Provider quota is account-level/shared and is not allocated to profiles.",
      profileScope: "Profile scope",
      currentProfile: "Current profile",
      allProfiles: "All profiles",
      profileBreakdown: "Usage by profile",
      profile: "Profile",
      partialWarning: "Partial data: some profiles could not be read, so totals are incomplete.",
      unavailable: "The provider does not publish a usable account quota.",
      usageUnavailable: "Usage unavailable",
      remaining: "remaining",
      used: "used",
      reset: "Resets",
      quotaScale: "Remaining allowance scale",
      quotaCritical: "Critical 0–<25%",
      quotaLow: "Low 25–<50%",
      quotaModerate: "Moderate 50–<75%",
      quotaHealthy: "Healthy 75–100%",
      stats: function (days) { return "Hermes activity · " + (days === 1 ? "24 hours" : days + " days"); },
      sessions: "Sessions",
      calls: "API calls",
      input: "Input",
      output: "Output",
      cached: "Cache read",
      cacheWrite: "Cache write",
      nonCacheRead: "Non-cache read",
      nonCacheReadTokens: "Non-cache-read tokens",
      cacheReadTokens: "Cache-read tokens",
      rawTotal: "Raw total",
      tokenSplit: "Token split",
      rawVolumeBand: "Raw-volume band",
      chart: "Token usage",
      currentProfileOwnership: function (profile) { return "Profile: " + profile; },
      allProfileOwnership: function (count) { return "All profiles · " + count + " consuming " + (count === 1 ? "profile" : "profiles"); },
      chartHint: "UTC buckets · select a bar to isolate the matching sessions.",
      periodComposition: "Period composition",
      periodTotal: function (total, start, end) { return total + " tokens · " + start + "–" + end + " UTC"; },
      periodTokenSplit: function (nonCache, cacheRead, raw, start, end) { return "Non-cache read " + nonCache + " · Cache read " + cacheRead + " · Raw total " + raw + " · " + start + "–" + end + " UTC"; },
      periodGroup: "Token usage period",
      reasoningShare: function (percent, value) { return "Reasoning " + percent + " of output · " + value; },
      bucketBreakdown: function (date) { return "Token breakdown for " + date + " UTC"; },
      emptyComposition: "No token usage in this period.",
      ofOutput: "of output",
      inputLegend: "Input",
      outputLegend: "Output",
      reasoningLegend: "Reasoning (within output)",
      cacheReadLegend: "Cache read",
      cacheWriteLegend: "Cache write",
      recent: "Recent sessions",
      recentHint: "Latest 30 sessions in the period",
      filteredHint: "Sessions in the selected bucket",
      truncatedHint: "Bounded results: some sessions in this bucket are not displayed.",
      logRef: "Log ref",
      date: "Date",
      model: "Model · provider",
      surface: "Surface",
      workload: "Workload",
      tokens: "Tokens",
      inProgress: "In progress",
      durationDays: function (days, hours) { return days + "d " + String(hours).padStart(2, "0") + "h"; },
      durationHours: function (hours, minutes) { return hours + "h " + String(minutes).padStart(2, "0") + "m"; },
      durationMinutes: function (minutes, seconds) { return minutes + "m " + String(seconds).padStart(2, "0") + "s"; },
      durationSeconds: function (seconds) { return seconds + "s"; },
      bands: { green: "Low", blue: "Moderate", yellow: "Elevated", orange: "High", red: "Extreme" },
      surfaces: { cron: "Cron", desktop: "Desktop", cli: "CLI", tui: "TUI", acp: "ACP", gateway: "Gateway", other: "Other" },
      workloads: { scheduled: "Scheduled", subagent: "Subagent", branch: "Branch", continuation: "Continuation" },
      empty: "No usage was recorded in this period.",
      loading: "Loading usage data…",
      error: "Usage data could not be loaded. Try again in a few seconds.",
      historyUnavailable: "Usage history is unavailable. Try again in a few seconds.",
      codex: "This percentage is the Codex allowance attached to the ChatGPT subscription, not a universal meter for all ChatGPT conversations.",
      source: "Percentages come from the provider when exposed. Tokens are counters recorded by Hermes; they do not convert directly into a subscription percentage."
    };
  }

  function compact(value) {
    const n = Number(value || 0);
    if (n >= 1000000000) return (n / 1000000000).toFixed(1) + "B";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n.toLocaleString(activeLocale());
  }

  function finiteToken(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? Math.min(number, Math.floor(Number.MAX_SAFE_INTEGER / 4)) : 0;
  }

  function allocateShareTenths(values, total) {
    if (!(total > 0)) return values.map(function () { return 0; });
    const raw = values.map(function (value) { return value / total * 1000; });
    const allocated = raw.map(Math.floor);
    let remainder = 1000 - allocated.reduce(function (sum, value) { return sum + value; }, 0);
    const order = raw.map(function (value, index) {
      return { index: index, fraction: value - allocated[index] };
    }).sort(function (a, b) { return b.fraction - a.fraction || a.index - b.index; });
    for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
      allocated[order[index].index] += 1;
    }
    return allocated;
  }

  function compositionOf(source) {
    source = source || {};
    const input = finiteToken(source.input_tokens);
    const output = finiteToken(source.output_tokens);
    const cacheRead = finiteToken(source.cache_read_tokens);
    const cacheWrite = finiteToken(source.cache_write_tokens);
    const reasoning = Math.min(output, finiteToken(source.reasoning_tokens));
    const outputNonReasoning = output - reasoning;
    const nonCacheRead = input + output + cacheWrite;
    const rawTotal = nonCacheRead + cacheRead;
    const additiveTotal = rawTotal;
    return {
      input: input, output: output, outputNonReasoning: outputNonReasoning,
      reasoning: reasoning, cacheRead: cacheRead, cacheWrite: cacheWrite,
      nonCacheRead: nonCacheRead, rawTotal: rawTotal, additiveTotal: additiveTotal,
      shareTenths: allocateShareTenths([input, output, cacheRead, cacheWrite], additiveTotal),
      reasoningOutputTenths: output > 0 ? Math.round(reasoning / output * 1000) : 0
    };
  }

  function formatDate(value) {
    if (!value) return "—";
    const numeric = Number(value);
    const date = new Date(Number.isFinite(numeric) && Math.abs(numeric) < 100000000000 ? numeric * 1000 : value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function formatBucket(value, bucket) {
    const date = new Date(Number(value || 0) * 1000);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: bucket === "hour" ? "short" : undefined,
      timeZone: "UTC"
    }).format(date);
  }

  function activeLocale() {
    return String(document.documentElement.lang || navigator.language || "en");
  }

  function formatPercentTenths(tenths) {
    const locale = activeLocale();
    const value = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(tenths / 10);
    return value + (locale.toLowerCase().startsWith("fr") ? " %" : "%");
  }

  function formatExactNumber(value) {
    return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 0 }).format(value);
  }

  function bindingWindow(account) {
    const windows = (account && account.windows || []).filter(function (window) {
      return quotaPercentages(window).used !== null;
    });
    return windows.length ? windows.reduce(function (lowest, current) {
      return quotaPercentages(current).remaining < quotaPercentages(lowest).remaining ? current : lowest;
    }) : null;
  }

  function quotaPercentages(window) {
    const usedValue = Number(window && window.used_percent);
    const remainingValue = Number(window && window.remaining_percent);
    const remaining = window && window.remaining_percent != null && Number.isFinite(remainingValue)
      ? Math.max(0, Math.min(100, remainingValue))
      : window && window.used_percent != null && Number.isFinite(usedValue)
        ? 100 - Math.max(0, Math.min(100, usedValue))
        : null;
    return { used: remaining === null ? null : 100 - remaining, remaining: remaining };
  }

  function tokenBand(value, t) {
    const total = Number(value);
    if (!Number.isFinite(total) || total < 0) return null;
    const key = total < 10000 ? "green" : total < 50000 ? "blue" : total < 100000 ? "yellow" : total < 250000 ? "orange" : "red";
    return { key: key, label: t.bands[key] };
  }

  function formatDuration(value, active, t) {
    if (active) return t.inProgress;
    if (!Number.isInteger(value) || value < 0) return "—";
    const days = Math.floor(value / 86400);
    const hours = Math.floor(value % 86400 / 3600);
    const minutes = Math.floor(value % 3600 / 60);
    const seconds = value % 60;
    if (days) return t.durationDays(days, hours);
    if (hours) return t.durationHours(hours, minutes);
    if (minutes) return t.durationMinutes(minutes, seconds);
    return t.durationSeconds(seconds);
  }

  function workloadLabel(row, t) {
    const surface = t.surfaces[row.surface || row.source] || t.surfaces.other;
    const workload = row.workload_type && !["interactive", "unknown"].includes(row.workload_type)
      ? t.workloads[row.workload_type]
      : null;
    return [surface, workload].filter(Boolean).join(" · ");
  }

  function Stat(props) {
    return h("div", { className: "aum-stat" + (props.secondary ? " is-secondary" : "") },
      h("div", { className: "aum-stat-label" }, props.label),
      h("div", { className: "aum-stat-value" }, props.value)
    );
  }

  function AccountCard(props) {
    const account = props.account;
    const t = props.t;
    if (!account || !account.available) {
      return h("section", { className: "aum-card" },
        h("h2", { className: "aum-card-title" }, t.account),
        h("p", { className: "aum-card-meta" }, t.sharedQuota),
        h("p", { className: "aum-card-meta" }, t.unavailable)
      );
    }

    return h("section", { className: "aum-card" },
      h("h2", { className: "aum-card-title" }, t.account),
      h("p", { className: "aum-card-meta" }, t.sharedQuota),
      h("p", { className: "aum-card-meta" }, account.provider + (account.plan ? " · " + account.plan : "")),
      h("div", { className: "aum-quota-legend", role: "list", "aria-label": t.quotaScale },
        [["red", t.quotaCritical], ["orange", t.quotaLow], ["yellow", t.quotaModerate], ["green", t.quotaHealthy]].map(function (item) {
          return h("span", { role: "listitem", key: item[0] },
            h("i", { className: "aum-quota-swatch is-" + item[0], "aria-hidden": true }), item[1]
          );
        })
      ),
      h("div", { className: "aum-window-list" }, (account.windows || []).map(function (window, index) {
        const quota = quotaPercentages(window);
        return h("div", { className: "aum-window", key: window.label + "-" + index },
          h("div", { className: "aum-window-head" },
            h("span", null, window.label),
            h("span", { className: "aum-window-value" }, quota.remaining === null ? t.usageUnavailable : Math.round(quota.remaining) + "% " + t.remaining)
          ),
          quota.used === null
            ? h("div", { className: "aum-progress is-unavailable", role: "status" }, t.usageUnavailable)
            : h("div", {
                className: "aum-progress",
                role: "progressbar",
                "aria-label": window.label + ": " + quota.remaining + "% " + t.remaining,
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": quota.remaining
              },
                h("div", { className: "aum-progress-scale" }),
                h("div", { className: "aum-progress-mask", style: { left: quota.remaining + "%", width: quota.used + "%" } })
              ),
          h("div", { className: "aum-window-foot" },
            quota.used === null ? t.usageUnavailable : quota.used + "% " + t.used + (window.reset_at ? " · " + t.reset + " " + formatDate(window.reset_at) : "")
          )
        );
      })),
      account.details && account.details.length ? h("div", { className: "aum-details" }, account.details.join(" · ")) : null,
      account.provider === "openai-codex" ? h("p", { className: "aum-caveat" }, t.codex) : null
    );
  }

  function StatsCard(props) {
    const history = props.history || {};
    const totals = history.totals || {};
    const historyDays = Number(history.days);
    const scopeDays = Number.isInteger(historyDays) && historyDays >= 1 && historyDays <= 90
      ? historyDays
      : props.days;
    const t = props.t;
    const composition = compositionOf(totals);
    return h("section", { className: "aum-card" },
      h("h2", { className: "aum-card-title" }, t.stats(scopeDays)),
      h("p", { className: "aum-card-meta" }, t.source),
      h("div", { className: "aum-stats" },
        h(Stat, { label: t.sessions, value: compact(totals.sessions) }),
        h(Stat, { label: t.calls, value: compact(totals.api_calls) }),
        h(Stat, { label: t.nonCacheReadTokens, value: compact(composition.nonCacheRead) }),
        h(Stat, { label: t.cacheReadTokens, value: compact(composition.cacheRead) }),
        h(Stat, { label: t.rawTotal, value: compact(composition.rawTotal), secondary: true }),
        h(Stat, { label: t.input, value: compact(totals.input_tokens) }),
        h(Stat, { label: t.output, value: compact(totals.output_tokens) }),
        h(Stat, { label: t.cacheWrite, value: compact(totals.cache_write_tokens) })
      )
    );
  }

  function ProfileBreakdown(props) {
    const profiles = props.history && props.history.profiles || [];
    if (!profiles.length) return null;
    return h("section", { className: "aum-card aum-table-card" },
      h("h2", { className: "aum-card-title" }, props.t.profileBreakdown),
      h("div", {
        className: "aum-table-wrap aum-profile-viewport",
        tabIndex: 0,
        "aria-label": props.t.profileBreakdown,
        "data-profile-viewport": "five-rows"
      }, h("table", {
        className: "aum-table aum-profile-table",
        "aria-label": props.t.profileBreakdown
      },
        h("thead", null, h("tr", null,
          h("th", { scope: "col" }, props.t.profile),
          h("th", { className: "aum-num", scope: "col" }, props.t.nonCacheRead),
          h("th", { className: "aum-num", scope: "col" }, props.t.cached),
          h("th", { className: "aum-num", scope: "col" }, props.t.rawTotal),
          h("th", { className: "aum-num", scope: "col" }, props.t.calls),
          h("th", { className: "aum-num", scope: "col" }, props.t.sessions)
        )),
        h("tbody", null, profiles.map(function (profile) {
          const composition = compositionOf(profile);
          return h("tr", { key: profile.profile },
            h("td", { "data-label": props.t.profile }, profile.profile),
            h("td", { className: "aum-num", "data-label": props.t.nonCacheRead }, compact(composition.nonCacheRead)),
            h("td", { className: "aum-num", "data-label": props.t.cached }, compact(composition.cacheRead)),
            h("td", { className: "aum-num aum-secondary", "data-label": props.t.rawTotal }, compact(composition.rawTotal)),
            h("td", { className: "aum-num", "data-label": props.t.calls }, compact(profile.api_calls)),
            h("td", { className: "aum-num", "data-label": props.t.sessions }, compact(profile.sessions))
          );
        }))
      ))
    );
  }

  function UsageChart(props) {
    const history = props.history || {};
    const series = history.series || {};
    const points = series.points || [];
    const profiles = history.profiles || [];
    const ownership = history.profile_scope === "all"
      ? props.t.allProfileOwnership(profiles.filter(function (profile) { return Number(profile.total_tokens) > 0; }).length)
      : history.profile_scope === "current" && profiles[0] && profiles[0].profile
        ? props.t.currentProfileOwnership(profiles[0].profile)
        : null;
    const chartLabel = ownership ? props.t.chart + " · " + ownership : props.t.chart;
    const preferredRovingIndex = Math.max(0, props.selectedBucket === null
      ? points.findIndex(function (point) { return compositionOf(point).additiveTotal > 0; })
      : points.findIndex(function (point) { return Number(point.bucket_start) === props.selectedBucket; }));
    const t = props.t;
    const viewportRef = React.useRef(null);
    const patternRef = React.useRef("aum-reasoning-" + (++chartInstance));
    const patternId = patternRef.current;
    const widthState = React.useState(320);
    const viewportWidth = widthState[0];
    const setViewportWidth = widthState[1];
    const activeState = React.useState(null);
    const activeIndex = activeState[0];
    const setActiveIndex = activeState[1];
    const rovingState = React.useState(preferredRovingIndex);
    const rovingIndex = points.length ? Math.max(0, Math.min(points.length - 1, rovingState[0])) : 0;
    const setRovingIndex = rovingState[1];
    React.useEffect(function () {
      const viewport = viewportRef.current;
      if (!viewport) return undefined;
      const measure = function () { setViewportWidth(Math.max(0, viewport.clientWidth || 0)); };
      measure();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return function () { observer.disconnect(); };
    }, []);
    const left = 40;
    const right = 16;
    const width = Math.max(viewportWidth, left + right + points.length * 10);
    const height = 220;
    const baseline = 182;
    const chartHeight = 142;
    const step = (width - left - right) / Math.max(1, points.length);
    const barWidth = Math.max(3, Math.min(18, step * 0.66));
    const compositions = points.map(compositionOf);
    const maximum = Math.max(1, ...compositions.map(function (composition) { return composition.additiveTotal; }));
    const periodCadence = props.days === 1 ? 4 : props.days === 7 ? 1 : props.days === 30 ? 5 : 14;
    const labelStep = Math.max(periodCadence, Math.ceil(72 / step));
    const legends = [
      ["input", t.inputLegend],
      ["output", t.outputLegend],
      ["reasoning", t.reasoningLegend],
      ["cache-read", t.cacheReadLegend],
      ["cache-write", t.cacheWriteLegend]
    ];
    const periodSource = points.reduce(function (total, point) {
      total.input_tokens += finiteToken(point.input_tokens);
      total.output_tokens += finiteToken(point.output_tokens);
      total.reasoning_tokens += Math.min(finiteToken(point.output_tokens), finiteToken(point.reasoning_tokens));
      total.cache_read_tokens += finiteToken(point.cache_read_tokens);
      total.cache_write_tokens += finiteToken(point.cache_write_tokens);
      return total;
    }, { input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 });
    const period = compositionOf(periodSource);
    const percent = formatPercentTenths;
    const firstDate = points.length ? formatBucket(points[0].bucket_start, series.bucket) : "—";
    const lastDate = points.length ? formatBucket(points[points.length - 1].bucket_start, series.bucket) : "—";
    const focusBucket = function (event, index) {
      const targetIndex = Math.max(0, Math.min(points.length - 1, index));
      setRovingIndex(targetIndex);
      const svg = event.currentTarget && event.currentTarget.ownerSVGElement;
      const bars = svg && svg.querySelectorAll && svg.querySelectorAll("[data-bucket-index]");
      const target = bars && bars[targetIndex];
      if (target && target.focus) target.focus();
    };

    return h("section", { className: "aum-card aum-chart-card" },
      h("div", { className: "aum-chart-head" },
        h("div", null,
          h("h2", { className: "aum-card-title" }, chartLabel),
          h("p", { className: "aum-card-meta" }, t.chartHint)
        ),
        h("div", { className: "aum-periods", role: "group", "aria-label": t.periodGroup }, [1, 7, 30, 90].map(function (days) {
          return h("button", {
            type: "button",
            className: "aum-period" + (props.days === days ? " is-active" : ""),
            "aria-pressed": props.days === days,
            onClick: function () { props.onDays(days); },
            key: days
          }, days === 1 ? "24h" : days + "d");
        }))
      ),
      h("div", { className: "aum-composition" },
        h("div", { className: "aum-composition-head" },
          h("strong", null, t.periodComposition),
          h("span", null, t.periodTokenSplit(compact(period.nonCacheRead), compact(period.cacheRead), compact(period.rawTotal), firstDate, lastDate))
        ),
        h("div", {
          className: "aum-composition-strip",
          role: "img",
          "aria-label": period.additiveTotal
            ? t.periodComposition + ": " + t.nonCacheReadTokens + " " + formatExactNumber(period.nonCacheRead) + "; "
              + t.cacheReadTokens + " " + formatExactNumber(period.cacheRead) + "; " + t.rawTotal + " " + formatExactNumber(period.rawTotal) + "; "
              + t.inputLegend + " " + percent(period.shareTenths[0]) + "; "
              + t.outputLegend + " " + percent(period.shareTenths[1]) + ", " + t.reasoningLegend + " " + formatExactNumber(period.reasoning) + "; "
              + t.cacheReadLegend + " " + percent(period.shareTenths[2]) + "; " + t.cacheWriteLegend + " " + percent(period.shareTenths[3])
            : t.emptyComposition
        }, [
          ["input", period.input], ["output", period.outputNonReasoning], ["reasoning", period.reasoning],
          ["cache-read", period.cacheRead], ["cache-write", period.cacheWrite]
        ].map(function (segment) {
          return h("span", {
            className: "aum-composition-segment aum-chart-" + segment[0],
            style: { width: period.additiveTotal ? segment[1] / period.additiveTotal * 100 + "%" : "0%" },
            "aria-hidden": true,
            key: segment[0]
          });
        })),
        h("div", { className: "aum-composition-metrics" }, [
          ["input", t.inputLegend, period.input, period.shareTenths[0]],
          ["output", t.outputLegend, period.output, period.shareTenths[1]],
          ["cache-read", t.cacheReadLegend, period.cacheRead, period.shareTenths[2]],
          ["cache-write", t.cacheWriteLegend, period.cacheWrite, period.shareTenths[3]]
        ].map(function (metric) {
          return h("div", { className: "aum-composition-metric", key: metric[0] },
            h("i", { className: "aum-legend-swatch aum-chart-" + metric[0] }),
            h("span", null, metric[1]),
            h("b", null, percent(metric[3]) + " · " + compact(metric[2])),
            metric[0] === "output" ? h("small", null, "↳ " + t.reasoningShare(percent(period.reasoningOutputTenths), compact(period.reasoning))) : null
          );
        }))
      ),
      points.length ? h("div", { className: "aum-chart-scroll", ref: viewportRef },
        h("svg", {
          className: "aum-chart",
          viewBox: "0 0 " + width + " " + height,
          style: { width: width + "px" },
          role: "group",
          "aria-label": chartLabel
        },
          h("defs", null, h("pattern", { id: patternId, patternUnits: "userSpaceOnUse", width: 5, height: 5, patternTransform: "rotate(135)" },
            h("rect", { width: 5, height: 5, fill: "#f2eee3" }),
            h("rect", { width: 2, height: 5, fill: "#082522" })
          )),
          h("line", { className: "aum-chart-axis", x1: left, y1: baseline, x2: width - right, y2: baseline }),
          h("line", { className: "aum-chart-axis", x1: left, y1: baseline - chartHeight / 2, x2: width - right, y2: baseline - chartHeight / 2 }),
          h("line", { className: "aum-chart-axis", x1: left, y1: baseline - chartHeight, x2: width - right, y2: baseline - chartHeight }),
          points.map(function (point, index) {
            const composition = compositions[index];
            const segments = [
              ["input", composition.input],
              ["output", composition.outputNonReasoning],
              ["reasoning", composition.reasoning],
              ["cache-read", composition.cacheRead],
              ["cache-write", composition.cacheWrite]
            ];
            const x = left + index * step + (step - barWidth) / 2;
            let y = baseline;
            const rectangles = segments.map(function (segment) {
              const segmentHeight = Math.max(0, segment[1] / maximum * chartHeight);
              y -= segmentHeight;
              return h("rect", {
                className: "aum-chart-segment aum-chart-" + segment[0],
                x: x,
                y: y,
                width: barWidth,
                height: segmentHeight,
                fill: segment[0] === "reasoning" ? "url(#" + patternId + ")" : undefined,
                key: segment[0]
              });
            });
            const label = formatBucket(point.bucket_start, series.bucket);
            const tooltip = t.bucketBreakdown(label) + " · " + t.nonCacheReadTokens + " " + formatExactNumber(composition.nonCacheRead)
              + " · " + t.cacheReadTokens + " " + formatExactNumber(composition.cacheRead) + " · " + t.rawTotal + " " + formatExactNumber(composition.rawTotal)
              + " · " + t.inputLegend + " " + formatExactNumber(composition.input) + " " + percent(composition.shareTenths[0])
              + " · " + t.outputLegend + " " + formatExactNumber(composition.output) + " " + percent(composition.shareTenths[1])
              + " · " + t.reasoningLegend + " " + formatExactNumber(composition.reasoning) + " " + percent(composition.reasoningOutputTenths) + " " + t.ofOutput
              + " · " + t.cacheReadLegend + " " + formatExactNumber(composition.cacheRead) + " " + percent(composition.shareTenths[2])
              + " · " + t.cacheWriteLegend + " " + formatExactNumber(composition.cacheWrite) + " " + percent(composition.shareTenths[3])
              + " · " + compact(point.sessions) + " " + t.sessions
              + " · " + compact(point.api_calls) + " " + t.calls;
            const selected = props.selectedBucket === Number(point.bucket_start);
            return h("g", {
              className: "aum-chart-bar" + (selected ? " is-selected" : ""),
              role: "button",
              tabIndex: index === rovingIndex ? 0 : -1,
              "data-bucket-index": index,
              "aria-label": tooltip,
              "aria-pressed": selected,
              onClick: function () { props.onSelect(Number(point.bucket_start)); },
              onMouseEnter: function () { setActiveIndex(index); },
              onMouseLeave: function () { setActiveIndex(null); },
              onFocus: function () { setRovingIndex(index); setActiveIndex(index); },
              onBlur: function () { setActiveIndex(null); },
              onKeyDown: function (event) {
                if ([" ", "ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) event.preventDefault();
                if (event.key === "Enter" || event.key === " ") props.onSelect(Number(point.bucket_start));
                if (event.key === "ArrowLeft") focusBucket(event, index - 1);
                if (event.key === "ArrowRight") focusBucket(event, index + 1);
                if (event.key === "Home") focusBucket(event, 0);
                if (event.key === "End") focusBucket(event, points.length - 1);
                if (event.key === "Escape") setActiveIndex(null);
              },
              key: point.bucket_start
            },
              h("title", null, tooltip),
              rectangles,
              h("rect", { className: "aum-chart-outline", x: x - 2, y: baseline - composition.additiveTotal / maximum * chartHeight - 2, width: barWidth + 4, height: composition.additiveTotal / maximum * chartHeight + 4 }),
              index % labelStep === 0 || index === points.length - 1
                ? h("text", { className: "aum-chart-label", x: x + barWidth / 2, y: baseline + 22, textAnchor: "middle" }, label)
                : null
            );
          }),
          h("text", { className: "aum-chart-label", x: width - right, y: 216, textAnchor: "end" }, "UTC")
        )
      ) : h("div", { className: "aum-empty" }, t.empty),
      activeIndex !== null && points[activeIndex] ? h("div", {
        className: "aum-chart-tooltip",
        role: "tooltip"
      }, bucketTooltip(points[activeIndex], compositions[activeIndex], series.bucket, t, percent)) : null,
      h("div", { className: "aum-chart-legend" }, legends.map(function (legend) {
        return h("span", { key: legend[0] },
          h("i", { className: "aum-legend-swatch aum-chart-" + legend[0] }),
          legend[1]
        );
      }))
    );
  }

  function bucketTooltip(point, composition, bucket, t, percent) {
    return t.bucketBreakdown(formatBucket(point.bucket_start, bucket)) + " · " + t.nonCacheReadTokens + " " + formatExactNumber(composition.nonCacheRead)
      + " · " + t.cacheReadTokens + " " + formatExactNumber(composition.cacheRead) + " · " + t.rawTotal + " " + formatExactNumber(composition.rawTotal)
      + " · " + compact(point.sessions) + " " + t.sessions + " · " + compact(point.api_calls) + " " + t.calls
      + " · " + t.inputLegend + " " + formatExactNumber(composition.input) + " " + percent(composition.shareTenths[0])
      + " · " + t.outputLegend + " " + formatExactNumber(composition.output) + " " + percent(composition.shareTenths[1])
      + " · " + t.reasoningLegend + " " + formatExactNumber(composition.reasoning) + " " + percent(composition.reasoningOutputTenths) + " " + t.ofOutput
      + " · " + t.cacheReadLegend + " " + formatExactNumber(composition.cacheRead) + " " + percent(composition.shareTenths[2])
      + " · " + t.cacheWriteLegend + " " + formatExactNumber(composition.cacheWrite) + " " + percent(composition.shareTenths[3]);
  }

  function HistoryTable(props) {
    const history = props.history || {};
    const rows = history.rows || [];
    const series = history.series || {};
    const bucketSeconds = Number(series.bucket_seconds || 86400);
    const visibleRows = props.selectedBucket === null
      ? rows.slice(0, 30)
      : rows.filter(function (row) {
        const eventTime = Number(row.ended_at || row.started_at || 0);
        return Math.floor(eventTime / bucketSeconds) * bucketSeconds === props.selectedBucket;
      });
    const t = props.t;
    return h("section", { className: "aum-card aum-table-card" },
      h("div", { className: "aum-table-head" },
        h("div", null,
          h("h2", { className: "aum-card-title" }, t.recent),
          h("p", { className: "aum-card-meta" }, props.selectedBucket === null ? t.recentHint : t.filteredHint),
          props.selectedBucket !== null && history.rows_truncated
            ? h("p", { className: "aum-warning" }, t.truncatedHint)
            : null
        )
      ),
      visibleRows.length ? h("div", { className: "aum-table-wrap" },
        h("table", { className: "aum-table" },
          h("thead", null, h("tr", null,
            h("th", null, t.date),
            h("th", null, t.profile),
            h("th", null, t.workload),
            h("th", null, t.model),
            h("th", { className: "aum-num" }, t.calls),
            h("th", { className: "aum-num" }, t.tokenSplit),
            h("th", null, t.logRef)
          )),
          h("tbody", null, visibleRows.map(function (row, index) {
            const composition = compositionOf(row);
            const band = tokenBand(composition.rawTotal, t);
            const tokenDetail = t.nonCacheReadTokens + " " + compact(composition.nonCacheRead)
              + " · " + t.cacheReadTokens + " " + compact(composition.cacheRead)
              + " · " + t.rawTotal + " " + compact(composition.rawTotal)
              + " · " + t.inputLegend + " " + compact(composition.input)
              + " · " + t.outputLegend + " " + compact(composition.output)
              + " · " + t.cacheWriteLegend + " " + compact(composition.cacheWrite)
              + (row.reasoning_tokens ? " · " + t.reasoningLegend + " " + compact(row.reasoning_tokens) : "");
            return h("tr", { key: (row.profile || "unknown") + ":" + (row.session_ref || (row.ended_at || row.started_at || "session") + "-" + index) },
              h("td", { "data-label": t.date }, formatDate(row.ended_at || row.started_at), h("small", { className: "aum-duration" }, formatDuration(row.duration_seconds, row.is_active, t))),
              h("td", { className: "aum-muted", "data-label": t.profile }, row.profile || "—"),
              h("td", { className: "aum-muted", "data-label": t.workload }, workloadLabel(row, t)),
              h("td", { className: "aum-model", "data-label": t.model }, (row.model || "unknown") + " · " + (row.provider || "unknown")),
              h("td", { className: "aum-num", "data-label": t.calls }, compact(row.api_call_count)),
              h("td", {
                className: "aum-num aum-band-" + (band ? band.key : "none"),
                title: tokenDetail,
                "aria-label": band ? t.nonCacheReadTokens + " " + formatExactNumber(composition.nonCacheRead) + ", " + t.cacheReadTokens + " " + formatExactNumber(composition.cacheRead) + ", " + t.rawTotal + " " + formatExactNumber(composition.rawTotal) + ", " + t.rawVolumeBand + " " + band.label : t.usageUnavailable,
                "data-label": t.tokenSplit
              }, band ? h("span", null,
                h("span", { className: "aum-token-value", "data-token-kind": "non-cache-read" }, t.nonCacheRead + " " + compact(composition.nonCacheRead)),
                h("span", { className: "aum-token-value", "data-token-kind": "cache-read" }, t.cached + " " + compact(composition.cacheRead)),
                h("small", { className: "aum-duration" }, t.rawTotal + " " + compact(composition.rawTotal) + " · " + t.rawVolumeBand + " " + band.label)
              ) : "—"),
              h("td", { "data-label": t.logRef }, row.session_ref ? h("code", { className: "aum-session-ref", title: t.logRef }, row.session_ref) : "—")
            );
          }))
        )
      ) : h("div", { className: "aum-empty" }, t.empty)
    );
  }

  function HistoryUnavailable(props) {
    if (!props.error && (!props.history || props.history.available !== false)) return null;
    return h("div", { className: "aum-error", role: "alert" }, props.t.historyUnavailable);
  }

  const HISTORY_COUNTERS = ["sessions", "api_calls", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens"];

  function historyObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function historyCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function historyCounters(value) {
    return historyObject(value) && HISTORY_COUNTERS.every(function (field) { return historyCount(value[field]); });
  }

  function historyPoint(point) {
    return historyCounters(point) && historyCount(point.bucket_start);
  }

  function historyProfile(profile) {
    return historyCounters(profile)
      && typeof profile.profile === "string"
      && profile.profile.length > 0
      && profile.profile.length <= 64;
  }

  function historyRow(row) {
    return historyObject(row)
      && historyCount(row.started_at)
      && (row.ended_at === null || historyCount(row.ended_at))
      && historyCount(row.duration_seconds)
      && typeof row.is_active === "boolean"
      && historyCount(row.api_call_count)
      && ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens"].every(function (field) { return historyCount(row[field]); })
      && ["model", "provider", "surface", "source", "workload_type"].every(function (field) { return typeof row[field] === "string"; })
      && (row.profile === null || typeof row.profile === "string")
      && (row.session_ref === null || typeof row.session_ref === "string");
  }

  function validHistory(history) {
    if (!historyObject(history) || history.available !== true) return false;
    if (!historyCount(history.days) || history.days < 1 || history.days > 90) return false;
    if (!["current", "all"].includes(history.profile_scope)) return false;
    if (history.provider_quota_scope !== "account_shared_not_attributed") return false;
    if (!historyCounters(history.totals)) return false;
    if (!historyObject(history.series)
        || ![["hour", 3600], ["day", 86400]].some(function (shape) { return history.series.bucket === shape[0] && history.series.bucket_seconds === shape[1]; })
        || history.series.timezone !== "UTC"
        || !Array.isArray(history.series.points)
        || history.series.points.length > 2200
        || !history.series.points.every(historyPoint)) return false;
    if (!Array.isArray(history.rows) || history.rows.length > 200 || !history.rows.every(historyRow)) return false;
    if (!Array.isArray(history.profiles) || history.profiles.length > 64 || !history.profiles.every(historyProfile)) return false;
    if (!historyCount(history.row_count) || typeof history.rows_truncated !== "boolean") return false;
    if (history.selected_bucket_start !== null && !historyCount(history.selected_bucket_start)) return false;
    if (history.partial !== undefined && typeof history.partial !== "boolean") return false;
    return true;
  }

  function normalizeHistoryResponse(response) {
    const history = response && response.history;
    return validHistory(history) ? history : { available: false };
  }

  function AIUsagePage() {
    const t = text();
    const state = React.useState({ loading: true, refreshing: false, error: false, account: null, history: null });
    const data = state[0];
    const setData = state[1];
    const periodState = React.useState(7);
    const days = periodState[0];
    const setDays = periodState[1];
    const scopeState = React.useState("all");
    const scope = scopeState[0];
    const setScope = scopeState[1];
    const selectionState = React.useState(null);
    const selectedBucket = selectionState[0];
    const setSelectedBucket = selectionState[1];
    const requestGeneration = React.useRef(0);

    const load = React.useCallback(function (manual) {
      const generation = ++requestGeneration.current;
      setData(function (previous) { return Object.assign({}, previous, { refreshing: !!manual, error: false }); });
      const bucketQuery = selectedBucket === null ? "" : "&bucket_start=" + encodeURIComponent(String(selectedBucket));
      const scopeQuery = scope === "all" ? "&scope=all" : "";
      return Promise.all([api("/snapshot?provider=auto"), api("/history?days=" + days + "&limit=200" + scopeQuery + bucketQuery)])
        .then(function (responses) {
          if (generation !== requestGeneration.current) return;
          setData({
            loading: false,
            refreshing: false,
            error: false,
            account: responses[0] && responses[0].account,
            history: normalizeHistoryResponse(responses[1])
          });
        })
        .catch(function () {
          if (generation !== requestGeneration.current) return;
          setData(function (previous) { return Object.assign({}, previous, { loading: false, refreshing: false, error: true }); });
        });
    }, [days, scope, selectedBucket]);

    React.useEffect(function () {
      load(false);
      const timer = window.setInterval(function () { load(false); }, 60000);
      return function () {
        window.clearInterval(timer);
        requestGeneration.current += 1;
      };
    }, [load]);

    if (data.loading) {
      return h("div", { className: "aum-page" }, h("div", { className: "aum-loading" }, t.loading));
    }

    const binding = bindingWindow(data.account);
    const bindingQuota = quotaPercentages(binding);
    const historyUnavailable = data.error || data.history && data.history.available === false;
    return h("div", { className: "aum-page" },
      h("header", { className: "aum-hero" },
        h("div", null,
          h("div", { className: "aum-kicker" },
            h("span", null, t.kicker),
            h("span", { className: "aum-version", "aria-label": t.versionLabel + " " + VERSION }, VERSION)
          ),
          h("h1", { className: "aum-title" }, t.title),
          h("p", { className: "aum-subtitle" }, t.subtitle)
        ),
        h("div", { className: "aum-hero-actions" },
          h("label", { className: "aum-card-meta" }, t.profileScope,
            h("select", {
              "aria-label": t.profileScope,
              value: scope,
              onChange: function (event) { setSelectedBucket(null); setScope(event.target.value); }
            },
              h("option", { value: "current" }, t.currentProfile),
              h("option", { value: "all" }, t.allProfiles)
            )
          ),
          h("div", { className: "aum-binding" }, bindingQuota.remaining === null ? "—" : Math.round(bindingQuota.remaining) + "% " + t.remaining),
          h("button", {
            type: "button",
            className: "aum-button",
            disabled: data.refreshing,
            onClick: function () { load(true); }
          }, data.refreshing ? t.refreshing : t.refresh)
        )
      ),
      historyUnavailable ? h(HistoryUnavailable, { history: data.history, error: data.error, t: t }) : null,
      data.history && data.history.partial ? h("div", { className: "aum-warning", role: "status" }, t.partialWarning) : null,
      h("div", { className: "aum-grid" },
        h(AccountCard, { account: data.account, t: t }),
        !historyUnavailable ? h(StatsCard, { history: data.history, t: t, days: days }) : null
      ),
      !historyUnavailable ? h(UsageChart, {
        history: data.history,
        t: t,
        days: days,
        selectedBucket: selectedBucket,
        onDays: function (value) {
          setSelectedBucket(null);
          setDays(value);
        },
        onSelect: function (value) {
          setSelectedBucket(function (current) { return current === value ? null : value; });
        }
      }) : null,
      !historyUnavailable ? h(ProfileBreakdown, { history: data.history, t: t }) : null,
      !historyUnavailable ? h(HistoryTable, { history: data.history, t: t, selectedBucket: selectedBucket }) : null,
      h("p", { className: "aum-source-note" }, t.source)
    );
  }

  registry.register("ai-usage-monitor", AIUsagePage);
})();
