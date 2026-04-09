# Spec: Content Section — Reject + Approve Buffer UX Fixes

## Files
- `command/app.js`
- `command/app.html` (for toast container)

## Bug 1: Reject leaves draft visible and says "Queued"

**Root cause:** `rejectLinkedInDraft(id)` calls the API but never re-renders or removes the draft from the DOM. The draft stays in the array and re-renders with its existing `status: 'queued'` label.

**Fix (line ~1879):** After the API call succeeds, filter out the rejected draft from `commandData.linkedin_drafts` and call `renderLinkedInDrafts(commandData.linkedin_drafts)`.

```javascript
// BEFORE (line ~1879)
function rejectLinkedInDraft(id) {
  fetch('/api/command/content/' + id + '/reject', {
    method: 'POST',
  })
  .then(r => r.json())
  .then(data => {
    // nothing here — draft stays on screen
  });
}

// AFTER
function rejectLinkedInDraft(id) {
  fetch('/api/command/content/' + id + '/reject', {
    method: 'POST',
  })
  .then(r => r.json())
  .then(data => {
    // Remove from local state and re-render
    commandData.linkedin_drafts = commandData.linkedin_drafts.filter(d => d.id !== id);
    renderLinkedInDrafts(commandData.linkedin_drafts);
    showToast('Draft rejected', 'info');
  })
  .catch(err => {
    console.error('Reject failed:', err);
    showToast('Failed to reject draft', 'error');
  });
}
```

## Bug 2: Approve-Buffer shows no confirmation

**Root cause:** `approveLinkedInDraft(id)` calls `POST /api/command/content/:id/approve-buffer` and the draft gets pushed to Buffer, but there is no user-facing feedback. The draft remains on screen with its old status.

**Fix (line ~1858):** After API success, re-render the draft list (so the status updates to "Buffer Sent" or whatever the API returns), and show a success toast.

```javascript
// AFTER (same pattern as reject)
function approveLinkedInDraft(id) {
  const textarea = document.getElementById('draft-edit-area-' + id);
  // existing body-edit logic (keep)
  
  fetch('/api/command/content/' + id + '/approve-buffer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: editedBody }),
  })
  .then(r => r.json())
  .then(data => {
    // Re-render so status label updates
    renderLinkedInDrafts(commandData.linkedin_drafts);
    showToast('Sent to Buffer successfully', 'success');
  })
  .catch(err => {
    console.error('Buffer send failed:', err);
    showToast('Failed to send to Buffer', 'error');
  });
}
```

## Toast Helper

Ensure `showToast(message, type)` exists in `app.js`. If not, add this near the top of the file (after `hideModal`):

```javascript
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const colors = { success: '#009e96', error: '#e53e3e', info: 'rgba(255,255,255,0.9)' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:${colors[type] || colors.info};color:#000;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;animation:fadeIn 0.2s ease;`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
```

Add to `app.html` `<style>` block:
```css
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
```

## Test Plan
1. Open Content section, find a draft labeled "Queued"
2. Click Reject → draft disappears immediately, toast "Draft rejected" appears
3. Find another queued draft → click "Approve → Buffer" → toast "Sent to Buffer successfully" appears, draft status updates or disappears
