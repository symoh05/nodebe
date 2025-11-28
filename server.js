const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'kenya-secret-2024';

// Create tables
const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ PostgreSQL tables ready');
  } catch (error) {
    console.error('❌ Table creation error:', error);
  }
};

createTables();

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: '🇰🇪 Kenya Auth API Running', 
    database: 'PostgreSQL',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: 'PostgreSQL',
    country: 'Kenya'
  });
});

// Test database
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({ 
      success: true, 
      message: '✅ PostgreSQL connected!',
      time: result.rows[0].time
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Database connection failed'
    });
  }
});

// REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET);

    res.json({
      success: true,
      message: 'User registered successfully',
      user: result.rows[0],
      token
    });

  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);

    res.json({
      success: true,
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email },
      token
    });

  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🗄️ PostgreSQL database connected`);
});