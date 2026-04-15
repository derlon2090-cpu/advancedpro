(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";
  const AUTH_TOKEN_KEY = "advancedpro_token";

  function getStoredToken() {
    try {
      const local = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (local) {
        return local;
      }
    } catch (error) {
      // ignore
    }

    try {
      const session = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (session) {
        return session;
      }
    } catch (error) {
      // ignore
    }

    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|; )${AUTH_TOKEN_KEY}=([^;]*)`)
    );
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  }

  async function requestJson(path) {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      const message = payload.message || payload.error || "تعذر تحميل الأكواد.";
      throw new Error(
        payload.requestId ? `${message} (رقم الطلب: ${payload.requestId})` : message
      );
    }

    return payload;
  }

  function setMessage(target, message, type = "info") {
    if (!target) {
      return;
    }

    if (!message) {
      target.hidden = true;
      target.textContent = "";
      target.className = "status-message";
      return;
    }

    target.hidden = false;
    target.textContent = message;
    target.className = `status-message is-${type}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDate(value) {
    if (!value) {
      return "غير متوفر";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "غير متوفر";
    }
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }

  function getStatusMeta(code) {
    if (!code.isActive) {
      return { key: "disabled", label: "معطل", className: "status-pill--suspended" };
    }
    if (code.isUsed) {
      return { key: "used", label: "مستخدم", className: "status-pill--pending" };
    }
    return { key: "available", label: "متاح", className: "status-pill--active" };
  }

  function filterCodes(codes, search = "", status = "available") {
    const normalizedSearch = String(search || "").trim().toLowerCase();

    return codes.filter((code) => {
      const statusKey = getStatusMeta(code).key;
      const matchesStatus = status === "all" ? true : statusKey === status;
      const matchesSearch = normalizedSearch
        ? String(code.code || "").toLowerCase().includes(normalizedSearch)
        : true;
      return matchesStatus && matchesSearch;
    });
  }

  function renderCodesTable(target, codes) {
    if (!target) {
      return;
    }

    if (!codes.length) {
      target.innerHTML = '<div class="empty-state">لا توجد أكواد مطابقة حاليًا.</div>';
      return;
    }

    target.innerHTML = `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الرصيد</th>
              <th>الحالة</th>
              <th>الاستخدام</th>
              <th>تاريخ الإنشاء</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            ${codes
              .map((code) => {
                const status = getStatusMeta(code);
                return `
                  <tr>
                    <td><strong>${escapeHtml(code.code)}</strong></td>
                    <td>${escapeHtml(code.balance)}</td>
                    <td><span class="status-pill ${status.className}">${status.label}</span></td>
                    <td>${code.isUsed ? "تم استخدامه" : "جاهز"}</td>
                    <td>${escapeHtml(formatDate(code.createdAt))}</td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-secondary btn-inline"
                        data-direct-code-copy="${escapeHtml(code.code)}"
                      >
                        نسخ
                      </button>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function attachAvailableCodesPage() {
    if (document.body?.dataset.page !== "admin-available-codes") {
      return;
    }

    const searchForm = document.querySelector("#adminAvailableCodesSearch");
    const target = document.querySelector("[data-admin-available-codes]");
    const message = document.querySelector("[data-admin-available-codes-message]");

    if (!target || target.dataset.directHandlerBound === "true") {
      return;
    }

    target.dataset.directHandlerBound = "true";
    let allCodes = [];

    const loadCodes = async () => {
      const payload = await requestJson("/api/admin/codes/list");
      allCodes = Array.isArray(payload.codes) ? payload.codes : [];
      const search = searchForm?.elements.namedItem("search")?.value || "";
      const status = searchForm?.elements.namedItem("status")?.value || "available";
      renderCodesTable(target, filterCodes(allCodes, search, status));
    };

    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const search = searchForm.elements.namedItem("search")?.value || "";
      const status = searchForm.elements.namedItem("status")?.value || "available";
      renderCodesTable(target, filterCodes(allCodes, search, status));
    });

    target.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("[data-direct-code-copy]");
      if (!copyButton) {
        return;
      }
      const codeValue = copyButton.dataset.directCodeCopy;
      if (!codeValue) {
        return;
      }

      try {
        await navigator.clipboard.writeText(codeValue);
        setMessage(message, "تم نسخ الكود.", "success");
      } catch (error) {
        setMessage(message, "تعذر نسخ الكود.", "error");
      }
    });

    loadCodes().catch((error) => {
      setMessage(message, error.message, "error");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachAvailableCodesPage);
  } else {
    attachAvailableCodesPage();
  }
})();
