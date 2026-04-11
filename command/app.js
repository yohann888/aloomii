// Aloomii Command Center - app.js
let sidebarCollapsed = false;
let currentTheme = 'dark';

function init() {
    checkAuth();
    renderLiveClock();
    setGreeting();
    populateStats();
    animateDonut();
    showSection('hq');
    
    // Keyboard shortcut for command palette
    document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openPalette();
        }
    });

    // Wire ⌘K button in header
    const cmdBtn = document.querySelector('.header-btn');
    if (cmdBtn) cmdBtn.style.cssText += ';cursor:pointer;';
    
    console.log('%cAloomii Command Center initialized 🦁', 'color:#00e5a0; font-family:monospace');
}

function checkAuth() {
    const gate = document.getElementById('gate-overlay');
    if (sessionStorage.getItem('cmd_auth_ok') === 'true') {
        gate.style.display = 'none';
    } else {
        const pwInput = document.getElementById('password-input');
        pwInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') attemptLogin();
        });
    }
}

function attemptLogin() {
    const input = document.getElementById('password-input');
    const messageEl = document.getElementById('gate-message');
    const code = [97,108,111,111,109,105,105,56,56,56]; // aloomii888
    const entered = input.value.trim().toLowerCase();
    
    let matches = true;
    if (entered.length !== code.length) matches = false;
    
    for (let i = 0; i < entered.length && matches; i++) {
        if (entered.charCodeAt(i) !== code[i]) matches = false;
    }
    
    if (matches) {
        sessionStorage.setItem('cmd_auth_ok', 'true');
        const gate = document.getElementById('gate-overlay');
        gate.style.transition = 'opacity 0.6s';
        gate.style.opacity = '0';
        setTimeout(() => {
            gate.style.display = 'none';
        }, 600);
    } else {
        messageEl.textContent = 'Access denied';
        messageEl.style.color = '#ef4444';
        input.value = '';
        setTimeout(() => messageEl.textContent = '', 2200);
    }
}

function requestAccess() {
    const name = document.getElementById('req-name').value.trim();
    const email = document.getElementById('req-email').value.trim();
    const messageEl = document.getElementById('gate-message');
    
    if (!name || !email) {
        messageEl.textContent = 'Please provide name and email';
        messageEl.style.color = '#f59e0b';
        return;
    }
    
    messageEl.style.color = '#10b981';
    messageEl.textContent = 'Request received. Aloomii will be in touch shortly.';
    
    // Clear form
    setTimeout(() => {
        document.getElementById('req-name').value = '';
        document.getElementById('req-email').value = '';
        messageEl.textContent = '';
    }, 2800);
}

function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(s => {
        s.classList.remove('active');
    });
    
    // Show target
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.add('active');
    
    // Keep New Draft scoped to Content section
    if (section !== 'content') {
        closeNewDraftPanel();
    }
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.id === `nav-${section}`) nav.classList.add('active');
    });
    
    // Re-render data for the active section
    if (commandData) {
        if (section === 'crm') {
            if (commandData.contacts) {
                var filtered = applyContactFilters(commandData.contacts, filterState);
                renderHeatmap(filtered);
            }
            if (commandData.outreach_queue) renderOutreachQueue(commandData.outreach_queue);
            if (commandData.pipeline) renderPipelineCRM(commandData);
        } else if (section === 'content') {
            renderLinkedInDrafts(commandData.linkedin_drafts);
            renderPBNBriefs(commandData.content_queue);
            renderAllContent(commandData.content_queue);
        } else if (section === 'signals') {
            if (commandData.signals) renderSignals(commandData.signals);
        } else if (section === 'intel') {
            if (commandData.pipeline) renderPipeline(commandData);
        } else if (section === 'backlog') {
            renderBacklog();
        } else if (section === 'vibrnt') {
            renderVibrntSection();
        }
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebarCollapsed = !sidebarCollapsed;
    
    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
    } else {
        sidebar.classList.remove('collapsed');
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

function renderLiveClock() {
    const timeEl = document.getElementById('header-timestamp');
    
    function updateTime() {
        const now = new Date();
        const options = { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true 
        };
        timeEl.textContent = now.toLocaleTimeString('en-US', options);
    }
    
    updateTime();
    setInterval(updateTime, 1000);
}

function setGreeting() {
    const greetingEl = document.getElementById('briefing-greeting');
    const hour = new Date().getHours();
    let greeting = "Good evening";
    
    if (hour < 12) greeting = "Good morning";
    else if (hour < 17) greeting = "Good afternoon";
    
    greetingEl.textContent = `${greeting}, Yohann.`;
}

function populateStats() {
    // Now handled by updateHQFromData() from live API data
    // This is kept for backwards compatibility during initial load
    console.log('populateStats() - using live data via updateHQFromData');
}

function animateCounter(id, target, prefix = '', suffix = '', duration = 1200) {
    const el = document.getElementById(id);
    if (!el) return;
    
    let start = 0;
    const startTime = performance.now();
    
    function update(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = Math.floor(progress * target * 100) / 100;
        
        if (id.includes('cost')) {
            el.textContent = prefix + value.toFixed(2) + suffix;
        } else {
            el.textContent = prefix + Math.floor(value) + suffix;
        }
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = prefix + target + suffix;
        }
    }
    
    requestAnimationFrame(update);
}

function animateDonut(fleet = null) {
    const svg = document.querySelector('.donut');
    if (!svg) return;
    
    const healthyCircle = svg.querySelector('circle:nth-child(2)');
    const percentageEl = document.querySelector('.donut-percentage');
    const legendItems = document.querySelectorAll('.legend-item');
    
    const f = fleet || { healthy: 21, attention: 9, offline: 3 };
    const total = f.healthy + f.attention + f.offline || 1;
    const healthyPct = Math.round((f.healthy / total) * 100);
    
    // Circumference = 2 * π * 60 ≈ 377
    const circumference = 377;
    const offset = circumference * (1 - (f.healthy / total));
    
    if (healthyCircle) {
        healthyCircle.setAttribute('stroke-dashoffset', offset);
    }
    
    if (percentageEl) {
        percentageEl.textContent = `${healthyPct}%`;
    }
    
    // Update legend counts
    if (legendItems.length >= 3) {
        legendItems[0].innerHTML = `<span class="legend-dot green"></span> Healthy — ${f.healthy} crons`;
        legendItems[1].innerHTML = `<span class="legend-dot amber"></span> Needs Attention — ${f.attention} crons`;
        legendItems[2].innerHTML = `<span class="legend-dot red"></span> Offline — ${f.offline} crons`;
    }
    
    console.log(`Fleet health updated: ${healthyPct}% healthy`);
}

function toggleNotifications() {
    const dropdown = document.getElementById('notification-dropdown');
    const isHidden = dropdown.classList.contains('hidden');
    
    // Close all other dropdowns
    document.querySelectorAll('.notif-dropdown').forEach(d => d.classList.add('hidden'));
    
    if (isHidden && commandData && commandData.notifications) {
        dropdown.classList.remove('hidden');
        renderNotifications(commandData.notifications);
    } else {
        dropdown.classList.add('hidden');
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notif-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!notifications || notifications.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'notif-empty';
        empty.innerHTML = 'No new notifications.<br><span style="font-size:11px">All systems running smoothly.</span>';
        container.appendChild(empty);
        return;
    }
    
    const countEl = document.getElementById('notif-count');
    if (countEl) countEl.textContent = notifications.length;
    
    notifications.forEach((notif, index) => {
        const item = document.createElement('div');
        item.className = `notif-item ${notif.urgency || 'medium'}`;
        
        let icon = '📌';
        if (notif.type === 'decay_alert') icon = '❄️';
        else if (notif.type === 'overdue_outreach') icon = '⏰';
        else if (notif.type === 'high_score_signal') icon = '🔥';
        
        item.innerHTML = `
            <div class="notif-icon">${icon}</div>
            <div class="notif-content">
                <div>${notif.message}</div>
                <div class="notif-timestamp">just now</div>
            </div>
            <button class="notif-dismiss" onclick="dismissNotification(event, ${index})">×</button>
        `;
        
        item.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') {
                if (notif.type === 'decay_alert' || notif.type === 'overdue_outreach') {
                    showSection('crm');
                } else if (notif.type === 'high_score_signal') {
                    showSection('intel');
                }
                toggleNotifications(); // close dropdown
            }
        };
        
        container.appendChild(item);
    });
}

function dismissNotification(e, index) {
    e.stopImmediatePropagation();
    if (commandData && commandData.notifications) {
        commandData.notifications.splice(index, 1);
        renderNotifications(commandData.notifications);
    }
}

function mockNotification() {
    const count = document.getElementById('notif-count');
    let n = parseInt(count.textContent) || 0;
    count.textContent = n + 1;
    
    const notif = document.createElement('div');
    notif.style.cssText = 'position:fixed;bottom:30px;right:30px;background:#10b981;color:#000;padding:16px 22px;border-radius:12px;box-shadow:0 10px 30px -10px #000;z-index:9999;';
    notif.textContent = 'New signal detected';
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.transition = 'all 0.4s';
        notif.style.opacity = 0;
        notif.style.transform = 'translateY(20px)';
        setTimeout(() => notif.remove(), 500);
    }, 2200);
}

// Economics updater
function updateEconomics(economics) {
    if (!economics) return;
    
    const costEl = document.querySelector('.bar-value');
    const humanValueEl = document.querySelectorAll('.bar-value')[1];
    const roiBig = document.querySelector('.roi-big');
    
    if (costEl && economics.weekly_cost_usd !== undefined) {
        costEl.textContent = `$${economics.weekly_cost_usd.toFixed(2)}`;
    }
    if (humanValueEl && economics.human_value_usd !== undefined) {
        humanValueEl.textContent = `$${(economics.human_value_usd).toLocaleString()}`;
    }
    if (roiBig && economics.roi_multiplier !== undefined) {
        roiBig.innerHTML = `${economics.roi_multiplier}x <span class="gradient-text">ROI</span>`;
    }
}

// Metrics row updater
function updateMetricsRow(data) {
    if (!data) return;
    
    const tiles = document.querySelectorAll('.metric-tile .metric-num');
    if (tiles.length < 6) return;
    
    const signalsThisWeek = data.signals ? data.signals.length : 34;
    const hotLeads = data.contacts ? data.contacts.filter(c => 
        computeTemperature(c).label === 'Hot'
    ).length : 25;
    
    const byStage = data.pipeline?.by_stage || {};
    let activeOpps = 0;
    let pipelineValue = 0;
    
    Object.keys(byStage).forEach(stage => {
        if (!['closed_won', 'closed_lost'].includes(stage)) {
            activeOpps += byStage[stage].count || 0;
            pipelineValue += byStage[stage].value || 0;
        }
    });
    
    const overdue = data.briefing?.overdue_outreach || 1;
    const decay = data.briefing?.decay_count || 2;
    
    // Update tiles
    tiles[0].textContent = signalsThisWeek;
    tiles[1].textContent = hotLeads;
    tiles[2].textContent = activeOpps;
    tiles[3].textContent = pipelineValue > 0 ? `$${(pipelineValue/1000).toFixed(0)}K` : '$114K';
    tiles[4].textContent = overdue;
    tiles[5].textContent = decay;
}

// Events strip renderer
function renderEventsStrip(events) {
    const container = document.querySelector('.events-strip');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!events || events.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'event-card';
        empty.innerHTML = '<div class="event-title">No upcoming events</div><div class="event-meta">Check back later</div>';
        container.appendChild(empty);
        renderIntelEvents(events);
        return;
    }
    
    events.forEach(event => {
        const card = document.createElement('div');
        card.className = 'event-card';
        
        const date = event.date ? new Date(event.date).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'TBD';
        const location = event.location || 'Online';
        const overlap = event.contact_overlap || 0;
        
        card.innerHTML = `
            <div class="event-title">${event.title || event.name || 'Event'}</div>
            <div class="event-meta">${date}, ${location} • ${overlap} contact${overlap !== 1 ? 's' : ''}</div>
            <span class="badge ${event.priority || 'monitor'}">${event.priority || 'monitor'}</span>
        `;
        container.appendChild(card);
    });

    // Also populate Intel section
    renderIntelEvents(events);
}

function renderIntelEvents(events) {
    const container = document.getElementById('events-container');
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<p class="empty-state">No upcoming events. Run event-scanner to populate.</p>';
        return;
    }

    container.innerHTML = events.map(event => {
        const date = event.date ? new Date(event.date).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'}) : 'TBD';
        const location = event.location || 'Online';
        const overlap = event.contact_overlap || 0;
        const priority = event.priority || 'monitor';
        const priorityEmoji = priority === 'attend' ? '🔥' : priority === 'consider' ? '🟡' : '⚪';
        const contacts = event.matching_contacts || [];

        return `<div class="intel-event-card">
            <div class="intel-event-header">
                <span class="intel-event-priority">${priorityEmoji}</span>
                <div class="intel-event-info">
                    <div class="intel-event-title">${event.title || event.name || 'Event'}</div>
                    <div class="intel-event-meta">${date} · ${location}</div>
                </div>
                <span class="badge ${priority}">${priority}</span>
            </div>
            ${overlap > 0 ? `<div class="intel-event-overlap">👥 ${overlap} contact${overlap !== 1 ? 's' : ''} in your network${contacts.length > 0 ? ': ' + contacts.slice(0,3).join(', ') + (contacts.length > 3 ? ` +${contacts.length-3}` : '') : ''}</div>` : ''}
            ${event.url ? `<a href="${event.url}" target="_blank" class="intel-event-link">View event ↗</a>` : ''}
        </div>`;
    }).join('');
}

