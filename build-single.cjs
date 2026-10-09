#!/usr/bin/env node
/* =====================================================================
   DrZiad — أداة توليد النسخة ذات الملف الواحد (Single-File Build)
   تدمج: styles.css + print.css + data.js + storage.js + search.js + app.js
   داخل index.html لإنتاج drziad-single.html قابل للمشاركة محلياً.
   التشغيل:  node build-single.cjs
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const read = f => fs.readFileSync(path.join(DIR, f), "utf8");

const styles = read("styles.css");
const print = read("print.css");
const dataJs = read("data.js");
const storageJs = read("storage.js");
const searchJs = read("search.js");
const appJs = read("app.js");
let html = read("index.html");

// ملاحظة مهمة: نستخدم دوال استبدال (وليس نصوصاً) حتى لا يفسّر String.replace
// التسلسلات الخاصة مثل $$ و $& داخل كود JavaScript (مثل الدالة المساعدة $$).

// 1) استبدال وسوم الأنماط بأنماط مضمّنة
html = html.replace(/<link rel="stylesheet" href="styles\.css">/,
  () => '<style id="app-styles">\n' + styles + '\n</style>');
html = html.replace(/<link rel="stylesheet" href="print\.css" media="all">/,
  () => '<style id="print-styles">\n' + print + '\n</style>');

// 2) استبدال سكربتات المصدر بسكربتات مضمّنة (نفس الترتيب)
const inlineScripts =
  '<script>/* data.js */\n' + dataJs + '\n</' + 'script>\n' +
  '<script>/* storage.js */\n' + storageJs + '\n</' + 'script>\n' +
  '<script>/* search.js */\n' + searchJs + '\n</' + 'script>\n' +
  '<script>/* app.js */\n' + appJs + '\n</' + 'script>';

html = html.replace(
  /<script src="data\.js"><\/script>\s*<script src="storage\.js"><\/script>\s*<script src="search\.js"><\/script>\s*<script src="app\.js"><\/script>/,
  () => inlineScripts);

// 3) تعليق يوضح طبيعة الملف
const banner = '\n<!-- ========================================================\n' +
  '  DrZiad — النسخة ذات الملف الواحد (Single-File)\n' +
  '  مولّدة آلياً من الملفات المنفصلة عبر build-single.cjs\n' +
  '  تعمل محلياً بالكامل دون خادم. لتعديل المحتوى عدّل الملفات\n' +
  '  المنفصلة ثم أعد توليد هذه النسخة.\n' +
  '======================================================== -->\n';
html = html.replace(/<title>/, () => banner + "  <title>");

// التحقق من نجاح الاستبدال
if (html.includes('src="data.js"') || html.includes('href="styles.css"')) {
  console.error("خطأ: لم تُستبدل كل المراجع الخارجية. راجع قالب index.html.");
  process.exit(1);
}

fs.writeFileSync(path.join(DIR, "drziad-single.html"), html, "utf8");
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log("✓ تم إنشاء drziad-single.html (" + kb + " KB)");
