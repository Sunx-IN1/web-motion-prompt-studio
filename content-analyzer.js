(() => {
  if (window.__webMotionPromptStudioInstalled) return;
  window.__webMotionPromptStudioInstalled = true;

  const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const rectOf = (el) => {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  };

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 1 && rect.height > 1;
  };

  const selectorFor = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const tag = el.tagName.toLowerCase();
    const classes = [...el.classList].slice(0, 2).map((item) => CSS.escape(item));
    return classes.length ? `${tag}.${classes.join(".")}` : tag;
  };

  const compact = (items, limit = 12) => [...new Set(items.map(cleanText).filter(Boolean))].slice(0, limit);

  const collectSnapshot = () => {
    const visible = [...document.querySelectorAll("body *")]
      .filter(isVisible)
      .map((el) => {
        const rect = rectOf(el);
        return { el, rect, area: rect.width * rect.height };
      })
      .filter((item) => item.rect.y < window.innerHeight * 1.5)
      .sort((a, b) => b.area - a.area)
      .slice(0, 100);

    const colors = new Map();
    const fonts = new Map();
    const layoutRegions = [];
    const components = [];
    const transitions = [];
    const cssAnimations = [];

    for (const { el, rect, area } of visible) {
      const style = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || el.getAttribute("aria-label") || "";
      const addColor = (value, roleName) => {
        if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return;
        if ((value.match(/rgba?\(/g) || []).length > 1) return;
        colors.set(`${value}|${roleName}`, { value, role: roleName });
      };

      addColor(style.color, "text");
      addColor(style.backgroundColor, "background");
      addColor(style.borderColor, "border");
      fonts.set(style.fontFamily, {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight
      });

      if (["header", "nav", "main", "section", "article", "aside", "footer"].includes(tag) || area > 30000) {
        layoutRegions.push({ selector: selectorFor(el), tag, role, rect });
      }

      if (["button", "a", "input", "textarea", "select"].includes(tag) || role === "button") {
        components.push({ selector: selectorFor(el), tag, role, text: cleanText(el.innerText || el.value).slice(0, 120), rect });
      }

      if (style.transitionDuration !== "0s") {
        transitions.push({
          selector: selectorFor(el),
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          transitionTimingFunction: style.transitionTimingFunction
        });
      }

      if (style.animationName && style.animationName !== "none") {
        cssAnimations.push({
          selector: selectorFor(el),
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          animationTimingFunction: style.animationTimingFunction,
          animationIterationCount: style.animationIterationCount
        });
      }
    }

    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .filter(isVisible)
      .slice(0, 18)
      .map((el) => ({ level: el.tagName.toLowerCase(), text: cleanText(el.innerText), rect: rectOf(el) }));
    const navigation = [...document.querySelectorAll("nav a, header a")]
      .filter(isVisible)
      .slice(0, 28)
      .map((el) => ({ text: cleanText(el.innerText), href: el.href, rect: rectOf(el) }));
    const buttons = [...document.querySelectorAll("button,main a,[role='button'],input[type='button'],input[type='submit']")]
      .filter(isVisible)
      .filter((el) => !el.closest("nav") && !(el.tagName.toLowerCase() === "a" && el.closest("header")))
      .slice(0, 32)
      .map((el) => ({ text: cleanText(el.innerText || el.value || el.getAttribute("aria-label")), selector: selectorFor(el), rect: rectOf(el) }));
    const images = [...document.querySelectorAll("img,video,picture")]
      .filter(isVisible)
      .slice(0, 24)
      .map((el) => ({ tag: el.tagName.toLowerCase(), alt: el.getAttribute("alt") || "", src: el.currentSrc || el.src || "", rect: rectOf(el) }));
    const visibleText = compact([...document.querySelectorAll("p,li,span,div")].filter(isVisible).map((el) => el.innerText).filter((value) => cleanText(value).length > 24), 32);
    const tracked = visible.slice(0, 36).map(({ el }) => ({
      selector: selectorFor(el),
      text: cleanText(el.innerText).slice(0, 90),
      rect: rectOf(el),
      opacity: getComputedStyle(el).opacity,
      transform: getComputedStyle(el).transform
    }));

    return {
      title: document.title,
      url: location.href,
      capturedAt: new Date().toISOString(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      content: { headings, navigation, buttons, images, visibleText },
      visual: {
        colors: [...colors.values()].slice(0, 20),
        fonts: [...fonts.values()].slice(0, 12),
        layoutRegions: layoutRegions.slice(0, 24),
        components: components.slice(0, 36)
      },
      motion: {
        cssAnimations: cssAnimations.slice(0, 36),
        transitions: transitions.slice(0, 50),
        webAnimations: document.getAnimations({ subtree: true }).slice(0, 30).map((animation) => ({
          selector: animation.effect?.target ? selectorFor(animation.effect.target) : "unknown",
          playState: animation.playState,
          playbackRate: animation.playbackRate,
          timing: animation.effect?.getTiming ? animation.effect.getTiming() : null
        }))
      },
      tracked
    };
  };

  const diffSnapshots = (samples) => {
    const bySelector = new Map();
    for (const sample of samples) {
      for (const item of sample.tracked) {
        if (!bySelector.has(item.selector)) bySelector.set(item.selector, []);
        bySelector.get(item.selector).push(item);
      }
    }

    const changes = [];
    for (const [selector, items] of bySelector.entries()) {
      if (items.length < 2) continue;
      const first = items[0];
      const last = items[items.length - 1];
      const changed = [];
      if (Math.abs(first.rect.x - last.rect.x) > 2 || Math.abs(first.rect.y - last.rect.y) > 2) changed.push("position");
      if (Math.abs(first.rect.width - last.rect.width) > 2 || Math.abs(first.rect.height - last.rect.height) > 2) changed.push("size");
      if (Math.abs(Number(first.opacity) - Number(last.opacity)) > 0.03) changed.push("opacity");
      if (first.transform !== last.transform) changed.push("transform");
      if (changed.length) changes.push({ selector, text: first.text, changed, from: first, to: last });
    }
    return changes.slice(0, 36);
  };

  const joinHuman = (items, fallback = "未检测到明显特征") => {
    const values = compact(items, 10);
    return values.length ? values.join("、") : fallback;
  };

  const shortText = (value, limit = 90) => {
    const text = cleanText(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).replace(/[，。,.!！?？:：;；\\s]+$/u, "")}...`;
  };

  const normalizeLabel = (value) => {
    const text = cleanText(value);
    const parts = text.split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) return parts[0];
    return text;
  };

  const cleanLabels = (items, limit = 5, textLimit = 90) =>
    compact(items.map(normalizeLabel).map((item) => shortText(item, textLimit)), limit);

  const summarizeSubject = (report, headings) => {
    const first = headings[0] || report.page.title || "网站首屏";
    if (/noomo/i.test(first) || /noomo/i.test(report.page.title || "")) return "NOOMO 沉浸式 3D 数字叙事官网";
    if (first.length > 72) return shortText(first, 72);
    return first;
  };

  const fontSummary = (fonts) => {
    const systemPattern = /(system-ui|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica|arial|sans-serif|serif)/i;
    const named = [];
    const fallbacks = [];
    for (const family of fonts) {
      for (const part of family.split(",").map((item) => item.trim()).filter(Boolean)) {
        const clean = part.replaceAll('"', "");
        if (systemPattern.test(clean)) fallbacks.push(clean);
        else named.push(clean);
      }
    }
    const result = compact(named.length ? named : fallbacks.slice(0, 1), 3);
    return result.length ? result : ["参考原网页字体系统"];
  };

  const rgbToHex = (value) => {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
    if (!match) return "";
    return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
  };

  const describeColor = (hex, role) => {
    const names = {
      "#000000": "黑色",
      "#ffffff": "白色",
      "#fff2df": "暖奶油色",
      "#ffbf00": "琥珀黄"
    };
    return `${names[hex] || hex}${role === "background" ? "背景" : role === "text" ? "文字" : ""} (${hex})`;
  };

  const colorPalette = (report) => {
    const seen = new Set();
    const colors = [];
    for (const item of report.visual.colors) {
      const hex = rgbToHex(item.value);
      if (!hex || seen.has(hex)) continue;
      seen.add(hex);
      colors.push(describeColor(hex, item.role));
      if (colors.length >= 6) break;
    }
    return colors.length ? colors : ["参考原网页的配色"];
  };

  const assetLabel = (item) => {
    if (item.alt) return item.alt;
    try {
      const url = new URL(item.src);
      const file = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || item.tag || "media");
      return file.replace(/\.(png|jpe?g|webp|avif|svg|mp4|mov)$/i, "").replace(/[-_]+/g, " ");
    } catch {
      return item.tag || "media";
    }
  };

  const meaningfulMediaLabels = (report) =>
    cleanLabels(
      report.content.images
        .map(assetLabel)
        .filter((label) => !/^(arrow|icon|image|logo|media|video)$/i.test(cleanText(label))),
      4,
      72
    );

  const mediaSummary = (report) => {
    const videos = report.content.images.filter((item) => item.tag === "video").length;
    const images = report.content.images.length - videos;
    const labels = meaningfulMediaLabels(report);
    if (!report.content.images.length) return "未检测到必须复用的图片素材，可用功能性界面、商品占位图和排版结构表达";
    const parts = [];
    if (videos) parts.push(`${videos} 个首屏/产品视频参考`);
    if (images) parts.push(`${images} 个案例/编辑图片参考`);
    return labels.length ? `${parts.join("，")}；视觉线索：${labels.join("、")}` : `${parts.join("，")}；以案例画面、品牌视觉和编辑式媒体为主`;
  };

  const regionSummary = (report) => {
    const tags = new Set(report.visual.layoutRegions.map((item) => item.tag));
    const regions = [];
    if (tags.has("header") || tags.has("nav")) regions.push("紧凑页头/导航");
    if (tags.has("video") || tags.has("canvas")) regions.push("沉浸式媒体首屏");
    if (tags.has("main") || tags.has("section")) regions.push("纵向编辑式内容区");
    if (report.content.images.length > 2) regions.push("案例/媒体网格");
    return regions.length ? regions.join("、") : "干净清晰的网页分区";
  };

  const inferContentMood = (report) => {
    const text = compact([
      ...report.content.headings.map((item) => item.text),
      ...report.content.buttons.map((item) => item.text),
      ...report.content.navigation.map((item) => item.text)
    ], 12).join(" ").toLowerCase();
    const moods = [];
    if (/3d|immersive|storytelling|digital|narrative|brand|design|experience/.test(text)) moods.push("沉浸式数字叙事/创意工作室气质");
    if (/vogue|editorial|report|case|work|recognition|innovative/.test(text)) moods.push("编辑式案例展示与创新表达");
    if (/collection|drop|accessories|shop/.test(text)) moods.push("时尚/产品发布感");
    if (/newsletter|social|media|dream/.test(text)) moods.push("社区与编辑内容氛围");
    if (/new|live|now/.test(text)) moods.push("新品上线的即时感");
    return moods.length ? moods.join("、") : "清晰、现代、品牌感明确";
  };

  const summarizeMotion = (report) => {
    const raw = [
      ...report.motion.cssAnimations.map((item) => `${item.selector} ${item.animationName}`),
      ...report.motion.transitions.map((item) => `${item.selector} ${item.transitionProperty}`),
      ...report.motion.sampledChanges.map((item) => `${item.selector} ${item.changed.join(" ")}`)
    ].join(" ").toLowerCase();
    const cues = [];
    if (/split-word|text-shadow|span\.text|span\.inner/.test(raw)) cues.push("文字分段揭示与悬停强调");
    if (/button|cta/.test(raw)) cues.push("行动按钮位移/缩放反馈");
    if (/cursor/.test(raw)) cues.push("自定义光标动效");
    if (/path|svg/.test(raw)) cues.push("SVG 路径运动");
    if (/video|canvas/.test(raw)) cues.push("媒体层驱动的动效");
    if (/transform/.test(raw)) cues.push("轻微 transform 过渡");
    return cues.length ? compact(cues, 6).join("、") : "克制淡入、平滑位移和精致悬停反馈";
  };

  const inferCreativeBrief = (report) => {
    const headingText = cleanLabels(report.content.headings.map((item) => item.text), 4, 110);
    const buttonText = cleanLabels(report.content.buttons.map((item) => item.text), 5, 40);
    const navText = compact(report.content.navigation.map((item) => item.text), 8);
    const textTone = inferContentMood(report);
    const colors = colorPalette(report);
    const fonts = fontSummary(report.visual.fonts.map((item) => item.family));
    const hasMedia = report.content.images.length > 0;
    const hasDenseText = report.content.visibleText.length > 12;
    const regionCount = report.visual.layoutRegions.length;
    const motionCount = report.motion.cssAnimations.length + report.motion.transitions.length + report.motion.sampledChanges.length;
    const motionMood = motionCount > 12 ? "微交互丰富、入场层次清晰、界面反馈明显" : motionCount > 0 ? "过渡轻盈、入场克制、悬停反馈精致" : "静态构图稳定，可加入柔和淡入";
    const layoutMood = regionCount > 10 || hasDenseText ? "信息丰富的编辑式界面、网格组织清晰、层级强" : "聚焦型落地页构图、留白充足、首屏层级清晰";
    const visualMood = hasMedia ? "以项目案例和媒体画面驱动的视觉叙事" : "以字体、干净面板、色彩节奏和精确间距构成的视觉系统";

    return {
      subject: summarizeSubject(report, headingText),
      headingText,
      buttonText,
      navText,
      textTone,
      colors,
      fonts,
      layoutMood,
      visualMood,
      motionMood,
      aspect: report.page.viewport.width >= report.page.viewport.height ? "16:9 横向网页首屏画幅" : "竖向移动端网页画幅",
      density: hasDenseText ? "中高信息密度" : "留白均衡",
      imageDirection: hasMedia
        ? `参考页面媒体方向：${mediaSummary(report)}`
        : "使用功能性界面、字体排版、卡片、图标和案例面板表达，不要加入随机装饰图"
    };
  };

  const buildAssetRequest = (report, brief) => {
    const detectedMedia = report.content.images.slice(0, 4).map((item, index) => {
      const label = assetLabel(item);
      return `- 参考媒体 ${index + 1}: ${label}`;
    });
    const motionCount = report.motion.cssAnimations.length + report.motion.transitions.length + report.motion.sampledChanges.length;
    const mediaHint = report.content.images.length
      ? "页面已检测到图片/媒体线索，默认可先按参考风格生成；高还原时再让用户提供原图或可替代素材。"
      : "页面图片线索较少，默认不用追问；只有进入高还原/上线级时再补产品图或场景图。";
    const motionHint = motionCount
      ? "页面已检测到动效线索，默认可按检测结果生成；高还原时再补录屏/GIF。"
      : "未检测到明显动效，默认可用轻量淡入和 hover；如要动效视频再让用户给参考。";

    return [
      "【轻量需求确认】",
      "默认只需要用户确认 3 个问题，不必一开始收集完整素材包：",
      "1. 你要做什么用途？类似网站 / 设计图 / 动效视频 / 提示词参考。",
      "2. 你现在有什么素材？只有网站链接 / 有 logo 品牌素材 / 有图片视频 / 有完整文案。",
      "3. 你想做到什么程度？快速参考版 / 高还原版 / 可上线网站版。",
      "",
      "【仅在高还原或上线级时再追问】",
      `- 品牌：logo、品牌名、主色、字体或 slogan。当前推断主题：${brief.subject}。`,
      `- 图片：${mediaHint}`,
      detectedMedia.length ? ["检测到的媒体线索：", ...detectedMedia].join("\n") : "- 媒体线索：未提取到明确图片，先不强制追问。",
      `- 动效：${motionHint}`,
      "- 内容：最终文案、产品卖点、案例/价格/联系方式。",
      "- 约束：移动端、语言版本、表单/API、版权可用性。"
    ].join("\n");
  };

  const buildSkillWorkflow = (report, brief) => {
    const hasMedia = report.content.images.length > 0;
    const hasMotion = report.motion.cssAnimations.length + report.motion.transitions.length + report.motion.sampledChanges.length > 0;
    return [
      "【后续 Skill 辅助建站流程】",
      "可以把这个分析结果作为起点，按下面步骤逐个推进构建一个类似网站：",
      "Step 1 - 轻量确认：先问用途、现有素材、完成度 3 个问题；除非用户选择高还原/上线级，不展开完整素材清单。",
      `Step 2 - 视觉定稿：用高级静态视觉提示词生成/筛选首屏方向${hasMedia ? "，并对照用户提供的原始图片素材做替换" : "，同时补齐产品图或场景图" }。`,
      `Step 3 - 动效方案：${hasMotion ? "根据检测到的 transition/animation 线索拆解入场、滚动、hover、媒体播放节奏。" : "先定义需要的淡入、滑入、视差、hover、数字滚动等动效，再让用户确认强度。"}`,
      "Step 4 - UI 结构：用前端/UI 复刻提示词生成页面结构、组件层级、响应式规则和设计 token。",
      "Step 5 - 前端实现：选择 React/Next/Vue/纯 HTML 等技术栈，实现真实可运行页面，并替换为用户提供的素材。",
      "Step 6 - 视觉验收：截图对比原站与新站，检查字体、间距、颜色、按钮、响应式和素材裁切。",
      "Step 7 - 动效验收：录屏检查动画节奏、滚动体验、hover 状态、移动端性能，必要时逐个模块微调。",
      "Step 8 - 交付发布：整理源码、素材授权说明、部署方式和后续可维护说明。"
    ].join("\n");
  };

  const buildPrompts = (report) => {
    const brief = inferCreativeBrief(report);
    const headings = joinHuman(brief.headingText);
    const buttons = joinHuman(brief.buttonText, "主要行动按钮不明显");
    const nav = brief.navText.length ? joinHuman(brief.navText) : "极简或隐藏式导航";
    const colors = brief.colors.join("、");
    const fonts = joinHuman(brief.fonts);
    const regions = regionSummary(report);
    const motion = summarizeMotion(report);

    return {
      creativeBrief: [
        "【创意提炼】",
        `核心主题：${brief.subject}`,
        `信息气质：${brief.textTone}`,
        `视觉方向：${brief.layoutMood}；${brief.visualMood}；${brief.density}`,
        `配色与字体：${colors}；字体接近 ${fonts}`,
        `内容结构：标题 ${headings}；导航 ${nav}；行动入口 ${buttons}`,
        `动效基调：${brief.motionMood}`
      ].join("\n"),
      staticVisual: [
        "【高级静态视觉提示词】",
        `为「${brief.subject}」创作一张高端网站首屏视觉稿，${brief.aspect}。画面要像真实可上线的品牌官网，而不是通用模板。`,
        `构图要求：${brief.layoutMood}；首屏层级清晰，间距精确，导航对齐，行动入口突出；页面区域包含 ${regions}。`,
        `视觉语言：${brief.visualMood}；配色参考 ${colors}；字体接近 ${fonts}；${brief.imageDirection}。`,
        `内容保留：标题「${headings}」，导航「${nav}」，行动按钮「${buttons}」。文案块要可信、对齐清楚，不要编造与原站无关的品牌主张。`,
        "渲染风格：清晰现代的网站界面，高级产品展示感，对比干净，组件边缘细节明确；仅在原站风格支持时使用精致阴影；文字可读性高，间距达到上线级水准，避免模板感。"
      ].join("\n"),
      motionVideo: [
        "【高级动效/视频提示词】",
        `生成 6-10 秒网页动效视频，主题为「${brief.subject}」，保持真实浏览器中的网站首屏质感。`,
        `开场方式：从稳定完整的首屏构图开始，按导航、标题、辅助内容、媒体/产品面板、行动按钮的顺序逐层揭示。`,
        `动效方向：${motion}。使用缓动曲线和分层节奏；只有在符合原网页气质时加入轻微视差或遮罩揭示；避免混乱镜头运动。`,
        "镜头与节奏：正面稳定展示网页，可使用缓慢推进或轻微纵向滚动；保持 24fps 电影感顺滑度，界面文字必须可读，重要 UI 不要被运动模糊覆盖。",
        `风格连续性：保留 ${colors}、${fonts}、间距节奏、组件边界和原网页的信息层级。`
      ].join("\n"),
      uiRebuild: [
        "【前端/UI 复刻提示词】",
        `构建一个响应式、可上线质感的网页，主题为「${brief.subject}」。复刻原页面的可见层级、布局密度和交互手感。`,
        `信息架构：标题 ${headings}；导航 ${nav}；主要行动入口 ${buttons}；页面区域 ${regions}。`,
        `设计系统：配色 ${colors}；字体 ${fonts}；使用一致的间距尺度、可访问的对比度、清晰的 hover/focus 状态；不要添加无助于界面的装饰元素。`,
        `动效实现：${motion}。使用 CSS transition/keyframes 和克制缓动，保证可读性，并让动画服务于真实 UI 状态。`,
        "输出应像完整可用页面，而不是营销 mockup：导航可用、分区真实、响应式稳定，桌面端和移动端都要打磨。"
      ].join("\n"),
      englishMaster: [
        "【英文备用提示词（可选）】",
        `A premium, production-ready website hero for "${brief.subject}", ${brief.aspect}, ${brief.layoutMood}, ${brief.visualMood}.`,
        `Use a refined palette based on ${colors}, typography similar to ${fonts}, clear navigation (${nav}), strong headline hierarchy (${headings}), and believable CTA buttons (${buttons}).`,
        `Preserve the original site's content density, spacing rhythm, component boundaries, and visual hierarchy. ${brief.imageDirection}.`,
        `Motion style if animated: ${brief.motionMood}; ${motion}. Smooth easing, layered reveals, readable UI text, stable camera, polished micro-interactions.`,
        "High fidelity web design, crisp interface details, premium brand system, realistic browser screenshot quality, clean alignment, accessible contrast, no generic template aesthetics."
      ].join("\n"),
      assetRequest: buildAssetRequest(report, brief),
      skillWorkflow: buildSkillWorkflow(report, brief),
      negativePrompt: [
        "【负面提示词】",
        "避免：低清晰度、通用 SaaS 模板感、随机装饰块、无意义渐变、过度玻璃拟态、不可读或乱码文字、虚假控件、布局错位、间距不一致、无关图库图片、品牌层级缺失、画面拥挤、动效过度、镜头抖动、严重运动模糊、字体变形、响应式布局破碎、内容与原网页冲突。"
      ].join("\n")
    };
  };

  const analyzePage = async () => {
    const samples = [];
    for (let i = 0; i < 4; i += 1) {
      samples.push(collectSnapshot());
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    const first = samples[0];
    const report = {
      page: {
        title: first.title,
        url: first.url,
        capturedAt: first.capturedAt,
        viewport: first.viewport
      },
      content: first.content,
      visual: first.visual,
      motion: {
        ...first.motion,
        sampledChanges: diffSnapshots(samples)
      }
    };
    report.prompts = buildPrompts(report);
    return report;
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "WMP_ANALYZE") return false;
    analyzePage()
      .then((report) => sendResponse({ ok: true, report }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();