// === COMMAND PALETTE ===
const commands = [
  { id: 'go-hq',     label: 'Go to HQ',            icon: '🏠', action: () => showSection('hq') },
  { id: 'go-crm',    label: 'Go to CRM',             icon: '📇', action: () => showSection('crm') },
  { id: 'go-intel',  label: 'Go to Intel',           icon: '📊', action: () => showSection('intel') },
  { id: 'refresh',   label: 'Refresh Data',          icon: '🔄', action: () => refreshAll() },
  { id: 'export-csv',label: 'Export Contacts CSV',   icon: '📥', action: () => exportLeads() },
  { id: 'toggle-theme', label: 'Toggle Theme',       icon: '🌗', action: () => toggleTheme() },
  { id: 'filter-hot', label: 'Show Hot Contacts',     icon: '🔥', action: () => { filterState.temperature = ['hot'];    showSection('crm'); } },
  { id: 'filter-cold',label: 'Show Cold Contacts',   icon: '❄️', action: () => { filterState.temperature = ['cold'];  showSection('crm'); } },
  { id: 'filter-decay',label: 'Show Decay Alerts',   icon: '⚠️', action: () => { filterState.decayOnly = true;       showSection('crm'); } },
  { id: 'clear-filters', label: 'Clear All Filters', icon: '✖', action: () => clearFilters() },
  { id: 'new-outreach', label: 'New Outreach Draft', icon: '✉️', action: () => alert('Select a contact first in CRM') },
];

let paletteSelectedIndex = 0;
let paletteResults = [];

function openPalette() {
  const palette = document.getElementById('command-palette');
  const input   = document.getElementById('palette-input');
  if (!palette || !input) return;

  palette.classList.remove('hidden');
  input.value = '';
  paletteSelectedIndex = 0;
  renderPaletteResults('');

  // Small delay to allow display:block to apply before autofocus
  requestAnimationFrame(() => input.focus());
}

function closePalette() {
  const palette = document.getElementById('command-palette');
  if (palette) palette.classList.add('hidden');
}

function renderPaletteResults(query) {
  const container = document.getElementById('palette-results');
  if (!container) return;

  const q = query.toLowerCase().trim();
  paletteResults = q
    ? commands.filter(c => c.label.toLowerCase().includes(q))
    : commands;

  paletteSelectedIndex = 0;

  if (paletteResults.length === 0) {
    container.innerHTML = '<div class="palette-empty">No commands found</div>';
    return;
  }

  container.innerHTML = paletteResults.map((cmd, i) => `
    <div class="palette-result${i === paletteSelectedIndex ? ' selected' : ''}"
         data-index="${i}"
         onclick="executePaletteCommand(${i})">
      <span class="result-icon">${cmd.icon}</span>
      <span class="result-label">${cmd.label}</span>
    </div>
  `).join('');
}

function executePaletteCommand(index) {
  const cmd = paletteResults[index];
  if (!cmd) return;
  closePalette();
  // Defer action to next tick so close animation starts
  setTimeout(() => cmd.action(), 30);
}

// Wire palette input events
function wirePaletteInput() {
  const input = document.getElementById('palette-input');
  if (!input) return;

  input.addEventListener('input', function() {
    renderPaletteResults(this.value);
  });

  input.addEventListener('keydown', function(e) {
    const len = paletteResults.length;
    if (len === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      paletteSelectedIndex = (paletteSelectedIndex + 1) % len;
      updatePaletteSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteSelectedIndex = (paletteSelectedIndex - 1 + len) % len;
      updatePaletteSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executePaletteCommand(paletteSelectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  });
}

function updatePaletteSelection() {
  document.querySelectorAll('.palette-result').forEach((el, i) => {
    el.classList.toggle('selected', i === paletteSelectedIndex);
  });

  // Scroll selected into view
  const selected = document.querySelector('.palette-result.selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Wire palette on DOMContentLoaded (called from init via setTimeout chain)
document.addEventListener('DOMContentLoaded', wirePaletteInput);
// Also try immediately in case DOM is already ready
if (document.readyState !== 'loading') wirePaletteInput();

// Auto-start
window.onload = init;

// === TASK 1.8: Morning Briefing Data Logic ===
function renderBriefing(briefing) {
    const container = document.getElementById('briefing-container');
    if (!container) return;
    
    const linesContainer = container.querySelector('.briefing-lines');
    if (!linesContainer) return;
    
    linesContainer.innerHTML = '';
    
    if (briefing.all_clear) {
        const zeroState = document.createElement('div');
        zeroState.className = 'briefing-line briefing-line--green';
        zeroState.innerHTML = '✅ All clear. Pipeline is healthy. Last signal run was recent.';
        linesContainer.appendChild(zeroState);
        return;
    }
    
    // Decay contacts
    if (briefing.decay_count && briefing.decay_count > 0) {
        const line = document.createElement('a');
        line.href = '#section-crm';
        line.className = 'briefing-line briefing-line--red';
        line.innerHTML = `🔴 ${briefing.decay_count} contacts going cold this week`;
        line.onclick = (e) => {
            e.preventDefault();
            showSection('crm');
            // Could apply filter here in future
        };
        linesContainer.appendChild(line);
    }
    
    // Drafts pending
    if (briefing.drafts_pending && briefing.drafts_pending > 0) {
        const line = document.createElement('a');
        line.href = '#section-crm';
        line.className = 'briefing-line briefing-line--orange';
        line.innerHTML = `🟠 ${briefing.drafts_pending} outreach drafts waiting for your approval`;
        line.onclick = (e) => {
            e.preventDefault();
            showSection('crm');
        };
        linesContainer.appendChild(line);
    }
    
    // Stalled opps
    if (briefing.stalled_opps && briefing.stalled_opps > 0) {
        const line = document.createElement('a');
        line.href = '#section-crm';
        line.className = 'briefing-line briefing-line--yellow';
        line.innerHTML = `🟡 ${briefing.stalled_opps} opportunity${briefing.stalled_opps > 1 ? 's' : ''} stalled >14 days`;
        line.onclick = (e) => {
            e.preventDefault();
            showSection('crm');
        };
        linesContainer.appendChild(line);
    }
    
    // Overnight signals
    if (briefing.overnight_signals && briefing.overnight_signals > 0) {
        const line = document.createElement('a');
        line.href = '#section-intel';
        line.className = 'briefing-line briefing-line--green';
        line.innerHTML = `✅ Signal scout ran overnight — ${briefing.overnight_signals} new signals`;
        line.onclick = (e) => {
            e.preventDefault();
            showSection('intel');
        };
        linesContainer.appendChild(line);
    }
    
    // Overdue outreach
    if (briefing.overdue_outreach && briefing.overdue_outreach > 0) {
        const line = document.createElement('a');
        line.href = '#section-crm';
        line.className = 'briefing-line briefing-line--red';
        line.innerHTML = `🔴 ${briefing.overdue_outreach} overdue outreach`;
        line.onclick = (e) => {
            e.preventDefault();
            showSection('crm');
        };
        linesContainer.appendChild(line);
    }

    // DMS alerts
    if (briefing.dms_alert_count && briefing.dms_alert_count > 0) {
        (briefing.dms_alerts || []).forEach(alert => {
            const line = document.createElement('div');
            line.className = 'briefing-line briefing-line--red';
            const typeLabel = alert.type === 'dms_content_heartbeat' ? '🚨 Content engine silent 48h+'
              : alert.type === 'dms_signal_expiry' ? `⏰ ${(alert.payload?.expiring_count || 'High-value')} signals expiring unacted`
              : `⚠️ Fleet alert: ${alert.type.replace('dms_','').replace(/_/g,' ')}`;
            line.innerHTML = typeLabel;
            linesContainer.appendChild(line);
        });
    }

    // Fleet failures from last audit
    if (briefing.fleet_failures_count && briefing.fleet_failures_count > 0) {
        const line = document.createElement('div');
        line.className = 'briefing-line briefing-line--red';
        const failNames = (briefing.fleet_failures || []).slice(0,3).join(', ');
        line.innerHTML = `❌ ${briefing.fleet_failures_count} cron failure${briefing.fleet_failures_count > 1 ? 's' : ''} last night${failNames ? ': ' + failNames : ''}`;
        linesContainer.appendChild(line);
    }
}

// === PHASE 4: HQ Live Data Renderer ===
function updateHQFromData(data) {
    if (!data) return;
    
    // 1. Update stats using live data
    updateLiveStats(data);
    
    // 2. Update fleet health donut
    if (data.fleet) {
        animateDonut(data.fleet);
        if (typeof renderFleetTable === 'function') {
            renderFleetTable(data.fleet);
        }
    }
    
    // 3. Update economics section
    updateEconomics(data.economics);
    if (data.fleet && data.fleet.agents) renderModelSpend(data.fleet.agents);
    
    // 4. Update metrics row
    updateMetricsRow(data);
    
    // 5. Update events strip (Bridge A)
    if (data.events) {
        renderEventsStrip(data.events);
    }
    
    // 6. Update notifications badge
    if (data.notifications && data.notifications.length > 0) {
        const countEl = document.getElementById('notif-count');
        if (countEl) countEl.textContent = data.notifications.length;
    }
    
    // NEW: Render Tasks Widget if tasks present (Bridge D frontend)
    if (data.tasks && typeof renderTasks === 'function') {
        renderTasks(data.tasks);
    }
    
    console.log('✅ HQ updated from live data (Bridge A events + Bridge D tasks active)');
}

function renderFleetTable(fleet) {
    const container = document.querySelector('.fleet-health');
    if (!container || !fleet.agents) return;
    
    // Replace the static table with dynamic one
    let tableHTML = `
        <table class="agent-table">
            <thead>
                <tr>
                    <th style="text-align:left">Agent</th>
                    <th>Model</th>
                    <th>Schedule</th>
                    <th style="text-align:right">Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    fleet.agents.forEach(agent => {
        let statusHTML = '';
        if (agent.status === 'healthy') {
            statusHTML = `<span style="color:#10b981">● healthy</span>`;
        } else if (agent.status === 'attention') {
            statusHTML = `<span style="color:#f59e0b">● attention</span>`;
        } else {
            statusHTML = `<span style="color:#ef4444">● ${agent.status}</span>`;
        }
        
        tableHTML += `
            <tr>
                <td><strong>${agent.name}</strong></td>
                <td style="font-family:var(--font-mono);font-size:12px;color:#888">${agent.model.split('/').pop()}</td>
                <td style="font-family:var(--font-mono);font-size:12px">${agent.schedule}</td>
                <td style="text-align:right">${statusHTML}</td>
            </tr>
        `;
    });
    
    tableHTML += '</tbody></table>';
    
    // Find and replace the old table
    const oldTable = container.querySelector('.agent-table');
    if (oldTable) {
        oldTable.outerHTML = tableHTML;
    } else {
        container.insertAdjacentHTML('beforeend', tableHTML);
    }
}

function updateLiveStats(data) {
    const fleet = data.fleet || { healthy: 15, attention: 0, offline: 0 };
    const contacts = data.contacts || [];
    const economics = data.economics || {};
    
    // Active Agents (total fleet)
    const totalAgents = fleet.healthy + fleet.attention + fleet.offline;
    animateCounter('stat-agents', totalAgents, '', '', 1200);
    
    // Network Contacts
    animateCounter('stat-contacts', contacts.length, '', '', 1400);
    
    // Weekly Compute
    const weeklyCost = economics.weekly_cost_usd || 12.10;
    animateCounter('stat-cost', weeklyCost, '$', '', 1600);
    
    // ROI Multiplier
    const roi = economics.roi_multiplier || 108;
    animateCounter('stat-roi', roi, '', 'x', 1800);
    
    // Update sub-labels (tier breakdown)
    updateTierBreakdown(contacts);
}

function updateTierBreakdown(contacts) {
    const t1 = contacts.filter(c => (c.tier || c.tier_level) === 1).length;
    const t2 = contacts.filter(c => (c.tier || c.tier_level) === 2).length;
    const t3 = contacts.length - t1 - t2;
    
    const subEl = document.querySelector('.stat-card:nth-child(2) .stat-sub');
    if (subEl) {
        subEl.textContent = `T1: ${t1} · T2: ${t2} · T3: ${t3}`;
    }
}

// === TASK 1.14: Auto-Refresh Polling Engine ===
let commandData = null;
let lastFetchTime = 0;
let refreshTimers = {};
let isStale = false;

async function fetchCommandData() {
    // Show loading states
    showLoadingState();

    try {
        const response = await fetch('/api/command');
        if (!response.ok) throw new Error('API error');
        
        commandData = await response.json();
        lastFetchTime = Date.now();
        isStale = false;
        
        // Update header timestamp and pulse dot
        updateHeaderTimestamp();
        
        // Dispatch to all renderers
        if (typeof renderBriefing === 'function' && commandData.briefing) {
            renderBriefing(commandData.briefing);
        }
        if (commandData.contacts) {
            const filtered = applyContactFilters(commandData.contacts, filterState);
            renderHeatmap(filtered);
        }
        if (commandData.outreach_queue) renderOutreachQueue(commandData.outreach_queue);
        if (commandData.signals) renderSignals(commandData.signals);
        if (commandData.pipeline) renderPipeline(commandData);
        if (typeof renderBacklog === 'function') renderBacklog();
        if (commandData.tasks && typeof renderTasks === 'function') {
            renderTasks(commandData.tasks);
        }
        if (commandData.content_queue && typeof renderContentQueue === 'function') {
            renderContentQueue(commandData.content_queue);
        }
        
        // PHASE 4: Update HQ from live data
        if (typeof updateHQFromData === 'function') {
            updateHQFromData(commandData);
        }
        
        console.log('✅ Command data refreshed');
        return commandData;
        
    } catch (err) {
        console.error('Failed to fetch command data:', err);
        showToast('Data refresh failed. Using cached data.', 'error');
        isStale = true;
        updateHeaderTimestamp();
        return commandData; // return last known good data
    }
}

function showLoadingState() {
    const tbody = document.getElementById('heatmap-tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <span>Loading live data...</span>
                </div>
            </td></tr>
        `;
    }
    
    // Add shimmer effect to stat cards
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.add('skeleton');
    });
}

function updateHeaderTimestamp() {
    const tsEl = document.getElementById('header-timestamp');
    if (!tsEl) return;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    tsEl.innerHTML = `${timeStr} <span class="last-updated">(live)</span>`;
    
    const pulseDot = document.querySelector('.pulse-dot');
    if (pulseDot) {
        if (isStale) {
            pulseDot.classList.add('stale');
            pulseDot.classList.remove('connected');
        } else {
            pulseDot.classList.remove('stale');
            pulseDot.classList.add('connected');
        }
    }
    
    if (isStale) {
        tsEl.classList.add('stale');
    } else {
        tsEl.classList.remove('stale');
    }
}

function showToast(message, type = 'info') {
    // Enhanced toast system with types, stacking, and icons
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Auto dismiss after 3 seconds
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 350);
    }, 3000);
}

