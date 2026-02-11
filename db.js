// db.js
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(
  path.join(__dirname, 'PatientsData.db'),
  (err) => {
    if (err) {
      console.error(" Database connection failed:", err.message);
    } else {
      console.log("Connected to patientsData.db");
    }
  }
);

export default db;