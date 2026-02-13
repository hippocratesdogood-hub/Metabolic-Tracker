-- Performance Optimization Indexes
-- Run this migration to add indexes for common query patterns

-- User lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_coach_id ON users(coach_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Food entries - frequently filtered by user and date
CREATE INDEX IF NOT EXISTS idx_food_entries_user_timestamp
ON food_entries(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_food_entries_timestamp
ON food_entries(timestamp DESC);

-- Metric entries - already has unique index, add timestamp-only for dashboard
CREATE INDEX IF NOT EXISTS idx_metric_entries_timestamp
ON metric_entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metric_entries_user_type
ON metric_entries(user_id, type);

-- Messages - for conversation loading
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON messages(conversation_id, created_at DESC);

-- Conversations - for user lookups
CREATE INDEX IF NOT EXISTS idx_conversations_participant
ON conversations(participant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_coach
ON conversations(coach_id);

-- Prompt deliveries - for history and cooldown checks
CREATE INDEX IF NOT EXISTS idx_prompt_deliveries_user_fired
ON prompt_deliveries(user_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_deliveries_prompt_fired
ON prompt_deliveries(prompt_id, fired_at DESC);

-- Prompt rules - for active rule lookups
CREATE INDEX IF NOT EXISTS idx_prompt_rules_active
ON prompt_rules(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_prompt_rules_prompt
ON prompt_rules(prompt_id);

-- Audit logs - for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp
ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user
ON audit_logs(target_user_id, timestamp DESC) WHERE target_user_id IS NOT NULL;

-- Reports - for user report history
CREATE INDEX IF NOT EXISTS idx_reports_user_period
ON reports(user_id, period_start DESC);

-- Macro targets - for quick lookups (already has unique on user_id)
-- No additional index needed

-- Analyze tables after adding indexes
ANALYZE users;
ANALYZE food_entries;
ANALYZE metric_entries;
ANALYZE messages;
ANALYZE conversations;
ANALYZE prompt_deliveries;
ANALYZE prompt_rules;
ANALYZE audit_logs;
ANALYZE reports;

-- Query to verify indexes were created
-- SELECT schemaname, tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