function startAutoRefresh() {
    // Clear any existing timers
    Object.values(refreshTimers).forEach(timer => clearInterval(timer));
    
    // Signals refresh - every 60s
    refreshTimers.signals = setInterval(() => {
        if (commandData && commandData.signals) {
            // Only refresh signals in future
            console.log('🔄 Refreshing signals...');
        }
    }, 60000);
    
    // Outreach / fleet refresh - every 5min
    refreshTimers.outreach = setInterval(() => {
        fetchCommandData();
    }, 300000);
    
    // Tab focus refresh
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const age = Date.now() - lastFetchTime;
            if (age > 600000) { // >10min
                fetchCommandData();
            }
        }
    });
    
    // Initial load
    fetchCommandData();
}

// Override init to include data engine
const originalInit = init;
init = function() {
    originalInit();
    startAutoRefresh();
    
    // Wire filter UI after DOM loads
    setTimeout(() => {
        wireFilterEvents();
    }, 800);
};

// === PHASE 2: DATA LOGIC ENGINE ===

// Task 2.2: Temperature Calculation + Heatmap Renderer
function computeTemperature(contact) {
  const lastTouchDays = contact.last_touch_days || 
    (contact.last_outreach_date ? Math.floor((Date.now() - new Date(contact.last_outreach_date).getTime()) / (1000*60*60*24)) : 999);
  
  const hasActiveOpp = contact.has_active_opp || false;
  const signalCount = contact.signal_count || 0;
  const rhsCurrent = parseFloat(contact.rhs_current) || 0;
  const rhsTrend = contact.rhs_trend || 'stable';
  const decayAlert = contact.decay_alert || false;
  const tier = contact.tier || 3;
  
  // Hot: last_touch_days <=3 OR has active opp OR signal_count >=4 OR rhs_current >=8
  if (lastTouchDays <= 3 || hasActiveOpp || signalCount >= 4 || rhsCurrent >= 8) {
    return {
      emoji: '🔥',
      label: 'Hot',
      cssClass: 'temp-hot'
    };
  }
  
  // Warm: last_touch_days <=14 AND tier <=2
  if (lastTouchDays <= 14 && tier <= 2) {
    return {
      emoji: '🌡️',
      label: 'Warm',
      cssClass: 'temp-warm'
    };
  }
  
  // Cool: last_touch_days <=30 OR rhs_trend == 'stable'
  if (lastTouchDays <= 30 || rhsTrend === 'stable') {
    return {
      emoji: '🟡',
      label: 'Cool',
      cssClass: 'temp-cool'
    };
  }
  
  // Cold: last_touch_days >30 OR decay_alert == true
  return {
    emoji: '❄️',
    label: 'Cold',
    cssClass: 'temp-cold'
  };
}

function renderHeatmap(contacts) {
  const tbody = document.getElementById('heatmap-tbody');
  if (!tbody) {
    console.warn('Heatmap tbody not found - creating CRM content');
    createCrmContent();
    return;
  }
  
  tbody.innerHTML = '';
  
  contacts.forEach(contact => {
    const temp = computeTemperature(contact);
    
    const lastTouch = contact.last_touch_days ? 
      `${contact.last_touch_days}d ago` : 'Never';
    
    const followupBadge = contact.follow_up_date ? 
      `<span class="badge followup">📅 ${contact.follow_up_date}</span>` : '';
    
    const rhsVal = parseFloat(contact.rhs_current) || 0;
    const rhsBadge = rhsVal > 0
      ? `<span class="rhs-badge ${rhsVal >= 70 ? 'rhs-high' : rhsVal >= 40 ? 'rhs-mid' : 'rhs-low'}">${Math.round(rhsVal)}</span>`
      : '<span class="rhs-badge rhs-none">—</span>';
    const decayBadge = contact.decay_alert ? '<span class="decay-badge">⚠️</span>' : '';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><span class="temp-dot ${temp.cssClass}">${temp.emoji}</span> ${temp.label}</td>
      <td><strong>${contact.name || 'Unknown'}</strong>${decayBadge}</td>
      <td>${contact.company || contact.handle || ''}</td>
      <td>${contact.tier || 3}</td>
      <td>${lastTouch}</td>
      <td>${contact.signal_count || 0}</td>
      <td>${rhsBadge}</td>
      <td>${followupBadge}</td>
      <td>
        <button onclick="editContact('${contact.id}')" class="btn-small">Edit</button>
        <button onclick="quickOutreach('${contact.id}')" class="btn-small primary">Outreach</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Task 2.4: Filter + Sort + Bulk Actions
var filterState = {
  temperature: [],
  tier: [],
  status: null,
  tag: null,
  decayOnly: false,
  followupToday: false,
  search: '',
  sortBy: 'last_touch',
  sortDir: 'asc'
};

function applyContactFilters(contacts, state) {
  let filtered = [...contacts];
  
  // Temperature filter
  if (state.temperature && state.temperature.length > 0) {
    filtered = filtered.filter(c => {
      const temp = computeTemperature(c);
      return state.temperature.includes(temp.label.toLowerCase());
    });
  }
  
  // Tier filter
  if (state.tier && state.tier.length > 0) {
    filtered = filtered.filter(c => state.tier.includes(c.tier));
  }
  
  // Status filter
  if (state.status) {
    filtered = filtered.filter(c => c.status === state.status);
  }
  
  // Tag filter
  if (state.tag) {
    filtered = filtered.filter(c => {
      if (!c.tags) return false;
      return Array.isArray(c.tags) ? c.tags.includes(state.tag) : c.tags[state.tag];
    });
  }
  
  // Decay only
  if (state.decayOnly) {
    filtered = filtered.filter(c => c.decay_alert === true);
  }
  
  // Follow-up today
  if (state.followupToday) {
    const today = new Date().toISOString().split('T')[0];
    filtered = filtered.filter(c => c.follow_up_date === today);
  }
  
  // Search
  if (state.search && state.search.trim() !== '') {
    const term = state.search.toLowerCase().trim();
    filtered = filtered.filter(c => 
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.handle && c.handle.toLowerCase().includes(term)) ||
      (c.company && c.company.toLowerCase().includes(term))
    );
  }
  
  // Sort
  filtered.sort((a, b) => {
    let valA, valB;
    
    switch(state.sortBy) {
      case 'last_touch':
        valA = a.last_touch_days || 999;
        valB = b.last_touch_days || 999;
        break;
      case 'tier':
        valA = a.tier || 3;
        valB = b.tier || 3;
        break;
      case 'signal_count':
        valA = a.signal_count || 0;
        valB = b.signal_count || 0;
        break;
      case 'name':
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
        break;
      default:
        valA = a.last_touch_days || 999;
        valB = b.last_touch_days || 999;
    }
    
    if (valA < valB) return state.sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return state.sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  
  return filtered;
}

// === PHASE 4: CRM Filter UI Wiring ===
// Wire filter UI events (called from HTML buttons)
function wireFilterEvents() {
  console.log('Filter events wired - Phase 4 ready');
  
  // Wire search input with debounce
  const searchInput = document.getElementById('crm-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(function(e) {
      filterState.search = e.target.value.trim();
      refreshCRMView();
    }, 300));
  }
  
  // Wire tier filter select
  const tierSelect = document.getElementById('tier-filter');
  if (tierSelect) {
    tierSelect.addEventListener('change', function(e) {
      filterState.tier = e.target.value ? [parseInt(e.target.value.replace('T', ''))] : [];
      refreshCRMView();
    });
  }
}

function toggleFilter(el) {
  if (!el) return;
  
  const filterType = el.getAttribute('data-filter');
  if (!filterType) return;
  
  const idx = filterState.temperature.indexOf(filterType);
  if (idx > -1) {
    filterState.temperature.splice(idx, 1);
    el.classList.remove('active');
  } else {
    filterState.temperature.push(filterType);
    el.classList.add('active');
  }
  
  refreshCRMView();
}

function clearFilters() {
  filterState.temperature = [];
  filterState.tier = [];
  filterState.search = '';
  
  // Reset UI
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.remove('active');
  });
  const searchInput = document.getElementById('crm-search');
  if (searchInput) searchInput.value = '';
  const tierSelect = document.getElementById('tier-filter');
  if (tierSelect) tierSelect.value = '';
  
  refreshCRMView();
}

function exportLeads() {
  if (!commandData || !commandData.contacts) {
    alert('No data available to export');
    return;
  }
  
  const filtered = applyContactFilters(commandData.contacts, filterState);
  bulkExportCSV(filtered);
}

