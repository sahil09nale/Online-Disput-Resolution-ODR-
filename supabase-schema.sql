-- Supabase Database Schema for ResolveNOW

-- Create users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('individual', 'lawyer', 'mediator', 'organization', 'admin')),
    department VARCHAR(100),
    license_number VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cases table
CREATE TABLE IF NOT EXISTS public.cases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    case_title VARCHAR(255) NOT NULL,
    case_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    amount_involved DECIMAL(15,2),
    preferred_resolution VARCHAR(100),
    urgency_level VARCHAR(50) DEFAULT 'Medium',
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Review', 'In Mediation', 'Resolved', 'Closed')),
    assigned_mediator_id UUID REFERENCES public.users(id),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create case_files table for file attachments
CREATE TABLE IF NOT EXISTS public.case_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    file_type VARCHAR(100),
    uploaded_by UUID REFERENCES public.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create case_updates table for case history
CREATE TABLE IF NOT EXISTS public.case_updates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
    updated_by UUID REFERENCES public.users(id) NOT NULL,
    update_type VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON public.users(user_type);
CREATE INDEX IF NOT EXISTS idx_cases_user_id ON public.cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases(created_at);
CREATE INDEX IF NOT EXISTS idx_case_files_case_id ON public.case_files(case_id);
CREATE INDEX IF NOT EXISTS idx_case_updates_case_id ON public.case_updates(case_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_updates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Enable insert for authenticated users" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for cases table
CREATE POLICY "Users can view own cases" ON public.cases
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cases" ON public.cases
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cases" ON public.cases
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all cases" ON public.cases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.user_type = 'admin'
        )
    );
-- CORRECTED POLICY: Mediators can only view cases specifically assigned to them.
CREATE POLICY "Mediators can view assigned cases" ON public.cases
    FOR SELECT USING (auth.uid() = assigned_mediator_id);

-- RLS Policies for case_files table
CREATE POLICY "Users can view files for their cases" ON public.case_files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.cases 
            WHERE cases.id = case_files.case_id 
            AND cases.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can upload files to their cases" ON public.case_files
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.cases 
            WHERE cases.id = case_files.case_id 
            AND cases.user_id = auth.uid()
        )
    );

-- RLS Policies for case_updates table
CREATE POLICY "Users can view updates for their cases" ON public.case_updates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.cases 
            WHERE cases.id = case_updates.case_id 
            AND cases.user_id = auth.uid()
        )
    );
CREATE POLICY "Authenticated users can insert case updates" ON public.case_updates
    FOR INSERT WITH CHECK (auth.uid() = updated_by);

-- Create functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON public.cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, user_type)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'user_type', 'individual')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic user profile creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;