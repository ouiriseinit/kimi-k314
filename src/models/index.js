const express = require('express');
require('dotenv').config();
const dbConnection = require('./models/db');

const app = express();
app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'agentic-platform' });
});

// Connect to MongoDB and start server
dbConnection()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => console.error('MongoDB connection failed:', err));

module.exports = app;