import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

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
