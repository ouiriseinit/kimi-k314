const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function connect() {
  await client.connect();
  console.log('✅ Connected to MongoDB');
}

module.exports = connect;