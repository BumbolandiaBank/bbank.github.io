
const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

const viewAuth = el('#view-auth');
const viewApp = el('#view-app');
const btnAdmin = el('#btn-admin');
const btnLogout = el('#btn-logout');

const formAuth = el('#form-auth');
const formTransfer = el('#form-transfer');

const meName = el('#me-name');
const meCard = el('#me-card');
const meBalance = el('#me-balance');
const txList = el('#tx-list');
const copyCardBtn = el('#copy-card');
const toCardInput = document.querySelector('#to-card');
const adminSearchInput = document.querySelector('#admin-search');

const adminModal = el('#admin-modal');
const adminClose = el('#admin-close');
const formAdminLogin = el('#form-admin-login');
const adminLogin = el('#admin-login');
const adminPanel = el('#admin-panel');
const adminRows = el('#admin-rows');

let socket;
let sessionToken = localStorage.getItem('sessionToken') || '';
let adminToken = localStorage.getItem('adminToken') || '';

function formatCard(num) {
	const only = String(num || '').replace(/\D/g, '');
	return only.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

async function api(path, { method = 'GET', body } = {}) {
	const res = await fetch(path, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(sessionToken ? { 'x-session-token': sessionToken } : {}),
			...(adminToken ? { 'x-admin-token': adminToken } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.error || 'Ошибка запроса');
	}
	return res.json();
}

function setAuthState(auth) {
	if (auth) {
		viewAuth.classList.add('hidden');
		viewApp.classList.remove('hidden');
		btnLogout.classList.remove('hidden');
	} else {
		viewAuth.classList.remove('hidden');
		viewApp.classList.add('hidden');
		btnLogout.classList.add('hidden');
	}
}

function connectSocket() {
	if (socket) socket.disconnect();
	socket = io();
	socket.on('connect', () => {
		if (sessionToken) socket.emit('session:subscribe', { token: sessionToken });
		if (adminToken) socket.emit('admin:subscribe', { adminToken });
	});
	socket.on('balance:update', (data) => {
		if (!data) return;
		meBalance.textContent = data.balance.toString();
		if (Array.isArray(data.transactions)) {
			renderTransactions(data.transactions);
		}
	});
	socket.on('admin:accounts', (list) => {
		renderAdminAccounts(list);
	});
}

function renderTransactions(list) {
	txList.innerHTML = '';
	list.slice().reverse().forEach((t) => {
		const li = document.createElement('li');
		li.innerHTML = `
			<span>${t.direction === 'sent' ? '→' : t.direction === 'received' ? '←' : '+'} ${t.toCard || t.fromCard}</span>
			<strong>${t.direction === 'sent' ? '-' : '+'}${t.amount} DBL</strong>
		`;
		txList.appendChild(li);
	});
}

function renderAdminAccounts(list) {
	if (!Array.isArray(list)) return;
	const q = (adminSearchInput?.value || '').toLowerCase();
	adminRows.innerHTML = '';
	list.filter(a => !q || a.name.toLowerCase().includes(q) || String(a.cardNumber).includes(q.replace(/\s/g, ''))).forEach((a) => {
		const tr = document.createElement('tr');
		tr.innerHTML = `
			<td>${a.name}</td>
			<td><code>${formatCard(a.cardNumber)}</code></td>
			<td>${a.balance} ${a.currency}</td>
			<td>
				<form class="admin-inc form-inline" data-card="${a.cardNumber}">
					<input name="amount" inputmode="decimal" placeholder="Сумма" style="width:110px" />
					<button class="btn small" type="submit">Увеличить баланс</button>
				</form>
			</td>
		`;
		adminRows.appendChild(tr);
	});
	// bind forms
	els('form.admin-inc').forEach((f) => {
		f.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fd = new FormData(f);
			const amount = Number(fd.get('amount'));
			const cardNumber = f.getAttribute('data-card');
			try {
				await api('/api/admin/increase', { method: 'POST', body: { cardNumber, amount } });
				toast('Баланс увеличен');
			} catch (err) {
				toast(err.message, true);
			}
		});
	});
}

