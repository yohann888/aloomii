
// --- 1. Notification Center ---
function toggleNotifications() {
    const drawer = document.getElementById('notification-drawer');
    if (drawer.classList.contains('hidden')) {
        drawer.classList.remove('hidden');
        document.getElementById('notif-badge').style.display = 'none';
        renderNotifications();
    } else {
        drawer.classList.add('hidden');
    }
}
function closeNotifications() {
    document.getElementById('notification-drawer').classList.add('hidden');
}
function renderNotifications() {
    const list = document.getElementById('notification-list');
    let html = '';
    const alerts = [
        { icon: '🔴', message: 'Relationship decay: Vincent Pronesti', time: '2 hours ago', action: 'Ping' },
        { icon: '🟠', message: 'Overdue outreach: NationGraph', time: '5 hours ago', action: 'Draft' },
        { icon: '🚨', message: 'High-score signal: Bisner', time: '1 day ago', action: 'View' }
    ];
    alerts.forEach(a => {
        html += `
            <div style="padding:10px; border:1px solid var(--border-light); border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.2em;">${a.icon}</span>
                    <div>
                        <div style="font-weight:500;">${a.message}</div>
                        <div style="font-size:0.8em; color:var(--text-dim);">${a.time}</div>
                    </div>
                </div>
                <button class="btn-secondary" style="padding:4px 8px; font-size:0.8em;">${a.action}</button>
            </div>
        `;
    });
    list.innerHTML = html;
}

// --- 2. Win/Loss Panel ---
function renderWinLoss() {
    const container = document.getElementById('win-loss-stats');
    if (!container || !window.commandData || !window.commandData.pipeline) return;
    const wl = window.commandData.pipeline.win_loss || { won_quarter: 5, revenue_won: 150000, lost_quarter: 2, revenue_lost: 50000, conversion_rate: 0.71 };
    
    // Fallback if data is empty for UI building
    const wonCount = wl.won_quarter || 0;
    const wonRev = wl.revenue_won || 0;
    const lostCount = wl.lost_quarter || 0;
    const lostRev = wl.revenue_lost || 0;
    const convRate = (wl.conversion_rate || 0) * 100;
    
    container.innerHTML = `
        <div style="display:flex; gap:20px; justify-content:space-between; align-items:center;">
            <div style="flex:1; background:rgba(0,229,160,0.1); padding:15px; border-radius:8px; border:1px solid rgba(0,229,160,0.2);">
                <div style="color:var(--text-dim); font-size:0.9em; margin-bottom:5px;">Won (Quarter)</div>
                <div style="font-size:1.8em; font-weight:600; color:var(--accent);">${wonCount}</div>
                <div style="font-size:0.9em; color:var(--text-dim);">$${wonRev.toLocaleString()}</div>
            </div>
            <div style="flex:1; background:rgba(255,100,100,0.1); padding:15px; border-radius:8px; border:1px solid rgba(255,100,100,0.2);">
                <div style="color:var(--text-dim); font-size:0.9em; margin-bottom:5px;">Lost (Quarter)</div>
                <div style="font-size:1.8em; font-weight:600; color:#ff6464;">${lostCount}</div>
                <div style="font-size:0.9em; color:var(--text-dim);">$${lostRev.toLocaleString()}</div>
            </div>
            <div style="flex:1; padding:15px;">
                <div style="color:var(--text-dim); font-size:0.9em; margin-bottom:5px;">Win Rate</div>
                <div style="font-size:1.8em; font-weight:600;">${convRate.toFixed(1)}%</div>
                <div style="margin-top:10px; display:flex; gap:2px; height:20px; align-items:flex-end;" title="4-week trend">
                    <div style="flex:1; background:var(--accent); height:30%; opacity:0.5;"></div>
                    <div style="flex:1; background:var(--accent); height:60%; opacity:0.7;"></div>
                    <div style="flex:1; background:var(--accent); height:40%; opacity:0.5;"></div>
                    <div style="flex:1; background:var(--accent); height:100%;"></div>
                </div>
            </div>
        </div>
    `;
}

