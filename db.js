import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Helper function to execute queries
const db = {
  all: (query, params, callback) => {
    pool.query(query, params, (err, result) => {
      if (err) {
        return callback(err, null);
      }
      callback(null, result.rows);
    });
  },
  
  run: (query, params, callback) => {
    pool.query(query, params, (err, result) => {
      if (err) {
        return callback(err, null);
      }
      callback(null, result);
    });
  },

  get: (query, params, callback) => {
    pool.query(query, params, (err, result) => {
      if (err) {
        return callback(err, null);
      }
      callback(null, result.rows[0]);
    });
  },
};

export default db;
