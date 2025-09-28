const { supabaseClient } = require('../config/supabase');

// Setup script to check database connection
async function setupDatabase() {
  try {
    console.log('🚀 Starting ResolveNOW database setup...');

    // Check if we can connect to Supabase
    console.log('📋 Checking Supabase connection...');
    
    const { data, error } = await supabaseClient
      .from('cases')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Database connection failed. Please check your Supabase configuration.');
      console.log('📝 Make sure to:');
      console.log('1. Run the supabase-schema.sql file in your Supabase dashboard');
      console.log('2. Set up Row Level Security (RLS) policies');
      console.log('3. Configure your .env file with correct Supabase credentials');
      return;
    }

    console.log('✅ Database connection successful');
    console.log('');
    console.log('🎉 Setup completed successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Make sure your .env file has SUPABASE_URL and SUPABASE_ANON_KEY');
    console.log('2. Run: npm run dev');
    console.log('3. Visit: http://localhost:3000');
    console.log('');
    console.log('⚠️  Note: Without service role key, some features are limited:');
    console.log('   - User registration works via Supabase Auth');
    console.log('   - Profile updates require client-side implementation');
    console.log('   - File uploads require alternative solution');
    console.log('   - Admin functions may be limited');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

// Run setup if called directly
if (require.main === module) {
  require('dotenv').config();
  setupDatabase();
}

module.exports = { setupDatabase };
