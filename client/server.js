const express = require("express");
const http = require("http");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "gapino-secret-change-this";

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

app.get("/", (req, res) => {
  res.json({
    name: "Gapino",
    status: "online",
    message: "سرور گپینو فعال است 🚀"
  });
});

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    database: !!pool
  });
});

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      error: "احراز هویت لازم است"
    });
  }

  const token = header.startsWith("Bearer ")
    ? header.substring(7)
    : header;

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      error: "توکن نامعتبر یا منقضی شده است"
    });
  }
}

/* =========================
   Register
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      password
    } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({
        error: "نام، نام کاربری و رمز عبور الزامی است"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "رمز عبور باید حداقل ۶ کاراکتر باشد"
      });
    }

    if (!pool) {
      return res.status(503).json({
        error: "پایگاه داده هنوز متصل نشده است"
      });
    }

    const exists = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({
        error: "این نام کاربری قبلاً ثبت شده است"
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users
       (name, username, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, username, email`,
      [
        name,
        username,
        email || null,
        passwordHash
      ]
    );

    const user = result.rows[0];

    const token = createToken(user);

    res.status(201).json({
      message: "ثبت‌نام با موفقیت انجام شد",
      token,
      user
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در ثبت‌نام"
    });
  }
});

/* =========================
   Login
========================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "نام کاربری و رمز عبور را وارد کنید"
      });
    }

    if (!pool) {
      return res.status(503).json({
        error: "پایگاه داده هنوز متصل نشده است"
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        name,
        username,
        email,
        password_hash
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "نام کاربری یا رمز عبور اشتباه است"
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: "نام کاربری یا رمز عبور اشتباه است"
      });
    }

    delete user.password_hash;

    const token = createToken(user);

    res.json({
      message: "ورود موفق بود",
      token,
      user
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در ورود"
    });
  }
});

/* =========================
   Current User
========================= */

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, username, email
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "کاربر پیدا نشد"
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در دریافت اطلاعات کاربر"
    });
  }
});

/* =========================
   Search Users
========================= */

app.get("/api/users/search", auth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    if (!q) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT id, name, username
       FROM users
       WHERE
         username ILIKE $1
         OR name ILIKE $1
       ORDER BY username
       LIMIT 20`,
      [`%${q}%`]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در جستجوی کاربران"
    });
  }
});

/* =========================
   Conversations
========================= */

app.get("/api/conversations", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.created_at,
        u.id AS user_id,
        u.name,
        u.username
      FROM conversations c
      JOIN conversation_members cm
        ON cm.conversation_id = c.id
      JOIN users u
        ON u.id = cm.user_id
      WHERE
        c.id IN (
          SELECT conversation_id
          FROM conversation_members
          WHERE user_id = $1
        )
      AND u.id != $1
      ORDER BY c.created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در دریافت گفتگوها"
    });
  }
});

/* =========================
   Messages
========================= */

app.get("/api/messages/:conversationId", auth, async (req, res) => {
  try {
    const conversationId = req.params.conversationId;

    const access = await pool.query(
      `SELECT 1
       FROM conversation_members
       WHERE conversation_id = $1
       AND user_id = $2`,
      [conversationId, req.user.id]
    );

    if (access.rows.length === 0) {
      return res.status(403).json({
        error: "دسترسی ندارید"
      });
    }

    const result = await pool.query(
      `SELECT
        m.id,
        m.sender_id,
        m.body,
        m.created_at,
        u.name AS sender_name,
        u.username AS sender_username
       FROM messages m
       JOIN users u
         ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در دریافت پیام‌ها"
    });
  }
});

/* =========================
   Send Message
========================= */

app.post("/api/messages", auth, async (req, res) => {
  try {
    const {
      conversationId,
      body
    } = req.body;

    if (!conversationId || !body) {
      return res.status(400).json({
        error: "گفتگو و متن پیام الزامی است"
      });
    }

    const access = await pool.query(
      `SELECT 1
       FROM conversation_members
       WHERE conversation_id = $1
       AND user_id = $2`,
      [conversationId, req.user.id]
    );

    if (access.rows.length === 0) {
      return res.status(403).json({
        error: "دسترسی ندارید"
      });
    }

    const result = await pool.query(
      `INSERT INTO messages
       (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, conversation_id, sender_id, body, created_at`,
      [
        conversationId,
        req.user.id,
        body
      ]
    );

    const message = result.rows[0];

    io.to(`conversation:${conversationId}`).emit(
      "new_message",
      message
    );

    res.status(201).json(message);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "خطا در ارسال پیام"
    });
  }
});

/* =========================
   Socket.IO
========================= */

io.on("connection", (socket) => {

  console.log("کاربر متصل شد:", socket.id);

  socket.on("authenticate", (token) => {
    try {
      const user = jwt.verify(token, JWT_SECRET);

      socket.user = user;

      socket.join(`user:${user.id}`);

      console.log(
        "کاربر احراز هویت شد:",
        user.username
      );

    } catch (error) {
      socket.emit("auth_error", {
        error: "توکن نامعتبر است"
      });
    }
  });

  socket.on("join_conversation", (conversationId) => {
    if (!socket.user) return;

    socket.join(
      `conversation:${conversationId}`
    );
  });

  socket.on("typing", (data) => {
    if (!socket.user) return;

    socket.to(
      `conversation:${data.conversationId}`
    ).emit("typing", {
      userId: socket.user.id,
      username: socket.user.username
    });
  });

  socket.on("stop_typing", (data) => {
    if (!socket.user) return;

    socket.to(
      `conversation:${data.conversationId}`
    ).emit("stop_typing", {
      userId: socket.user.id
    });
  });

  socket.on("disconnect", () => {
    console.log(
      "کاربر قطع شد:",
      socket.id
    );
  });
});

/* =========================
   Start
========================= */

server.listen(PORT, () => {
  console.log(
    `🚀 Gapino server running on port ${PORT}`
  );
});
