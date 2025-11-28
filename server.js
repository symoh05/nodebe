const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Log environment info
console.log('🔧 Environment check:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Database connection with detailed error handling
let pool;
if (process.env.DATABASE_URL) {
  try {
    console.log('🔗 Attempting database connection...');
    console.log('Database host:', process.env.DATABASE_URL.split('@')[1]?.split(':')[0]);
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { 
        rejectUnauthorized: false 
      },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });

    // Test connection immediately
    pool.query('SELECT NOW()')
      .then(result => {
        console.log('✅ Database connection test successful:', result.rows[0]);
      })
      .catch(error => {
        console.error('❌ Database connection test failed:', error.message);
      });

  } catch (error) {
    console.error('❌ Database pool creation failed:', error);
  }
} else {
  console.error('❌ DATABASE_URL environment variable is missing!');
}

const JWT_SECRET = process.env.JWT_SECRET || 'kenya-secret-2024';

// Create tables
const createTables = async () => {
  if (!pool) {
    console.error('❌ Cannot create tables - database pool not available');
    return;
  }
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ PostgreSQL tables ready');
  } catch (error) {
    console.error('❌ Table creation error:', error.message);
  }
};

// Wait a bit then create tables
setTimeout(createTables, 2000);

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: '🇰🇪 Kenya Auth API Running', 
    status: 'OK',
    database: pool ? 'Connected' : 'Not Connected',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: process.env.DATABASE_URL ? 'Configured' : 'Missing DATABASE_URL',
    timestamp: new Date().toISOString()
  });
});

// Test database connection
app.get('/test-db', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ 
      success: false, 
      error: 'Database pool not initialized',
      details: 'DATABASE_URL might be incorrect or database is unreachable'
    });
  }
  
  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    res.json({ 
      success: true, 
      message: '✅ Database connected!',
      time: result.rows[0].time,
      version: result.rows[0].version
    });
  } catch (error) {
    console.error('❌ Database test error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Database connection failed',
      details: error.message
    });
  }
});

// REGISTER endpoint
app.post('/api/register', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Database not available' });
  }
  
  try {
    console.log('📝 Registration attempt:', req.body);
    
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    // Create token
    const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET);

    res.json({
      success: true,
      message: 'User registered successfully',
      user: result.rows[0],
      token
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Server error: ' + error.message });
    }
  }
});

// LOGIN endpoint
app.post('/api/login', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Database not available' });
  }
  
  try {
    console.log('🔐 Login attempt:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    // Create token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);

    res.json({
      success: true,
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email },
      token
    });

  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'Missing!'}`);
});