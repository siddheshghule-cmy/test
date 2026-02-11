import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import cors from "cors";
import Groq from "groq-sdk";
import db from "./db.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 5000;

console.log("API key:",process.env.GROQ_API_KEY);

app.use(cors());

const upload = multer({ dest: "uploads/"});

const groq = new Groq({ 
  apiKey:process.env.GROQ_API_KEY,
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {

  console.log("Transcription Request Started");
  
  let webmPath = null;
  
  try {

    if (!req.file) {
      console.error("No file uploaded");
      return res.status(400).json({ error: "No audio file received" });
    }

    console.log("File received:", req.file.size, "bytes");
    
    webmPath = req.file.path + ".webm";
    fs.renameSync(req.file.path, webmPath);
    
    console.log("Sending to Groq...");

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(webmPath),
      model: "whisper-large-v3",
      response_format: "json",
    });

    console.log("Transcription successful:", transcription.text);
    
    
    fs.unlinkSync(webmPath);

    await getQueryFromText(transcription.text,res);
  }catch (err) {
    console.error("TRANSCRIPTION ERROR:");
    console.error("Error message:", err.message);

    if (webmPath && fs.existsSync(webmPath)) {
      fs.unlinkSync(webmPath);
    }
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      error: "Transcription failed",
      details: err.message,
    });
  }
});


async function getQueryFromText(text,res) {

    try {
        console.log("Generating SQL from text...");

        const sqlResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", 
            messages: [
                {
                role: "system",
                content: `
                    You are a backend SQL generator for an SQLite database.

                      Your ONLY job is to convert natural language requests into a SINGLE, VALID SQLite SELECT query
                      based STRICTLY on the provided schema and value constraints.

                      Database schema:

                      patients(
                        patient_id TEXT PRIMARY KEY,
                        age INTEGER,
                        gender TEXT,            -- ALLOWED VALUES: 'Male' or 'Female' ONLY
                        bmi REAL,
                        blood_pressure TEXT,
                        cholesterol INTEGER,
                        smoker TEXT,            -- ALLOWED VALUES: 'Yes' or 'No' ONLY
                        diabetic TEXT,          -- ALLOWED VALUES: 'Yes' or 'No' ONLY
                        diagnosis TEXT,
                        treatment_cost REAL,
                        admission_date TEXT,    -- format: YYYY-MM-DD
                        discharge_date TEXT,    -- format: YYYY-MM-DD
                        outcome TEXT
                      )

                      MANDATORY RULES:
                      - Generate ONLY ONE SQLite SELECT query
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
                {
                  role: "user",
                  content: text,
                },
            ],
            temperature: 0.1,
        });

        const sqlQuery = sqlResponse.choices[0].message.content.trim();
        console.log("Generated SQL:", sqlQuery);

        await fetchDataUsingQuery(sqlQuery,res,text);
    }catch(error) {
        throw new Error(`SQL generation failed: ${error.message}`);
    }
}


function fetchDataUsingQuery(query,res,text) {
  console.log("Executing SQL query...");

  console.log("Text is ",text);
  
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error(" SQL Error:", err.message);
        res.status(400).json({ 
          error: "Database query failed",
          details: err.message, 
          sql: query 
        });
        reject(err);
      }else {
        console.log("Query successful! Rows returned:", rows.length,"Text:",text,"Query:",query);
    
        res.json({
          data: rows,
          text:text,
          Sqlquery:query
        });
        resolve(rows);
      }
    });
  });
}

app.post("/info", upload.single("audio"), async (req, res) => {

  console.log("Extracting Key points from Audio");
  
  let webmPath = null;
  
  try {
    
    console.log("Inside the try block of info");

    if (!req.file) {
      console.error("No file uploaded");
      return res.status(400).json({ error: "No audio file received" });
    }

    console.log("File received:", req.file.size, "bytes");
    
    webmPath = req.file.path + ".webm";
    fs.renameSync(req.file.path, webmPath);
    
    console.log("Sending to Groq...");

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(webmPath),
      model: "whisper-large-v3",
      response_format: "json",
    });

    console.log("Transcription successful:", transcription.text);
    
    
    fs.unlinkSync(webmPath);

    await getKeyInfoFromText(transcription.text,res);
  }catch (err) {
    console.error("TRANSCRIPTION ERROR:");
    console.error("Error message:", err.message);

    if (webmPath && fs.existsSync(webmPath)) {
      fs.unlinkSync(webmPath);
    }
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      error: "Transcription failed",
      details: err.message,
    });
  }
});

async function getKeyInfoFromText(text,res) {

    try {
      console.log("Generating key Info from text...");

      const Response = await groq.chat.completions.create({
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
                    - Keys must be:
                      - concise
                      - descriptive
                      - written in snake_case
                    - Values must be:
                      - directly taken from the text
                      - normalized when applicable (e.g., yes/no, numbers)
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
              {
              role: "user",
                content: text,
              },
          ],
          temperature: 0.1,
        });
        const info = Response.choices[0].message.content.trim();
        console.log("our Info:", info);
        res.json({
          data:info,
          text:text
        })
    }catch(error) {
      throw new Error(`Extraction Failed: ${error.message}`);
    }
}


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});