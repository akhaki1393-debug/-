CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(150),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,

    conversation_id INTEGER NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    body TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);