async function loadMe() {
	try {
		const me = await api('/api/me');
		meName.textContent = me.name;
		meCard.textContent = formatCard(me.cardNumber);
		meBalance.textContent = String(me.balance);
		renderTransactions(me.transactions || []);
		setAuthState(true);
		connectSocket();
	} catch (e) {
		setAuthState(false);
	}
}

formAuth.addEventListener('submit', async (e) => {
	e.preventDefault();
	const fd = new FormData(formAuth);
	const name = String(fd.get('name') || '').trim();
	const cardNumber = String(fd.get('cardNumber') || '');
	const cds = String(fd.get('cds') || '');
	try {
		const res = await api('/api/register', { method: 'POST', body: { name, cardNumber, cds } });
		sessionToken = res.token;
		localStorage.setItem('sessionToken', sessionToken);
		await loadMe();
	} catch (err) {
		toast(err.message, true);
	}
});

formTransfer.addEventListener('submit', async (e) => {
	e.preventDefault();
	const fd = new FormData(formTransfer);
	const toCardNumber = String(fd.get('toCardNumber') || '');
	const amount = Number(fd.get('amount'));
	try {
		await api('/api/transfer', { method: 'POST', body: { toCardNumber, amount } });
		formTransfer.reset();
		toast('Перевод отправлен');
	} catch (err) {
		toast(err.message, true);
	}
});

btnLogout.addEventListener('click', () => {
	localStorage.removeItem('sessionToken');
	sessionToken = '';
	setAuthState(false);
	if (socket) socket.disconnect();
});

// Admin
btnAdmin.addEventListener('click', () => {
	adminModal.classList.remove('hidden');
});
adminClose.addEventListener('click', () => {
	adminModal.classList.add('hidden');
});

formAdminLogin.addEventListener('submit', async (e) => {
	e.preventDefault();
	const fd = new FormData(formAdminLogin);
	const code = String(fd.get('code'));
	try {
		const res = await api('/api/admin/login', { method: 'POST', body: { code } });
		adminToken = res.adminToken;
		localStorage.setItem('adminToken', adminToken);
		adminLogin.classList.add('hidden');
		adminPanel.classList.remove('hidden');
		connectSocket();
		const data = await api('/api/admin/accounts');
		renderAdminAccounts(data.accounts || []);
		toast('Вход администратора выполнен');
	} catch (err) {
		toast(err.message, true);
	}
});

// Initial
loadMe();

// Mask card inputs
document.addEventListener('input', (e) => {
	const t = e.target;
	if (t && (t.name === 'cardNumber' || t.name === 'toCardNumber')) {
		const pos = t.selectionStart;
		const digits = String(t.value).replace(/\D/g, '').slice(0, 16);
		t.value = formatCard(digits);
		try { t.setSelectionRange(pos, pos); } catch {}
	}
});

// Copy own card
copyCardBtn?.addEventListener('click', async () => {
	try {
		await navigator.clipboard.writeText((meCard.textContent || '').replace(/\s/g, ''));
		toast('Номер карты скопирован');
	} catch {}
});

// Admin live filter
adminSearchInput?.addEventListener('input', () => {
	api('/api/admin/accounts').then(d => renderAdminAccounts(d.accounts || [])).catch(() => {});
});

// Utilities
function toast(message, isError = false) {
	let t = document.querySelector('.toast');
	if (!t) {
		t = document.createElement('div');
		t.className = 'toast';
		document.body.appendChild(t);
	}
	t.textContent = message;
	t.style.borderColor = isError ? 'var(--danger)' : 'rgba(255,255,255,.12)';
	t.classList.add('show');
	setTimeout(() => t.classList.remove('show'), 2200);
}

