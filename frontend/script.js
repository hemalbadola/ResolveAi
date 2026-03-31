let currentUser = null;

const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const userView = document.getElementById('user-view');
const adminView = document.getElementById('admin-view');
const toast = document.getElementById('toast');

// Auth Elements
const authContainer = document.getElementById('auth-container');
const signUpToggle = document.getElementById('signUpToggle');
const signInToggle = document.getElementById('signInToggle');
const signUpBtn = document.getElementById('signUpBtn');
const signInBtn = document.getElementById('signInBtn');

const roleToggleUp = document.getElementById('role-toggle-up');
const roleToggleIn = document.getElementById('role-toggle-in');
const labelUserUp = document.getElementById('label-user-up');
const labelAdminUp = document.getElementById('label-admin-up');
const labelUserIn = document.getElementById('label-user-in');
const labelAdminIn = document.getElementById('label-admin-in');

// Status stages
const STATUS_STAGES = [
    'Pending', 'Under Review', 'Assigned', 'In Progress',
    'Awaiting Response', 'Resolved', 'Closed', 'Rejected'
];

// Sliding Animation
signUpToggle.addEventListener('click', () => authContainer.classList.add("right-panel-active"));
signInToggle.addEventListener('click', () => authContainer.classList.remove("right-panel-active"));

// Role Toggles
roleToggleUp.addEventListener('change', () => {
    const isAdmin = roleToggleUp.checked;
    labelUserUp.classList.toggle('active', !isAdmin);
    labelAdminUp.classList.toggle('active', isAdmin);
});
roleToggleIn.addEventListener('change', () => {
    const isAdmin = roleToggleIn.checked;
    labelUserIn.classList.toggle('active', !isAdmin);
    labelAdminIn.classList.toggle('active', isAdmin);
});

// ─── Password Validation (Real-time) ───────────────────────────────────────────

const passwordInput = document.getElementById('password-up');
const rules = {
    length: { el: document.getElementById('rule-length-up'), test: v => v.length >= 8 },
    upper:  { el: document.getElementById('rule-upper-up'),  test: v => /[A-Z]/.test(v) },
    lower:  { el: document.getElementById('rule-lower-up'),  test: v => /[a-z]/.test(v) },
    digit:  { el: document.getElementById('rule-digit-up'),  test: v => /\d/.test(v) },
    special:{ el: document.getElementById('rule-special-up'), test: v => /[@$!%*?&#+\-_]/.test(v) }
};

passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    const rulesContainer = document.getElementById('password-rules-up');
    rulesContainer.style.display = val.length > 0 ? 'block' : 'none';

    for (const [key, rule] of Object.entries(rules)) {
        const passed = rule.test(val);
        rule.el.classList.toggle('pass', passed);
        rule.el.classList.toggle('fail', !passed);
        rule.el.querySelector('i').className = passed ? 'fas fa-check-circle' : 'fas fa-circle';
    }
});

function isPasswordValid(password) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#+\-_])[A-Za-z\d@$!%*?&#+\-_]{8,}$/.test(password);
}

// Filter elements
const searchInput = document.getElementById('search-input');
const filterDept = document.getElementById('filter-dept');
const filterPriority = document.getElementById('filter-priority');
const filterStatus = document.getElementById('filter-status');

// Admin Filter Listeners
[searchInput, filterDept, filterPriority, filterStatus].forEach(el => {
    if (el) el.addEventListener('change', () => loadAllComplaints());
    if (el && el.id === 'search-input') el.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') loadAllComplaints();
    });
});

// ─── Auth ───────────────────────────────────────────────────────────────────────

function init() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    if (token && user) {
        currentUser = user;
        showMainScreen();
    }
}

function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3500);
}

signInBtn.addEventListener('click', async () => {
    const username = document.getElementById('username-in').value;
    const password = document.getElementById('password-in').value;

    if (!username || !password) return showToast('Please fill in all fields');

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({ username: data.username, role: data.role, id: data.id }));
        currentUser = data;
        showMainScreen();
    } catch (e) {
        showToast(e.message);
    }
});

signUpBtn.addEventListener('click', async () => {
    const username = document.getElementById('username-up').value;
    const password = document.getElementById('password-up').value;
    const role = roleToggleUp.checked ? 'admin' : 'user';

    if (!username || !password) return showToast('Please fill in all fields');

    // Client-side password validation
    if (!isPasswordValid(password)) {
        return showToast('Password does not meet requirements');
    }

    if (username.length < 3) {
        return showToast('Username must be at least 3 characters');
    }

    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        showToast('Registered! Please sign in.');
        signInToggle.click();
    } catch (e) {
        showToast(e.message);
    }
});