function openOutcomeModal() {
    const modal = document.getElementById('outcome-modal');
    modal.classList.remove('hidden');
    
    // populate contacts
    const sel = document.getElementById('outcome-contact');
    if (window.commandData && window.commandData.contacts) {
        sel.innerHTML = window.commandData.contacts.map(c => `<option value="${c.id}">${c.name} (${c.company})</option>`).join('');
    } else {
        sel.innerHTML = '<option>Loading...</option>';
    }
}
function closeOutcomeModal() {
    document.getElementById('outcome-modal').classList.add('hidden');
}
async function submitOutcome() {
    const contact = document.getElementById('outcome-contact').value;
    const type = document.getElementById('outcome-type').value;
    const rev = document.getElementById('outcome-revenue').value;
    const notes = document.getElementById('outcome-notes').value;
    
    if(!contact) return showToast('Please select a contact', 'error');
    
    try {
        const res = await fetch('/api/command/outcomes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contact_id: contact, outcome: type, revenue: parseInt(rev)||0, notes })
        });
        showToast('Outcome logged successfully');
        closeOutcomeModal();
        if(window.refreshAll) window.refreshAll();
    } catch(err) {
        showToast('Error logging outcome', 'error');
    }
}

// --- 3. Outreach Editor ---
function updateDraftScore() {
    const text = document.getElementById('draft-textarea').value;
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    document.getElementById('draft-word-count').innerText = words;
    
    let score = 85;
    let flagsHTML = '';
    let suggestion = 'Looks good!';
    
    if (words > 150) {
        score -= 20;
        flagsHTML += `<span style="background:rgba(255,100,100,0.2); color:#ff6464; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:4px;">Too long</span>`;
        suggestion = 'Tip: Reduce length under 150 words.';
    } else if (words < 20) {
        score -= 10;
        flagsHTML += `<span style="background:rgba(255,200,100,0.2); color:#ffc864; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:4px;">Too short</span>`;
        suggestion = 'Tip: Add more personalized context.';
    }
    
    if (!text.toLowerCase().includes('?')) {
        score -= 10;
        flagsHTML += `<span style="background:rgba(255,200,100,0.2); color:#ffc864; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-right:4px;">Weak CTA</span>`;
        suggestion = 'Tip: End with a clear question (CTA).';
    }
    
    document.getElementById('draft-score-val').innerText = score;
    document.getElementById('score-flags').innerHTML = flagsHTML;
    document.getElementById('draft-suggestion').innerText = suggestion;
    
    if (score > 80) document.getElementById('draft-score-val').style.color = 'var(--accent)';
    else if (score > 60) document.getElementById('draft-score-val').style.color = '#ffc864';
    else document.getElementById('draft-score-val').style.color = '#ff6464';
}

function applyTone(tone) {
    const ta = document.getElementById('draft-textarea');
    ta.value = `[Applied ${tone} tone] ` + ta.value;
    updateDraftScore();
    showToast(`Tone updated: ${tone}`);
}

function saveDraftTemplate() {
    showToast('Saved as template');
}
function rejectDraft() {
    closeDraftPanel();
    showToast('Draft rejected');
}

// Ensure the score is updated when the panel opens
const origEditDraft = window.editDraft;
window.editDraft = function(id) {
    if(origEditDraft) origEditDraft(id);
    document.getElementById('draft-edit-panel').classList.remove('hidden');
    setTimeout(() => {
        const text = document.getElementById('draft-textarea').value;
        document.getElementById('draft-original-text').innerText = text || 'No original content';
        updateDraftScore();
    }, 100);
};

// Auto-inject Win/Loss rendering into the refresh cycle
const origRefreshAll = window.refreshAll;
window.refreshAll = async function() {
    if(origRefreshAll) await origRefreshAll();
    renderWinLoss();
};
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderWinLoss, 1000); // Initial fallback render
});

// Expose globals
window.toggleNotifications = toggleNotifications;
window.closeNotifications = closeNotifications;
window.openOutcomeModal = openOutcomeModal;
window.closeOutcomeModal = closeOutcomeModal;
window.submitOutcome = submitOutcome;
window.updateDraftScore = updateDraftScore;
window.applyTone = applyTone;
window.saveDraftTemplate = saveDraftTemplate;
window.rejectDraft = rejectDraft;

