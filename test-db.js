require('dotenv').config();
const { Pool } = require('pg');

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : 'not set');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.query('SELECT 1 as test', (err, res) => {
  if (err) {
    console.error('Error:', err.message);
    console.error('Code:', err.code);
  } else {
    console.log('Success:', res.rows);
  }
  pool.end();
});
