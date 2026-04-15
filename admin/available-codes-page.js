(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";
  const AUTH_TOKEN_KEY = "advancedpro_token";

  function getStoredToken() {
    try {
      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) return token;
    } catch (error) {
      // ignore
    }

    try {
      const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (token) return token;
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
    if (!target) return;

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
    if (!value) return "غير محدد";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }

  function statusMeta(code) {
    if (code.statusKey === "inactive") {
      return { label: "غير مفعل", className: "status-pill--suspended" };
    }
    if (code.statusKey === "expired") {
      return { label: "منتهي", className: "status-pill--pending" };
    }
    if (code.statusKey === "in-use") {
      return { label: "قيد الاستخدام", className: "status-pill--active" };
    }
    if (code.statusKey === "used") {
      return { label: "تم الاستخدام", className: "status-pill--pending" };
    }
    return { label: "متاح", className: "status-pill--active" };
  }

  function renderTable(target, codes) {
    if (!target) return;

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
              <th>البريد المرتبط</th>
              <th>الرصيد الحالي</th>
              <th>التجديد</th>
              <th>الحالة</th>
              <th>الإنشاء / الانتهاء</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            ${codes
              .map((code) => {
                const status = statusMeta(code);
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(code.code)}</strong>
                      <small>${escapeHtml(code.ownerName || "بدون اسم")}</small>
                    </td>
                    <td>
                      <strong>${escapeHtml(code.email || "عام")}</strong>
                      <small>${escapeHtml(code.accessTypeLabel || "عام")}</small>
                    </td>
                    <td>
                      <strong>${code.imageAvailable ?? 0} صورة / ${code.videoAvailable ?? 0} فيديو</strong>
                      <small>المستخدم: ${code.imageUsed ?? 0} / ${code.videoUsed ?? 0}</small>
                    </td>
                    <td>
                      <strong>${code.isRenewable ? "نعم" : "لا"}</strong>
                      <small>${escapeHtml(code.renewalLabel || "غير متجدد")}</small>
                    </td>
                    <td>
                      <span class="status-pill ${status.className}">${status.label}</span>
                      <small>${code.isUsed ? "تم ربطه بمستخدم" : "جاهز للتفعيل"}</small>
                    </td>
                    <td>
                      <strong>${escapeHtml(formatDate(code.createdAt))}</strong>
                      <small>${escapeHtml(formatDate(code.expiresAt))}</small>
                    </td>
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
    if (document.body?.dataset.page !== "admin-available-codes") return;

    const searchForm = document.querySelector("#adminAvailableCodesSearch");
    const target = document.querySelector("[data-admin-available-codes]");
    const message = document.querySelector("[data-admin-available-codes-message]");

    if (!target || target.dataset.bound === "true") return;
    target.dataset.bound = "true";

    let allCodes = [];

    const loadCodes = async () => {
      const search = searchForm?.elements.namedItem("search")?.value || "";
      const status = searchForm?.elements.namedItem("status")?.value || "all";
      const payload = await requestJson(
        `/api/admin/codes/list?search=${encodeURIComponent(search)}`
      );
      allCodes = Array.isArray(payload.codes) ? payload.codes : [];
      const filtered =
        status === "all"
          ? allCodes
          : allCodes.filter((item) => (item.statusKey || "available") === status);
      renderTable(target, filtered);
    };

    searchForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadCodes();
      } catch (error) {
        setMessage(message, error.message, "error");
      }
    });

    target.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("[data-direct-code-copy]");
      if (!copyButton) return;

      const codeValue = copyButton.dataset.directCodeCopy;
      if (!codeValue) return;

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
