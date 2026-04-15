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
      // ignore storage failures
    }

    try {
      const session = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (session) {
        return session;
      }
    } catch (error) {
      // ignore storage failures
    }

    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|; )${AUTH_TOKEN_KEY}=([^;]*)`)
    );
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  }

  async function requestJson(path, options = {}) {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      const message = payload.message || payload.error || "تعذر إتمام الطلب.";
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

  function setButtonBusy(button, busy, label = "جارٍ الحفظ...") {
    if (!button) {
      return;
    }

    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent.trim();
    }

    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.originalLabel;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getStatusMeta(code) {
    if (!code) {
      return { key: "unknown", label: "غير معروف", className: "status-pill--pending" };
    }
    if (!code.isActive) {
      return { key: "disabled", label: "معطل", className: "status-pill--suspended" };
    }
    if (code.isUsed) {
      return { key: "used", label: "مستخدم", className: "status-pill--pending" };
    }
    return { key: "available", label: "متاح", className: "status-pill--active" };
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

  function renderCodesTable(target, codes) {
    if (!target) {
      return;
    }

    if (!codes.length) {
      target.innerHTML = '<div class="empty-state">لا توجد أكواد محفوظة حتى الآن.</div>';
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

  function formToValues(form) {
    const formData = new FormData(form);
    return {
      code: String(formData.get("code") || "").trim(),
      balance: Number(formData.get("balance") || 0),
      isActive: form.querySelector('[name="isActive"]')?.checked ?? true,
    };
  }

  function filterCodes(codes, search = "", status = "all") {
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

  function attachAdminCodesPage() {
    if (document.body?.dataset.page !== "admin-codes") {
      return;
    }

    const form = document.querySelector("#adminCodeForm");
    const searchForm = document.querySelector("#adminCodesSearch");
    const target = document.querySelector("[data-admin-codes]");
    const message = document.querySelector("[data-admin-codes-message]");

    if (!form || !target || form.dataset.directHandlerBound === "true") {
      return;
    }

    form.dataset.directHandlerBound = "true";
    let allCodes = [];

    const loadCodes = async () => {
      const payload = await requestJson("/api/admin/codes/list", { method: "GET" });
      allCodes = Array.isArray(payload.codes) ? payload.codes : [];

      const search = searchForm?.elements.namedItem("search")?.value || "";
      const status = searchForm?.elements.namedItem("status")?.value || "all";
      renderCodesTable(target, filterCodes(allCodes, search, status));
    };

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const submitButton = form.querySelector('button[type="submit"]');
        const values = formToValues(form);

        if (!values.code) {
          setMessage(message, "الرجاء إدخال الكود.", "error");
          return;
        }

        if (Number.isNaN(values.balance) || values.balance < 0) {
          setMessage(message, "رصيد الكود غير صالح.", "error");
          return;
        }

        try {
          setButtonBusy(submitButton, true, "جارٍ الحفظ...");
          const payload = await requestJson("/api/admin/codes/create", {
            method: "POST",
            body: JSON.stringify(values),
          });

          setMessage(message, payload.message || "تم حفظ الكود بنجاح.", "success");
          form.reset();
          const checkbox = form.querySelector('[name="isActive"]');
          if (checkbox) {
            checkbox.checked = true;
          }
          await loadCodes();
        } catch (error) {
          setMessage(message, error.message, "error");
        } finally {
          setButtonBusy(submitButton, false);
        }
      },
      true
    );

    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const search = searchForm.elements.namedItem("search")?.value || "";
      const status = searchForm.elements.namedItem("status")?.value || "all";
      renderCodesTable(target, filterCodes(allCodes, search, status));
    });

    document.querySelector("[data-code-reset]")?.addEventListener("click", () => {
      form.reset();
      const checkbox = form.querySelector('[name="isActive"]');
      if (checkbox) {
        checkbox.checked = true;
      }
      setMessage(message, "", "info");
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
      setMessage(
        message,
        error.message || "تعذر تحميل قائمة الأكواد، لكن يمكنك محاولة حفظ كود جديد.",
        "error"
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachAdminCodesPage);
  } else {
    attachAdminCodesPage();
  }
})();
