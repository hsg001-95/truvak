const TRUVAK_API = "http://127.0.0.1:8000";

const SECTION_ORDER = [
  "product-header",
  "review-shield",
  "seller-trust",
  "price-intel",
  "delivery-intel",
  "dark-patterns",
  "actions",
];

const SECTION_TITLES = {
  "product-header": "Product Trust",
  "review-shield": "Review Shield",
  "seller-trust": "Seller Trust",
  "price-intel": "Price Intelligence",
  "delivery-intel": "Delivery and Logistics",
  "dark-patterns": "Dark Patterns Detected",
  actions: "Actions",
};

const state = {
  authToken: "",
  sidebar: null,
  collapseButton: null,
  contentArea: null,
  isOpen: true,
  pageContext: null,
};

function ensureStyles() {
  if (document.getElementById("truvak-customer-sidebar-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "truvak-customer-sidebar-styles";
  style.textContent = `
    #truvak-customer-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 300px;
      height: 100vh;
      background: #0D1117;
      border-left: 1px solid #30363D;
      color: #E6EDF3;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: -12px 0 28px rgba(0, 0, 0, 0.45);
      transform: translateX(300px);
      transition: transform 180ms ease;
    }

    #truvak-customer-sidebar * {
      box-sizing: border-box;
    }

    .truvak-sidebar-header {
      height: 48px;
      background: #161B22;
      border-bottom: 1px solid #30363D;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
    }

    .truvak-sidebar-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.01em;
      color: #2F81F7;
    }

    .truvak-sidebar-collapse {
      border: 0;
      background: transparent;
      color: #8B949E;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      font-size: 16px;
      line-height: 1;
    }

    .truvak-sidebar-collapse:hover {
      background: #1F2630;
      color: #E6EDF3;
    }

    .truvak-sidebar-main {
      flex: 1;
      overflow-y: auto;
      background: #0D1117;
    }

    .truvak-section {
      border-bottom: 1px solid #30363D;
      padding: 12px;
    }

    .truvak-section-title {
      margin: 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8B949E;
      font-weight: 700;
    }

    .truvak-section-body {
      margin-top: 8px;
      font-size: 12px;
      line-height: 1.45;
      color: #E6EDF3;
    }

    .truvak-footer {
      height: 32px;
      background: #161B22;
      border-top: 1px solid #30363D;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      color: #8B949E;
      font-size: 9px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .truvak-skeleton {
      height: 14px;
      border-radius: 4px;
      background: linear-gradient(90deg, #1F2630 20%, #2D3642 40%, #1F2630 60%);
      background-size: 240% 100%;
      animation: truvak-shimmer 1.2s ease infinite;
    }

    .truvak-error {
      color: #F85149;
      font-size: 12px;
    }

    .truvak-actions-btn {
      width: 100%;
      border: 1px solid #2F81F7;
      border-radius: 8px;
      background: transparent;
      color: #2F81F7;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 10px;
      cursor: pointer;
    }

    .truvak-actions-btn:hover {
      background: #2F81F7;
      color: #E6EDF3;
    }

    @keyframes truvak-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: 0 0; }
    }
  `;

  document.head.appendChild(style);
}

function sanitizeHtml(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}

async function getAuthToken() {
  try {
    if (typeof chrome === "undefined" || !chrome.storage) {
      state.authToken = "";
      return "";
    }

    const area = chrome.storage.sync || chrome.storage.local;
    const stored = await area.get("truvak_customer_token");
    state.authToken = stored.truvak_customer_token || "";
    return state.authToken;
  } catch (_error) {
    state.authToken = "";
    return "";
  }
}

function createSection(sectionId) {
  const section = document.createElement("section");
  section.className = "truvak-section";
  section.id = `truvak-section-${sectionId}`;

  const title = document.createElement("h3");
  title.className = "truvak-section-title";
  title.textContent = SECTION_TITLES[sectionId] || sectionId;

  const body = document.createElement("div");
  body.className = "truvak-section-body";
  body.id = `truvak-section-body-${sectionId}`;
  body.textContent = "Waiting for data...";

  section.appendChild(title);
  section.appendChild(body);

  return section;
}

function createSidebar() {
  ensureStyles();

  const existing = document.getElementById("truvak-customer-sidebar");
  if (existing) {
    state.sidebar = existing;
    state.contentArea = existing.querySelector(".truvak-sidebar-main");
    state.collapseButton = existing.querySelector(".truvak-sidebar-collapse");
    return existing;
  }

  const sidebar = document.createElement("aside");
  sidebar.id = "truvak-customer-sidebar";

  const header = document.createElement("header");
  header.className = "truvak-sidebar-header";

  const title = document.createElement("div");
  title.className = "truvak-sidebar-title";
  title.textContent = "Truvak";

  const collapseButton = document.createElement("button");
  collapseButton.className = "truvak-sidebar-collapse";
  collapseButton.type = "button";
  collapseButton.setAttribute("aria-label", "Collapse Truvak sidebar");
  collapseButton.textContent = "<";

  header.appendChild(title);
  header.appendChild(collapseButton);

  const main = document.createElement("main");
  main.className = "truvak-sidebar-main";

  SECTION_ORDER.forEach((sectionId) => {
    main.appendChild(createSection(sectionId));
  });

  const footer = document.createElement("footer");
  footer.className = "truvak-footer";
  footer.innerHTML = "<span>Truvak by Snoxx Tech</span><span>2024</span>";

  sidebar.appendChild(header);
  sidebar.appendChild(main);
  sidebar.appendChild(footer);

  document.body.appendChild(sidebar);

  state.sidebar = sidebar;
  state.contentArea = main;
  state.collapseButton = collapseButton;

  return sidebar;
}

function updateSidebarVisibility() {
  if (!state.sidebar) {
    return;
  }

  state.sidebar.style.transform = state.isOpen ? "translateX(0)" : "translateX(260px)";
  if (state.collapseButton) {
    state.collapseButton.textContent = state.isOpen ? "<" : ">";
  }
}

async function fetchSectionData(sectionId) {
  try {
    const query = new URLSearchParams({
      section: sectionId,
      url: window.location.href,
      platform: state.pageContext?.platform || "",
      submode: state.pageContext?.submode || "",
    });

    const response = await fetch(`${TRUVAK_API}/v1/customer/sidebar?${query.toString()}`, {
      headers: {
        "Content-Type": "application/json",
        ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  } catch (_error) {
    return null;
  }
}

function renderSection(sectionId, htmlContent = "") {
  const body = document.getElementById(`truvak-section-body-${sectionId}`);
  if (!body) {
    return;
  }
  body.innerHTML = sanitizeHtml(htmlContent);
}

function showSectionLoading(sectionId) {
  renderSection(sectionId, "<div class=\"truvak-skeleton\"></div>");
}

function showSectionError(sectionId, message) {
  const safe = String(message || "Failed to load").replace(/[<>]/g, "");
  renderSection(sectionId, `<div class=\"truvak-error\">${safe}</div>`);
}

function ensureActionControls() {
  const actionsBody = document.getElementById("truvak-section-body-actions");
  if (!actionsBody) {
    return;
  }

  if (actionsBody.querySelector("#truvak-open-dashboard-btn")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "truvak-open-dashboard-btn";
  button.type = "button";
  button.className = "truvak-actions-btn";
  button.textContent = "Open Dashboard";
  button.addEventListener("click", () => {
    window.open("http://localhost:5173", "_blank", "noopener,noreferrer");
  });

  actionsBody.appendChild(button);
}

async function renderAllSections() {
  SECTION_ORDER.forEach((sectionId) => {
    showSectionLoading(sectionId);
  });

  await Promise.all(
    SECTION_ORDER.map(async (sectionId) => {
      const data = await fetchSectionData(sectionId);
      if (!data) {
        showSectionError(sectionId, "Failed to load section");
        return;
      }

      if (typeof data.content === "string") {
        renderSection(sectionId, data.content);
        return;
      }

      if (data.content != null) {
        renderSection(sectionId, String(data.content));
        return;
      }

      showSectionError(sectionId, "No section content available");
    })
  );

  ensureActionControls();
}

async function init(pageContext = {}) {
  state.pageContext = pageContext;
  state.isOpen = true;

  await getAuthToken();
  createSidebar();
  updateSidebarVisibility();

  if (state.collapseButton) {
    state.collapseButton.onclick = () => {
      state.isOpen = !state.isOpen;
      updateSidebarVisibility();
    };
  }

  await renderAllSections();
}

function destroy() {
  const sidebar = document.getElementById("truvak-customer-sidebar");
  if (sidebar) {
    sidebar.remove();
  }

  const styles = document.getElementById("truvak-customer-sidebar-styles");
  if (styles) {
    styles.remove();
  }

  state.authToken = "";
  state.sidebar = null;
  state.collapseButton = null;
  state.contentArea = null;
  state.isOpen = true;
  state.pageContext = null;
}

window.TruvakSidebar = {
  init,
  destroy,
  renderSection,
  showSectionLoading,
  showSectionError,
};
