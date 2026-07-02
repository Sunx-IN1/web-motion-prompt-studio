const analyzeBtn = document.querySelector("#analyzeBtn");
const copyBtn = document.querySelector("#copyBtn");
const downloadJsonBtn = document.querySelector("#downloadJsonBtn");
const downloadScreenshotBtn = document.querySelector("#downloadScreenshotBtn");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const promptOutput = document.querySelector("#promptOutput");
const screenshotStrip = document.querySelector("#screenshotStrip");

let latestReport = null;
let latestScreenshots = [];

const setStatus = (message) => {
  statusEl.textContent = message;
};

const joinHuman = (items, fallback = "未检测到") => {
  const values = [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 8);
  return values.length ? values.join("、") : fallback;
};

const renderSummary = (report) => {
  const rows = [
    ["标题", report.page.title || "无标题"],
    ["URL", report.page.url],
    ["Viewport", `${report.page.viewport.width}x${report.page.viewport.height}`],
    ["内容层级", joinHuman(report.content.headings.map((item) => item.text))],
    ["主要颜色", joinHuman(report.visual.colors.map((item) => item.value))],
    ["字体", joinHuman(report.visual.fonts.map((item) => item.family))],
    ["动效", `${report.motion.cssAnimations.length} 个 CSS animation，${report.motion.transitions.length} 个 transition，${report.motion.sampledChanges.length} 个采样变化`],
    ["截图", report.screenshots?.items?.length ? `已分段截取 ${report.screenshots.items.length} 张` : "未截取"]
  ];
  summaryEl.innerHTML = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
};

const renderPrompts = (report) => {
  promptOutput.value = [
    report.prompts.creativeBrief,
    "",
    report.prompts.staticVisual,
    "",
    report.prompts.motionVideo,
    "",
    report.prompts.uiRebuild,
    "",
    report.prompts.assetRequest,
    "",
    report.prompts.skillWorkflow,
    "",
    report.prompts.negativePrompt
  ].filter(Boolean).join("\n");
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前活动标签页。");
  return tab;
};

const safeHost = (url) => {
  try {
    return new URL(url).hostname || "website";
  } catch {
    return "website";
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getScrollState = async (tab) => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      x: window.scrollX,
      y: window.scrollY,
      innerHeight: window.innerHeight,
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      title: document.title
    })
  });
  return result.result;
};

const scrollToPosition = async (tab, y) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (nextY) => window.scrollTo({ top: nextY, left: 0, behavior: "auto" }),
    args: [y]
  });
};

const renderScreenshotStrip = (items) => {
  screenshotStrip.innerHTML = "";
  if (!items.length) {
    screenshotStrip.style.display = "none";
    return;
  }
  for (const item of items) {
    const img = document.createElement("img");
    img.className = "screenshotPreview";
    img.src = item.dataUrl;
    img.alt = `网页分段截图 ${item.index}`;
    screenshotStrip.appendChild(img);
  }
  screenshotStrip.style.display = "grid";
};

const captureScreenshotSequence = async (tab) => {
  const initial = await getScrollState(tab);
  const maxShots = 4;
  const step = Math.max(360, Math.round(initial.innerHeight * 0.8));
  const maxY = Math.max(0, initial.scrollHeight - initial.innerHeight);
  const items = [];

  try {
    for (let index = 0; index < maxShots; index += 1) {
      const y = Math.min(maxY, initial.y + index * step);
      await scrollToPosition(tab, y);
      await sleep(index === 0 ? 350 : 550);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      items.push({
        index: index + 1,
        y,
        format: "png",
        scope: "visibleViewportAfterScroll",
        dataUrl
      });
      if (y >= maxY) break;
    }
  } finally {
    await scrollToPosition(tab, initial.y);
  }

  latestScreenshots = items;
  renderScreenshotStrip(items);
  return {
    capturedAt: new Date().toISOString(),
    format: "png",
    mode: "scrollSequence",
    direction: "down",
    stepPx: step,
    originalScrollY: initial.y,
    viewportHeight: initial.innerHeight,
    scrollHeight: initial.scrollHeight,
    note: "Chrome extension captured multiple visible viewports while scrolling downward.",
    items
  };
};

const analyze = async () => {
  analyzeBtn.disabled = true;
  copyBtn.disabled = true;
  downloadJsonBtn.disabled = true;
  downloadScreenshotBtn.disabled = true;
  latestScreenshots = [];
  renderScreenshotStrip([]);
  setStatus("正在分段截图并采集页面信息...");
  try {
    const tab = await getActiveTab();
    const screenshots = await captureScreenshotSequence(tab);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-analyzer.js"]
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "WMP_ANALYZE" });
    if (!response?.ok) throw new Error(response?.error || "页面分析失败。");
    latestReport = response.report;
    latestReport.screenshots = screenshots;
    renderSummary(latestReport);
    renderPrompts(latestReport);
    copyBtn.disabled = false;
    downloadJsonBtn.disabled = false;
    downloadScreenshotBtn.disabled = false;
    setStatus(`分析完成，已按滚动方向截取 ${screenshots.items.length} 张。`);
  } catch (error) {
    setStatus(`分析失败：${error.message}`);
  } finally {
    analyzeBtn.disabled = false;
  }
};

const copyPrompts = async () => {
  await navigator.clipboard.writeText(promptOutput.value);
  setStatus("提示词已复制到剪贴板。");
};

const downloadJson = () => {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const host = safeHost(latestReport.page.url);
  link.href = url;
  link.download = `web-motion-prompt-${host}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadScreenshot = () => {
  if (!latestScreenshots.length || !latestReport) return;
  const host = safeHost(latestReport.page.url);
  latestScreenshots.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.dataUrl;
    link.download = `web-motion-screenshot-${host}-${String(item.index).padStart(2, "0")}.png`;
    link.click();
  });
};

analyzeBtn.addEventListener("click", analyze);
copyBtn.addEventListener("click", copyPrompts);
downloadJsonBtn.addEventListener("click", downloadJson);
downloadScreenshotBtn.addEventListener("click", downloadScreenshot);
