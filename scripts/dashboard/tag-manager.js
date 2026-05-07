// tag-manager.js — Tag Manager routes for CC dashboard
// Mounted on the same Express app as cc-dashboard.js
// No auto-refresh. HTMX for interactivity.
// Writes: request-only (logged to activity_log, never direct DB)

// ─── HTML Escaping ───────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// ─── Shared CSS (tag manager specific) ──────────────────────────────────────
const TAG_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 0; }
  .tm-header { background: #111; border-bottom: 1px solid #333; padding: 12px 20px; display: flex; align-items: center; gap: 16px; }
  .tm-header h1 { margin: 0; font-size: 1.2em; color: #3b82f6; }
  .tm-header a { color: #9ca3af; font-size: 0.85em; text-decoration: none; }
  .tm-header a:hover { color: #fff; }
  .tm-body { display: grid; grid-template-columns: 180px 1fr 320px; height: calc(100vh - 53px); overflow: hidden; }
  
  /* Sidebar */
  .tm-sidebar { background: #111; border-right: 1px solid #333; overflow-y: auto; padding: 12px 0; }
  .tm-sidebar h3 { color: #9ca3af; font-size: 0.7em; text-transform: uppercase; letter-spacing: 1px; padding: 8px 16px 4px; margin: 0; }
  .cat-item { padding: 8px 16px; cursor: pointer; font-size: 0.88em; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid transparent; }
  .cat-item:hover { background: #1f2937; }
  .cat-item.active { background: #1e3a5f; border-left-color: #3b82f6; color: #60a5fa; }
  .cat-count { background: #374151; color: #9ca3af; padding: 1px 6px; border-radius: 10px; font-size: 0.75em; }
  .cat-item.untracked { color: #f59e0b; }
  .cat-item.untracked .cat-count { background: #451a03; color: #f59e0b; }

  /* Tag browser (center) */
  .tm-center { display: flex; flex-direction: column; overflow: hidden; }
  .tm-center-toolbar { padding: 12px 16px; border-bottom: 1px solid #333; display: flex; gap: 10px; align-items: center; }
  .tm-search { background: #2a2a2a; border: 1px solid #444; border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 0.88em; width: 240px; }
  .tm-search:focus { outline: none; border-color: #3b82f6; }
  .tag-table-wrap { overflow-y: auto; flex: 1; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #1f2937; color: #9ca3af; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; text-align: left; position: sticky; top: 0; z-index: 1; }
  td { padding: 8px 12px; border-bottom: 1px solid #1f2937; font-size: 0.88em; vertical-align: middle; }
  tr:hover td { background: #1a2332; }
  .tag-name { font-family: monospace; color: #e2e8f0; }
  .tag-badge { display: inline-block; background: #374151; color: #9ca3af; padding: 2px 7px; border-radius: 10px; font-size: 0.75em; }
  .tag-untracked { color: #f59e0b; }
  .tag-untracked .tag-name { color: #fbbf24; }
  .warn-badge { background: #451a03; color: #f59e0b; padding: 1px 5px; border-radius: 4px; font-size: 0.72em; margin-left: 6px; }
  .btn { padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 0.8em; }
  .btn-merge { background: #1e3a5f; color: #60a5fa; }
  .btn-merge:hover { background: #2563eb; color: #fff; }
  .btn-primary { background: #2563eb; color: #fff; }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-danger { background: #7f1d1d; color: #fca5a5; }
  .btn-danger:hover { background: #991b1b; color: #fff; }
  .btn-ghost { background: transparent; color: #6b7280; border: 1px solid #374151; }
  .btn-ghost:hover { background: #1f2937; color: #fff; }
  
  /* Contact panel (right) */
  .tm-contact { background: #111; border-left: 1px solid #333; display: flex; flex-direction: column; overflow: hidden; }
  .tm-contact-toolbar { padding: 12px 12px; border-bottom: 1px solid #333; }
  .tm-contact-search { background: #1a1a1a; border: 1px solid #444; border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 0.85em; width: 100%; }
  .tm-contact-search:focus { outline: none; border-color: #3b82f6; }
  .contact-list { overflow-y: auto; flex: 1; }
  .contact-item { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #1a1a1a; }
  .contact-item:hover { background: #1f2937; }
  .contact-item.selected { background: #1e3a5f; }
  .contact-name { font-weight: bold; font-size: 0.9em; }
  .contact-meta { color: #6b7280; font-size: 0.78em; margin-top: 2px; }
  .contact-tags { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
  .ctag { background: #1f2937; color: #9ca3af; padding: 2px 6px; border-radius: 4px; font-size: 0.72em; font-family: monospace; }
  
  /* Toast */
  .toast { position: fixed; bottom: 20px; right: 20px; background: #065f46; color: #6ee7b7; padding: 10px 16px; border-radius: 6px; font-size: 0.88em; z-index: 999; display: none; }
  .toast.show { display: block; }
  .toast.error { background: #7f1d1d; color: #fca5a5; }

  /* Merge modal */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; display: none; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 24px; width: 400px; }
  .modal h3 { margin: 0 0 16px; color: #fff; }
  .modal label { color: #9ca3af; font-size: 0.85em; display: block; margin-bottom: 6px; }
  .modal select { width: 100%; background: #111; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; font-size: 0.88em; margin-bottom: 16px; }
  .modal select:focus { outline: none; border-color: #3b82f6; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  
  /* Htmx loading */
  .htmx-indicator { opacity: 0; transition: opacity 0.2s; }
  .htmx-request .htmx-indicator { opacity: 1; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #374151; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  /* Category label */
  .cat-label { display: inline-block; background: #1f2937; color: #6b7280; padding: 1px 6px; border-radius: 4px; font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.5px; }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderContactTags(tags) {
  let arr = [];
  try {
    if (Array.isArray(tags)) arr = tags;
    else if (typeof tags === 'string') arr = JSON.parse(tags);
  } catch(e) {
    console.warn('renderContactTags: failed to parse tags', tags, e.message);
  }
  if (!arr.length) return '<span style="color:#4b5563;font-size:0.75em">no tags</span>';
  return arr.map(t => `<span class="ctag">#${escapeHtml(String(t).replace(/"/g,''))}</span>`).join('');
}

// ─── GET /tags — main tag manager page ───────────────────────────────────────

async function renderTagsPage(req, res) {
  try {
    const [categories, untracked, allContacts] = await Promise.all([
      pool.query(`
        SELECT td.category,
               count(DISTINCT td.tag) AS tag_count,
               count(ct.contact_id) AS usage_count
        FROM tag_definitions td
        LEFT JOIN contact_tags ct ON ct.tag = td.tag AND ct.is_active
        GROUP BY td.category ORDER BY td.category
      `),
      pool.query(`
        SELECT ct.tag, count(DISTINCT ct.contact_id) AS cnt
        FROM contact_tags ct
        LEFT JOIN tag_definitions td ON ct.tag = td.tag
        WHERE td.tag IS NULL AND ct.is_active
        GROUP BY ct.tag ORDER BY cnt DESC
        LIMIT 100
      `),
      pool.query(`
        SELECT id, name, tier, lead_status, tags
        FROM contacts ORDER BY tier ASC NULLS LAST, name ASC LIMIT 60
      `)
    ]);

    const activeCategory = req.query.cat || 'all';
    let tagRows;
    if (activeCategory === 'untracked') {
      tagRows = untracked.rows.map(r => ({
        tag: r.tag, category: 'untracked', display: r.tag,
        description: null, cnt: parseInt(r.cnt), tracked: false
      }));
    } else {
      const q = activeCategory === 'all'
        ? `SELECT td.tag, td.category, td.display, td.description,
                  count(DISTINCT ct.contact_id) AS cnt
           FROM tag_definitions td
           LEFT JOIN contact_tags ct ON ct.tag = td.tag AND ct.is_active
           GROUP BY td.tag, td.category, td.display, td.description
           ORDER BY cnt DESC, td.tag`
        : `SELECT td.tag, td.category, td.display, td.description,
                  count(DISTINCT ct.contact_id) AS cnt
           FROM tag_definitions td
           LEFT JOIN contact_tags ct ON ct.tag = td.tag AND ct.is_active
           WHERE td.category = $1
           GROUP BY td.tag, td.category, td.display, td.description
           ORDER BY cnt DESC, td.tag`;
      const res2 = activeCategory === 'all'
        ? await pool.query(q)
        : await pool.query(q, [activeCategory]);
      tagRows = res2.rows.map(r => ({ ...r, cnt: parseInt(r.cnt), tracked: true }));
    }

    const untrackedCount = untracked.rows.length;
    const totalUntracked = (await pool.query(`
      SELECT count(DISTINCT ct.tag) AS n
      FROM contact_tags ct LEFT JOIN tag_definitions td ON ct.tag = td.tag
      WHERE td.tag IS NULL AND ct.is_active
    `)).rows[0].n;

    // Build all defined tags for merge target dropdown
    const allDefinedTags = (await pool.query(
      `SELECT tag, category, display FROM tag_definitions ORDER BY category, tag`
    )).rows;

    const catItems = [
      { key: 'all', label: 'All Tags', count: categories.rows.reduce((s,r)=>s+parseInt(r.tag_count),0) },
      ...categories.rows.map(r => ({ key: r.category, label: r.category, count: parseInt(r.tag_count) })),
      { key: 'untracked', label: 'Untracked', count: parseInt(totalUntracked), special: true }
    ];

    const sidebarHtml = catItems.map(c => `
      <a href="/tags?cat=${escapeHtml(c.key)}" style="text-decoration:none;color:inherit;">
        <div class="cat-item ${c.key === activeCategory ? 'active' : ''} ${c.special ? 'untracked' : ''}">
          <span style="text-transform:capitalize">${escapeHtml(c.label)}</span>
          <span class="cat-count">${c.count}</span>
        </div>
      </a>
    `).join('');

    const tagTableRows = tagRows.map(r => `
      <tr class="${r.tracked ? '' : 'tag-untracked'}" data-tag="${escapeHtml(r.tag)}">
        <td>
          <span class="tag-name">#${escapeHtml(r.tag)}</span>
          ${!r.tracked ? '<span class="warn-badge">⚠ untracked</span>' : ''}
        </td>
        <td>${r.tracked ? `<span class="cat-label">${escapeHtml(r.category)}</span>` : '—'}</td>
        <td>${r.description ? `<span style="color:#6b7280;font-size:0.82em">${escapeHtml(r.description)}</span>` : '—'}</td>
        <td><span class="tag-badge">${r.cnt}</span></td>
        <td>
          ${!r.tracked ? `<button class="btn btn-merge" data-merge-tag="${escapeHtml(r.tag)}" data-merge-cnt="${r.cnt}">Merge →</button>` : ''}
          <button class="btn btn-ghost" data-filter-tag="${escapeHtml(r.tag)}">Contacts</button>
        </td>
      </tr>
    `).join('');

    const contactListHtml = allContacts.rows.map(c => `
      <div class="contact-item" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        <div class="contact-meta">T${c.tier || '?'} &nbsp;·&nbsp; ${escapeHtml(c.lead_status || 'unknown')}</div>
        <div class="contact-tags">${renderContactTags(c.tags)}</div>
      </div>
    `).join('');

    const mergeTargetOptions = allDefinedTags.map(t =>
      `<option value="${t.tag}">[${t.category}] ${t.tag}${t.display && t.display !== t.tag ? ' — '+t.display : ''}</option>`
    ).join('');

    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Tag Manager — Aloomii</title>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <style>${TAG_CSS}</style>
</head>
<body>

<div class="tm-header">
  <h1>🏷️ Tag Manager</h1>
  <a href="/">← CC Dashboard</a>
  <span style="color:#374151;margin-left:auto;font-size:0.8em">
    ${categories.rows.reduce((s,r)=>s+parseInt(r.tag_count),0)} defined · 
    <span style="color:#f59e0b">${totalUntracked} untracked</span> · 
    1,129 active assignments
  </span>
</div>

<div class="tm-body">

  <!-- Sidebar -->
  <div class="tm-sidebar">
    <h3>Categories</h3>
    ${sidebarHtml}
  </div>

  <!-- Tag Browser -->
  <div class="tm-center">
    <div class="tm-center-toolbar">
      <input class="tm-search" type="text" placeholder="Search tags…" oninput="filterTags(this.value)" />
      <span style="color:#6b7280;font-size:0.82em;margin-left:auto">
        ${tagRows.length} tags shown
      </span>
    </div>
    <div class="tag-table-wrap" id="tag-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tag</th><th>Category</th><th>Description</th><th>Contacts</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="tag-tbody">
          ${tagTableRows || '<tr><td colspan="5" style="color:#6b7280;text-align:center;padding:24px">No tags in this category.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Contact Panel -->
  <div class="tm-contact">
    <div class="tm-contact-toolbar">
      <input class="tm-contact-search" type="text" placeholder="Search contacts…" 
        hx-get="/tags/contacts" hx-trigger="keyup changed delay:300ms" 
        hx-target="#contact-list" hx-include="this"
        name="q" />
    </div>
    <div class="contact-list" id="contact-list">
      ${contactListHtml}
    </div>
    
    <!-- Contact detail panel -->
    <div id="contact-detail" style="display:none;border-top:1px solid #333;padding:12px;background:#0f172a;flex-shrink:0;max-height:45%;overflow-y:auto">
      <!-- populated by selectContact() via HTMX -->
    </div>
  </div>

</div>

<!-- Merge Modal -->
<div class="modal-overlay" id="merge-modal">
  <div class="modal">
    <h3>Merge Tag</h3>
    <p style="color:#9ca3af;font-size:0.85em;margin-top:0">
      Merging <strong id="merge-source-label" style="color:#fbbf24;font-family:monospace"></strong>
      (<span id="merge-source-count"></span> contacts) into a defined tag.
    </p>
    <label>Merge into:</label>
    <select id="merge-target-select">
      <option value="">— select target tag —</option>
      ${mergeTargetOptions}
    </select>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeMerge()">Cancel</button>
      <button class="btn btn-primary" onclick="submitMerge()">Request Merge →</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
let mergeSourceTag = null;

// ─── Delegated Event Listeners (replaces inline onclick) ──────────────────

document.addEventListener('click', function(e) {
  const btn = e.target.closest('button');
  if (!btn) return;

  // Merge button on tag table
  if (btn.classList.contains('btn-merge') && btn.dataset.mergeTag) {
    e.preventDefault();
    openMerge(btn.dataset.mergeTag, parseInt(btn.dataset.mergeCnt || '0'));
    return;
  }

  // Filter by tag button
  if (btn.classList.contains('btn-ghost') && btn.dataset.filterTag) {
    e.preventDefault();
    filterByTag(btn.dataset.filterTag);
    return;
  }

  // Apply suggested tag button
  if (btn.dataset.applyTag && btn.dataset.contactId) {
    e.preventDefault();
    applyTag(btn.dataset.contactId, btn.dataset.contactName, btn.dataset.applyTag);
    return;
  }

  // Remove active tag button
  if (btn.dataset.removeTag && btn.dataset.contactId) {
    e.preventDefault();
    removeTag(btn.dataset.contactId, btn.dataset.contactName, btn.dataset.removeTag);
    return;
  }

  // Add tag from dropdown
  if (btn.dataset.addTagFor) {
    e.preventDefault();
    const id = btn.dataset.addTagFor;
    const sel = document.getElementById('add-tag-select-' + id);
    if (sel && sel.value) {
      applyTag(id, btn.dataset.contactName, sel.value);
    }
    return;
  }
});

// Contact selection via delegated listener
document.addEventListener('click', function(e) {
  const item = e.target.closest('.contact-item');
  if (!item) return;
  const id = item.dataset.id;
  const name = item.dataset.name;
  if (id) selectContact(id, name);
});

function openMerge(tag, cnt) {
  mergeSourceTag = tag;
  document.getElementById('merge-source-label').textContent = '#' + tag;
  document.getElementById('merge-source-count').textContent = cnt;
  document.getElementById('merge-target-select').value = '';
  document.getElementById('merge-modal').classList.add('show');
}
function closeMerge() {
  document.getElementById('merge-modal').classList.remove('show');
  mergeSourceTag = null;
}
function submitMerge() {
  const target = document.getElementById('merge-target-select').value;
  if (!target) { showToast('Select a target tag first.', true); return; }
  closeMerge();
  submitRequest({ action: 'merge_tag', source_tag: mergeSourceTag, target_tag: target });
}

function filterTags(q) {
  const rows = document.querySelectorAll('#tag-tbody tr');
  const lower = q.toLowerCase();
  rows.forEach(r => {
    const tag = (r.dataset.tag || '').toLowerCase();
    r.style.display = !lower || tag.includes(lower) ? '' : 'none';
  });
}

function filterByTag(tag) {
  const input = document.querySelector('.tm-contact-search');
  input.value = '#' + tag;
  htmx.ajax('GET', '/tags/contacts?q=' + encodeURIComponent('#' + tag), '#contact-list');
}

function selectContact(id, name) {
  document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector('[data-id="' + id + '"]');
  if (el) el.classList.add('selected');
  htmx.ajax('GET', '/tags/contact-detail?id=' + encodeURIComponent(id), '#contact-detail');
  document.getElementById('contact-detail').style.display = 'block';
}

async function submitRequest(payload) {
  try {
    const res = await fetch('/tags/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      showToast('✅ Request logged → check activity_log for approval');
    } else {
      showToast('Error: ' + (data.error || 'Unknown'), true);
    }
  } catch(e) {
    showToast('Request failed: ' + e.message, true);
  }
}

function applyTag(contactId, contactName, tag) {
  submitRequest({ action: 'apply_tag', contact_id: contactId, contact_name: contactName, tag });
}
function removeTag(contactId, contactName, tag) {
  submitRequest({ action: 'remove_tag', contact_id: contactId, contact_name: contactName, tag });
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 4000);
}
</script>
</body>
</html>`);
  } catch(err) {
    res.status(500).send('<pre>Tag Manager error: ' + err.message + '</pre>');
  }
}

// ─── GET /tags/contacts — HTMX contact search ─────────────────────────────

async function renderContactList(req, res) {
  try {
    const q = (req.query.q || '').trim();
    const isTagFilter = q.startsWith('#');
    
    let rows;
    if (isTagFilter) {
      const tag = q.slice(1);
      rows = (await pool.query(
        `SELECT c.id, c.name, c.tier, c.lead_status, c.tags
         FROM contacts c
         JOIN contact_tags ct ON ct.contact_id = c.id AND ct.is_active AND ct.tag = $1
         ORDER BY c.tier ASC NULLS LAST, c.name ASC LIMIT 60`,
        [tag]
      )).rows;
    } else if (q) {
      rows = (await pool.query(
        `SELECT id, name, tier, lead_status, tags FROM contacts
         WHERE name ILIKE $1 ORDER BY tier ASC NULLS LAST, name ASC LIMIT 30`,
        ['%' + q + '%']
      )).rows;
    } else {
      rows = (await pool.query(
        `SELECT id, name, tier, lead_status, tags FROM contacts
         ORDER BY tier ASC NULLS LAST, name ASC LIMIT 60`
      )).rows;
    }

    const html = rows.length
      ? rows.map(c => `
        <div class="contact-item" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}">
          <div class="contact-name">${escapeHtml(c.name)}</div>
          <div class="contact-meta">T${c.tier || '?'} &nbsp;·&nbsp; ${escapeHtml(c.lead_status || 'unknown')}</div>
          <div class="contact-tags">${renderContactTags(c.tags)}</div>
        </div>`).join('')
      : '<div style="padding:24px;color:#6b7280;text-align:center;font-size:0.85em">No contacts found.</div>';

    res.send(html);
  } catch(err) {
    res.status(500).send('<div style="color:#f87171;padding:12px">Error: ' + err.message + '</div>');
  }
}

// ─── GET /tags/contact-detail — HTMX contact detail panel ────────────────

async function renderContactDetail(req, res) {
  try {
    const { id } = req.query;
    if (!id) return res.send('<div style="color:#6b7280;padding:12px">No contact selected.</div>');

    const [contact, activeTags, suggested] = await Promise.all([
      pool.query(`SELECT id, name, tier, lead_status, role, email FROM contacts WHERE id = $1`, [id]),
      pool.query(`SELECT tag FROM contact_tags WHERE contact_id = $1 AND is_active ORDER BY tag`, [id]),
      pool.query(`SELECT * FROM suggest_tags($1) LIMIT 8`, [id]).catch(e => {
        console.warn('suggest_tags failed for contact', id, e.message);
        return { rows: [] };
      })
    ]);

    if (!contact.rows.length) return res.send('<div style="color:#f87171;padding:12px">Contact not found.</div>');
    const c = contact.rows[0];

    // All defined tags for the add-tag dropdown
    const allTags = (await pool.query(`SELECT tag, category FROM tag_definitions ORDER BY category, tag`)).rows;
    const activeTagSet = new Set(activeTags.rows.map(r => r.tag));
    const availableTags = allTags.filter(t => !activeTagSet.has(t.tag));

    const tagChips = activeTags.rows.map(r => `
      <span style="display:inline-flex;align-items:center;gap:4px;background:#1f2937;color:#9ca3af;padding:3px 8px;border-radius:12px;font-size:0.78em;font-family:monospace;margin:2px">
        #${escapeHtml(r.tag)}
        <button data-remove-tag="${escapeHtml(r.tag)}" data-contact-id="${escapeHtml(c.id)}" data-contact-name="${escapeJs(c.name)}"
                style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:0.9em;padding:0;line-height:1" 
                title="Request removal">✕</button>
      </span>`).join('');

    const suggestChips = suggested.rows.map(r => `
      <span style="display:inline-flex;align-items:center;gap:4px;background:#0f2d1f;color:#4ade80;padding:3px 8px;border-radius:12px;font-size:0.78em;font-family:monospace;margin:2px">
        +${escapeHtml(r.tag)}
        <button data-apply-tag="${escapeHtml(r.tag)}" data-contact-id="${escapeHtml(c.id)}" data-contact-name="${escapeJs(c.name)}"
                style="background:none;border:none;cursor:pointer;color:#4ade80;font-size:0.9em;padding:0;line-height:1"
                title="Request apply">✓</button>
      </span>`).join('');

    const addTagOptions = availableTags.map(t =>
      `<option value="${escapeHtml(t.tag)}">[${escapeHtml(t.category)}] ${escapeHtml(t.tag)}</option>`
    ).join('');

    res.send(`
      <div style="padding:2px">
        <div style="font-weight:bold;font-size:0.95em;margin-bottom:2px">${escapeHtml(c.name)}</div>
        <div style="color:#6b7280;font-size:0.78em;margin-bottom:8px">
          T${c.tier || '?'} · ${escapeHtml(c.role || '—')} · ${escapeHtml(c.lead_status || 'unknown')}${c.email ? ' · ' + escapeHtml(c.email) : ''}
        </div>
        
        <div style="font-size:0.75em;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Active Tags (${activeTags.rows.length})</div>
        <div style="margin-bottom:10px;line-height:1.8">${tagChips || '<span style="color:#4b5563;font-size:0.78em">No tags</span>'}</div>
        
        ${suggested.rows.length ? `
          <div style="font-size:0.75em;color:#4ade80;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Suggested</div>
          <div style="margin-bottom:10px;line-height:1.8">${suggestChips}</div>
        ` : ''}
        
        <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
          <select id="add-tag-select-${escapeHtml(c.id)}" style="background:#111;border:1px solid #444;color:#fff;padding:4px 6px;border-radius:4px;font-size:0.78em;flex:1">
            <option value="">+ Add tag…</option>
            ${addTagOptions}
          </select>
          <button class="btn btn-primary" style="font-size:0.78em" 
                  data-add-tag-for="${escapeHtml(c.id)}" data-contact-name="${escapeJs(c.name)}">
            Apply
          </button>
        </div>
      </div>
    `);
  } catch(err) {
    res.status(500).send('<div style="color:#f87171;padding:12px">Error: ' + err.message + '</div>');
  }
}

// ─── POST /tags/request — log write request to activity_log ──────────────

async function handleTagRequest(req, res) {
  try {
    const payload = req.body;
    const { action, contact_id, contact_name, tag, source_tag, target_tag } = payload;

    // Validate required fields
    const VALID_ACTIONS = ['apply_tag', 'remove_tag', 'merge_tag'];
    if (!action || !VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid action' });
    }
    if (action === 'merge_tag') {
      if (!source_tag || !target_tag) {
        return res.status(400).json({ ok: false, error: 'source_tag and target_tag required for merge' });
      }
    } else {
      if (!contact_id || !contact_name || !tag) {
        return res.status(400).json({ ok: false, error: 'contact_id, contact_name, and tag are required' });
      }
    }

    // Build human-readable message
    let msg = '';
    switch(action) {
      case 'apply_tag':
        msg = `🏷️ **Tag Request:** Apply \`#${tag}\` to **${contact_name}** (id: \`${contact_id}\`)\n> React ✅ to approve, ❌ to deny`;
        break;
      case 'remove_tag':
        msg = `🏷️ **Tag Request:** Remove \`#${tag}\` from **${contact_name}** (id: \`${contact_id}\`)\n> React ✅ to approve, ❌ to deny`;
        break;
      case 'merge_tag':
        msg = `🏷️ **Tag Merge Request:** Merge \`#${source_tag}\` → \`#${target_tag}\`\n> This will remap all contacts from source to target tag.\n> React ✅ to approve, ❌ to deny`;
        break;
    }

    // Log to DB for audit trail
    await pool.query(
      `INSERT INTO activity_log (time, type, source, score, payload)
       VALUES (NOW(), 'tag_request', 'tag-manager', 1, $1)`,
      [JSON.stringify({ action, contact_id, contact_name, tag, source_tag, target_tag, msg })]
    );

    res.json({ ok: true, msg });
  } catch(err) {
    console.error('handleTagRequest error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── Accept pool from cc-dashboard.js ─────────────────────────────────────

let pool;
function setPool(p) { pool = p; }

module.exports = { renderTagsPage, renderContactList, renderContactDetail, handleTagRequest, setPool };
