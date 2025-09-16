import express from "express";
import http from "http";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { customAlphabet } from "nanoid";
import dayjs from "dayjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
	cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Demo data store (in-memory)
const accountsByCard = new Map(); // cardNumber -> account
const sessions = new Map(); // token -> cardNumber
const adminSessions = new Set(); // admin tokens

const CARD_GENERATOR = customAlphabet("1234567890", 16);
const TOKEN_GENERATOR = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 24);

const ADMIN_ACCESS_CODE = "TimeAbsolut434345@";

function createAccount({ name, cardNumber }) {
	const normalizedCard = String(cardNumber).replace(/\D/g, "");
	if (accountsByCard.has(normalizedCard)) {
		return accountsByCard.get(normalizedCard);
	}
	const account = {
		id: TOKEN_GENERATOR(),
		name: String(name || "User").trim().slice(0, 64),
		cardNumber: normalizedCard || CARD_GENERATOR(),
		balance: 0,
		currency: "DBL", // Dublo
		createdAt: dayjs().toISOString(),
		transactions: []
	};
	accountsByCard.set(account.cardNumber, account);
	return account;
}

function getAccountByToken(token) {
	const card = sessions.get(token);
	if (!card) return null;
	return accountsByCard.get(card) || null;
}

function emitAccountUpdate(account) {
	io.to(`account:${account.cardNumber}`).emit("balance:update", {
		cardNumber: account.cardNumber,
		balance: account.balance,
		currency: account.currency,
		transactions: account.transactions.slice(-50)
	});
	// update admin views
	io.to("admin").emit("admin:accounts", getAllAccountsPublic());
}

function getAllAccountsPublic() {
	return Array.from(accountsByCard.values()).map(a => ({
		id: a.id,
		name: a.name,
		cardNumber: a.cardNumber,
		balance: a.balance,
		currency: a.currency,
		createdAt: a.createdAt
	}));
}

// Routes
app.post("/api/register", (req, res) => {
	const { name, cardNumber, cds } = req.body || {};
	// Note: "cds" is treated as a non-sensitive demo field; we do not store it
	if (!name || (!cardNumber && String(cardNumber) !== "")) {
		return res.status(400).json({ error: "name and cardNumber are required (demo)" });
	}
	const account = createAccount({ name, cardNumber });
	const token = TOKEN_GENERATOR();
	sessions.set(token, account.cardNumber);
	return res.json({
		token,
		account: {
			id: account.id,
			name: account.name,
			cardNumber: account.cardNumber,
			balance: account.balance,
			currency: account.currency
		}
	});
});

app.get("/api/me", (req, res) => {
	const token = req.headers["x-session-token"]; 
	const account = getAccountByToken(token);
	if (!account) return res.status(401).json({ error: "invalid session" });
	return res.json({
		id: account.id,
		name: account.name,
		cardNumber: account.cardNumber,
		balance: account.balance,
		currency: account.currency,
		transactions: account.transactions.slice(-50)
	});
});

app.post("/api/transfer", (req, res) => {
	const token = req.headers["x-session-token"]; 
	const { toCardNumber, amount } = req.body || {};
	const from = getAccountByToken(token);
	if (!from) return res.status(401).json({ error: "invalid session" });
	const normalizedTo = String(toCardNumber || "").replace(/\D/g, "");
	const to = accountsByCard.get(normalizedTo);
	const parsedAmount = Number(amount);
	if (!to) return res.status(404).json({ error: "recipient not found" });
	if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "invalid amount" });
	if (from.balance < parsedAmount) return res.status(400).json({ error: "insufficient funds" });

	from.balance -= parsedAmount;
	to.balance += parsedAmount;
	const tx = {
		id: TOKEN_GENERATOR(),
		fromCard: from.cardNumber,
		toCard: to.cardNumber,
		amount: parsedAmount,
		currency: from.currency,
		timestamp: dayjs().toISOString()
	};
	from.transactions.push({ ...tx, direction: "sent" });
	to.transactions.push({ ...tx, direction: "received" });

	emitAccountUpdate(from);
	emitAccountUpdate(to);
	return res.json({ ok: true, tx });
});

// Admin APIs
app.post("/api/admin/login", (req, res) => {
	const { code } = req.body || {};
	if (code !== ADMIN_ACCESS_CODE) return res.status(401).json({ error: "invalid code" });
	const adminToken = `adm_${TOKEN_GENERATOR()}`;
	adminSessions.add(adminToken);
	return res.json({ adminToken });
});

function requireAdmin(req, res) {
	const token = req.headers["x-admin-token"];
	if (!token || !adminSessions.has(token)) {
		res.status(401).json({ error: "unauthorized" });
		return null;
	}
	return token;
}

app.get("/api/admin/accounts", (req, res) => {
	const t = requireAdmin(req, res);
	if (!t) return;
	return res.json({ accounts: getAllAccountsPublic() });
});

app.post("/api/admin/increase", (req, res) => {
	const t = requireAdmin(req, res);
	if (!t) return;
	const { cardNumber, amount } = req.body || {};
	const normalized = String(cardNumber || "").replace(/\D/g, "");
	const account = accountsByCard.get(normalized);
	const parsedAmount = Number(amount);
	if (!account) return res.status(404).json({ error: "account not found" });
	if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "invalid amount" });
	account.balance += parsedAmount;
	account.transactions.push({
		id: TOKEN_GENERATOR(),
		fromCard: "ADMIN",
		toCard: account.cardNumber,
		amount: parsedAmount,
		currency: account.currency,
		timestamp: dayjs().toISOString(),
		direction: "increase"
	});
	emitAccountUpdate(account);
	return res.json({ ok: true, balance: account.balance });
});

// Socket.IO
io.on("connection", (socket) => {
	// join per-account room
	socket.on("session:subscribe", ({ token }) => {
		const account = getAccountByToken(token);
		if (!account) return;
		socket.join(`account:${account.cardNumber}`);
		// push initial state
		socket.emit("balance:update", {
			cardNumber: account.cardNumber,
			balance: account.balance,
			currency: account.currency,
			transactions: account.transactions.slice(-50)
		});
	});

	socket.on("admin:subscribe", ({ adminToken }) => {
		if (!adminToken || !adminSessions.has(adminToken)) return;
		socket.join("admin");
		socket.emit("admin:accounts", getAllAccountsPublic());
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`Bumbolandia Bank running on http://localhost:${PORT}`);
});