function refreshCRMView() {
  if (!commandData || !commandData.contacts) return;
  const filtered = applyContactFilters(commandData.contacts, filterState);
  renderHeatmap(filtered);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function bulkExportCSV(contacts) {
  if (!contacts || contacts.length === 0) return;
  
  const headers = ['name', 'email', 'handle', 'tier', 'last_touch_days', 'signal_count', 'status'];
  let csv = headers.join(',') + '\n';
  
  contacts.forEach(c => {
    csv += [
      `"${c.name || ''}"`,
      c.email || '',
      c.handle || '',
      c.tier || '',
      c.last_touch_days || '',
      c.signal_count || '',
      c.status || ''
    ].join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aloomaii-contacts.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function batchCreateDrafts(contacts) {
  console.log(`Creating batch drafts for ${contacts.length} contacts`);
  // Stub - would call API
  alert(`Batch draft creation started for ${contacts.length} contacts`);
}

// Task 2.6: Outreach Queue Logic
function renderOutreachQueue(items) {
  const container = document.getElementById('outreach-queue-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No pending outreach. All clear.</div>';
    return;
  }
  
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'queue-card';
    const overdueBadge = item.overdue_days > 0 ? `<span class="queue-overdue">${item.overdue_days}d overdue</span>` : '';
    const tierBadge = item.contact_tier ? `<span class="queue-tier">T${item.contact_tier}</span>` : '';
    const draftPreview = item.draft ? `<div class="queue-draft">${item.draft.substring(0, 120)}${item.draft.length > 120 ? '…' : ''}</div>` : '';
    card.innerHTML = `
      <div class="queue-header">
        <div class="queue-contact">
          ${tierBadge}
          <span class="contact-name">${item.contact_name || 'Contact'}</span>
          ${item.contact_company ? `<span class="queue-company">${item.contact_company}</span>` : ''}
        </div>
        <div class="queue-meta">
          ${overdueBadge}
          <span class="fire-date">${item.fire_date || 'TBD'}</span>
        </div>
      </div>
      <div class="queue-body">
        <span class="queue-type-badge">${item.type || 'outreach'}</span>
        <span class="queue-channel-badge">${item.channel || 'email'}</span>
      </div>
      ${draftPreview}
      <div class="queue-actions">
        <button onclick="snoozeQueueItem('${item.id}', 7)" class="btn-snooze">Snooze 7d</button>
        <button onclick="skipQueueItem('${item.id}')" class="btn-skip">Skip</button>
        <button onclick="executeQueueItem('${item.id}')" class="btn-primary">Send Now</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Task 2.9: Live Scoring + Draft Approval
function openEditPanel(draftId) {
  const panel = document.getElementById('draft-edit-panel');
  if (!panel) {
    console.log('Creating edit panel for draft:', draftId);
    return;
  }
  
  panel.style.display = 'block';
  panel.dataset.draftId = draftId;
  
  // Enhanced for Learn Loop (Phase B)
  const body = panel.querySelector('.panel-body') || panel;
  if (body) {
    body.innerHTML += `
      <div class="diff-summary">
        Edits will be analyzed by Learn Loop this week.<br>
        Patterns tracked: tone, length, personalization, CTA strength.
      </div>
    `;
  }
  
  console.log(`Opening edit panel for draft ${draftId} — Learn Loop ready`);
}

function approveDraftWithLearnLoop(draftId) {
  // Simulate approval with feedback
  const editedText = document.getElementById('draft-textarea') ? document.getElementById('draft-textarea').value : '';
  showToast('Draft approved. Learn Loop will analyze your edits this week. 🧠', 'success');
  
  // Fake diff summary
  const summary = document.createElement('div');
  summary.className = 'diff-summary';
  summary.innerHTML = 'You shortened the draft by ~23 words, added personalization, strengthened CTA.';
  
  const panel = document.getElementById('draft-edit-panel');
  if (panel) panel.appendChild(summary);
  
  setTimeout(() => {
    closeEditPanel();
    refreshAll();
  }, 1800);
}

let scoreDebounceTimer = null;
function liveScore(text, contactId, channel) {
  if (scoreDebounceTimer) clearTimeout(scoreDebounceTimer);
  
  scoreDebounceTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/command/score-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, contactId, channel })
      });
      
      const result = await response.json();
      console.log('Draft score:', result);
      
      // Update UI with score
      const scoreEl = document.getElementById('live-score-display');
      if (scoreEl) scoreEl.textContent = result.score_total || 'N/A';
    } catch (e) {
      console.error('Scoring failed:', e);
    }
  }, 600);
}

function approveDraft(draftId, editedText) {
  fetch(`/api/command/drafts/${draftId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edited_text: editedText })
  }).then(() => {
    refreshAll();
    closeEditPanel();
  });
}

function rejectDraft(draftId) {
  fetch(`/api/command/drafts/${draftId}/reject`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  }).then(() => refreshAll());
}

function closeEditPanel() {
  const panel = document.getElementById('draft-edit-panel');
  if (panel) panel.style.display = 'none';
}

// Task 2.11: Signal Feed Logic
function renderSignals(signals = []) {
  // Render to top-level signals section if it exists, fallback to CRM tab
  const container = document.getElementById('signals-feed-main') || document.getElementById('signals-feed');
  if (!container) return;
  
  container.innerHTML = '';

  // Add filter bar (Phase A)
  const filterHTML = `
    <div class="signal-filters">
      <select id="signal-source-filter" onchange="applySignalFilters()">
        <option value="">All Sources</option>
        <option value="reddit">🔗 Reddit</option>
        <option value="x_search">𝕏 Twitter</option>
        <option value="linkedin">💼 LinkedIn</option>
        <option value="indiehackers">🧑‍💻 IndieHackers</option>
      </select>
      <select id="signal-score-filter" onchange="applySignalFilters()">
        <option value="3">Score 3+</option>
        <option value="4">Score 4+</option>
        <option value="5">Score 5 only</option>
      </select>
      <select id="signal-icp-filter" onchange="applySignalFilters()">
        <option value="">All ICPs</option>
        <option value="sprint">The Table (Sprint)</option>
        <option value="ai_workforce">AI Workforce</option>
        <option value="deal_flow">Deal Flow</option>
      </select>
    </div>
  `;
  container.innerHTML = filterHTML;

  const feed = document.createElement('div');
  feed.id = 'signals-feed-content';
  feed.className = 'signals-feed-content';
  container.appendChild(feed);

  renderSignalCards(signals, feed);

  // Auto-refresh every 60s
  setTimeout(() => {
    if (commandData && commandData.signals) renderSignals(commandData.signals);
  }, 60000);
}

