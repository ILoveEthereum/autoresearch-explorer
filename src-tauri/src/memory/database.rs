use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub name: String,
    pub question: String,
    pub summary: String,
    pub skill_doc_path: Option<String>,
    pub created_at: String,
}

pub struct MemoryDb {
    conn: Connection,
}

impl MemoryDb {
    pub fn open() -> Result<Self, String> {
        let home = dirs_next::home_dir().ok_or("Could not determine home directory")?;
        let db_dir = home.join(".autoresearch");
        std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
        let path = db_dir.join("memory.db");

        let conn = Connection::open(&path).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                question TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                skill_doc_path TEXT,
                created_at TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
                name, question, summary, content=sessions, content_rowid=rowid
            );
            -- Triggers to keep FTS in sync
            CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
                INSERT INTO sessions_fts(rowid, name, question, summary)
                VALUES (new.rowid, new.name, new.question, new.summary);
            END;
            CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
                DELETE FROM sessions_fts WHERE rowid = old.rowid;
                INSERT INTO sessions_fts(rowid, name, question, summary)
                VALUES (new.rowid, new.name, new.question, new.summary);
            END;
        ",
        )
        .map_err(|e| e.to_string())?;

        Ok(Self { conn })
    }

    pub fn add_session(&self, entry: &MemoryEntry) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO sessions (id, name, question, summary, skill_doc_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    entry.id,
                    entry.name,
                    entry.question,
                    entry.summary,
                    entry.skill_doc_path,
                    entry.created_at
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn search(&self, query: &str, limit: i64) -> Vec<MemoryEntry> {
        let mut stmt = match self.conn.prepare(
            "SELECT s.id, s.name, s.question, s.summary, s.skill_doc_path, s.created_at
             FROM sessions s
             JOIN sessions_fts f ON s.rowid = f.rowid
             WHERE sessions_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };

        stmt.query_map(rusqlite::params![query, limit], |row| {
            Ok(MemoryEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                question: row.get(2)?,
                summary: row.get(3)?,
                skill_doc_path: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .ok()
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }

    pub fn list_all(&self, limit: i64) -> Vec<MemoryEntry> {
        let mut stmt = match self.conn.prepare(
            "SELECT id, name, question, summary, skill_doc_path, created_at
             FROM sessions ORDER BY created_at DESC LIMIT ?1",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };

        stmt.query_map(rusqlite::params![limit], |row| {
            Ok(MemoryEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                question: row.get(2)?,
                summary: row.get(3)?,
                skill_doc_path: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .ok()
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    }
}