// ─── Main Screen ────────────────────────────────────────────────────────────────

function showMainScreen() {
    authScreen.style.display = 'none';
    mainScreen.style.display = 'block';
    document.getElementById('user-display').innerHTML = `
        <span>${currentUser.username}</span>
        <small>(${currentUser.role})</small>
    `;
    
    if (currentUser.role === 'admin') {
        adminView.style.display = 'block';
        userView.style.display = 'none';
        loadAllComplaints();
        loadAnalytics();
    } else {
        userView.style.display = 'block';
        adminView.style.display = 'none';
        loadUserComplaints();
    }
}

// ─── Analytics ──────────────────────────────────────────────────────────────────

async function loadAnalytics() {
    try {
        const res = await fetch('/analytics/stats', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        
        document.getElementById('stat-total').textContent = data.total;
        document.getElementById('stat-pending').textContent = data.pending;
        document.getElementById('stat-under-review').textContent = data.underReview || 0;
        document.getElementById('stat-in-progress').textContent = data.inProgress;
        document.getElementById('stat-resolved').textContent = data.resolved;
        document.getElementById('stat-high').textContent = data.highPriority;

        renderChart('dept-chart', data.deptStats, data.total);
        renderChart('category-chart', data.categoryStats, data.total);
    } catch (e) {
        console.error('Stats failed', e);
    }
}

function renderChart(id, stats, total) {
    const container = document.getElementById(id);
    container.innerHTML = stats.map(s => {
        const pct = total > 0 ? (s.count / total * 100).toFixed(0) : 0;
        return `
            <div class="chart-bar-row">
                <div class="chart-label">${s._id}</div>
                <div class="chart-bar-bg"><div class="chart-bar-fill" style="width: ${pct}%"></div></div>
                <div class="chart-value">${s.count}</div>
            </div>
        `;
    }).join('');
}

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// ─── File Upload Handlers ───────────────────────────────────────────────────────
let currentUploadFile = null;
const fileInput = document.getElementById('file-input');
const uploadZone = document.getElementById('file-upload-zone');
const uploadContent = document.getElementById('upload-content');
const uploadPreview = document.getElementById('upload-preview');
const previewFilename = document.getElementById('preview-filename');
const removeFileBtn = document.getElementById('remove-file-btn');
const previewIcon = document.getElementById('preview-icon');

if (uploadZone) {
    uploadZone.addEventListener('click', () => { if (!currentUploadFile) fileInput.click(); });
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); if (!currentUploadFile) uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });
    
    function handleFile(file) {
        if (file.size > 10 * 1024 * 1024) return showToast('File too large (Max 10MB)');
        currentUploadFile = file;
        uploadContent.style.display = 'none';
        uploadPreview.style.display = 'flex';
        previewFilename.textContent = file.name;
        
        if (file.type === 'application/pdf') {
            previewIcon.className = 'fas fa-file-pdf';
            previewIcon.style.color = '#ef4444';
        } else if (file.type.startsWith('image/')) {
            previewIcon.className = 'fas fa-file-image';
            previewIcon.style.color = 'var(--primary)';
        } else {
            previewIcon.className = 'fas fa-file-alt';
            previewIcon.style.color = 'var(--secondary)';
        }
    }
    
    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentUploadFile = null;
        fileInput.value = '';
        uploadContent.style.display = 'flex';
        uploadPreview.style.display = 'none';
    });
}

// ─── Submit Complaint ───────────────────────────────────────────────────────────

