-- ResolveNOW Database Schema for Supabase

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  user_type TEXT NOT NULL CHECK (user_type IN ('individual', 'lawyer', 'mediator', 'organization', 'admin')),
  department TEXT, -- For admin users: 'consumer', 'employment', 'contract', 'property', 'family', 'business'
  license_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Cases table
CREATE TABLE cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  dispute_type TEXT NOT NULL CHECK (dispute_type IN ('consumer', 'employment', 'contract', 'property', 'family', 'business', 'other')),
  dispute_amount DECIMAL(12,2) DEFAULT 0,
  description TEXT NOT NULL,
  desired_outcome TEXT,
  respondent_name TEXT NOT NULL,
  respondent_email TEXT,
  respondent_phone TEXT,
  incident_date DATE,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Review', 'In Mediation', 'Resolved', 'Closed')),
  assigned_department TEXT NOT NULL,
  resolved_by UUID REFERENCES users(id),
  resolution TEXT,
  outcome TEXT,
  is_urgent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Case files table
CREATE TABLE case_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  file_url TEXT, -- Supabase Storage URL
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case updates/history table
CREATE TABLE case_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES users(id),
  old_status TEXT,
  new_status TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_updates ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Cases policies
CREATE POLICY "Users can view own cases" ON cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create cases" ON cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view department cases" ON cases FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.user_type = 'admin' 
    AND users.department = cases.assigned_department
  )
);
CREATE POLICY "Admins can update department cases" ON cases FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.user_type = 'admin' 
    AND users.department = cases.assigned_department
  )
);

-- Case files policies
CREATE POLICY "Users can view own case files" ON case_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM cases WHERE cases.id = case_files.case_id AND cases.user_id = auth.uid())
);
CREATE POLICY "Admins can view department case files" ON case_files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cases 
    JOIN users ON users.id = auth.uid()
    WHERE cases.id = case_files.case_id 
    AND users.user_type = 'admin' 
    AND users.department = cases.assigned_department
  )
);

-- Functions
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'ODR' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(NEXTVAL('case_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS case_number_seq;

-- Trigger to auto-generate case number
CREATE OR REPLACE FUNCTION set_case_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := generate_case_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_case_number
  BEFORE INSERT ON cases
  FOR EACH ROW
  EXECUTE FUNCTION set_case_number();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();