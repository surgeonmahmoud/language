/* =====================================================================
   DrZiad — طبقة التخزين المحلي (Local-First Storage)
   كل المفاتيح تبدأ بـ drziad_ . كل العمليات محاطة بـ try/catch حتى تعمل
   الواجهة بأمان في وضع التصفح الخاص أو عند حجب التخزين.
   لا تُرسل أي بيانات لأي جهة إطلاقاً.
   ===================================================================== */
(function () {
  "use strict";
  const PREFIX = "drziad_";
  const VERSION = 1;

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(PREFIX + key); return true; } catch (e) { return false; }
  }
  function available() {
    try { const t = PREFIX + "__t"; localStorage.setItem(t, "1"); localStorage.removeItem(t); return true; }
    catch (e) { return false; }
  }

  /* قائمة المفاتيح المعروفة (للتصدير/الاستيراد/المسح) */
  const KEYS = {
    theme:        "theme",
    fontScale:    "font_scale",
    lastRoute:    "last_route",
    navState:     "nav_state",
    readSections: "read_sections",
    sectionVisits:"section_visits",
    checklist:    "checklist",
    checklistMeta:"checklist_meta",
    cases:        "cases_progress",
    quizState:    "quiz_state",
    quizAttempts: "quiz_attempts",
    studentForm:  "student_form",
    bookmarks:    "bookmarks",
    notes:        "notes",
    filters:      "filters",
    mistakes:     "mistakes_state",
    settings:     "settings",
    activity:     "activity_log",
    doctor:       "doctor_profile",
    adminUnlocked:"admin_unlocked",
    sectionVis:   "section_visibility"
  };

  /* سجل النشاط المحلي (غير حساس) */
  function logActivity(type, label) {
    try {
      const log = safeGet(KEYS.activity, []);
      log.unshift({ type, label, at: new Date().toISOString() });
      safeSet(KEYS.activity, log.slice(0, 80));
    } catch (e) {}
  }

  /* تتبع فتح الأقسام */
  function markVisit(sectionId) {
    const visits = safeGet(KEYS.sectionVisits, {});
    visits[sectionId] = { last: new Date().toISOString(), count: (visits[sectionId]?.count || 0) + 1 };
    safeSet(KEYS.sectionVisits, visits);
  }
  function markRead(sectionId, value) {
    const read = safeGet(KEYS.readSections, {});
    if (value === false) delete read[sectionId]; else read[sectionId] = new Date().toISOString();
    safeSet(KEYS.readSections, read);
    logActivity("read", sectionId);
  }
  function isRead(sectionId) { return !!safeGet(KEYS.readSections, {})[sectionId]; }

  /* ---------------- التصدير / الاستيراد ---------------- */
  function exportAll() {
    const payload = { app: "DrZiad", schema: VERSION, exportedAt: new Date().toISOString(), data: {} };
    Object.values(KEYS).forEach(k => {
      const v = safeGet(k, null);
      if (v !== null) payload.data[k] = v;
    });
    return payload;
  }

  function validateBackup(obj) {
    const errors = [];
    if (!obj || typeof obj !== "object") { errors.push("الملف غير صالح أو ليس بصيغة JSON."); return { ok:false, errors }; }
    if (obj.app !== "DrZiad") errors.push("الملف لا يخص مشروع DrZiad.");
    if (typeof obj.schema !== "number") errors.push("إصدار الملف (schema) مفقود.");
    if (!obj.data || typeof obj.data !== "object") errors.push("حقل البيانات (data) مفقود أو تالف.");
    if (obj.data) {
      const known = Object.values(KEYS);
      Object.keys(obj.data).forEach(k => { if (!known.includes(k)) errors.push("مفتاح غير معروف سيُتجاهل: " + k); });
    }
    const fatal = errors.filter(e => !e.startsWith("مفتاح غير معروف"));
    return { ok: fatal.length === 0, errors, fatalCount: fatal.length };
  }

  function summarizeBackup(obj) {
    if (!obj || !obj.data) return [];
    const map = {
      checklist:"قائمة التحقق", cases_progress:"الحالات التدريبية", quiz_attempts:"محاولات الاختبار",
      student_form:"نموذج الطالب", bookmarks:"المحفوظات", notes:"الملاحظات", doctor_profile:"ملف الدكتور",
      read_sections:"الأقسام المقروءة", mistakes_state:"حالة الأخطاء", settings:"الإعدادات"
    };
    return Object.keys(obj.data).map(k => {
      const v = obj.data[k];
      let n = "";
      if (Array.isArray(v)) n = v.length + " عنصر";
      else if (v && typeof v === "object") n = Object.keys(v).length + " حقل";
      return { key: map[k] || k, info: n };
    });
  }

  function importBackup(obj, mode) { // mode: "replace" | "merge"
    const v = validateBackup(obj);
    if (!v.ok) return v;
    const known = Object.values(KEYS);
    Object.keys(obj.data).forEach(k => {
      if (!known.includes(k)) return;
      if (mode === "replace") { safeSet(k, obj.data[k]); return; }
      // merge
      const cur = safeGet(k, null);
      const incoming = obj.data[k];
      if (Array.isArray(cur) && Array.isArray(incoming)) safeSet(k, cur.concat(incoming));
      else if (cur && typeof cur === "object" && incoming && typeof incoming === "object") safeSet(k, Object.assign({}, cur, incoming));
      else safeSet(k, incoming);
    });
    logActivity("import", mode);
    return { ok: true, errors: v.errors };
  }

  function clearAll() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf(PREFIX) === 0) toRemove.push(key);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      return true;
    } catch (e) { return false; }
  }

  window.DZStore = {
    PREFIX, KEYS, available,
    get: safeGet, set: safeSet, remove: safeRemove,
    logActivity, markVisit, markRead, isRead,
    exportAll, validateBackup, summarizeBackup, importBackup, clearAll
  };
})();