document.getElementById('submit-complaint').addEventListener('click', async () => {
    const text = document.getElementById('complaint-text').value;
    if (!text) return showToast('Please enter a complaint');

    const submitBtn = document.getElementById('submit-complaint');
    const originalText = submitBtn.textContent;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = currentUploadFile 
        ? '<i class="fas fa-spinner fa-spin"></i> Parsing AI File...' 
        : '<i class="fas fa-spinner fa-spin"></i> Classifying with AI...';
    submitBtn.style.opacity = '0.7';

    try {
        const formData = new FormData();
        formData.append('complaint', text);
        if (currentUploadFile) formData.append('file', currentUploadFile);

        const res = await fetch('/predict', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submission failed');

        const engineLabel = {
            'nvidia': '🟢 NVIDIA AI',
            'keywords': '🟡 Smart Rules'
        }[data.classifiedBy] || 'AI';

        showToast(`${engineLabel} → ${data.category} (${(data.confidence * 100).toFixed(0)}% confidence)`);
        document.getElementById('complaint-text').value = '';
        if (currentUploadFile && removeFileBtn) removeFileBtn.click();
        loadUserComplaints();
    } catch (e) {
        showToast(e.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = '1';
    }
});

// ─── Load Complaints ────────────────────────────────────────────────────────────

async function loadUserComplaints() {
    try {
        const res = await fetch('/complaints', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        renderComplaints(data, 'user-complaints-list');
    } catch (e) {
        showToast('Failed to load complaints');
    }
}

async function loadAllComplaints() {
    try {
        const query = new URLSearchParams({
            search: searchInput.value,
            department: filterDept.value,
            priority: filterPriority.value,
            status: filterStatus.value
        });
        const res = await fetch(`/complaints?${query}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        renderAdminTable(data);
    } catch (e) {
        showToast('Failed to load complaints');
    }
}

// ─── Status Helpers ─────────────────────────────────────────────────────────────

function statusOptions(currentStatus) {
    return STATUS_STAGES.map(s =>
        `<option value="${s}" ${s === currentStatus ? 'selected' : ''}>${s}</option>`
    ).join('');
}

function getStatusClass(status) {
    const map = {
        'Pending': 'status-pending',
        'Under Review': 'status-under-review',
        'Assigned': 'status-assigned',
        'In Progress': 'status-in-progress',
        'Awaiting Response': 'status-awaiting',
        'Resolved': 'status-resolved',
        'Closed': 'status-closed',
        'Rejected': 'status-rejected'
    };
    return map[status] || '';
}

// ─── Admin Table ────────────────────────────────────────────────────────────────

function renderAdminTable(list) {
    const container = document.getElementById('admin-complaints-list');
    container.innerHTML = list.map(item => `
        <tr class="${item.priority === 'High' ? 'high-priority-row' : ''}">
            <td title="${item._id}" style="font-family: monospace; font-weight: bold; color: var(--primary);">
                #${item._id.slice(-6)}
                ${item.attachment ? `<a href="${item.attachment.url}" target="_blank" title="View Attachment" style="margin-left:5px; color:#6b7280;"><i class="fas fa-paperclip"></i></a>` : ''}
            </td>
            <td>
                <div style="font-weight: 600;">${item.user_id ? item.user_id.username : 'Guest'}</div>
            </td>
            <td class="text-truncate" title="${item.complaint_text}">${item.complaint_text}</td>
            <td>
                <select onchange="updateDepartment('${item._id}', this.value)" class="small-select">
                    <option value="Finance Department" ${item.assigned_department === 'Finance Department' ? 'selected' : ''}>Finance</option>
                    <option value="IT Department" ${item.assigned_department === 'IT Department' ? 'selected' : ''}>IT</option>
                    <option value="Customer Experience" ${item.assigned_department === 'Customer Experience' ? 'selected' : ''}>Experience</option>
                    <option value="Security & Accounts" ${item.assigned_department === 'Security & Accounts' ? 'selected' : ''}>Security</option>
                    <option value="Logistics Department" ${item.assigned_department === 'Logistics Department' ? 'selected' : ''}>Logistics</option>
                </select>
            </td>
            <td><span class="priority-tag priority-${item.priority.toLowerCase()}">${item.priority}</span></td>
            <td>
                <select onchange="updateStatus('${item._id}', this.value)" class="small-select status-select ${getStatusClass(item.status)}">
                    ${statusOptions(item.status)}
                </select>
            </td>
            <td>
                <button class="comment-btn" onclick="openCommentModal('${item._id}', '${encodeURIComponent(item.complaint_text).replace(/'/g, "%27")}')">
                    <i class="fas fa-comments"></i>
                    <span class="comment-count">${(item.comments || []).length}</span>
                </button>
            </td>
            <td style="color: var(--muted); font-size: 0.8rem;">${new Date(item.timestamp).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

// ─── User Complaint Cards ───────────────────────────────────────────────────────

function renderComplaints(list, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = list.map(item => `
        <div class="complaint-item">
            <div class="item-header">
                <strong>ID: ${item._id.slice(-6)}</strong>
                <span class="priority-tag priority-${item.priority.toLowerCase()}">${item.priority}</span>
            </div>
            <p>${item.complaint_text}</p>
            <div class="item-meta">
                <span class="status-badge ${getStatusClass(item.status)}">${item.status}</span>
                <span class="muted">${item.assigned_department}</span>
                <span class="muted">${new Date(item.timestamp).toLocaleDateString()}</span>
                ${item.attachment ? `<a href="${item.attachment.url}" target="_blank" class="muted" style="text-decoration:none;"><i class="fas fa-paperclip"></i> Attachment</a>` : ''}
            </div>
            <button class="comment-thread-btn" onclick="openCommentModal('${item._id}', '${encodeURIComponent(item.complaint_text).replace(/'/g, "%27")}')">
                <i class="fas fa-comments"></i> Discussion (${(item.comments || []).length})
            </button>
        </div>
    `).join('');
}

// ─── Comment Modal ──────────────────────────────────────────────────────────────

let activeComplaintId = null;

window.openCommentModal = async (complaintId, encodedText) => {
    const complaintText = decodeURIComponent(encodedText);
    activeComplaintId = complaintId;
    
    document.getElementById('modal-complaint-info').innerHTML = `
        <p><strong>#${complaintId.slice(-6)}</strong> — ${complaintText.slice(0, 120)}${complaintText.length > 120 ? '...' : ''}</p>
    `;
    
    document.getElementById('comment-modal').style.display = 'flex';
    document.getElementById('comment-input').value = '';
    
    await loadComments(complaintId);
};

document.getElementById('close-comment-modal').addEventListener('click', () => {
    document.getElementById('comment-modal').style.display = 'none';
    activeComplaintId = null;
    // Refresh data after closing
    if (currentUser.role === 'admin') {
        loadAllComplaints();
    } else {
        loadUserComplaints();
    }
});

// Close modal on overlay click
document.getElementById('comment-modal').addEventListener('click', (e) => {
    if (e.target.id === 'comment-modal') {
        document.getElementById('close-comment-modal').click();
    }
});

async function loadComments(complaintId) {
    const thread = document.getElementById('comment-thread');
    thread.innerHTML = '<div class="loading-comments"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    try {
        const res = await fetch(`/complaints/${complaintId}/comments`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const comments = await res.json();
        
        if (comments.length === 0) {
            thread.innerHTML = '<div class="no-comments"><i class="fas fa-comment-slash"></i> No messages yet. Start the conversation!</div>';
            return;
        }
        
        thread.innerHTML = comments.map(c => `
            <div class="comment ${c.role === 'admin' ? 'comment-admin' : 'comment-user'}">
                <div class="comment-header">
                    <span class="comment-author">
                        <i class="fas ${c.role === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
                        ${c.username}
                        <span class="role-badge role-${c.role}">${c.role}</span>
                    </span>
                    <span class="comment-time">${new Date(c.timestamp).toLocaleString()}</span>
                </div>
                <div class="comment-body">${c.text}</div>
            </div>
        `).join('');
        
        // Scroll to bottom
        thread.scrollTop = thread.scrollHeight;
    } catch (e) {
        thread.innerHTML = '<div class="no-comments">Failed to load comments</div>';
    }
}

document.getElementById('send-comment-btn').addEventListener('click', sendComment);
document.getElementById('comment-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendComment();
    }
});

async function sendComment() {
    if (!activeComplaintId) return;
    
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return showToast('Please type a message');
    
    const btn = document.getElementById('send-comment-btn');
    btn.disabled = true;
    
    try {
        const res = await fetch(`/complaints/${activeComplaintId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ text })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to send');
        }
        
        input.value = '';
        await loadComments(activeComplaintId);
    } catch (e) {
        showToast(e.message);
    } finally {
        btn.disabled = false;
    }
}

// ─── Status + Department Updates ────────────────────────────────────────────────

window.updateDepartment = async (id, department) => {
    try {
        const res = await fetch(`/complaints/${id}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ assigned_department: department })
        });
        if (!res.ok) throw new Error('Update failed');
        showToast('Department updated');
        loadAllComplaints();
        loadAnalytics();
    } catch (e) {
        showToast(e.message);
    }
};

window.updateStatus = async (id, status) => {
    try {
        const res = await fetch(`/complaints/${id}/status`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('Update failed');
        showToast('Status updated → ' + status);
        loadAllComplaints();
        loadAnalytics();
    } catch (e) {
        showToast(e.message);
    }
};

init();
