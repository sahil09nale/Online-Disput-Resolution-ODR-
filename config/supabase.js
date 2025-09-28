const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Main Supabase client (respects RLS)
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to create user-specific client with auth token
const createUserClient = (accessToken) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
};

// Helper function to create authenticated client for server operations
const createAuthenticatedClient = (user) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${user.access_token}`
      }
    }
  });
};

module.exports = {
  supabaseClient,
  createUserClient,
  createAuthenticatedClient
};
