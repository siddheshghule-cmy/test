import express from "express";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import Groq from "groq-sdk";
import db from "./db.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 5000;

console.log("API key:", process.env.GROQ_API_KEY);

app.use(cors());

const upload = multer({ dest: "uploads/" });

const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY,
});

// ---------------------- Helper Functions ----------------------

async function fetchDataUsingQuery(query, text) {
  console.log("Executing SQL query...");
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error("SQL Error:", err.message);
        return reject(new Error(`Database query failed: ${err.message}`));
      }
      console.log("Query successful! Rows returned:", rows.length);
      resolve({ data: rows, text, sql: query });
    });
  });
}

async function getQueryFromText(text) {
  try {
    console.log("Generating SQL from text...");
    const sqlResponse = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
            You are a backend SQL generator for a PostgreSQL database.
            Your ONLY job is to convert natural language requests into a SINGLE, VALID PostgreSQL SELECT query
            based STRICTLY on the provided schema and value constraints.

            Database schema:

            patients(
              patient_id TEXT PRIMARY KEY,
              age INTEGER,
              gender TEXT,            
              bmi REAL,
              blood_pressure TEXT,
              cholesterol INTEGER,
              smoker TEXT,            
              diabetic TEXT,          
              diagnosis TEXT,
              treatment_cost REAL,
              admission_date TEXT,    
              discharge_date TEXT,    
              outcome TEXT
            )

            MANDATORY RULES:
            - Generate ONLY ONE PostgreSQL SELECT query
            - NEVER generate INSERT, UPDATE, DELETE, DROP, ALTER
            - Use ONLY columns listed in the schema
            - Use EXACT column names (case-sensitive)
            - For ENUM-like fields, you MUST use ONLY these exact values:
              - gender: 'Male' or 'Female'
              - smoker: 'Yes' or 'No'
              - diabetic: 'Yes' or 'No'
            - NEVER use lowercase or alternative values for the above fields
            - If the user uses different casing or synonyms, NORMALIZE them to the allowed values
            - Return ONLY the SQL query
            - Do NOT include explanations, comments, markdown, or backticks
            - End the query with a semicolon
          `,
        },
        { role: "user", content: text },
      ],
      temperature: 0.1,
    });

    const sqlQuery = sqlResponse.choices[0].message.content.trim();
    console.log("Generated SQL:", sqlQuery);

    return await fetchDataUsingQuery(sqlQuery, text);
  } catch (error) {
    throw new Error(`SQL generation failed: ${error.message}`);
  }
}

async function getKeyInfoFromText(text) {
  try {
    console.log("Generating key Info from text...");
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
            You are an information extraction engine.
            Your task is to analyze user text and extract ALL meaningful information
            as key-value pairs.

            Rules you MUST follow:
            - Identify important facts stated explicitly in the text
            - Convert each fact into a clear key-value pair
            - Keys must be concise, descriptive, snake_case
            - Values must be directly taken from the text and normalized
            - Ignore greetings, filler, emotions, and irrelevant text
            - Do NOT guess or infer anything
            - Do NOT add explanations
            - Do NOT use markdown or code blocks
            - Do NOT hardcode or restrict keys to any predefined list

            Return output in EXACT JSON format:

            {
              "<key>": "<value>",
              "<key>": "<value>"
            }
          `,
        },
        { role: "user", content: text },
      ],
      temperature: 0.1,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(`Extraction Failed: ${error.message}`);
  }
}

// ---------------------- Routes ----------------------

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  let webmPath = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No audio file received" });

    webmPath = req.file.path + ".webm";
    fs.renameSync(req.file.path, webmPath);

    console.log("Sending audio to Groq...");
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(webmPath),
      model: "whisper-large-v3",
      response_format: "json",
    });

    fs.unlinkSync(webmPath);

    const result = await getQueryFromText(transcription.text);

    return res.json(result);

  } catch (err) {
    if (webmPath && fs.existsSync(webmPath)) fs.unlinkSync(webmPath);
    console.error("TRANSCRIPTION ERROR:", err.message);
    return res.status(500).json({ error: "Transcription failed", details: err.message });
  }
});

app.post("/info", upload.single("audio"), async (req, res) => {
  let webmPath = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No audio file received" });

    webmPath = req.file.path + ".webm";
    fs.renameSync(req.file.path, webmPath);

    console.log("Sending audio to Groq for key info extraction...");
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(webmPath),
      model: "whisper-large-v3",
      response_format: "json",
    });

    fs.unlinkSync(webmPath);

    const info = await getKeyInfoFromText(transcription.text);

    return res.json({ data: info, text: transcription.text });

  } catch (err) {
    if (webmPath && fs.existsSync(webmPath)) fs.unlinkSync(webmPath);
    console.error("INFO EXTRACTION ERROR:", err.message);
    return res.status(500).json({ error: "Extraction failed", details: err.message });
  }
});

// ---------------------- Start Server ----------------------

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