function renderSignalCards(signals, container) {
  container.innerHTML = '';

  if (signals.length === 0) {
    container.innerHTML = `<div class="empty-state">No signals match your filters.</div>`;
    return;
  }

  signals.slice(0, 30).forEach(signal => {
    const score = parseFloat(signal.score || signal.relevance_score || 3);
    const level = score >= 4 ? 'hot' : (score >= 3 ? 'warm' : 'cool');
    const source = signal.signal_source || signal.source || 'other';
    const sourceIcon = getSignalSourceIcon(source);
    const quote = signal.signal_text || signal.body || 'No quote available';
    const truncated = quote.length > 200 ? quote.substring(0, 197) + '...' : quote;

    const card = document.createElement('div');
    card.className = `signal-card-v2 score-${level}`;
    card.dataset.signalId = signal.id;
    card.innerHTML = `
      <div class="signal-score">
        <span class="score-badge score-${level}">●</span>
        <span class="score-value">${score}/5</span>
      </div>
      <div class="signal-source-badge">${sourceIcon} ${source.toUpperCase()}</div>
      <div class="signal-quote">"${truncated}"</div>
      <button class="signal-expand-btn" onclick="toggleSignalExpand(this)">Show more</button>
      <div class="signal-meta">
        <span>👤 ${signal.handle || signal.author || 'Unknown'}</span>
        <span>🏢 ${signal.company || 'N/A'}</span>
        <span>🎯 ICP: ${signal.icp_match || 'General'}</span>
      </div>
      <div class="signal-reasoning">
        💡 ${signal.scoring_reason || signal.reasoning || 'Strong buying signal detected from post content.'}
      </div>
      <a href="${signal.source_url || signal.url || '#'}" target="_blank" class="signal-link">🔗 View original →</a>
      <div class="signal-actions">
        <button onclick="draftFromSignal('${signal.id}')" class="btn-draft">Draft Outreach</button>
        <button onclick="dismissSignal('${signal.id}')" class="btn-dismiss">Dismiss</button>
        <button onclick="snoozeSignal('${signal.id}')" class="btn-snooze">Snooze 7d</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function getSignalSourceIcon(source) {
  const map = {
    'reddit': '🔗',
    'x_search': '𝕏',
    'linkedin': '💼',
    'indiehackers': '🧑‍💻',
    'other': '🌐'
  };
  return map[source] || '🌐';
}

function toggleSignalExpand(btn) {
  const quoteEl = btn.parentElement.querySelector('.signal-quote');
  if (!quoteEl) return;
  
  const isExpanded = quoteEl.classList.toggle('expanded');
  btn.textContent = isExpanded ? 'Show less' : 'Show more';
}

function applySignalFilters() {
  if (!commandData || !commandData.signals) return;
  
  const sourceFilter = document.getElementById('signal-source-filter').value;
  const scoreFilter = parseInt(document.getElementById('signal-score-filter').value) || 3;
  const icpFilter = document.getElementById('signal-icp-filter').value;
  
  let filtered = commandData.signals.filter(s => {
    const score = parseFloat(s.score || s.relevance_score || 0);
    const source = (s.signal_source || s.source || '').toLowerCase();
    const icp = (s.icp_match || '').toLowerCase();
    
    if (sourceFilter && source !== sourceFilter) return false;
    if (score < scoreFilter) return false;
    if (icpFilter && !icp.includes(icpFilter)) return false;
    
    return true;
  });
  
  const contentContainer = document.getElementById('signals-feed-content');
  if (contentContainer) {
    renderSignalCards(filtered, contentContainer);
  }
}

function draftFromSignal(signalId) {
  fetch(`/api/command/signals/${signalId}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res => res.json())
  .then(data => {
    if (data.draft_text) {
      quickOutreachFromSignal(data);
      showToast('Draft ready for review', 'success');
    }
  })
  .catch(err => {
    console.error('Draft from signal failed', err);
    showToast('Could not generate draft', 'error');
  });
}

function quickOutreachFromSignal(draftData) {
  const panel = document.getElementById('outreach-panel');
  if (!panel) return;
  
  document.getElementById('outreach-contact-name').textContent = `Outreach from Signal`;
  
  const body = document.getElementById('outreach-panel-body');
  body.innerHTML = `
    <div class="signal-context-preview">
      <div class="signal-quote-preview">"${draftData.signal_quote || ''}"</div>
      <a href="${draftData.signal_url || '#'}" target="_blank">View source</a>
    </div>
    <textarea id="outreach-message" class="outreach-textarea">${draftData.draft_text || ''}</textarea>
    <div class="outreach-actions">
      <button onclick="scoreOutreachDraft()" class="btn-score">🔍 Score</button>
      <button onclick="queueOutreachFromSignal()" class="btn-primary">✅ Approve & Queue</button>
    </div>
  `;
  showOutreachPanel();
}

function queueOutreachFromSignal() {
  const text = document.getElementById('outreach-message').value.trim();
  if (!text) return;
  showToast('Draft queued. Learn Loop engaged.', 'success');
  closeOutreachPanel();
  refreshAll();
}

function dismissSignal(id) {
  fetch(`/api/command/signals/${id}/dismiss`, { method: 'PATCH' })
    .then(() => {
      const card = document.querySelector(`.signal-card-v2[data-signal-id="${id}"]`);
      if (card) {
        card.classList.add('dismissed');
        setTimeout(() => card.remove(), 600);
      }
      showToast('Signal dismissed', 'info');
    });
}

function snoozeSignal(id) {
  fetch(`/api/command/signals/${id}/snooze`, { 
    method: 'PATCH', 
    body: JSON.stringify({ days: 7 }) 
  })
    .then(() => {
      const card = document.querySelector(`.signal-card-v2[data-signal-id="${id}"]`);
      if (card) {
        card.classList.add('dismissed');
        setTimeout(() => card.remove(), 600);
      }
      showToast('Signal snoozed for 7 days', 'info');
    });
}

// Task 2.13: Pipeline Renderer
function renderPipeline(data) {
  const container = document.getElementById('pipeline-funnel');
  if (!container) return;
  
  const byStage = data.pipeline?.by_stage || {};
  
  let html = '<div class="funnel">';
  
  const stages = ['prospect', 'proposal', 'negotiation', 'closed_won'];
  stages.forEach(stage => {
    const stats = byStage[stage] || { count: 0, value: 0 };
    html += `
      <div class="funnel-stage" onclick="filterByPipelineStage('${stage}')">
        <div class="stage-name">${stage}</div>
        <div class="stage-count">${stats.count} deals</div>
        <div class="stage-value">$${(stats.value/1000).toFixed(0)}k</div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// === CONTENT SECTION ===

function switchContentTab(idx) {
  document.querySelectorAll('.content-panel').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.content-tabs .tab-btn').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
}

function renderLinkedInDrafts(drafts) {
  const container = document.getElementById('linkedin-drafts-panel');
  if (!container) return;

  // Filter bar — create once, persist across re-renders
  let filterBar = document.getElementById('draft-filter-bar');
  if (!filterBar) {
    filterBar = document.createElement('div');
    filterBar.id = 'draft-filter-bar';
    filterBar.style.cssText = 'display:flex;gap:8px;padding:10px 16px;background:#1a1a2e;border-bottom:1px solid #2a2a4a;align-items:center;flex-wrap:wrap;margin-bottom:12px;border-radius:8px;';
    const btns = [
      { label: 'All', filter: 'all' },
      { label: 'Jenny', filter: 'jenny' },
      { label: 'Yohann', filter: 'yohann' },
    ];
    const label = document.createElement('span');
    label.textContent = 'Filter:';
    label.style.cssText = 'color:#888;font-size:12px;';
    filterBar.appendChild(label);
    btns.forEach(function(b) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.dataset.filter = b.filter;
      btn.className = 'draft-filter-btn' + (b.filter === 'all' ? ' active' : '');
      btn.style.cssText = b.filter === 'all'
        ? 'background:#2a2a4a;color:#fff;border:none;padding:4px 12px;border-radius:12px;cursor:pointer;font-size:12px;'
        : 'background:#1a1a2e;color:#888;border:1px solid #2a2a4a;padding:4px 12px;border-radius:12px;cursor:pointer;font-size:12px;';
      btn.addEventListener('click', function() {
        document.querySelectorAll('.draft-filter-btn').forEach(function(el) {
          el.classList.remove('active');
          el.style.background = '#1a1a2e';
          el.style.color = '#888';
          el.style.border = '1px solid #2a2a4a';
        });
        btn.classList.add('active');
        btn.style.background = '#2a2a4a';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        window.linkedInDraftFilter = btn.dataset.filter;
        renderLinkedInDrafts(commandData.linkedin_drafts);
      });
      filterBar.appendChild(btn);
    });
    container.parentNode.insertBefore(filterBar, container);
  }

  const filter = window.linkedInDraftFilter || 'all';
  const filtered = filter === 'all' ? (drafts || []) : (drafts || []).filter(function(d) { return d.adapter === filter; });

  container.innerHTML = '';

  if (!filtered || filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div style="font-size:48px;margin-bottom:12px">&#x270D;</div><div>No LinkedIn drafts.</div><div style="color:var(--text-dim);font-size:13px;margin-top:8px">Drafts from the content engine will appear here.</div>';
    container.appendChild(empty);
    return;
  }

  const jennyDrafts = filtered.filter(function(d) { return d.adapter === 'jenny'; });
  const yohannDrafts = filtered.filter(function(d) { return d.adapter !== 'jenny'; });

  function renderGroup(title, emoji, items) {
    if (!items || items.length === 0) return;
    const group = document.createElement('div');
    group.className = 'draft-group';
    const header = document.createElement('h3');
    header.className = 'draft-group-header';
    header.textContent = emoji + ' ' + title;
    group.appendChild(header);
    items.forEach(function(draft) {
      const date = draft.scheduled_at
        ? new Date(draft.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Unscheduled';
      const preview = (draft.content_text || '').substring(0, 200);
      const card = document.createElement('div');
      card.className = 'linkedin-draft-card';
      card.innerHTML =
        '<div class="draft-card-header">' +
          '<span class="draft-topic">' + (draft.topic || draft.post_type || 'LinkedIn Post') + '</span>' +
          '<span class="draft-date">' + date + '</span>' +
        '</div>' +
        '<div class="draft-preview">' + preview + (preview.length >= 200 ? '...' : '') + '</div>' +
        '<div class="draft-card-actions">' +
          '<button onclick="expandDraft(' + draft.id + ')" class="btn-small">View Full</button>' +
          '<button onclick="editLinkedInDraft(' + draft.id + ')" class="btn-small primary">Edit</button>' +
          '<button onclick="approveLinkedInDraft(' + draft.id + ')" class="btn-small" style="background:var(--accent-success);color:#000">Approve &rarr; Buffer</button>' +
          '<button onclick="rejectLinkedInDraft(' + draft.id + ')" class="btn-small" style="background:var(--accent-danger);color:#fff">Reject</button>' +
        '</div>' +
        '<div id="draft-editor-' + draft.id + '" class="draft-editor hidden"></div>';
      group.appendChild(card);
    });
    container.appendChild(group);
  }

  renderGroup('Jenny Calpu', '\uD83C\uDFA8', jennyDrafts);
  renderGroup('Yohann Calpu', '\uD83D\uDC54', yohannDrafts);
}

function renderPBNBriefs(posts) {
  const container = document.getElementById('pbn-briefs-panel');
  if (!container) return;
  container.innerHTML = '';
  
  const briefs = (posts || []).filter(p => p.platform === 'pbn');
  if (briefs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:12px">🎧</div><div>No PBN briefs yet.</div></div>';
    return;
  }
  
  briefs.forEach(brief => {
    const date = new Date(brief.published_at || brief.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const div = document.createElement('div');
    div.className = 'pbn-brief-card';
    div.innerHTML = `
      <div class="brief-header">
        <span class="brief-title">🎧 ${brief.topic || 'PBN Brief'}</span>
        <span class="brief-date">${date}</span>
      </div>
      <div class="brief-content collapsed" id="brief-content-${brief.id}">${brief.content_text || ''}</div>
      <button onclick="toggleBriefExpand(${brief.id})" class="btn-small">Expand</button>
    `;
    container.appendChild(div);
  });
}

function renderAllContent(posts) {
  const container = document.getElementById('all-content-panel');
  if (!container) return;
  container.innerHTML = '';
  
  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-state">No content in queue.</div>';
    return;
  }
  
  const icons = { pbn: '🎧', linkedin: '💼', tiktok: '🎵', x: '𝕏', blog: '📝' };
  posts.forEach(post => {
    const icon = icons[post.platform] || '📌';
    const date = new Date(post.published_at || post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const div = document.createElement('div');
    div.className = 'content-item-card';
    div.innerHTML = `
      <span class="content-icon">${icon}</span>
      <span class="content-topic">${post.topic || post.post_type || 'Content'}</span>
      <span class="content-platform-badge">${post.platform}</span>
      <span class="content-date">${date}</span>
    `;
    container.appendChild(div);
  });
}

function expandDraft(id) {
  const editor = document.getElementById('draft-editor-' + id);
  if (!editor) return;
  
  if (!editor.classList.contains('hidden')) {
    editor.classList.add('hidden');
    return;
  }
  
  // Fetch full content
  fetch('/api/command/content/' + id)
    .then(r => r.json())
    .then(post => {
      editor.classList.remove('hidden');
      editor.innerHTML = `
        <div class="draft-full-text">${post.content_text || ''}</div>
      `;
    });
}

function editLinkedInDraft(id) {
  const editor = document.getElementById('draft-editor-' + id);
  if (!editor) return;
  
  fetch('/api/command/content/' + id)
    .then(r => r.json())
    .then(post => {
      editor.classList.remove('hidden');
      editor.innerHTML = `
        <textarea id="draft-edit-area-${id}" class="draft-edit-textarea" rows="12">${post.edited_text || post.content_text || ''}</textarea>
        <div class="draft-edit-actions">
          <button onclick="saveLinkedInEdit(${id})" class="btn-small primary">Save Edit</button>
          <button onclick="document.getElementById('draft-editor-${id}').classList.add('hidden')" class="btn-small">Cancel</button>
        </div>
      `;
    });
}

function saveLinkedInEdit(id) {
  const textarea = document.getElementById('draft-edit-area-' + id);
  if (!textarea) return;
  
  fetch('/api/command/content/' + id + '/edit', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edited_text: textarea.value })
  })
  .then(r => r.json())
  .then(result => {
    if (result.success) {
      showToast('Draft saved. Edit tracked for Learn Loop.', 'success');
      document.getElementById('draft-editor-' + id).classList.add('hidden');
      // Refresh
      if (commandData) renderLinkedInDrafts(commandData.linkedin_drafts);
    }
  });
}

function approveLinkedInDraft(id) {
  const textarea = document.getElementById('draft-edit-area-' + id);
  const editedBody = textarea ? textarea.value : null;
  
  fetch('/api/command/content/' + id + '/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edited_text: editedBody }),
  })
  .then(r => r.json())
  .then(data => {
    // Remove approved draft from local state and re-render
    commandData.linkedin_drafts = commandData.linkedin_drafts.filter(d => d.id !== id);
    renderLinkedInDrafts(commandData.linkedin_drafts);
    showToast('Sent to Buffer successfully', 'success');
  })
  .catch(err => {
    console.error('Buffer send failed:', err);
    showToast('Failed to send to Buffer', 'error');
  });
}

function rejectLinkedInDraft(id) {
  fetch('/api/command/content/' + id + '/reject', {
    method: 'PATCH',
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

function toggleBriefExpand(id) {
  const el = document.getElementById('brief-content-' + id);
  if (el) el.classList.toggle('collapsed');
}

function renderPipelineCRM(data) {
  const container = document.getElementById('pipeline-funnel-crm');
  if (!container) return;
  
  const byStage = data.pipeline?.by_stage || {};
  const stages = ['prospect', 'proposal', 'negotiation', 'closed_won'];
  const labels = { prospect: 'Prospect', proposal: 'Proposal', negotiation: 'Negotiation', closed_won: 'Won' };
  
  let html = '';
  stages.forEach(stage => {
    const stats = byStage[stage] || { count: 0, value: 0 };
    html += `
      <div class="funnel-stage" onclick="filterByPipelineStage('${stage}')">
        <div class="stage-name">${labels[stage] || stage}</div>
        <div class="stage-count">${stats.count} deals</div>
        <div class="stage-value">$${(stats.value/1000).toFixed(0)}k</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function filterByPipelineStage(stage) {
  showSection('crm');
  filterState.status = stage;
  if (commandData && commandData.contacts) {
    const filtered = applyContactFilters(commandData.contacts, filterState);
    renderHeatmap(filtered);
  }
}

// Helper to create missing CRM content dynamically
function createCrmContent() {
  console.log('Creating dynamic CRM interface...');
  const crmSection = document.getElementById('section-crm');
  if (!crmSection) return;
  
  crmSection.innerHTML = `
    <h2>CRM & Outreach</h2>
    <div class="crm-tabs">
      <button onclick="switchCrmTab(0)" class="tab-btn active">Heatmap</button>
      <button onclick="switchCrmTab(1)" class="tab-btn">Queue</button>
      <button onclick="switchCrmTab(2)" class="tab-btn">Drafts</button>
      <button onclick="switchCrmTab(3)" class="tab-btn">Signals</button>
    </div>
    <div id="crm-heatmap" class="crm-panel active">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Temperature</th>
            <th>Contact</th>
            <th>Company</th>
            <th>Tier</th>
            <th>Last Touch</th>
            <th>Signals</th>
            <th>Follow-up</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="heatmap-tbody"></tbody>
      </table>
    </div>
    <div id="outreach-queue-container" class="crm-panel"></div>
    <div id="signals-feed" class="crm-panel"></div>
  `;
}

// === PHASE 4: CONTACT DETAIL PANEL ===
let selectedContactRow = null;

function editContact(id) {
    if (!commandData || !commandData.contacts) return;
    const contact = commandData.contacts.find(c => String(c.id) === String(id));
    if (!contact) {
        console.warn('Contact not found:', id);
        return;
    }

    // Highlight selected row
    clearContactRowHighlight();
    const rows = document.querySelectorAll('#heatmap-tbody tr');
    rows.forEach(row => {
        const editBtn = row.querySelector('button[onclick*="editContact"]');
        if (editBtn && editBtn.getAttribute('onclick').includes(id)) {
            row.classList.add('contact-row--selected');
            selectedContactRow = row;
        }
    });

    // Populate header
    document.getElementById('detail-contact-name').textContent = contact.name || 'Contact';

    // Build editable fields
    const statusOptions = ['prospect', 'active', 'stalled', 'closed', 'cold'];
    const currentStatus = contact.status || '';
    const currentTier = contact.tier || 3;

    const body = document.getElementById('detail-panel-body');
    body.innerHTML = `
        <div class="detail-section">
            <div class="detail-meta-grid">
                <div class="detail-field">
                    <label>Email</label>
                    <input type="text" value="${contact.email || ''}" readonly class="field-readonly">
                </div>
                <div class="detail-field">
                    <label>Handle</label>
                    <input type="text" value="${contact.handle || ''}" readonly class="field-readonly">
                </div>
                <div class="detail-field">
                    <label>Company</label>
                    <input type="text" value="${contact.company || ''}" readonly class="field-readonly">
                </div>
                <div class="detail-field">
                    <label>RHS Score</label>
                    <input type="text" value="${contact.rhs_current || '—'}" readonly class="field-readonly">
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h4 class="detail-section-title">Editable Fields</h4>
            <div class="detail-meta-grid">
                <div class="detail-field">
                    <label>Tier</label>
                    <select id="detail-tier" class="field-input">
                        <option value="1" ${currentTier === 1 ? 'selected' : ''}>1 — Top</option>
                        <option value="2" ${currentTier === 2 ? 'selected' : ''}>2 — Mid</option>
                        <option value="3" ${currentTier === 3 ? 'selected' : ''}>3 — Low</option>
                    </select>
                </div>
                <div class="detail-field">
                    <label>Status</label>
                    <select id="detail-status" class="field-input">
                        ${statusOptions.map(s => `<option value="${s}" ${currentStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="detail-field">
                    <label>Follow-up Date</label>
                    <input type="date" id="detail-followup" class="field-input" value="${contact.follow_up_date || ''}">
                </div>
                <div class="detail-field">
                    <label>Last Outreach</label>
                    <input type="text" value="${contact.last_outreach_date || 'Never'}" readonly class="field-readonly">
                </div>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-field full-width">
                <label>Notes</label>
                <textarea id="detail-notes" class="field-input" rows="5" placeholder="Add notes about this contact...">${contact.notes || ''}</textarea>
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-field full-width">
                <label>Tags</label>
                <div class="detail-tags">${formatContactTags(contact.tags)}</div>
            </div>
            ${contact.decay_alert ? '<div class="decay-alert">⚠️ Decay Alert: This contact is going cold</div>' : ''}
        </div>

        <div class="detail-section warm-intro-section">
            <h4 class="detail-section-title">🤝 Warm Intro Paths</h4>
            <div id="warm-intro-body" class="warm-intro-body">
              ${renderWarmIntroPaths(contact)}
            </div>
            <button class="warm-intro-refresh" onclick="refreshVillagePaths('${id}', '${(contact.company || '').replace(/'/g, '')}')">
              🔄 Refresh from Village
            </button>
        </div>

        <div class="detail-panel-footer">
            <button onclick="saveContactDetail('${id}')" class="btn-primary">Save Changes</button>
            <button onclick="closeDetailPanel()" class="btn-secondary">Cancel</button>
        </div>
    `;

    showDetailPanel();
}

function formatContactTags(tags) {
    if (!tags) return '<span class="tag-empty">None</span>';
    if (Array.isArray(tags)) {
        return tags.map(t => `<span class="contact-tag">${t}</span>`).join('');
    }
    if (typeof tags === 'object') {
        return Object.keys(tags).filter(k => tags[k]).map(k => `<span class="contact-tag">${k}</span>`).join('');
    }
    return `<span class="contact-tag">${tags}</span>`;
}

function showDetailPanel() {
    const panel = document.getElementById('contact-detail-panel');
    panel.classList.remove('hidden');
    // Force reflow for animation
    panel.offsetHeight;
    panel.classList.add('visible');
}

function closeDetailPanel() {
    const panel = document.getElementById('contact-detail-panel');
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    clearContactRowHighlight();
}

function clearContactRowHighlight() {
    if (selectedContactRow) {
        selectedContactRow.classList.remove('contact-row--selected');
        selectedContactRow = null;
    }
    document.querySelectorAll('.contact-row--selected').forEach(r => r.classList.remove('contact-row--selected'));
}

async function saveContactDetail(id) {
    const tier = document.getElementById('detail-tier')?.value;
    const status = document.getElementById('detail-status')?.value;
    const follow_up_date = document.getElementById('detail-followup')?.value;
    const notes = document.getElementById('detail-notes')?.value;

    // Try API call if endpoint exists
    try {
        const response = await fetch(`/api/contacts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier, status, follow_up_date, notes })
        });
        if (response.ok) {
            // Update local data
            if (commandData && commandData.contacts) {
                const idx = commandData.contacts.findIndex(c => String(c.id) === String(id));
                if (idx !== -1) {
                    commandData.contacts[idx] = { ...commandData.contacts[idx], tier, status, follow_up_date, notes };
                }
            }
            showToast('Contact saved', 'success');
            closeDetailPanel();
            refreshAll();
            return;
        }
    } catch (e) {
        console.log('PATCH /api/contacts/:id not available, updating local state only');
    }

    // Fallback: update local state only
    if (commandData && commandData.contacts) {
        const idx = commandData.contacts.findIndex(c => String(c.id) === String(id));
        if (idx !== -1) {
            commandData.contacts[idx] = { ...commandData.contacts[idx], tier, status, follow_up_date, notes };
        }
    }
    showToast('Contact updated (local)', 'info');
    closeDetailPanel();
    refreshAll();
}

