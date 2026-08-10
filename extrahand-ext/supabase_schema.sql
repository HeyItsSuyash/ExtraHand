-- Create a table for storing the extension's generated public keys
CREATE TABLE public.user_public_keys (
  user_id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  public_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_public_keys ENABLE ROW LEVEL SECURITY;

-- Allow users to read and insert their own public key
CREATE POLICY "Users can manage their own public key" ON public.user_public_keys
  FOR ALL USING (auth.uid() = user_id);

-- Create a table for storing the symmetrically encrypted API keys
CREATE TABLE public.user_api_keys (
  user_id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  openai_key_encrypted TEXT,
  anthropic_key_encrypted TEXT,
  openrouter_key_encrypted TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Allow users to read and update their own API keys
CREATE POLICY "Users can manage their own API keys" ON public.user_api_keys
  FOR ALL USING (auth.uid() = user_id);
