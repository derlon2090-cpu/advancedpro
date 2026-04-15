(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";
  const AUTH_TOKEN_KEY = "advancedpro_token";

  function getStoredToken() {
    try {
      const local = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (local) return local;
    } catch (error) {
      // ignore
    }

    try {
      const session = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (session) return session;
    } catch (error) {
      // ignore
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
      const message = payload.message || payload.error || "تعذر تنفيذ الطلب.";
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

  function setButtonBusy(button, busy, label = "جارٍ الحفظ...") {
    if (!button) return;
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

  function formatDate(value) {
    if (!value) return "غير محدد";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }

  function formatDateTimeInput(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const offset = parsed.getTimezoneOffset();
    const local = new Date(parsed.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function statusMeta(code) {
    const key = code.statusKey || "available";
    if (key === "inactive") {
      return { label: "غير مفعل", className: "status-pill--suspended" };
    }
    if (key === "expired") {
      return { label: "منتهي", className: "status-pill--pending" };
    }
    if (key === "in-use") {
      return { label: "قيد الاستخدام", className: "status-pill--active" };
    }
    if (key === "used") {
      return { label: "تم الاستخدام", className: "status-pill--pending" };
    }
    return { label: "متاح", className: "status-pill--active" };
  }

  function fillForm(form, record) {
    form.elements.namedItem("id").value = record?.id || "";
    form.elements.namedItem("code").value = record?.code || "";
    form.elements.namedItem("ownerName").value = record?.ownerName || "";
    form.elements.namedItem("imageLimit").value = record?.imageLimit ?? 0;
    form.elements.namedItem("videoLimit").value = record?.videoLimit ?? 0;
    form.elements.namedItem("accessType").value = record?.accessType || "public";
    form.elements.namedItem("email").value = record?.email || "";
    form.elements.namedItem("isRenewable").value = record?.isRenewable ? "true" : "false";
    form.elements.namedItem("renewalType").value = record?.renewalType || "";
    form.elements.namedItem("expiresAt").value = formatDateTimeInput(record?.expiresAt);
    form.elements.namedItem("isActive").value = record?.isActive === false ? "false" : "true";
    form.elements.namedItem("notes").value = record?.notes || "";
    syncFormState(form);
  }

  function syncFormState(form) {
    const accessType = form.elements.namedItem("accessType").value;
    const emailField = form.elements.namedItem("email");
    emailField.disabled = accessType === "public";
    if (accessType === "public") {
      emailField.value = "";
    }

    const isRenewable = form.elements.namedItem("isRenewable").value === "true";
    const renewalTypeField = form.elements.namedItem("renewalType");
    renewalTypeField.disabled = !isRenewable;
    if (!isRenewable) {
      renewalTypeField.value = "";
    }
  }

  function formToPayload(form) {
    const id = Number(form.elements.namedItem("id").value || 0);
    return {
      id: id || null,
      code: String(form.elements.namedItem("code").value || "").trim(),
      ownerName: String(form.elements.namedItem("ownerName").value || "").trim(),
      imageLimit: Number(form.elements.namedItem("imageLimit").value || 0),
      videoLimit: Number(form.elements.namedItem("videoLimit").value || 0),
      accessType: form.elements.namedItem("accessType").value || "public",
      email: String(form.elements.namedItem("email").value || "").trim(),
      isRenewable: form.elements.namedItem("isRenewable").value === "true",
      renewalType: form.elements.namedItem("renewalType").value || "",
      expiresAt: form.elements.namedItem("expiresAt").value || null,
      isActive: form.elements.namedItem("isActive").value !== "false",
      notes: String(form.elements.namedItem("notes").value || "").trim(),
    };
  }

  function renderTable(target, records) {
    if (!target) return;
    if (!records.length) {
      target.innerHTML = '<div class="empty-state">لا توجد أكواد مطابقة حاليًا.</div>';
      return;
    }

    target.innerHTML = `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الربط</th>
              <th>الرصيد</th>
              <th>التجديد</th>
              <th>الحالة</th>
              <th>الإنشاء / الانتهاء</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            ${records
              .map((record) => {
                const status = statusMeta(record);
                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(record.code)}</strong>
                      <small>${escapeHtml(record.ownerName || "بدون اسم")}</small>
                    </td>
                    <td>
                      <strong>${escapeHtml(record.accessTypeLabel || "عام")}</strong>
                      <small>${escapeHtml(record.email || "غير مرتبط ببريد")}</small>
                    </td>
                    <td>
                      <strong>${record.imageAvailable ?? 0} صورة / ${record.videoAvailable ?? 0} فيديو</strong>
                      <small>المستخدم: ${record.imageUsed ?? 0} / ${record.videoUsed ?? 0}</small>
                    </td>
                    <td>
                      <strong>${record.isRenewable ? "نعم" : "لا"}</strong>
                      <small>${escapeHtml(record.renewalLabel || "غير متجدد")}</small>
                    </td>
                    <td>
                      <span class="status-pill ${status.className}">${status.label}</span>
                      <small>${record.isUsed ? "تم ربطه بمستخدم" : "لم يستخدم بعد"}</small>
                    </td>
                    <td>
                      <strong>${escapeHtml(formatDate(record.createdAt))}</strong>
                      <small>${escapeHtml(formatDate(record.expiresAt))}</small>
                    </td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-ghost btn-sm" type="button" data-code-copy="${record.id}">نسخ</button>
                        <button class="btn btn-secondary btn-sm" type="button" data-code-edit="${record.id}">تعديل</button>
                        <button class="btn btn-outline btn-sm" type="button" data-code-toggle="${record.id}">
                          ${record.isActive ? "تعطيل" : "تفعيل"}
                        </button>
                        <button class="btn btn-danger btn-sm" type="button" data-code-delete="${record.id}">حذف</button>
                      </div>
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

  function attachPage() {
    if (document.body?.dataset.page !== "admin-codes") return;

    const form = document.querySelector("#adminCodeForm");
    const searchForm = document.querySelector("#adminCodesSearch");
    const target = document.querySelector("[data-admin-codes]");
    const message = document.querySelector("[data-admin-codes-message]");

    if (!form || !target || form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    let records = [];

    const loadCodes = async () => {
      const search = searchForm?.elements.namedItem("search")?.value || "";
      const status = searchForm?.elements.namedItem("status")?.value || "all";
      const payload = await requestJson(
        `/api/admin/codes/list?search=${encodeURIComponent(search)}`,
        { method: "GET" }
      );
      records = Array.isArray(payload.codes) ? payload.codes : [];
      const filtered =
        status === "all"
          ? records
          : records.filter((record) => (record.statusKey || "available") === status);
      renderTable(target, filtered);
    };

    form.addEventListener("change", () => syncFormState(form));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const submitButton = form.querySelector('button[type="submit"]');
      const payload = formToPayload(form);
      const isEditing = Boolean(payload.id);

      try {
        setButtonBusy(submitButton, true, isEditing ? "جارٍ التحديث..." : "جارٍ الحفظ...");
        const response = await requestJson(
          isEditing ? `/api/admin/codes/${payload.id}` : "/api/admin/codes/create",
          {
            method: isEditing ? "PUT" : "POST",
            body: JSON.stringify(payload),
          }
        );

        setMessage(message, response.message || "تم حفظ الكود بنجاح.", "success");
        fillForm(form, null);
        if (searchForm) {
          searchForm.reset();
        }
        await loadCodes();
      } catch (error) {
        setMessage(message, error.message, "error");
      } finally {
        setButtonBusy(submitButton, false);
      }
    });

    searchForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadCodes();
      } catch (error) {
        setMessage(message, error.message, "error");
      }
    });

    document.querySelector("[data-code-reset]")?.addEventListener("click", () => {
      fillForm(form, null);
      setMessage(message, "");
    });

    target.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("[data-code-copy]");
      if (copyButton) {
        const record = records.find((item) => item.id === Number(copyButton.dataset.codeCopy));
        if (record?.code) {
          await navigator.clipboard.writeText(record.code);
          setMessage(message, "تم نسخ الكود.", "success");
        }
        return;
      }

      const editButton = event.target.closest("[data-code-edit]");
      if (editButton) {
        const record = records.find((item) => item.id === Number(editButton.dataset.codeEdit));
        if (record) {
          fillForm(form, record);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }

      const toggleButton = event.target.closest("[data-code-toggle]");
      if (toggleButton) {
        const record = records.find((item) => item.id === Number(toggleButton.dataset.codeToggle));
        if (!record) return;

        try {
          setButtonBusy(toggleButton, true, "جارٍ...");
          const payload = {
            ...record,
            accessType: record.accessType || (record.email ? "private" : "public"),
            isActive: !record.isActive,
          };
          await requestJson(`/api/admin/codes/${record.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          setMessage(message, "تم تحديث حالة الكود.", "success");
          await loadCodes();
        } catch (error) {
          setMessage(message, error.message, "error");
        } finally {
          setButtonBusy(toggleButton, false);
        }
        return;
      }

      const deleteButton = event.target.closest("[data-code-delete]");
      if (deleteButton) {
        const record = records.find((item) => item.id === Number(deleteButton.dataset.codeDelete));
        if (!record) return;
        if (!window.confirm(`هل تريد حذف الكود ${record.code} نهائيًا؟`)) {
          return;
        }

        try {
          setButtonBusy(deleteButton, true, "جارٍ...");
          await requestJson(`/api/admin/codes/${record.id}`, {
            method: "DELETE",
          });
          setMessage(message, "تم حذف الكود.", "success");
          await loadCodes();
        } catch (error) {
          setMessage(message, error.message, "error");
        } finally {
          setButtonBusy(deleteButton, false);
        }
      }
    });

    fillForm(form, null);
    loadCodes().catch((error) => {
      setMessage(message, error.message, "error");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachPage);
  } else {
    attachPage();
  }
})();