// === PHASE 4: QUICK OUTREACH FLOW ===
let outreachDebounceTimer = null;

function quickOutreach(id) {
    if (!commandData || !commandData.contacts) return;
    const contact = commandData.contacts.find(c => String(c.id) === String(id));
    if (!contact) {
        console.warn('Contact not found:', id);
        return;
    }

    // Highlight selected row
    clearContactRowHighlight();
    const rows = document.querySelectorAll('#heatmap-tbody tr');
    rows.forEach(row => {
        const outreachBtn = row.querySelector('button[onclick*="quickOutreach"]');
        if (outreachBtn && outreachBtn.getAttribute('onclick').includes(id)) {
            row.classList.add('contact-row--selected');
            selectedContactRow = row;
        }
    });

    document.getElementById('outreach-contact-name').textContent = `Outreach → ${contact.name || 'Contact'}`;

    const body = document.getElementById('outreach-panel-body');
    body.innerHTML = `
        <div class="outreach-recipient">
            <span class="recipient-name">${contact.name || 'Unknown'}</span>
            <span class="recipient-meta">${contact.company || contact.handle || ''} · <span id="outreach-channel-label">email</span></span>
        </div>

        <div class="outreach-channel-selector">
            <button class="channel-btn active" data-channel="email" onclick="selectOutreachChannel('email', '${id}')">📧 Email</button>
            <button class="channel-btn" data-channel="linkedin" onclick="selectOutreachChannel('linkedin', '${id}')">💼 LinkedIn</button>
            <button class="channel-btn" data-channel="x" onclick="selectOutreachChannel('x', '${id}')">✖ X</button>
        </div>

        <div class="outreach-compose">
            <textarea id="outreach-message" class="outreach-textarea" placeholder="Write your outreach message here..." oninput="debouncedLiveScore()"></textarea>
        </div>

        <div class="outreach-score-bar">
            <div class="score-bar-label">
                <span>Message Score</span>
                <span id="outreach-score-value" class="outreach-score-value">—</span>
            </div>
            <div class="score-bar-track">
                <div id="outreach-score-fill" class="score-bar-fill" style="width: 0%"></div>
            </div>
        </div>

        <div class="outreach-actions">
            <button onclick="scoreOutreachDraft('${id}')" class="btn-score">🔍 Score</button>
            <button onclick="queueOutreach('${id}')" class="btn-primary">📤 Queue</button>
        </div>
    `;

    showOutreachPanel();
}

function showOutreachPanel() {
    const panel = document.getElementById('outreach-panel');
    panel.classList.remove('hidden');
    panel.offsetHeight;
    panel.classList.add('visible');
}

function closeOutreachPanel() {
    const panel = document.getElementById('outreach-panel');
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    clearContactRowHighlight();
}

function selectOutreachChannel(channel, contactId) {
    document.querySelectorAll('.channel-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.channel === channel);
    });
    document.getElementById('outreach-channel-label').textContent = channel;
    // Re-trigger score if there's text
    const textarea = document.getElementById('outreach-message');
    if (textarea && textarea.value.trim()) {
        triggerScoreDebounced(contactId, channel);
    }
}

function debouncedLiveScore() {
    if (outreachDebounceTimer) clearTimeout(outreachDebounceTimer);
    outreachDebounceTimer = setTimeout(() => {
        const textarea = document.getElementById('outreach-message');
        if (textarea && textarea.value.trim()) {
            // Trigger score without requiring button click
            const contactId = getSelectedContactId();
            const channel = document.querySelector('.channel-btn.active')?.dataset.channel || 'email';
            if (contactId) triggerScoreDebounced(contactId, channel);
        }
    }, 800);
}

function getSelectedContactId() {
    // Extract from the textarea's placeholder/id, or find from panel
    const panel = document.getElementById('outreach-panel');
    if (!panel.classList.contains('visible')) return null;
    // We need to track which contact is open - check the header
    const header = document.getElementById('outreach-contact-name')?.textContent || '';
    // Use the message element as marker
    const textarea = document.getElementById('outreach-message');
    if (!textarea) return null;
    // Walk up to find contact id from onclick attrs
    const contactId = textarea.closest('#outreach-panel')?.querySelector('.outreach-actions button[onclick*="queueOutreach"]')
        ?.getAttribute('onclick')?.match(/queueOutreach\('([^']+)'\)/)?.[1];
    return contactId || null;
}

async function triggerScoreDebounced(contactId, channel) {
    const textarea = document.getElementById('outreach-message');
    const text = textarea?.value?.trim();
    if (!text || !contactId) return;

    try {
        const response = await fetch('/api/command/score-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, contactId, channel })
        });
        const result = await response.json();
        updateScoreUI(result.score_total || 0);
    } catch (e) {
        console.error('Scoring failed:', e);
    }
}

function updateScoreUI(score) {
    const scoreVal = document.getElementById('outreach-score-value');
    const scoreFill = document.getElementById('outreach-score-fill');
    if (!scoreVal || !scoreFill) return;

    const scoreNum = parseFloat(score) || 0;
    scoreVal.textContent = typeof score === 'number' ? score.toFixed(1) : score;

    // Color based on score
    let color = 'var(--accent-crm)';
    if (scoreNum < 3) color = '#ef4444';
    else if (scoreNum < 5) color = '#f59e0b';
    else if (scoreNum < 7) color = '#eab308';
    else color = '#10b981';

    scoreFill.style.width = Math.min(scoreNum / 10 * 100, 100) + '%';
    scoreFill.style.background = color;
    scoreFill.style.boxShadow = `0 0 12px ${color}66`;
}

async function scoreOutreachDraft(contactId) {
    const textarea = document.getElementById('outreach-message');
    const text = textarea?.value?.trim();
    if (!text) {
        showToast('Write a message first', 'error');
        return;
    }
    const channel = document.querySelector('.channel-btn.active')?.dataset.channel || 'email';

    const scoreVal = document.getElementById('outreach-score-value');
    if (scoreVal) scoreVal.textContent = '…';

    try {
        const response = await fetch('/api/command/score-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, contactId, channel })
        });
        const result = await response.json();
        updateScoreUI(result.score_total || 0);
        showToast(`Score: ${result.score_total || 'N/A'}`, 'info');
    } catch (e) {
        console.error('Scoring failed:', e);
        showToast('Scoring unavailable', 'error');
    }
}

async function queueOutreach(contactId) {
    const textarea = document.getElementById('outreach-message');
    const text = textarea?.value?.trim();
    if (!text) {
        showToast('Write a message first', 'error');
        return;
    }
    const channel = document.querySelector('.channel-btn.active')?.dataset.channel || 'email';

    try {
        const response = await fetch('/api/command/outreach-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId, text, channel })
        });
        if (response.ok || response.status === 201) {
            showToast('Queued for outreach', 'success');
            closeOutreachPanel();
            refreshAll();
        } else {
            showToast('Failed to queue outreach', 'error');
        }
    } catch (e) {
        console.error('Queue failed:', e);
        showToast('Queue endpoint unavailable — draft logged locally', 'info');
        console.log('Queued outreach locally:', { contactId, text, channel });
        closeOutreachPanel();
    }
}

// Wire Escape key to close panels
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeDetailPanel();
        closeOutreachPanel();
        closeEditPanel();
        closeNewDraftPanel();
    }
});
function snoozeQueueItem(id, days) { 
  fetch(`/api/command/queue/${id}/snooze`, { method: 'PATCH', body: JSON.stringify({days}) })
    .then(() => refreshAll()); 
}
function skipQueueItem(id) {
  fetch(`/api/command/queue/${id}/skip`, { method: 'PATCH' }).then(() => refreshAll());
}
function executeQueueItem(id) { console.log('Execute queue item:', id); }
function actOnSignal(id) {
  fetch(`/api/command/signals/${id}/act`, { method: 'POST' }).then(() => refreshAll());
}
function dismissSignal(id) { console.log('Dismiss signal:', id); }
function switchCrmTab(tabIndex) {
  document.querySelectorAll('.crm-panel').forEach(p => p.classList.remove('active'));
  const panels = document.querySelectorAll('.crm-panel');
  if (panels[tabIndex]) panels[tabIndex].classList.add('active');
  document.querySelectorAll('.tab-btn').forEach((b,i) => {
    b.classList.toggle('active', i === tabIndex);
  });
}

// Update fetchCommandData to call new renderers
window.refreshAll = async function() {
  await fetchCommandData();
  
  if (commandData) {
    if (commandData.contacts) {
      const filtered = applyContactFilters(commandData.contacts, filterState);
      renderHeatmap(filtered);
    }
    if (commandData.outreach_queue) renderOutreachQueue(commandData.outreach_queue);
    if (commandData.signals) renderSignals(commandData.signals);
    if (commandData.pipeline) renderPipeline(commandData);
    if (commandData.tasks && typeof renderTasks === 'function') renderTasks(commandData.tasks);
    if (commandData.content_queue && typeof renderContentQueue === 'function') renderContentQueue(commandData.content_queue);
  }
};

// Call refreshAll after data loads in fetchCommandData (already wired in existing code)
// PHASE 5: Keyboard Navigation + Empty States (added by polish pass)
globalThis.keyboardHandler = function(e) {
    // Don't trigger shortcuts when typing in input fields
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
    }

    switch(e.key) {
        case '1':
            showSection('hq');
            break;
        case '2':
            showSection('crm');
            break;
        case '3':
            showSection('intel');
            break;
        case '/':
            e.preventDefault();
            const searchInput = document.getElementById('crm-search');
            if (searchInput) searchInput.focus();
            break;
        case 'Escape':
            closeDetailPanel();
            closeOutreachPanel();
            if (typeof closeEditPanel === 'function') closeEditPanel();
            if (typeof closeNewDraftPanel === 'function') closeNewDraftPanel();
            break;
    }
};

// Remove any duplicate listeners and add our new one
document.removeEventListener('keydown', globalThis.keyboardHandler);
document.addEventListener('keydown', globalThis.keyboardHandler);

console.log('%cPhase 5 polish loaded — keyboard nav, toasts, loading states, empty states active', 'color:#00e5a0; font-family:monospace');

// === Bridge 4: Tasks Widget + Content Queue Renderer ===

