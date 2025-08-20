-- Migration: Add schema parse enhancements
-- Description: Add filename, content_hash, file_size columns and indexes for duplicate prevention
-- Date: 2025-08-21 01:20:54

-- Add filename column if it doesn't exist
ALTER TABLE schema_parse 
ADD COLUMN IF NOT EXISTS filename VARCHAR(255);

-- Add content_hash column if it doesn't exist (for duplicate detection)
ALTER TABLE schema_parse 
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(32);

-- Add file_size column if it doesn't exist
ALTER TABLE schema_parse 
ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Add updated_at column if it doesn't exist
ALTER TABLE schema_parse 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create unique constraint on content_hash if it doesn't exist
DO $$
BEGIN
    BEGIN
        ALTER TABLE schema_parse ADD CONSTRAINT unique_content_hash UNIQUE (content_hash);
    EXCEPTION
        WHEN duplicate_table THEN
            -- Constraint already exists, do nothing
            NULL;
    END;
END $$;

-- Create index on content_hash for faster duplicate checking
CREATE INDEX IF NOT EXISTS idx_schema_parse_content_hash 
ON schema_parse(content_hash);

-- Create index on filename for faster filename-based searches
CREATE INDEX IF NOT EXISTS idx_schema_parse_filename 
ON schema_parse(filename);

-- Create composite index for better query performance
CREATE INDEX IF NOT EXISTS idx_schema_parse_hash_filename 
ON schema_parse(content_hash, filename);

-- Update RLS policy to allow service role operations
DO $$
BEGIN
    -- Drop existing policy if it exists
    BEGIN
        DROP POLICY IF EXISTS "Allow authenticated users" ON schema_parse;
    EXCEPTION
        WHEN undefined_object THEN
            -- Policy doesn't exist, continue
            NULL;
    END;
    
    -- Create new policy for authenticated users and service role
    BEGIN
        CREATE POLICY "Allow authenticated users" ON schema_parse
        FOR ALL USING (
            auth.role() = 'authenticated' OR 
            auth.jwt() ->> 'role' = 'service_role' OR
            current_user = 'service_role'
        );
    EXCEPTION
        WHEN others THEN
            RAISE NOTICE 'Could not create RLS policy: %', SQLERRM;
    END;
    
    -- Enable RLS if not already enabled
    BEGIN
        ALTER TABLE schema_parse ENABLE ROW LEVEL SECURITY;
    EXCEPTION
        WHEN others THEN
            RAISE NOTICE 'RLS already enabled or could not be enabled: %', SQLERRM;
    END;
    
END $$;

-- Add comments to document the new columns
COMMENT ON COLUMN schema_parse.filename IS 'Original filename of the uploaded SQL file';
COMMENT ON COLUMN schema_parse.content_hash IS 'MD5 hash of file content for duplicate detection';
COMMENT ON COLUMN schema_parse.file_size IS 'Size of the original file in bytes';
COMMENT ON COLUMN schema_parse.updated_at IS 'Timestamp when the record was last updated';