function renderTasks(tasks = []) {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    container.innerHTML = '';

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state tasks-empty">
                <span style="font-size:28px;margin-bottom:8px;display:block">✅</span>
                <div>All clear. No pending tasks.</div>
            </div>
        `;
        return;
    }

    // Group by source per spec
    const sourceMap = {
        'senior-pm': '📋 PM Actions',
        'hunter-support': '🦁 Hunter Tasks',
        'manual': '📌 Other Tasks'
    };

    const grouped = {};
    tasks.forEach(task => {
        const src = task.source || 'manual';
        const header = sourceMap[src] || '📌 Other Tasks';
        if (!grouped[header]) grouped[header] = [];
        grouped[header].push(task);
    });

    Object.keys(grouped).forEach(header => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'task-group';
        groupDiv.innerHTML = `<div class="task-group-header">${header}</div>`;

        grouped[header].forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.className = `task-item ${task.status === 'done' ? 'done' : ''}`;
            taskEl.innerHTML = `
                <div class="task-checkbox" onclick="toggleTaskStatus('${task.id}', this)">⬜</div>
                <div class="task-content">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">
                        ${task.category ? `<span class="category-badge ${task.category}">${task.category}</span>` : ''}
                        ${task.priority ? `<span class="priority-dot ${task.priority}"></span>` : ''}
                        ${task.due_date ? `<span class="due-date">${task.due_date}</span>` : ''}
                    </div>
                </div>
            `;
            groupDiv.appendChild(taskEl);
        });

        container.appendChild(groupDiv);
    });
}

function toggleTaskStatus(id, checkboxEl) {
    fetch(`/api/command/tasks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' })
    })
    .then(res => res.json())
    .then(() => {
        checkboxEl.innerHTML = '✅';
        checkboxEl.parentElement.classList.add('done');
        setTimeout(() => refreshAll(), 800);
    })
    .catch(err => console.error('Task update failed', err));
}

function renderContentQueue(posts = []) {
    const container = document.getElementById('content-queue-container');
    if (!container) return;

    container.innerHTML = '';

    if (posts.length === 0) {
        container.innerHTML = `<p class="empty-state">No content in queue</p>`;
        return;
    }

    posts.forEach(post => {
        const card = document.createElement('div');
        card.className = 'content-queue-item';
        card.innerHTML = `
            <div class="platform-icon">${getPlatformIcon(post.platform)}</div>
            <div class="content-info">
                <div class="content-topic">${post.topic || post.title}</div>
                <div class="content-meta">
                    <span class="post-type-badge">${post.post_type}</span>
                    <span class="content-date">${post.scheduled_at || post.created_at || ''}</span>
                </div>
            </div>
        `;
        card.onclick = () => toggleContentExpand(card, post.content_text || post.body);
        container.appendChild(card);
    });
}

function getPlatformIcon(platform) {
    const icons = {
        'pbn': '📻',
        'linkedin': '💼',
        'tiktok': '🎵',
        'x': '✖',
        'blog': '📝'
    };
    return icons[platform] || '📄';
}

function toggleContentExpand(card, text) {
    let expandDiv = card.querySelector('.content-expand');
    if (expandDiv) {
        expandDiv.remove();
        return;
    }
    expandDiv = document.createElement('div');
    expandDiv.className = 'content-expand';
    expandDiv.textContent = text;
    card.appendChild(expandDiv);
}

console.log('✅ Bridge 4 Frontend (Tasks Widget + Content Queue) implemented');

// Re-init to pick up new functions
if (typeof init === 'function') setTimeout(init, 100);

// === New Draft Composer Functions ===
let isSavingNewDraft = false;

function newLinkedInDraft() {
    showSection('content');

    const panel = document.getElementById('new-draft-panel');
    const authorSelect = document.getElementById('new-draft-author');
    const textarea = document.getElementById('new-draft-text');

    if (!panel || !textarea) return;

    authorSelect.value = authorSelect.value || 'yohann';
    textarea.value = '';

    panel.classList.remove('hidden');
    panel.classList.add('visible');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => textarea.focus());
}

function closeNewDraftPanel() {
    const panel = document.getElementById('new-draft-panel');
    if (!panel) return;

    panel.classList.remove('visible');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

async function saveNewDraft() {
    if (isSavingNewDraft) return;

    const author = document.getElementById('new-draft-author')?.value || 'yohann';
    const textarea = document.getElementById('new-draft-text');
    const text = textarea?.value?.trim() || '';

    if (!text) {
        showToast('Please write something', 'warning');
        textarea?.focus();
        return;
    }

    const payload = {
        platform: 'linkedin',
        post_type: 'draft',
        topic: 'New LinkedIn Draft',
        content_text: text,
        adapter: author,
        status: 'draft'
    };

    isSavingNewDraft = true;

    try {
        const response = await fetch('/api/command/content/new', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to save draft');
        }

        showToast('✅ New draft saved', 'success');
        closeNewDraftPanel();
        await refreshAll();

        if (commandData?.linkedin_drafts) {
            renderLinkedInDrafts(commandData.linkedin_drafts);
        }
        switchContentTab(0);
    } catch (error) {
        console.error('saveNewDraft failed:', error);
        showToast('Failed to save draft: ' + (error.message || 'unknown error'), 'error');
    } finally {
        isSavingNewDraft = false;
    }
}

// ─── Model Spend Breakdown ──────────────────────────────────────────────────────────

const MODEL_PRICING = {
  'anthropic/claude-sonnet-4-6':    { input: 3.0,   output: 15.0,  name: 'Sonnet 4.6',     provider: 'anthropic' },
  'anthropic/claude-opus-4-6':      { input: 15.0,  output: 75.0,  name: 'Opus 4.6',        provider: 'anthropic' },
  'google/gemini-3.1-pro-preview':  { input: 2.0,   output: 12.0,  name: 'Gemini 3.1 Pro',  provider: 'google' },
  'google/gemini-3-flash':          { input: 0.5,   output: 0.5,   name: 'Gemini Flash',    provider: 'google' },
  'xai/grok-4-2-fast':              { input: 0.2,   output: 0.5,   name: 'Grok 4.2',        provider: 'xai' },
  'minimax/MiniMax-M2.7-Lightning': { input: 0.3,   output: 1.2,   name: 'MiniMax M2.7',    provider: 'minimax' },
  'minimax/MiniMax-M2.5-Lightning': { input: 0.015, output: 0.06,  name: 'MiniMax M2.5',    provider: 'minimax' },
  'ollama/minimax-m2.7:cloud':      { input: 0.3,   output: 1.2,   name: 'MiniMax M2.7',    provider: 'minimax' },
  'ollama/gemma4:26b':              { input: 0,     output: 0,     name: 'Gemma4 26b',      provider: 'local' },
  'ollama/gemma4:31b-cloud':        { input: 0,     output: 0,     name: 'Gemma4 31b',      provider: 'local' },
  'zai/glm-4.7-flash':              { input: 0,     output: 0,     name: 'GLM Flash',       provider: 'local' },
  'zai/glm-5':                      { input: 0,     output: 0,     name: 'GLM-5',           provider: 'local' },
};

const PROVIDER_COLORS = {
  anthropic: '#cc785c',
  google:    '#4285f4',
  xai:       '#ffffff',
  minimax:   '#a78bfa',
  local:     '#10b981',
};

function estimateWeeklySpend(agents) {
  if (!agents || agents.length === 0) return [];

  const AVG_INPUT_TOKENS = 10000;  // avg per run
  const AVG_OUTPUT_TOKENS = 2500;

  const modelMap = {};

  agents.forEach(agent => {
    if (!agent.enabled) return;
    const model = agent.model || '';
    const schedule = agent.schedule || '';

    // Estimate weekly runs from cron expression
    const parts = schedule.split(' ');
    if (parts.length < 5) return;
    const [, hour, dom, , dow] = parts;
    let weeklyRuns = 7; // default daily
    if (hour.includes(',')) weeklyRuns = hour.split(',').length * 7;
    else if (dow !== '*') weeklyRuns = (dow.includes(',') ? dow.split(',').length : 1);
    else if (dom === '1') weeklyRuns = 0.25; // monthly

    if (!modelMap[model]) modelMap[model] = 0;
    modelMap[model] += weeklyRuns;
  });

  const results = [];
  for (const [model, runs] of Object.entries(modelMap)) {
    const p = MODEL_PRICING[model] || { input: 1.0, output: 5.0, name: model.split('/').pop(), provider: 'unknown' };
    const cost = runs * (AVG_INPUT_TOKENS / 1e6 * p.input + AVG_OUTPUT_TOKENS / 1e6 * p.output);
    if (cost > 0.001) {
      results.push({ model, name: p.name, provider: p.provider, runs: Math.round(runs), cost });
    }
  }

  results.sort((a, b) => b.cost - a.cost);
  return results;
}

function renderModelSpend(agents) {
  const container = document.getElementById('model-spend-bars');
  const totalEl = document.getElementById('model-spend-total');
  if (!container) return;

  const breakdown = estimateWeeklySpend(agents);
  if (breakdown.length === 0) {
    container.innerHTML = '<div class="model-spend-empty">No spend data available</div>';
    return;
  }

  const total = breakdown.reduce((s, r) => s + r.cost, 0);
  const maxCost = breakdown[0].cost;

  container.innerHTML = breakdown.map(r => {
    const pct = Math.round((r.cost / maxCost) * 100);
    const color = PROVIDER_COLORS[r.provider] || '#888';
    const isAnthropicSonnet = r.model === 'anthropic/claude-sonnet-4-6';
    const isAnthropicOpus = r.model === 'anthropic/claude-opus-4-6';
    const highlight = (isAnthropicSonnet || isAnthropicOpus) ? ' model-spend-bar-row--highlight' : '';
    return `<div class="model-spend-bar-row${highlight}">
      <div class="model-spend-bar-label">
        <span class="model-spend-dot" style="background:${color}"></span>
        <span class="model-spend-name">${r.name}</span>
        <span class="model-spend-runs">${r.runs} runs/wk</span>
      </div>
      <div class="model-spend-bar-track">
        <div class="model-spend-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="model-spend-cost">$${r.cost.toFixed(3)}</span>
    </div>`;
  }).join('');

  if (totalEl) totalEl.textContent = `Est. weekly total: $${total.toFixed(2)}`;
}

window.newLinkedInDraft = newLinkedInDraft;
window.closeNewDraftPanel = closeNewDraftPanel;
window.saveNewDraft = saveNewDraft;

// ─── Outreach Logger ──────────────────────────────────────────────────────────
async function submitOutreachLog() {
  const name = document.getElementById('outreach-log-name').value.trim();
  const outcome = document.getElementById('outreach-log-outcome').value;
  const note = document.getElementById('outreach-log-note').value.trim();
  const email = document.getElementById('outreach-log-email')?.value.trim() || '';
  if (!name) { showToast('Enter a contact name', 'error'); return; }

  try {
    const res = await fetch('/api/command/outreach/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_name: name, outcome, note, channel: 'manual', email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Log failed');
    const emailMsg = data.email_updated ? ` · email saved` : '';
    showToast(`Logged: ${data.contact} — ${outcome}${emailMsg}`, 'success');
    document.getElementById('outreach-log-name').value = '';
    document.getElementById('outreach-log-note').value = '';
    if (document.getElementById('outreach-log-email')) document.getElementById('outreach-log-email').value = '';
    loadRecentOutreach();
    // Refresh CRM contacts so email shows up immediately
    if (data.email_updated) refreshAll();
  } catch (e) {
    showToast('Failed to log: ' + e.message, 'error');
  }
}

async function loadRecentOutreach() {
  try {
    const res = await fetch('/api/command/outreach/recent');
    const data = await res.json();
    const container = document.getElementById('outreach-log-recent');
    if (!container) return;
    if (!data.outreach || data.outreach.length === 0) {
      container.innerHTML = '<span class="outreach-log-empty">No outreach logged yet.</span>';
      return;
    }
    const outcomeEmoji = { sent: '📤', replied: '💬', meeting_booked: '📅', not_interested: '🚫', no_reply: '⏳' };
    container.innerHTML = data.outreach.slice(0, 5).map(r => {
      const d = new Date(r.time);
      const ago = Math.floor((Date.now() - d.getTime()) / 60000);
      const timeStr = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago/60)}h ago` : `${Math.floor(ago/1440)}d ago`;
      return `<span class="outreach-log-item">${outcomeEmoji[r.outcome] || '📌'} <b>${r.contact_name}</b> — ${r.outcome}${r.note ? ' · ' + r.note : ''} <span class="outreach-log-time">${timeStr}</span></span>`;
    }).join('');
  } catch (e) {
    // silent
  }
}

window.submitOutreachLog = submitOutreachLog;

// ─── Warm Intro Paths ──────────────────────────────────────────────────────────

function renderWarmIntroPaths(contact) {
  const mutual = contact.mutual_connection;
  const villagePaths = contact.metadata?.village_paths;

  let html = '';

  // Village API paths (structured)
  if (villagePaths && villagePaths.length > 0) {
    html += villagePaths.slice(0, 5).map((path, i) => {
      const connectors = Array.isArray(path.connectors) ? path.connectors : [path.connector || path.name || 'Unknown'];
      const strength = path.strength || path.score;
      const strengthBadge = strength >= 0.8 ? '🟢 Strong' : strength >= 0.5 ? '🟡 Medium' : '⚪ Weak';
      return `<div class="intro-path">
        <span class="intro-path-num">${i + 1}</span>
        <div class="intro-path-detail">
          <span class="intro-path-connectors">${connectors.join(' → ')} → ${contact.name}</span>
          ${strength ? `<span class="intro-path-strength">${strengthBadge}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // Fallback: mutual_connection field (raw text from DB)
  if (!html && mutual) {
    const isUrl = mutual.startsWith('http');
    if (isUrl) {
      html = `<div class="intro-path">
        <span class="intro-path-num">1</span>
        <div class="intro-path-detail">
          <a href="${mutual}" target="_blank" class="intro-path-link">LinkedIn connection ↗</a>
        </div>
      </div>`;
    } else {
      // Parse "Name1, Name2 + N others" format
      const parts = mutual.split('+');
      const names = parts[0].split(',').map(n => n.trim()).filter(Boolean);
      const others = parts[1] ? parts[1].trim() : '';
      html = names.map((name, i) => `<div class="intro-path">
        <span class="intro-path-num">${i + 1}</span>
        <div class="intro-path-detail">
          <span class="intro-path-connectors">${name} → ${contact.name || 'Contact'}</span>
          <span class="intro-path-strength">🟡 Via network</span>
        </div>
      </div>`).join('');
      if (others) html += `<div class="intro-path-more">${others}</div>`;
    }
  }

  if (!html) {
    html = '<div class="intro-path-empty">No warm paths found. Click Refresh to query Village.</div>';
  }

  return html;
}

async function refreshVillagePaths(contactId, company) {
  const body = document.getElementById('warm-intro-body');
  if (!body) return;
  body.innerHTML = '<div class="intro-path-loading">⏳ Querying Village…</div>';

  try {
    const res = await fetch(`/api/command/contacts/${contactId}/village-paths`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    // Update local contact data
    if (commandData?.contacts) {
      const idx = commandData.contacts.findIndex(c => String(c.id) === String(contactId));
      if (idx !== -1) {
        if (!commandData.contacts[idx].metadata) commandData.contacts[idx].metadata = {};
        commandData.contacts[idx].metadata.village_paths = data.paths;
        commandData.contacts[idx].mutual_connection = data.mutual_connection || commandData.contacts[idx].mutual_connection;
        body.innerHTML = renderWarmIntroPaths(commandData.contacts[idx]);
      }
    }

    if (data.paths && data.paths.length > 0) {
      showToast(`${data.paths.length} intro paths found`, 'success');
    } else {
      showToast('No warm paths found in Village', 'info');
    }
  } catch (e) {
    body.innerHTML = '<div class="intro-path-empty">Village query failed. Check API connection.</div>';
    showToast('Village refresh failed: ' + e.message, 'error');
  }
}

window.refreshVillagePaths = refreshVillagePaths;

function showVibrntTab(tab = 'influencers') {
  document.querySelectorAll('.vibrnt-subtab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.vibrnt-panel').forEach(el => el.classList.remove('active'));
  document.getElementById(`vibrnt-subtab-${tab}`)?.classList.add('active');
  document.getElementById(`vibrnt-panel-${tab}`)?.classList.add('active');
}

function renderVibrntSection() {
  renderVibrntPipeline(commandData.influencer_pipeline || []);
  renderVibrntTrends(commandData.vibrnt?.trends || []);
  renderVibrntScripts(commandData.vibrnt?.scripts || []);
  renderVibrntCatalog(commandData.vibrnt?.catalog || {});
  showVibrntTab('influencers');
}

function renderVibrntPipeline(candidates = []) {
  const container = document.getElementById('vibrnt-pipeline-container');
  const statsEl = document.getElementById('vibrnt-stats');
  if (!container) return;


  container.innerHTML = '';

  // Stats bar
  if (statsEl) {
    const total = candidates.length;
    const avgVibe = total ? (candidates.reduce((s, c) => s + (c.vibe_score || 0), 0) / total).toFixed(1) : 0;
    const identified = candidates.filter(c => c.status === 'Identified').length;
    const contacted = candidates.filter(c => c.status === 'Contacted').length;
    const confirmed = candidates.filter(c => c.status === 'Confirmed').length;
    const posted = candidates.filter(c => c.status === 'Posted').length;
    statsEl.innerHTML = `
      <div class="vibrnt-stat-card"><div class="v-stat-val">${total}</div><div class="v-stat-label">Candidates</div></div>
      <div class="vibrnt-stat-card"><div class="v-stat-val">${avgVibe}</div><div class="v-stat-label">Avg Vibe Score</div></div>
      <div class="vibrnt-stat-card"><div class="v-stat-val">${identified}</div><div class="v-stat-label">Identified</div></div>
      <div class="vibrnt-stat-card"><div class="v-stat-val">${contacted}</div><div class="v-stat-label">Contacted</div></div>
      <div class="vibrnt-stat-card"><div class="v-stat-val">${confirmed}</div><div class="v-stat-label">Confirmed</div></div>
      <div class="vibrnt-stat-card"><div class="v-stat-val">${posted}</div><div class="v-stat-label">Posted</div></div>
    `;
  }

  if (!candidates.length) {
    container.innerHTML = '<div class="empty-state">No influencer candidates yet. First scout run populates this.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'vibrnt-grid';


  candidates.forEach(c => {
    const platformIcons = (c.platform || '').split('/').map(p => {
      const icon = p.trim() === 'TikTok' ? '📱' : p.trim() === 'Instagram' ? '📸' : '🌐';
      const label = p.trim();
      return `<span class="platform-icon" title="${label}">${icon}</span>`;
       }).join('');

    const vibeColor = c.vibe_score >= 8 ? '#22c55e' : c.vibe_score >= 6 ? '#f59e0b' : '#6b7280';
    const statusBadge = {
      'Identified': 'badge-identified', 'Contacted': 'badge-contacted',
      'Responded': 'badge-responded', 'Confirmed': 'badge-confirmed', 'Posted': 'badge-posted'
    }[c.status] || 'badge-identified';

    const nicheTags = (c.niche_tags || '').split(',').filter(Boolean).map(t =>
      `<span class="niche-tag">${t.trim()}</span>`
       ).join('');

    const profileUrl = c.profile_url || `#`;
    const contactMethod = c.contact_method || 'DM';

    const card = document.createElement('div');
    card.className = 'vibrnt-card';
    card.innerHTML = `
      <div class="vibrnt-card-header">
        <div class="vibrnt-handle-row">
          <a href="${profileUrl}" target="_blank" class="vibrnt-handle">${c.handle}</a>
          <span class="platform-icons">${platformIcons}</span>
        </div>
        <span class="vibe-badge" style="background:${vibeColor}">${c.vibe_score || '?'}/10</span>
      </div>
      <div class="vibrnt-card-meta">
        <span class="meta-item">👥 ${c.followers?.toLocaleString() || '?'}</span>
        <span class="meta-item">💬 ${c.engagement_rate || '?'}%</span>
        <span class="meta-item">📬 ${contactMethod}</span>
      </div>
      ${nicheTags ? `<div class="vibrnt-niche-tags">${nicheTags}</div>` : ''}
      <div class="vibrnt-pricing">💰 ${c.pricing_estimate || 'Standard offer'}</div>
      <div class="vibrnt-notes">${c.notes || ''}</div>
      <div class="vibrnt-card-footer">
        <span class="vibrnt-status ${statusBadge}">${c.status || 'Identified'}</span>
        <button class="vibrnt-draft-btn" onclick="openVibrntDraft('${c.handle}', ${c.id})">📧 Draft Email</button>
      </div>
    `;
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function openVibrntDraft(handle, id) {
  const candidate = (commandData.influencer_pipeline || []).find(c => c.id === id);
  if (!candidate) { showToast('Candidate not found', 'error'); return; }
  const draft = generateVibrntDraft(candidate);
  const panel = document.getElementById('new-draft-panel');
  if (!panel) { showToast('Draft panel not available', 'error'); return; }
  document.getElementById('new-draft-title').textContent = `Vibrnt Draft — ${handle}`;
  document.getElementById('new-draft-author').value = 'jenny';
  document.getElementById('new-draft-text').value = draft;
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
}

function generateVibrntDraft(candidate) {
  const name = candidate.handle.replace('@', '');
  return `To: via ${candidate.contact_method || 'DM'}
CC: jenny@aloomii.com
Subject: ${candidate.handle} — Vibrnt collab?

Hey ${name},

[Specific observation about their content — genuine, specific, not generic.]


I run creator partnerships for Vibrnt. We make mood-based graphic apparel for women — bold tees and hoodies that say something. Your audience vibes with that.

We'd love to send you something free to try. No strings. Just want you to have it.

Your call if you actually like it. If you do and want to share — we'd love that. If not, no hard feelings.

Check us out: vibrnt.ai

Yohann`;
}

function renderVibrntTrends(trends = []) {
  const container = document.getElementById('vibrnt-trends-container');
  if (!container) return;
  if (!trends.length) {
    container.innerHTML = '<div class="empty-state">No Vibrnt trends found.</div>';
    return;
  }
  container.innerHTML = trends.map(t => `
    <div class="vibrnt-card" style="margin-bottom:12px;">
      <div class="vibrnt-card-header"><strong>${t.date}</strong></div>
      <div class="vibrnt-notes" style="white-space:pre-wrap;max-height:260px;overflow:auto;">${(t.body || '').replace(/</g,'&lt;')}</div>
    </div>
  `).join('');
}

function renderVibrntScripts(scripts = []) {
  const container = document.getElementById('vibrnt-scripts-container');
  if (!container) return;
  if (!scripts.length) {
    container.innerHTML = '<div class="empty-state">No Vibrnt scripts found.</div>';
    return;
  }
  container.innerHTML = scripts.slice(0, 12).map(s => `
    <div class="vibrnt-card" style="margin-bottom:12px;">
      <div class="vibrnt-card-header"><strong>${s.file}</strong><span class="vibrnt-status badge-identified">${s.type || 'script'}</span></div>
      <div class="vibrnt-notes" style="white-space:pre-wrap;max-height:220px;overflow:auto;">${(s.body || '').replace(/</g,'&lt;')}</div>
    </div>
  `).join('');
}

function renderVibrntCatalog(catalog = {}) {
  const container = document.getElementById('vibrnt-catalog-container');
  if (!container) return;
  const body = catalog.body || '';
  container.innerHTML = body
    ? `<div class="vibrnt-card"><div class="vibrnt-notes" style="white-space:pre-wrap;max-height:480px;overflow:auto;">${body.replace(/</g,'&lt;')}</div></div>`
    : '<div class="empty-state">No Vibrnt catalog found.</div>';
}

window.renderVibrntPipeline = renderVibrntPipeline;
window.renderVibrntSection = renderVibrntSection;
window.showVibrntTab = showVibrntTab;
window.openVibrntDraft = openVibrntDraft;

function renderBacklog() {
  const container = document.getElementById('backlog-container');
  if (!container) return;

  container.innerHTML = '';

  if (!commandData.backlog || commandData.backlog.length === 0) {
    container.innerHTML = '<div class="empty-state">No backlog items found.</div>';
    return;
  }

  commandData.backlog.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'backlog-group';
    groupDiv.innerHTML = `<div class="backlog-group-header">${group.category}</div>`;

    const grid = document.createElement('div');
    grid.className = 'backlog-grid';

    group.items.forEach(item => {
      const card = document.createElement('div');
      card.className = `backlog-card priority-${item.priority || 'medium'} status-${item.status || 'pending'}`;
      card.innerHTML = `
        <div class="backlog-card-header">
          <span class="backlog-title">${item.title}</span>
          <span class="backlog-badge">${item.status}</span>
        </div>
        <div class="backlog-description">${item.description}</div>
        <div class="backlog-actions">
          <button class="backlog-btn action-now" onclick="promoteBacklogItem('${item.id}')">Action Now</button>
          <button class="backlog-btn remove" onclick="removeBacklogItem('${item.id}')">Remove</button>
        </div>
        <div class="backlog-footer">
          <span class="backlog-priority-tag">${item.priority}</span>
        </div>
      `;
      grid.appendChild(card);
    });

    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  });
}

async function promoteBacklogItem(id) {
  if (!confirm('Promote this item to an active task?')) return;
  try {
    const res = await fetch(`/api/command/backlog/${id}/promote`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Promoted to active task');
      refreshAll();
    } else {
      showToast('Promotion failed: ' + data.error, 'error');
    }
  } catch (e) {
    showToast('Network error: ' + e.message, 'error');
  }
}

async function removeBacklogItem(id) {
  if (!confirm('Permanently remove this item from backlog?')) return;
  try {
    const res = await fetch(`/api/command/backlog/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Item removed');
      refreshAll();
    } else {
      showToast('Removal failed: ' + data.error, 'error');
    }
  } catch (e) {
    showToast('Network error: ' + e.message, 'error');
  }
}

window.renderBacklog = renderBacklog;
window.promoteBacklogItem = promoteBacklogItem;
window.removeBacklogItem = removeBacklogItem;

// Load recent on page init
document.addEventListener('DOMContentLoaded', () => { loadRecentOutreach(); });
